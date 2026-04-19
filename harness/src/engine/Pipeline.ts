import { EventEmitter } from 'events';
import pino from 'pino';
import { MqttClient, VADEvent } from '../comms/MqttClient';
import { AudioServer } from '../comms/AudioServer';
import { STTProvider, TTSProvider, LLMProvider, MemoryContext } from '../providers/types';
import type { ModeManager } from './ModeManager';
import type { Mode } from '../shared/contracts';

const logger = pino({ name: 'pipeline' });

// Safety limits for audio buffering (review fix: OOM guard)
const MAX_BUFFER_BYTES = 2 * 1024 * 1024; // 2MB ≈ 62.5s of PCM 16kHz 16-bit
const MAX_BUFFER_DURATION_MS = 45_000;    // 45s hard cap (force VAD-end)

interface PipelineOptions {
  stt: STTProvider;
  tts: TTSProvider;
  llm: LLMProvider;
  mqtt: MqttClient;
  audio: AudioServer;
  getMemoryContext: (userMessage: string) => Promise<MemoryContext>;
  onTurnComplete?: (userMessage: string, aiResponse: string) => Promise<void>;
}

export class Pipeline extends EventEmitter {
  private opts: PipelineOptions;
  private audioBuffer: Buffer[] = [];
  private audioBufferBytes: number = 0;
  private isListening: boolean = false;
  private isProcessing: boolean = false;
  private vadTimeout: ReturnType<typeof setTimeout> | null = null;
  private modeManager: ModeManager | null = null;

  constructor(opts: PipelineOptions) {
    super();
    this.opts = opts;
    this.setupListeners();
  }

  /** Inject ModeManager reference for mode-aware audio gating. */
  setModeManager(mm: ModeManager): void {
    this.modeManager = mm;
  }

  /** Reset all state — called on disconnect or pipeline errors (review fix: hung state) */
  private resetState(reason: string): void {
    logger.warn({ reason }, 'Pipeline state reset');
    if (this.vadTimeout) {
      clearTimeout(this.vadTimeout);
      this.vadTimeout = null;
    }
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
    this.isListening = false;
    this.isProcessing = false;
  }

  private setupListeners(): void {
    const { mqtt, audio } = this.opts;

    // STAGE 1: Audio chunking via WebSocket (NOT MQTT)
    audio.on('audioChunk', (chunk: Buffer) => {
      const mode = this.modeManager?.getMode() ?? 'active';

      // sleep mode: drop all audio — no processing
      if (mode === 'sleep') return;

      // record mode: buffer audio but don't run pipeline
      // (audio capture handled externally, just don't process here)

      if (!this.isListening) return;

      // [REVIEW FIX: HIGH] Guard against unbounded buffer growth
      this.audioBufferBytes += chunk.length;
      if (this.audioBufferBytes > MAX_BUFFER_BYTES) {
        logger.error(
          { bytes: this.audioBufferBytes, limit: MAX_BUFFER_BYTES },
          'Audio buffer exceeded max size — forcing VAD-end to prevent OOM'
        );
        this.triggerProcess();
        return;
      }
      this.audioBuffer.push(chunk);
    });

    // STAGE 2: VAD gates determine utterance boundaries (via MQTT)
    mqtt.on('vad', (event: VADEvent) => {
      const mode = this.modeManager?.getMode() ?? 'active';

      // sleep mode: ignore VAD events entirely
      if (mode === 'sleep') return;

      // listen mode: VAD start triggers transition to active
      if (mode === 'listen' && event.type === 'start') {
        this.modeManager?.transition('active');
        this.modeManager?.resetIdleTimer();
      }

      // record mode: buffer audio but don't trigger full pipeline
      if (mode === 'record') return;

      if (event.type === 'start') {
        logger.info('VAD start — buffering audio');
        this.audioBuffer = [];
        this.audioBufferBytes = 0;
        this.isListening = true;
        this.isProcessing = false;

        // [REVIEW FIX: HIGH] Hard time-cap: force process if VAD-end never arrives
        if (this.vadTimeout) clearTimeout(this.vadTimeout);
        this.vadTimeout = setTimeout(() => {
          if (this.isListening) {
            logger.warn({ limitMs: MAX_BUFFER_DURATION_MS }, 'VAD timeout — forcing utterance processing');
            this.triggerProcess();
          }
        }, MAX_BUFFER_DURATION_MS);
      } else if (event.type === 'end' && this.isListening && !this.isProcessing) {
        this.triggerProcess();
      }
    });

    // [REVIEW FIX: MEDIUM] WebSocket disconnect resets pipeline state
    audio.on('clientDisconnected', () => {
      this.resetState('WebSocket client disconnected');
    });

    mqtt.on('heartbeat', (data) => {
      logger.debug({ data }, 'Node heartbeat');
      this.emit('heartbeat', data);
    });
  }

  /** Deduplicates VAD-end + timeout trigger paths */
  private triggerProcess(): void {
    if (!this.isListening || this.isProcessing) return;
    if (this.vadTimeout) {
      clearTimeout(this.vadTimeout);
      this.vadTimeout = null;
    }
    const chunks = this.audioBuffer.length;
    logger.info({ chunks, bytes: this.audioBufferBytes }, 'Processing utterance');
    this.isListening = false;
    this.isProcessing = true;
    this.processUtterance(Buffer.concat(this.audioBuffer)).catch(err => {
      logger.error({ err }, 'Pipeline processing error');
      this.resetState('processing error');
    });
  }

  private async processUtterance(audioBuffer: Buffer): Promise<void> {
    const { stt, llm, tts, audio } = this.opts;

    // STAGE 3: STT — Transcribe audio to text
    logger.info('STT: transcribing...');
    const transcript = await stt.transcribe(audioBuffer);
    if (!transcript.trim()) {
      logger.warn('Empty transcript — skipping');
      this.isProcessing = false;
      return;
    }
    logger.info({ transcript }, 'STT complete');
    this.emit('transcript', transcript);

    // STAGE 4: Memory Injection (provided by Plan 02-02)
    const memoryContext = await this.opts.getMemoryContext(transcript);

    // STAGE 5: LLM — Generate streaming response
    logger.info('LLM: generating response...');
    const messages = [{ role: 'user' as const, content: transcript }];
    const tokenStream = llm.complete(messages, memoryContext);

    // STAGE 6+7: TTS streaming — pipe LLM tokens → TTS → Audio immediately
    logger.info('TTS: synthesizing...');
    
    // Intercept tokens to accumulate the full response for memory persistence
    let fullResponse = '';
    async function* interceptTokens(stream: AsyncIterable<string>) {
      for await (const token of stream) {
        fullResponse += token;
        yield token;
      }
    }

    const audioStream = tts.synthesizeStreaming(interceptTokens(tokenStream));

    for await (const audioChunk of audioStream) {
      audio.sendAudio(audioChunk as Buffer);
    }

    // Collect full LLM response for memory
    if (this.opts.onTurnComplete) {
      await this.opts.onTurnComplete(transcript, fullResponse);
    }

    logger.info('Turn complete');
    this.isProcessing = false;
    this.emit('turnComplete', { transcript });
  }
}

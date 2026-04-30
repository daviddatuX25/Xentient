/**
 * @deprecated — CUTOVER GATE in CONTEXT.md.
 * Current responsibilities that brain-basic must cover before deletion:
 *   - STT (Whisper) with timeout + error handling
 *   - LLM routing with context injection
 *   - TTS with provider fallback
 *   - xentient_play_audio result validation
 *   - Escalation ID correlation across the full chain
 * Do NOT delete until all five are proven via brain-basic.
 * Do NOT add new features to this module.
 */
import { EventEmitter } from 'events';
import pino from 'pino';
import { MqttClient } from '../comms/MqttClient';
import { AudioServer } from '../comms/AudioServer';
import { STTProvider, TTSProvider, LLMProvider, MemoryContext } from '../providers/types';
import type { ModeManager } from './ModeManager';
import type { Mode } from '../shared/contracts';

const logger = pino({ name: 'pipeline' });

// Safety limits for audio buffering (review fix: OOM guard)
const MAX_BUFFER_BYTES = 2 * 1024 * 1024; // 2MB ≈ 62.5s of PCM 16kHz 16-bit
const MAX_BUFFER_DURATION_MS = 45_000;    // 45s hard cap (force VAD-end)

export interface LatencyReport {
  vadBufferMs: number;    // VAD start → VAD end (audio buffering)
  sttMs: number;          // STT transcription
  memoryMs: number;       // Memory context retrieval
  llmFirstTokenMs: number; // LLM time to first token
  llmTotalMs: number;    // LLM first token → last audio chunk (includes pipelined TTS)
  ttsFirstChunkMs: number; // TTS time to first audio chunk
  ttsTotalMs: number;    // TTS total synthesis
  audioDeliveryMs: number; // Last audio chunk sent
  totalMs: number;        // VAD start → last audio sent
}

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
  private vadStartMs: number = 0;

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
    const t0 = this.vadStartMs;
    const vadEndMs = Date.now();
    const vadBufferMs = vadEndMs - t0;

    // STAGE 3: STT — Transcribe audio to text
    const sttStart = Date.now();
    logger.info('STT: transcribing...');
    const transcript = await stt.transcribe(audioBuffer);
    const sttMs = Date.now() - sttStart;
    if (!transcript.trim()) {
      logger.warn('Empty transcript — skipping');
      this.isProcessing = false;
      return;
    }
    logger.info({ transcript, sttMs }, 'STT complete');
    this.emit('transcript', transcript);

    // STAGE 4: Memory Injection (provided by Plan 02-02)
    const memStart = Date.now();
    const memoryContext = await this.opts.getMemoryContext(transcript);
    const memoryMs = Date.now() - memStart;

    // STAGE 5: LLM — Generate streaming response
    logger.info('LLM: generating response...');
    const llmStart = Date.now();
    let llmFirstTokenMs = 0;
    const messages = [{ role: 'user' as const, content: transcript }];
    const tokenStream = llm.complete(messages, memoryContext);

    // Intercept tokens to accumulate the full response for memory persistence
    let fullResponse = '';
    async function* interceptTokens(stream: AsyncIterable<string>) {
      for await (const token of stream) {
        if (!llmFirstTokenMs) llmFirstTokenMs = Date.now() - llmStart;
        fullResponse += token;
        yield token;
      }
    }

    // STAGE 6+7: TTS streaming — pipe LLM tokens → TTS → Audio immediately
    logger.info('TTS: synthesizing...');
    const ttsStart = Date.now();
    let ttsFirstChunkMs = 0;
    let audioDeliveryMs = 0;

    const audioStream = tts.synthesizeStreaming(interceptTokens(tokenStream));

    for await (const audioChunk of audioStream) {
      if (!ttsFirstChunkMs) ttsFirstChunkMs = Date.now() - ttsStart;
      audio.sendAudio(audioChunk as Buffer);
      audioDeliveryMs = Date.now();
    }

    const ttsTotalMs = Date.now() - ttsStart;
    const llmTotalMs = audioDeliveryMs > llmStart ? audioDeliveryMs - llmStart : Date.now() - llmStart;
    const totalMs = audioDeliveryMs > 0 ? audioDeliveryMs - t0 : Date.now() - t0;

    const report: LatencyReport = {
      vadBufferMs,
      sttMs,
      memoryMs,
      llmFirstTokenMs,
      llmTotalMs,
      ttsFirstChunkMs,
      ttsTotalMs,
      audioDeliveryMs: audioDeliveryMs > 0 ? audioDeliveryMs - ttsStart : 0,
      totalMs,
    };

    logger.info(report, 'Latency report');
    this.emit('latency', report);

    // Collect full LLM response for memory
    if (this.opts.onTurnComplete) {
      await this.opts.onTurnComplete(transcript, fullResponse);
    }

    logger.info('Turn complete');
    this.isProcessing = false;
    this.emit('turnComplete', { transcript });
  }
}

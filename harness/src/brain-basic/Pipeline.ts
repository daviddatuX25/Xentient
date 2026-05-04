import { EventEmitter } from "events";
import pino from "pino";
import type { STTProvider, TTSProvider, LLMProvider, MemoryContext } from "../providers/types";

const logger = pino({ name: "brain-pipeline" }, process.stderr);

export interface LatencyReport {
  sttMs: number;
  memoryMs: number;
  llmFirstTokenMs: number;
  llmTotalMs: number;
  ttsFirstChunkMs: number;
  ttsTotalMs: number;
  totalMs: number;
}

export interface BrainPipelineOptions {
  stt: STTProvider;
  tts: TTSProvider;
  llm: LLMProvider;
  playAudio: (audio: Buffer) => Promise<void>;
  getMemoryContext: (userMessage: string) => Promise<MemoryContext>;
  onTurnComplete?: (userMessage: string, aiResponse: string) => Promise<void>;
  onReasoningToken?: (token: string) => void;
}

export class BrainPipeline extends EventEmitter {
  private opts: BrainPipelineOptions;

  constructor(opts: BrainPipelineOptions) {
    super();
    this.opts = opts;
  }

  async processUtterance(audioBuffer: Buffer): Promise<void> {
    const { stt, llm, tts, playAudio } = this.opts;
    const onReasoningToken = this.opts.onReasoningToken;
    const t0 = Date.now();

    // STT
    const sttStart = Date.now();
    const transcript = await stt.transcribe(audioBuffer);
    const sttMs = Date.now() - sttStart;
    if (!transcript.trim()) {
      logger.warn("Empty transcript — skipping");
      return;
    }
    this.emit("transcript", transcript);

    // Memory
    const memStart = Date.now();
    const memoryContext = await this.opts.getMemoryContext(transcript);
    const memoryMs = Date.now() - memStart;

    // LLM
    const llmStart = Date.now();
    let llmFirstTokenMs = 0;
    let fullResponse = "";
    const messages = [{ role: "user" as const, content: transcript }];
    const tokenStream = llm.complete(messages, memoryContext);

    async function* interceptTokens(stream: AsyncIterable<string>) {
      for await (const token of stream) {
        if (!llmFirstTokenMs) llmFirstTokenMs = Date.now() - llmStart;
        fullResponse += token;
        // Emit reasoning token to brain stream (F10: cannot use return value)
        onReasoningToken?.(token);
        yield token;
      }
    }

    // TTS → play via MCP tool
    const ttsStart = Date.now();
    let ttsFirstChunkMs = 0;
    const audioStream = tts.synthesizeStreaming(interceptTokens(tokenStream));

    for await (const audioChunk of audioStream) {
      if (!ttsFirstChunkMs) ttsFirstChunkMs = Date.now() - ttsStart;
      await playAudio(audioChunk as Buffer);
    }

    const report: LatencyReport = {
      sttMs,
      memoryMs,
      llmFirstTokenMs,
      llmTotalMs: Date.now() - llmStart,
      ttsFirstChunkMs,
      ttsTotalMs: Date.now() - ttsStart,
      totalMs: Date.now() - t0,
    };
    this.emit("latency", report);

    if (this.opts.onTurnComplete) {
      await this.opts.onTurnComplete(transcript, fullResponse);
    }
    this.emit("turnComplete", { transcript });
  }
}
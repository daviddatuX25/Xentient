import * as dotenv from "dotenv";
dotenv.config();

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import config from "../config/default.json";
import { BrainPipeline } from "./brain-basic/Pipeline";
import { DeepgramProvider } from "./providers/stt/DeepgramProvider";
import { WhisperProvider } from "./providers/stt/WhisperProvider";
import { ElevenLabsProvider } from "./providers/tts/ElevenLabsProvider";
import { OpenAIProvider } from "./providers/llm/OpenAIProvider";
import type { STTProvider, TTSProvider, LLMProvider } from "./providers/types";
import { resolve } from "path";
import pino from "pino";

const logger = pino({ name: "brain-basic" }, process.stderr);

function createSTTProvider(): STTProvider {
  const provider = process.env.STT_PROVIDER ?? config.stt.provider;
  if (provider === "deepgram") {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY not set");
    return new DeepgramProvider(key);
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new WhisperProvider(key);
}

function createTTSProvider(): TTSProvider {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  return new ElevenLabsProvider(key, process.env.ELEVENLABS_VOICE_ID ?? config.tts.voiceId);
}

function createLLMProvider(): LLMProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAIProvider(key, config.llm.model);
}

async function main() {
  logger.info("Starting Xentient Brain (basic-llm)...");

  // Connect to Core's MCP server via stdio
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(__dirname, "core.js")],
  });

  const client = new Client({ name: "brain-basic", version: "1.0.0" });
  await client.connect(transport);
  logger.info("Connected to Xentient Core MCP server");

  // List available tools
  const { tools } = await client.listTools();
  logger.info({ tools: tools.map((t) => t.name) }, "Available MCP tools");

  // Create providers
  const stt = createSTTProvider();
  const tts = createTTSProvider();
  const llm = createLLMProvider();

  // MCP tool wrapper for audio playback
  const playAudio = async (audioBuffer: Buffer): Promise<void> => {
    await client.callTool({
      name: "xentient_play_audio",
      arguments: {
        data: audioBuffer.toString("base64"),
        format: "pcm_s16le",
      },
    });
  };

  const getMemoryContext = async () => ({
    userProfile: "",
    relevantEpisodes: "",
    extractedFacts: "",
  });

  const pipeline = new BrainPipeline({ stt, tts, llm, playAudio, getMemoryContext });

  // Subscribe to MCP events using notification handler (Zod schema pattern per RF-9)
  // The SDK requires Zod schemas for setNotificationHandler, but custom events use
  // a generic notification schema. We use client.on("notification") as fallback.
  client.on("notification", (notification: { method?: string; params?: Record<string, unknown> }) => {
    if (!notification.method || !notification.params) return;

    switch (notification.method) {
      case "xentient/motion_detected":
        logger.info({ params: notification.params }, "Motion detected — waking from sleep");
        client.callTool({ name: "xentient_set_mode", arguments: { mode: "listen" } }).catch((err: Error) =>
          logger.error({ err }, "Failed to set mode to listen after motion"));
        break;

      case "xentient/voice_start":
        logger.info("Voice start — transitioning to active mode");
        client.callTool({ name: "xentient_set_mode", arguments: { mode: "active" } }).catch((err: Error) =>
          logger.error({ err }, "Failed to set mode to active after voice start"));
        break;

      case "xentient/voice_end": {
        const params = notification.params as { audio?: string; timestamp: number; duration_ms: number };
        logger.info({ duration_ms: params.duration_ms }, "Voice end — processing utterance");

        if (params.audio) {
          const audioBuffer = Buffer.from(params.audio, "base64");
          pipeline.processUtterance(audioBuffer).catch((err: Error) =>
            logger.error({ err }, "Pipeline processing error"));
        }

        // Return to listen mode after processing
        client.callTool({ name: "xentient_set_mode", arguments: { mode: "listen" } }).catch((err: Error) =>
          logger.error({ err }, "Failed to return to listen mode"));
        break;
      }

      case "xentient/sensor_update":
        logger.debug({ params: notification.params }, "Sensor update received");
        break;

      case "xentient/mode_changed":
        logger.info({ params: notification.params }, "Mode changed");
        break;
    }
  });

  logger.info("Brain-basic ready — listening for events from Core");
}

// ── Process supervision (GAP-3/T-20) ────────────────────────────
let restartCount = 0;
const MAX_RESTARTS = 5;

async function supervisedMain() {
  while (restartCount < MAX_RESTARTS) {
    try {
      await main();
      break; // Clean exit
    } catch (err) {
      restartCount++;
      const backoff = 2000 * restartCount;
      logger.error({ err, restartCount, backoff }, "Core connection lost, restarting...");
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  if (restartCount >= MAX_RESTARTS) {
    logger.error("Core crashed too many times, giving up");
    process.exit(1);
  }
}

supervisedMain().catch((err) => {
  logger.error({ err }, "Fatal brain error");
  process.exit(1);
});
import * as dotenv from "dotenv";
dotenv.config();

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
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

/** Validate required env vars before spawning any child processes. */
function validateEnv(): void {
  const missing: string[] = [];

  const sttProvider = process.env.STT_PROVIDER ?? config.stt.provider;
  if (sttProvider === "deepgram") {
    if (!process.env.DEEPGRAM_API_KEY) missing.push("DEEPGRAM_API_KEY");
  } else if (!process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY (required for Whisper STT)");
  }

  if (!process.env.ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");

  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    missing.push("LLM_API_KEY or OPENAI_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function createSTTProvider(): STTProvider {
  const provider = process.env.STT_PROVIDER ?? config.stt.provider;
  if (provider === "deepgram") {
    return new DeepgramProvider(process.env.DEEPGRAM_API_KEY!);
  }
  return new WhisperProvider(process.env.OPENAI_API_KEY!);
}

function createTTSProvider(): TTSProvider {
  return new ElevenLabsProvider(process.env.ELEVENLABS_API_KEY!, process.env.ELEVENLABS_VOICE_ID ?? config.tts.voiceId);
}

function createLLMProvider(): LLMProvider {
  const key = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY!;
  const baseURL = process.env.LLM_BASE_URL;
  return new OpenAIProvider(key, process.env.LLM_MODEL ?? config.llm.model, baseURL);
}

/** Active MCP client reference — tracked for cleanup on restart. */
let activeClient: Client | null = null;

async function main() {
  logger.info("Starting Xentient Brain (basic-llm)...");

  // Connect to Core's MCP server.
  // When CORE_MCP_URL is set, use SSE transport (Core runs separately).
  // When unset, spawn Core as a child process via stdio (legacy/dev mode).
  let transport: SSEClientTransport | StdioClientTransport;
  const coreMcpUrl = process.env.CORE_MCP_URL;
  if (coreMcpUrl) {
    logger.info({ coreMcpUrl }, "Using SSE transport — connecting to external Core");
    transport = new SSEClientTransport(new URL(coreMcpUrl));
  } else {
    logger.info("CORE_MCP_URL not set — spawning Core via stdio (legacy mode)");
    const isDev = !__dirname.includes("dist");
    const corePath = resolve(__dirname, isDev ? "core.ts" : "core.js");
    transport = new StdioClientTransport(
      isDev
        ? {
            command: "npx",
            args: ["ts-node", "--transpile-only", corePath],
            env: { ...process.env, FORCE_COLOR: "0" },
          }
        : {
            command: process.execPath,
            args: [corePath],
          },
    );
  }

  const client = new Client({ name: "brain-basic", version: "1.0.0" });
  await client.connect(transport);
  activeClient = client;
  logger.info("Connected to Xentient Core MCP server");

  // List available tools
  const { tools } = await client.listTools();
  logger.info({ tools: tools.map((t) => t.name) }, "Available MCP tools");

  // Create providers (env vars already validated by supervisedMain)
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

  // Track the current escalation ID so the onReasoningToken callback can reference it
  let currentEscalationId: string | null = null;

  const getMemoryContext = async () => ({
    userProfile: "",
    relevantEpisodes: "",
    extractedFacts: "",
  });

  const pipeline = new BrainPipeline({
    stt, tts, llm, playAudio, getMemoryContext,
    onReasoningToken: (token: string) => {
      if (!currentEscalationId) return;
      client.callTool({
        name: "xentient_brain_stream",
        arguments: {
          escalation_id: currentEscalationId,
          subtype: "reasoning_token",
          payload: { token },
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to stream reasoning token"));
    },
  });

  // Subscribe to MCP events using fallbackNotificationHandler.
  client.fallbackNotificationHandler = async (notification) => {
    if (!notification.method || !notification.params) return;
    const params = notification.params as Record<string, unknown>;

    switch (notification.method) {
      // ── New path: skill_escalated (via EventBridge → _voice-capture → supervisor)
      case "xentient/skill_escalated": {
        const { escalationId, event, context } = params as {
          escalationId: string;
          event: string;
          context?: { audio?: string };
        };
        if (event !== "voice_command" || !context?.audio) break;

        currentEscalationId = escalationId;
        logger.info({ escalationId }, "Escalation received — processing voice command");

        const audioBuffer = Buffer.from(context.audio, "base64");

        // Signal received
        await client.callTool({
          name: "xentient_brain_stream",
          arguments: { escalation_id: escalationId, subtype: "escalation_received", payload: { skillId: params.skillId } },
        }).catch((err: Error) => logger.error({ err }, "Failed to signal escalation_received"));

        // Run pipeline (tokens stream via onReasoningToken callback)
        await pipeline.processUtterance(audioBuffer).catch((err: Error) =>
          logger.error({ err }, "Pipeline processing error"));

        // Signal complete — clears the 8s timeout in EscalationSupervisor
        await client.callTool({
          name: "xentient_brain_stream",
          arguments: { escalation_id: escalationId, subtype: "escalation_complete", payload: {} },
        }).catch((err: Error) => logger.error({ err }, "Failed to signal escalation_complete"));

        currentEscalationId = null;
        break;
      }

      // ── Legacy path: direct voice_end (kept as commented fallback — do not delete)
      // case "xentient/voice_end": { ... }

      case "xentient/motion_detected":
        logger.info({ params }, "Motion detected — waking from sleep");
        client.callTool({ name: "xentient_set_mode", arguments: { mode: "listen" } }).catch((err: Error) =>
          logger.error({ err }, "Failed to set mode to listen after motion"));
        break;

      case "xentient/voice_start":
        logger.info("Voice start — transitioning to active mode");
        client.callTool({ name: "xentient_set_mode", arguments: { mode: "active" } }).catch((err: Error) =>
          logger.error({ err }, "Failed to set mode to active after voice start"));
        break;

      case "xentient/voice_end": {
        // Legacy direct voice_end path — still active if EventBridge routing is disabled
        const voiceParams = params as { audio?: string; timestamp: number; duration_ms: number };
        logger.info({ duration_ms: voiceParams.duration_ms }, "[legacy] Voice end — processing utterance directly");
        if (voiceParams.audio) {
          const audioBuffer = Buffer.from(voiceParams.audio, "base64");
          pipeline.processUtterance(audioBuffer).catch((err: Error) =>
            logger.error({ err }, "Pipeline processing error"));
        }
        client.callTool({ name: "xentient_set_mode", arguments: { mode: "listen" } }).catch((err: Error) =>
          logger.error({ err }, "Failed to return to listen mode"));
        break;
      }

      case "xentient/sensor_update":
        logger.debug({ params }, "Sensor update received");
        break;

      case "xentient/mode_changed":
        logger.info({ params }, "Mode changed");
        break;
    }
  };

  logger.info("Brain-basic ready — listening for events from Core");
}

// ── Process supervision (GAP-3/T-20) ────────────────────────────
let restartCount = 0;
const MAX_RESTARTS = 5;
const PORT_EXHAUSTION_RE = /ports \d+-\d+ all in use/i;

function isPortExhaustion(err: unknown): boolean {
  if (err instanceof Error && PORT_EXHAUSTION_RE.test(err.message)) return true;
  // MCP wraps the core's exit in a connection-closed error — check the stack too
  if (err instanceof Error && err.stack && PORT_EXHAUSTION_RE.test(err.stack)) return true;
  return false;
}

async function supervisedMain() {
  // Hard exit on missing env vars — retrying won't help if config is absent
  try {
    validateEnv();
  } catch (err) {
    logger.fatal({ err }, "Required environment variables missing — hard exit");
    process.exit(1);
  }

  while (restartCount < MAX_RESTARTS) {
    try {
      await main();
      break; // Clean exit
    } catch (err) {
      // Port exhaustion is a persistent config clash — restarting won't help
      if (isPortExhaustion(err)) {
        logger.fatal({ err }, "Core failed to start: all ports in use. Stop other Xentient instances or set WS_PORT/CAMERA_WS_PORT/CONTROL_PORT to free ports.");
        process.exit(1);
      }

      // Tear down the MCP client and its child process before restarting
      if (activeClient) {
        try {
          await activeClient.close();
        } catch {
          // Ignore cleanup errors during shutdown
        }
        activeClient = null;
      }
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
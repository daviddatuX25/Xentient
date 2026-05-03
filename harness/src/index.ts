import * as dotenv from "dotenv";
dotenv.config();

import config from "../config/default.json";
import { MqttClient } from "./comms/MqttClient";
import { AudioServer } from "./comms/AudioServer";
import { CameraServer } from "./comms/CameraServer";
import { ControlServer } from "./comms/ControlServer";
import { DeepgramProvider } from "./providers/stt/DeepgramProvider";
import { WhisperProvider } from "./providers/stt/WhisperProvider";
import { ElevenLabsProvider } from "./providers/tts/ElevenLabsProvider";
import { OpenAIProvider } from "./providers/llm/OpenAIProvider";
import { Pipeline, LatencyReport } from "./engine/Pipeline";
import { ModeManager } from "./engine/ModeManager";
import { STTProvider, TTSProvider, LLMProvider } from "./providers/types";
import type { SensorCache } from "./shared/types";
import { PROTOCOL_VERSION } from "./shared/contracts";
import pino from "pino";

const logger = pino({ name: "xentient-core" }, process.stderr); // GAP-11/T-22: stderr for MCP stdio safety

// Sensor cache for status endpoint
const sensorCache: SensorCache = {
  temperature: null,
  humidity: null,
  pressure: null,
  motion: null,
  lastMotionAt: null,
};

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
  logger.info({ version: PROTOCOL_VERSION }, "Starting Xentient Core...");

  const mqtt = new MqttClient(process.env.MQTT_BROKER_URL ?? config.mqtt.brokerUrl, config.nodeId);
  const audioServer = new AudioServer(config.audio.wsPort);
  const cameraServer = new CameraServer(config.camera.wsPort, config.camera.idleTimeoutMs);
  const stt = createSTTProvider();
  const tts = createTTSProvider();
  const llm = createLLMProvider();

  // Basic mode: direct LLM call (no memory system — Mem0 integration is post-demo)
  // Brain Router will dispatch to Hermes/Mem0/OpenClaw based on Space config
  const getMemoryContext = async () => ({ userProfile: "", relevantEpisodes: "", extractedFacts: "" });

  const pipeline = new Pipeline({ stt, tts, llm, mqtt, audio: audioServer, getMemoryContext });

  // Mode Manager — wires mode state machine to MQTT events and Pipeline
  const modeManager = new ModeManager(mqtt);
  pipeline.setModeManager(modeManager);

  mqtt.on("modeCommand", (data) => modeManager.handleModeCommand(data));
  mqtt.on("sensor", (data) => modeManager.handleSensorEvent(data));

  modeManager.on("modeChange", ({ from, to }) => {
    logger.info({ from, to }, "Mode changed");
  });

  pipeline.on("transcript", (t) => logger.info({ transcript: t }, "User said"));
  pipeline.on("latency", (r: LatencyReport) => {
    logger.info(r, `Latency: ${r.totalMs}ms (STT ${r.sttMs} + LLM ${r.llmTotalMs} + TTS ${r.ttsTotalMs})`);
  });
  pipeline.on("turnComplete", (t) => logger.info(t, "Turn complete"));
  pipeline.on("heartbeat", (h) => logger.debug(h, "Heartbeat"));

  // Camera: AudioServer discriminates 0xCA frames → CameraServer forwards to dashboard
  audioServer.on("cameraFrame", (frame) => cameraServer.handleFrame(frame));
  cameraServer.on("cameraOnline", () => logger.info("Camera stream online"));
  cameraServer.on("cameraOffline", () => logger.warn("Camera stream offline — no frames for 10s"));

  // Control server — HTTP API + static files + SSE for browser test page
  const controlPort = parseInt(process.env.CONTROL_PORT ?? "3000", 10);
  const controlServer = new ControlServer(controlPort, mqtt, modeManager, cameraServer, sensorCache);
  await controlServer.start();

  logger.info({ wsPort: config.audio.wsPort, cameraPort: config.camera.wsPort, controlPort, mqtt: config.mqtt.brokerUrl }, "Core ready — open http://localhost:" + controlPort);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    modeManager.clearIdleTimer();
    mqtt.disconnect();
    cameraServer.close();
    audioServer.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal core error");
  process.exit(1);
});
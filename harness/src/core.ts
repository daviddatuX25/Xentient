import * as dotenv from "dotenv";
dotenv.config();

import config from "../config/default.json";
import { MqttClient } from "./comms/MqttClient";
import { AudioServer } from "./comms/AudioServer";
import { CameraServer } from "./comms/CameraServer";
import { ControlServer } from "./comms/ControlServer";
import { ModeManager } from "./engine/ModeManager";
import { startMcpServer } from "./mcp/server";
import type { SensorCache } from "./shared/types";
import { MCP_EVENTS, PROTOCOL_VERSION } from "./shared/contracts";
import pino from "pino";

const logger = pino({ name: "xentient-core" }, process.stderr);

async function main() {
  logger.info({ version: PROTOCOL_VERSION }, "Starting Xentient Core...");

  const mqtt = new MqttClient(
    process.env.MQTT_BROKER_URL ?? config.mqtt.brokerUrl,
    config.nodeId ?? "node-01",
  );
  const audioServer = new AudioServer(config.audio.wsPort);
  const cameraServer = new CameraServer(config.camera.wsPort, config.camera.idleTimeoutMs);
  const modeManager = new ModeManager(mqtt);

  // Sensor cache for MCP tools
  const sensorCache: SensorCache = {
    temperature: null,
    humidity: null,
    pressure: null,
    motion: null,
    lastMotionAt: null,
  };

  // Wire MQTT events -> ModeManager
  mqtt.on("modeCommand", (data) => modeManager.handleModeCommand(data));
  mqtt.on("sensor", (data) => modeManager.handleSensorEvent(data));
  modeManager.on("modeChange", ({ from, to }) => {
    logger.info({ from, to }, "Mode changed");
  });

  // Camera: AudioServer discriminates 0xCA frames -> CameraServer forwards to dashboard
  audioServer.on("cameraFrame", (frame) => cameraServer.handleFrame(frame));
  cameraServer.on("cameraOnline", () => logger.info("Camera stream online"));
  cameraServer.on("cameraOffline", () => logger.warn("Camera stream offline - no frames for 10s"));

  // Start MCP server (stdio transport - brain processes connect here)
  const mcpServer = await startMcpServer({
    mqtt,
    audio: audioServer,
    camera: cameraServer,
    modeManager,
    sensorCache,
  });

  // -- AudioAccumulator (GAP-2/T-19): buffer PCM chunks during active/listen --
  const MAX_AUDIO_BYTES = 16_000 * 2 * 30; // 30s cap: 16kHz * 2 bytes * 30s = 960KB
  let audioChunks: Buffer[] = [];
  let isAccumulating = false;

  audioServer.on("audioChunk", (chunk: Buffer) => {
    const mode = modeManager.getMode();
    if (mode === "active" || mode === "listen") {
      isAccumulating = true;
      audioChunks.push(chunk);
      // Safety cap: if buffer exceeds 30s of audio, flush early to prevent OOM
      const totalBytes = audioChunks.reduce((sum, c) => sum + c.length, 0);
      if (totalBytes > MAX_AUDIO_BYTES) {
        logger.warn({ totalBytes, maxBytes: MAX_AUDIO_BYTES }, "AudioAccumulator cap reached - flushing early");
        const combined = Buffer.concat(audioChunks);
        mcpServer.notification({
          method: MCP_EVENTS.voice_end,
          params: {
            timestamp: Date.now(),
            duration_ms: combined.length / 32,
            audio: combined.toString("base64"),
          },
        }).catch((err: Error) => logger.error({ err }, "Failed to send voice_end event (cap flush)"));
        audioChunks = [];
        isAccumulating = false;
      }
    }
  });

  // VAD-end -> flush audio buffer as voice_end event (GAP-1/RF-4)
  mqtt.on("triggerPipeline", (data: unknown) => {
    const d = data as { source?: string; stage?: string };
    if (d.source === "voice" && d.stage === "end" && isAccumulating) {
      const combined = Buffer.concat(audioChunks);
      mcpServer.notification({
        method: MCP_EVENTS.voice_end,
        params: {
          timestamp: Date.now(),
          duration_ms: combined.length / 32,
          audio: combined.toString("base64"),
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to send voice_end event"));
      audioChunks = [];
      isAccumulating = false;
    }
  });

  // Control server - HTTP API + static files + SSE for browser test page
  const controlPort = parseInt(process.env.CONTROL_PORT ?? "3000", 10);
  const controlServer = new ControlServer(controlPort, mqtt, modeManager, cameraServer, sensorCache);
  await controlServer.start();

  logger.info(
    { wsPort: config.audio.wsPort, cameraPort: config.camera.wsPort, controlPort, mqtt: config.mqtt.brokerUrl },
    "Core ready - open http://localhost:" + controlPort,
  );

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
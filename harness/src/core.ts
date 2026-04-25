import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import config from "../config/default.json";
import { MqttClient } from "./comms/MqttClient";
import { AudioServer } from "./comms/AudioServer";
import { CameraServer } from "./comms/CameraServer";
import { ControlServer } from "./comms/ControlServer";
import { ModeManager } from "./engine/ModeManager";
import { RuleEngine } from "./engine/RuleEngine";
import type { FastAction, SlowAction } from "./engine/RuleEngine";
import { HealthMonitor } from "./engine/HealthMonitor";
import { startMcpServer } from "./mcp/server";
import type { SensorCache } from "./shared/types";
import type { Rule, RuleAction, RuleContext } from "./shared/types";
import { MCP_EVENTS, PROTOCOL_VERSION } from "./shared/contracts";
import pino from "pino";

const logger = pino({ name: "xentient-core" }, process.stderr);

/** Play a chime preset by loading WAV from assets/chimes/ and sending as PCM. */
function playChime(preset: string, audioServer: AudioServer): void {
  const chimePath = path.resolve(__dirname, "..", "assets", "chimes", `${preset}.wav`);
  try {
    const wavBuf = fs.readFileSync(chimePath);
    const pcm = wavBuf.subarray(44); // Strip 44-byte WAV header
    audioServer.sendAudio(pcm);
  } catch (err) {
    logger.error({ err, preset }, "Failed to play chime");
  }
}

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

  // ── Rule Engine ──────────────────────────────────────────────────────
  // Create RuleEngine before MCP server so it can be passed as a dep.
  // MCP notification callbacks are set after mcpServer is created.
  let mcpServerNotify: ((method: string, params: Record<string, unknown>) => Promise<void>) | null = null;

  const executeFastAction: FastAction = (action: RuleAction, _rule: Rule) => {
    switch (action.type) {
      case "set_mode":
        modeManager.transition(action.mode);
        break;
      case "set_lcd":
        mqtt.publish("xentient/display", {
          v: 1, type: "display_update", mode: "expression",
          line1: action.line1, line2: action.line2, duration: 0,
        });
        break;
      case "play_chime":
        playChime(action.preset, audioServer);
        break;
      case "mqtt_publish":
        mqtt.publish(action.topic, action.payload);
        break;
      case "chain":
        for (const sub of action.actions) {
          executeFastAction(sub, _rule);
        }
        break;
      // "notify" is slow-path, not handled here
    }
  };

  const sendRuleTriggered: SlowAction = (rule: Rule, ctx: RuleContext) => {
    if (!mcpServerNotify) {
      logger.warn({ ruleId: rule.id }, "Cannot send rule_triggered — MCP server not ready");
      return;
    }
    mcpServerNotify(MCP_EVENTS.rule_triggered, {
      ruleId: rule.id,
      event: rule.action.type === "notify" ? (rule.action as { event: string }).event : rule.trigger.type,
      context: { ...ctx },
      timestamp: Date.now(),
    }).catch((err: Error) => logger.error({ err, ruleId: rule.id }, "Failed to send rule_triggered"));
  };

  const ruleEngine = new RuleEngine(
    sensorCache,
    modeManager,
    executeFastAction,
    sendRuleTriggered,
    config.rules?.tickMs ?? 2000,
  );
  ruleEngine.loadStatic((config.rules?.static ?? []) as Rule[]);
  ruleEngine.start();

  // Start MCP server — needs ruleEngine for tool deps
  const mcpServer = await startMcpServer({
    mqtt,
    audio: audioServer,
    camera: cameraServer,
    modeManager,
    sensorCache,
    ruleEngine,
    onToolCall: () => healthMonitor.recordActivity("basic"),
  });

  // Wire up notification helper after mcpServer is created
  mcpServerNotify = async (method: string, params: Record<string, unknown>) => {
    mcpServer.notification({ method, params });
  };

  // Wire MQTT events -> ModeManager + RuleEngine
  mqtt.on("modeCommand", (data) => modeManager.handleModeCommand(data));
  mqtt.on("sensor", (data) => {
    modeManager.handleSensorEvent(data);
    // Forward motion events to RuleEngine for event-type triggers
    const d = data as { peripheralType?: number };
    if (d.peripheralType === 0x11) {
      ruleEngine.onEvent("motion_detected");
    }
  });
  modeManager.on("modeChange", ({ from, to }) => {
    logger.info({ from, to }, "Mode changed");
    ruleEngine.onModeChange(from, to);
  });

  // Camera: AudioServer discriminates 0xCA frames -> CameraServer forwards to dashboard
  audioServer.on("cameraFrame", (frame) => cameraServer.handleFrame(frame));
  cameraServer.on("cameraOnline", () => logger.info("Camera stream online"));
  cameraServer.on("cameraOffline", () => logger.warn("Camera stream offline - no frames for 10s"));

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

  // ── Health Monitor ──────────────────────────────────────────────────
  const healthMonitor = new HealthMonitor(
    () => {
      logger.warn("Brain unresponsive — no MCP activity for 60s");
      if (controlServer && typeof controlServer.broadcastSSE === "function") {
        controlServer.broadcastSSE({ type: "brain_status", status: "unresponsive" });
      }
    },
    () => {
      logger.error("Brain disconnected — no MCP activity for 120s, activating failover");
      if (controlServer && typeof controlServer.broadcastSSE === "function") {
        controlServer.broadcastSSE({ type: "brain_status", status: "disconnected" });
      }
      const failoverMode = config.rules?.failoverMode ?? "rule-only";
      if (failoverMode === "sleep") {
        modeManager.transition("sleep");
      }
      // rule-only: Core continues autonomously via RuleEngine — no action needed
    },
    () => {
      logger.info("Brain reconnected");
      if (controlServer && typeof controlServer.broadcastSSE === "function") {
        controlServer.broadcastSSE({ type: "brain_status", status: "connected" });
      }
    },
  );
  healthMonitor.start();

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
    healthMonitor.stop();
    ruleEngine.stop();
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
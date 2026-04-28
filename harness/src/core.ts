import * as dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import config from "../config/default.json";
import { MqttClient } from "./comms/MqttClient";
import { AudioServer } from "./comms/AudioServer";
import { CameraServer } from "./comms/CameraServer";
import { ControlServer } from "./comms/ControlServer";
import { EventBridge } from "./comms/EventBridge";
import { ModeManager } from "./engine/ModeManager";
import { SpaceManager } from "./engine/SpaceManager";
import { SkillPersistence } from "./engine/SkillPersistence";
import { PackLoader } from "./engine/PackLoader";
import { SensorHistory } from "./engine/SensorHistory";
import { startMcpServer } from "./mcp/server";
import type { SensorCache, Space } from "./shared/types";
import { MCP_EVENTS, PROTOCOL_VERSION, PERIPHERAL_IDS } from "./shared/contracts";
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
  // Mutable ref pattern: create deps object first, pass to startMcpServer,
  // then assign spaceManager after both mcpServer and spaceManager exist.
  const mcpDeps: { mqtt: MqttClient; audio: AudioServer; camera: CameraServer; modeManager: ModeManager; sensorCache: SensorCache; spaceManager?: SpaceManager; eventBridge?: EventBridge; packLoader?: PackLoader } = {
    mqtt,
    audio: audioServer,
    camera: cameraServer,
    modeManager,
    sensorCache,
  };
  const mcpServer = await startMcpServer(mcpDeps as any);

  // --- SpaceManager (Xentient Layers) ---
  // Circular dep: SpaceManager needs mcpServer, startMcpServer needs spaceManager.
  // Solved by making spaceManager optional in McpToolDeps and assigning after both exist.
  const spaceManager = new SpaceManager(
    mcpServer,
    modeManager,
    mqtt,
    () => ({ ...sensorCache }),  // sensorSnapshot factory (plain object, no methods)
    () => cameraServer.getLatestJpeg?.()?.toString('base64'),
  );

  // Wire spaceManager into MCP deps (createToolHandlers captures deps by reference)
  mcpDeps.spaceManager = spaceManager;

  // Default Space (single-node v1)
  const defaultSpace: Space = {
    id: 'default',
    nodeBaseId: config.nodeId ?? 'node-01',
    activePack: 'default',
    spaceMode: modeManager.getMode(),
    activeMode: 'default',
    integrations: [],
    sensors: ['temperature', 'humidity', 'motion'],
  };
  spaceManager.addSpace(defaultSpace);
  logger.info({ spaceId: defaultSpace.id }, 'Default space initialized');

  // --- Skill persistence: load brain-registered skills from disk ---
  const persistence = new SkillPersistence(path.join(process.cwd(), 'var'));
  spaceManager.setPersistence(persistence);
  const persistedSkills = persistence.load();
  for (const skill of persistedSkills) {
    spaceManager.registerSkill(skill);
  }

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
        // @ts-expect-error McpServer.notification() exists at runtime but is not on the high-level type
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
      // @ts-expect-error McpServer.notification() exists at runtime but is not on the high-level type
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

  // CRITICAL: Listener registration order determines execution sequence.
  // Node.js EventEmitter calls listeners in registration order (FIFO).
  // The correct order for modeChange listeners is:
  //   1. Logger (above — already registered)
  //   2. updateSpaceMode (syncs SpaceMode so skills see correct mode)
  //   3. EventBridge (dispatches to skill system — must see correct SpaceMode)
  // If EventBridge fires before updateSpaceMode, skills querying SpaceMode
  // during mode-triggered execution will see stale state.
  // NOTE: updateSpaceMode only reads spaceManager.spaces (populated by addSpace
  // at line 91). It does NOT depend on EventBridge, PackLoader, or ControlServer,
  // so placing it before those components is safe.
  modeManager.on("modeChange", ({ from, to }) => {
    spaceManager.updateSpaceMode('default', to);
    logger.info({ from, to }, 'Mode transition — SpaceMode synced');
  });

  // --- EventBridge: declarative MQTT/Mode → Skill event routing ---
  // NOTE: EventBridge dispatches events to the Skill system. The MCP notification
  // path (wireMcpEvents in mcp/events.ts) updates sensor cache and notifies Brain.
  // Both paths subscribe to the same MQTT events but serve different purposes.
  // See EventBridge.ts header for details.
  const eventBridge = new EventBridge(mqtt, spaceManager, modeManager);
  eventBridge.start();

  // Wire eventBridge into MCP deps (for runtime mapping tools)
  mcpDeps.eventBridge = eventBridge;

  // --- PackLoader: load skill packs from packs/ directory ---
  const packsDir = path.join(process.cwd(), 'packs');
  const packLoader = new PackLoader(
    packsDir,
    (skill) => spaceManager.registerSkill(skill),
    (id) => spaceManager.removeSkill(id),
  );
  mcpDeps.packLoader = packLoader;

  // Auto-load default pack if it exists
  if (fs.existsSync(path.join(packsDir, 'default', 'skills.json'))) {
    try {
      packLoader.loadPack('default');
    } catch (err) {
      logger.error({ err }, 'Failed to load default pack — continuing without pack skills');
    }
  }

  // --- SensorHistory: ring buffer for sensor readings (5min window) ---
  const sensorHistory = new SensorHistory();
  // Push sensor cache snapshots into history on each BME280 reading
  mqtt.on("sensor", (data: unknown) => {
    const d = data as { peripheralType?: number };
    if (d.peripheralType === PERIPHERAL_IDS.BME280) {
      sensorHistory.push(sensorCache);
    }
  });

  // Control server - HTTP API + static files + SSE for browser test page
  const controlPort = parseInt(process.env.CONTROL_PORT ?? "3000", 10);
  const controlServer = new ControlServer(
    {
      mqtt,
      modeManager,
      cameraServer,
      sensorCache,
      sensorHistory,
      spaceManager,
      eventBridge,
      packLoader,
      skillLog: spaceManager.skillLog,
      getBrainConnected: () => true, // v1: stdio transport always connected
    },
    controlPort,
  );

  // Relay SkillExecutor observability events to dashboard via SSE
  spaceManager.on('skill_fired', (event: any) => {
    controlServer.broadcastSkillEvent({ type: 'skill_fired', ...event });
  });
  spaceManager.on('skill_escalated', (event: any) => {
    controlServer.broadcastSkillEvent({ type: 'skill_escalated', ...event });
  });
  spaceManager.on('skill_conflict', (event: any) => {
    controlServer.broadcastSkillEvent({ type: 'skill_conflict', ...event });
  });

  await controlServer.start();

  logger.info(
    { wsPort: config.audio.wsPort, cameraPort: config.camera.wsPort, controlPort, mqtt: config.mqtt.brokerUrl },
    "Core ready - open http://localhost:" + controlPort,
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    eventBridge.stop();
    spaceManager.stopAll();
    logger.info("SpaceManager stopped — all SkillExecutors shut down");
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
import type { MqttClient } from "../comms/MqttClient";
import type { ModeManager, ModeChangeEvent } from "../engine/ModeManager";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SensorCache } from "../shared/types";
import { MCP_EVENTS } from "../shared/contracts";
import { PERIPHERAL_IDS } from "../shared/contracts";
import pino from "pino";

const logger = pino({ name: "mcp-events" }, process.stderr);

export function wireMcpEvents(
  server: McpServer,
  mqtt: MqttClient,
  modeManager: ModeManager,
  sensorCache: SensorCache,
): void {
  // motion_detected: PIR ISR -> MQTT -> Core -> Brain
  mqtt.on("sensor", (data: unknown) => {
    const d = data as { peripheralType?: number; payload?: { motion?: boolean } };
    if (d.peripheralType === PERIPHERAL_IDS.PIR && d.payload?.motion) {
      sensorCache.motion = true;
      sensorCache.lastMotionAt = Date.now();
      server.notification({
        method: MCP_EVENTS.motion_detected,
        params: {
          timestamp: Date.now(),
          nodeBaseId: mqtt.nodeId,
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to send motion_detected event"));
    }

    // sensor_update: BME280 periodic -> Brain
    if (d.peripheralType === PERIPHERAL_IDS.BME280) {
      const p = d.payload as { temperature?: number; humidity?: number; pressure?: number };
      sensorCache.temperature = p.temperature ?? sensorCache.temperature;
      sensorCache.humidity = p.humidity ?? sensorCache.humidity;
      sensorCache.pressure = p.pressure ?? sensorCache.pressure;
      server.notification({
        method: MCP_EVENTS.sensor_update,
        params: {
          temperature: sensorCache.temperature!,
          humidity: sensorCache.humidity!,
          pressure: sensorCache.pressure!,
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to send sensor_update event"));
    }
  });

  // Voice triggers come via xentient/control/trigger (RF-3)
  mqtt.on("triggerPipeline", (data: unknown) => {
    const d = data as { source?: string; stage?: string };
    if (d.source === "voice" && d.stage === "start") {
      server.notification({
        method: MCP_EVENTS.voice_start,
        params: { timestamp: Date.now() },
      }).catch((err: Error) => logger.error({ err }, "Failed to send voice_start event"));
    }
    // voice_end with audio buffer is handled in core.ts (AudioAccumulator)
  });

  // mode_changed: ModeManager transition -> Brain
  modeManager.on("modeChange", ({ from, to }: ModeChangeEvent) => {
    server.notification({
      method: MCP_EVENTS.mode_changed,
      params: { from, to, timestamp: Date.now() },
    }).catch((err: Error) => logger.error({ err }, "Failed to send mode_changed event"));
  });
}
// src/mcp/tools.ts
import type { MqttClient } from "../comms/MqttClient";
import type { AudioServer } from "../comms/AudioServer";
import type { CameraServer } from "../comms/CameraServer";
import type { ModeManager } from "../engine/ModeManager";
import type { RuleEngine } from "../engine/RuleEngine";
import type { SensorCache } from "../shared/types";
import type { Mode } from "../shared/contracts";
import pino from "pino";

const logger = pino({ name: "mcp-tools" }, process.stderr);

export interface McpToolDeps {
  mqtt: MqttClient;
  audio: AudioServer;
  camera: CameraServer;
  modeManager: ModeManager;
  sensorCache: SensorCache;
  ruleEngine: RuleEngine;
  onToolCall?: () => void;
}

export function createToolHandlers(deps: McpToolDeps) {
  const act = () => deps.onToolCall?.();
  return {
    xentient_read_sensors: async () => {
      act();
      const { sensorCache } = deps;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            temperature: sensorCache.temperature,
            humidity: sensorCache.humidity,
            pressure: sensorCache.pressure,
            motion: sensorCache.motion,
          }),
        }],
      };
    },

    xentient_read_mode: async () => {
      act();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ mode: deps.modeManager.getMode() }),
        }],
      };
    },

    xentient_set_mode: async ({ mode }: { mode: string }) => {
      act();
      const validModes: Mode[] = ["sleep", "listen", "active", "record"];
      if (!validModes.includes(mode as Mode)) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: `Invalid mode "${mode}", expected one of: ${validModes.join(", ")}`,
            }),
          }],
          isError: true,
        };
      }
      const success = deps.modeManager.transition(mode as Mode);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success }),
        }],
      };
    },

    xentient_play_audio: async ({ data, format }: { data: string; format: string }) => {
      act();
      if (format !== "pcm_s16le") {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Unsupported format, expected pcm_s16le" }),
          }],
          isError: true,
        };
      }
      const audioBuffer = Buffer.from(data, "base64");
      deps.audio.sendAudio(audioBuffer);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },

    xentient_set_lcd: async ({ line1, line2 }: { line1: string; line2: string }) => {
      act();
      deps.mqtt.publish("xentient/display", {
        v: 1,
        type: "display_update",
        mode: "expression",
        line1,
        line2,
        duration: 0,
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },

    xentient_capture_frame: async () => {
      act();
      const jpeg = deps.camera.getLatestJpeg();
      if (!jpeg) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ frameId: 0, jpeg: "", error: "No frame available" }),
          }],
          isError: true,
        };
      }
      const stats = deps.camera.getStats();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            frameId: stats.lastFrameId,
            jpeg: jpeg.toString("base64"),
          }),
        }],
      };
    },

    xentient_mqtt_publish: async ({ topic, payload }: { topic: string; payload: Record<string, unknown> }) => {
      act();
      deps.mqtt.publish(topic, payload);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },

    xentient_register_rule: async (params: { id: string; enabled?: boolean; trigger: unknown; condition?: unknown; action: unknown; priority?: number; cooldownMs?: number }) => {
      act();
      const { RuleSchema } = await import("../shared/contracts");
      const rule = {
        id: params.id,
        enabled: params.enabled ?? true,
        priority: params.priority ?? 10,
        source: "dynamic" as const,
        cooldownMs: params.cooldownMs ?? 0,
        trigger: params.trigger,
        condition: params.condition as any,
        action: params.action,
      };
      const existing = deps.ruleEngine.list();
      if (existing.some((r) => r.id === rule.id)) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: `Rule '${rule.id}' already exists` }) }],
          isError: true,
        };
      }
      const parsed = RuleSchema.safeParse(rule);
      if (!parsed.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: parsed.error.message }) }],
          isError: true,
        };
      }
      deps.ruleEngine.register(rule as any);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, ruleId: rule.id }) }],
      };
    },

    xentient_unregister_rule: async ({ id }: { id: string }) => {
      act();
      const removed = deps.ruleEngine.unregister(id);
      if (!removed) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: `Rule '${id}' not found` }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, removed: id }) }],
      };
    },

    xentient_list_rules: async () => {
      act();
      const rules = deps.ruleEngine.list();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(rules, null, 2) }],
      };
    },
  };
}
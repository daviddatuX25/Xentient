// src/mcp/tools.ts
import type { MqttClient } from "../comms/MqttClient";
import type { AudioServer } from "../comms/AudioServer";
import type { CameraServer } from "../comms/CameraServer";
import type { ModeManager } from "../engine/ModeManager";
import type { SpaceManager } from "../engine/SpaceManager";
import type { SensorCache, CoreSkill } from "../shared/types"; // RF-5: moved from here to shared to avoid comms↔mcp circular dep
import type { Mode } from "../shared/contracts";
import pino from "pino";

const logger = pino({ name: "mcp-tools" }, process.stderr); // RF-2: stderr for MCP stdio safety

export interface McpToolDeps {
  mqtt: MqttClient;
  audio: AudioServer;
  camera: CameraServer;
  modeManager: ModeManager;
  sensorCache: SensorCache;
  spaceManager?: SpaceManager; // SKILL TOOLS: wired in Wave 4 (core.ts)
}

// NOTE: SensorCache interface is defined in src/shared/types.ts (Task 0.5) — do NOT redefine here

export function createToolHandlers(deps: McpToolDeps) {
  return {
    xentient_read_sensors: async () => {
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
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ mode: deps.modeManager.getMode() }),
        }],
      };
    },

    xentient_set_mode: async ({ mode }: { mode: string }) => {
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
      deps.mqtt.publish(topic, payload);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },

    // ============================================================
    // SKILL MANAGEMENT TOOLS — Spec: docs/SPEC-xentient-layers.md §8.1
    // spaceManager is optional until Wave 4 wires it in core.ts
    // ============================================================

    xentient_register_skill: async (params: any) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      const skill: CoreSkill = {
        ...params,
        enabled: true,
        source: 'brain' as const,
        fireCount: 0,
        escalationCount: 0,
      };
      deps.spaceManager.registerSkill(skill);
      return { content: [{ type: 'text' as const, text: `Skill ${params.id} registered in space ${params.spaceId}` }] };
    },

    xentient_update_skill: async ({ id, spaceId, ...patch }: any) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      const ok = deps.spaceManager.updateSkill(id, patch, spaceId);
      return { content: [{ type: 'text' as const, text: ok ? `Skill ${id} updated` : `Skill ${id} not found` }] };
    },

    xentient_disable_skill: async ({ id, enabled, spaceId }: { id: string; enabled: boolean; spaceId?: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      const ok = deps.spaceManager.disableSkill(id, enabled, spaceId);
      return { content: [{ type: 'text' as const, text: ok ? `Skill ${id} ${enabled ? 'enabled' : 'disabled'}` : `Skill ${id} not found` }] };
    },

    xentient_remove_skill: async ({ id, spaceId }: { id: string; spaceId?: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      const ok = deps.spaceManager.removeSkill(id, spaceId);
      return { content: [{ type: 'text' as const, text: ok ? `Skill ${id} removed` : `Cannot remove skill ${id} (not found or is builtin)` }] };
    },

    xentient_list_skills: async ({ spaceId }: { spaceId?: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: '[]' }] };
      const skills = deps.spaceManager.listSkills(spaceId);
      return { content: [{ type: 'text' as const, text: JSON.stringify(skills, null, 2) }] };
    },

    xentient_get_skill_log: async (filter: { spaceId?: string; skillId?: string; since?: number; limit?: number }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: '[]' }] };
      const entries = deps.spaceManager.skillLog.query(filter);
      return { content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }] };
    },

    xentient_switch_mode: async ({ spaceId, mode }: { spaceId: string; mode: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      const ok = deps.spaceManager.switchMode(spaceId, mode);
      return { content: [{ type: 'text' as const, text: ok ? `Space ${spaceId} switched to mode "${mode}"` : `Space ${spaceId} not found` }] };
    },

    xentient_resolve_conflict: async (resolution: { execute: string[]; skip: string[]; reason: string; conflictGroup: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      deps.spaceManager.resolveConflict(resolution);
      return { content: [{ type: 'text' as const, text: `Conflict resolved: executing [${resolution.execute.join(', ')}]` }] };
    },
  };
}
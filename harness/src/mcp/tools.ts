// src/mcp/tools.ts
import type { MqttClient } from "../comms/MqttClient";
import type { AudioServer } from "../comms/AudioServer";
import type { CameraServer } from "../comms/CameraServer";
import type { ControlServer } from "../comms/ControlServer";
import type { EventBridge } from "../comms/EventBridge";
import type { ModeManager } from "../engine/ModeManager";
import type { SpaceManager } from "../engine/SpaceManager";
import type { PackLoader } from "../engine/PackLoader";
import type { EventSubscriptionManager } from "../engine/EventSubscriptionManager";
import type { SensorCache, CoreSkill, BrainStreamEvent, BrainStreamSubtype, Configuration } from "../shared/types"; // RF-5: moved from here to shared to avoid comms↔mcp circular dep
import type { NodeProvisioner } from "../comms/NodeProvisioner";
import { type Mode, EVENT_MASK_BITS } from "../shared/contracts";
import pino from "pino";

const logger = pino({ name: "mcp-tools" }, process.stderr); // RF-2: stderr for MCP stdio safety

export interface McpToolDeps {
  mqtt: MqttClient;
  audio: AudioServer;
  camera: CameraServer;
  modeManager: ModeManager;
  sensorCache: SensorCache;
  spaceManager?: SpaceManager; // SKILL TOOLS: wired in Wave 4 (core.ts)
  eventBridge?: EventBridge; // EVENT BRIDGE TOOLS: wired in core.ts
  packLoader?: PackLoader; // PACK TOOLS: wired in core.ts
  controlServer?: ControlServer; // BRAIN STREAM: wired in core.ts
  eventSubscriptionManager?: EventSubscriptionManager; // EVENT SUBSCRIPTION: Sprint 4
  nodeProvisioner?: NodeProvisioner; // NODE PROVISIONING: Sprint 9
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

    xentient_activate_config: async ({ spaceId, config }: { spaceId: string; config: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      const ok = deps.spaceManager.activateConfig(spaceId, config);
      return { content: [{ type: 'text' as const, text: ok ? `Space ${spaceId} activated config "${config}"` : `Space ${spaceId} not found` }] };
    },

    xentient_resolve_conflict: async (resolution: { execute: string[]; skip: string[]; reason: string; conflictGroup: string }) => {
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };
      deps.spaceManager.resolveConflict(resolution);
      return { content: [{ type: 'text' as const, text: `Conflict resolved: executing [${resolution.execute.join(', ')}]` }] };
    },

    // ============================================================
    // EVENT BRIDGE TOOLS — Phase 7 Plan 07-02
    // Runtime mapping registration/removal for the EventBridge
    // ============================================================

    xentient_register_event_mapping: async ({ source, eventName, filter, transform }: {
      source: string;
      eventName: string;
      filter?: string;
      transform?: string;
    }) => {
      if (!deps.eventBridge) return { content: [{ type: 'text' as const, text: 'EventBridge not initialized' }], isError: true as const };
      // Filter/transform are JS expression strings eval'd via new Function.
      // This is only callable by Brain-side MCP (trusted), not user input.
      // Future improvement: replace with a safe expression evaluator.
      let filterFn: ((data: unknown) => boolean) | undefined;
      let transformFn: ((data: unknown) => Record<string, unknown>) | undefined;
      try {
        if (filter) {
          const fn = new Function('data', `"use strict"; return (${filter});`);
          filterFn = (d: unknown) => !!fn(d);
        }
        if (transform) {
          const fn = new Function('data', `"use strict"; return (${transform});`);
          transformFn = (d: unknown) => fn(d) as Record<string, unknown>;
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Invalid filter/transform expression: ${err}` }) }],
          isError: true as const,
        };
      }
      const mappingId = deps.eventBridge.addCustomMapping(source as any, eventName, filterFn, transformFn);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, mappingId }) }] };
    },

    xentient_remove_event_mapping: async ({ mappingId }: { mappingId: string }) => {
      if (!deps.eventBridge) return { content: [{ type: 'text' as const, text: 'EventBridge not initialized' }], isError: true as const };
      const removed = deps.eventBridge.removeMapping(mappingId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: removed, mappingId }) }] };
    },

    xentient_list_event_mappings: async () => {
      if (!deps.eventBridge) return { content: [{ type: 'text' as const, text: 'EventBridge not initialized' }], isError: true as const };
      const mappings = deps.eventBridge.listMappings().map(m => ({
        id: m.id,
        source: m.source,
        eventName: m.eventName,
        hasFilter: !!m.filter,
        hasTransform: !!m.transform,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(mappings, null, 2) }] };
    },

    // ============================================================
    // PACK MANAGEMENT TOOLS — Phase 7 Plan 07-03
    // Load, list, and reload skill packs
    // ============================================================

    xentient_load_pack: async ({ packName }: { packName: string }) => {
      if (!deps.packLoader) return { content: [{ type: 'text' as const, text: 'PackLoader not initialized' }], isError: true as const };
      try {
        deps.packLoader.loadPack(packName);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, pack: packName }) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: message }) }], isError: true as const };
      }
    },

    xentient_list_packs: async () => {
      if (!deps.packLoader) return { content: [{ type: 'text' as const, text: 'PackLoader not initialized' }], isError: true as const };
      const available = deps.packLoader.listAvailablePacks();
      const active = deps.packLoader.getLoadedPack();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ available, active }, null, 2) }] };
    },

    xentient_reload_pack: async () => {
      if (!deps.packLoader) return { content: [{ type: 'text' as const, text: 'PackLoader not initialized' }], isError: true as const };
      const active = deps.packLoader.getLoadedPack();
      if (!active) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'No pack currently loaded' }) }], isError: true as const };
      }
      try {
        deps.packLoader.reload();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, pack: active }) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: message }) }], isError: true as const };
      }
    },

    // ============================================================
    // CONFIG REGISTRATION TOOL — Sprint 5
    // Brain can author new configurations at runtime
    // ============================================================

    xentient_register_config: async ({ name, displayName, nodeAssignments, coreSkills, transitions }: {
      name: string;
      displayName: string;
      nodeAssignments?: Record<string, string>;
      coreSkills: string[];
      transitions?: Record<string, unknown>;
    }) => {
      if (!deps.packLoader) return { content: [{ type: 'text' as const, text: 'PackLoader not initialized' }], isError: true as const };
      if (!deps.spaceManager) return { content: [{ type: 'text' as const, text: 'SpaceManager not initialized' }], isError: true as const };

      // Validate nodeSkill IDs if specified
      if (nodeAssignments) {
        const manifest = deps.packLoader.getLoadedPackManifest();
        if (manifest) {
          for (const [role, skillId] of Object.entries(nodeAssignments)) {
            const found = manifest.nodeSkills.find(ns => ns.id === skillId);
            if (!found) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `NodeSkill "${skillId}" not found in pack (assigned to role "${role}")` }) }],
                isError: true as const,
              };
            }
          }
        }
      }

      const config: Configuration = {
        name,
        displayName,
        nodeAssignments: nodeAssignments ?? {},
        coreSkills,
        brainSkills: [], // v1: empty
        ...(transitions ? { transitions: transitions as any } : {}),
      };

      await deps.packLoader.registerConfig(config);

      // Add to space availableConfigs
      const spaceId = 'default'; // v1: single space
      const space = deps.spaceManager.getSpace(spaceId);
      if (space) {
        space.availableConfigs.push(config.name);
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ registered: true, configName: config.name }) }] };
    },

    // ============================================================
    // BRAIN STREAM TOOL — Sprint 6
    // Brain pushes reasoning tokens back to Core's SSE bus
    // ============================================================

    xentient_brain_stream: async ({ escalation_id, subtype, payload }: {
      escalation_id: string;
      subtype: string;
      payload?: Record<string, unknown>;
    }) => {
      const validSubtypes: BrainStreamSubtype[] = [
        'escalation_received', 'reasoning_token', 'tool_call_fired',
        'tool_call_result', 'tts_queued', 'escalation_complete',
      ];
      if (!validSubtypes.includes(subtype as BrainStreamSubtype)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Invalid subtype "${subtype}"` }) }],
          isError: true as const,
        };
      }
      const event: BrainStreamEvent = {
        type: 'brain_event',
        source: 'brain',
        escalation_id,
        subtype: subtype as BrainStreamSubtype,
        payload: payload ?? {},
        timestamp: Date.now(),
      };
      deps.controlServer?.broadcastSSE(event);
      if (subtype === 'escalation_complete' && deps.spaceManager) {
        deps.spaceManager.closeEscalation(escalation_id);
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ relayed: true }) }] };
    },

    // ============================================================
    // CAPABILITY DISCOVERY TOOLS — Sprint 3
    // Brain calls these on connect and after config changes
    // ============================================================

    xentient_get_capabilities: async ({ spaceId }: { spaceId?: string }) => {
      const targetSpaceId = spaceId ?? 'default';
      const space = deps.spaceManager?.getSpace(targetSpaceId);
      const executor = deps.spaceManager?.getExecutor(targetSpaceId);
      const pack = deps.packLoader?.getLoadedPackManifest();
      const config = pack?.configurations.find(c => c.name === space?.activeConfig);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nodes: space?.nodes.map(node => ({
              nodeId: node.nodeId,
              role: node.role,
              hardware: node.hardware,
              state: node.state,
              activeProfile: config?.nodeAssignments?.[node.role] ?? null,
              eventMask: pack?.nodeSkills?.find(ns => ns.id === config?.nodeAssignments?.[node.role])?.emits ?? [],
            })) ?? [],
            core: {
              activePack: space?.activePack ?? pack?.pack.name ?? '',
              activeConfig: space?.activeConfig ?? 'default',
              availableConfigs: pack?.configurations.map(c => c.name) ?? [],
              activeSkills: executor?.listSkills(targetSpaceId).filter(s => s.enabled).map(s => s.id) ?? [],
              availableActions: ['set_lcd', 'play_chime', 'set_mode', 'mqtt_publish', 'increment_counter', 'log'],
            },
            space: {
              id: targetSpaceId,
              integrations: space?.integrations.map(i => i.type) ?? [],
              permissions: [], // v1: empty, authorization not yet implemented
            },
          }),
        }],
      };
    },

    xentient_get_skill_schema: async ({ skillType }: { skillType: string }) => {
      switch (skillType) {
        case 'CoreSkill':
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                fields: {
                  id: { type: 'string', required: true, pattern: '^[a-z0-9_-]{1,64}$' },
                  displayName: { type: 'string', required: true, maxLength: 64 },
                  enabled: { type: 'boolean', default: true },
                  spaceId: { type: 'string', default: 'default' },
                  configFilter: { type: 'string', description: 'Config name or "*" for all' },
                  trigger: { type: 'SkillTrigger', required: true },
                  actions: { type: 'CoreAction[]', required: true },
                  collect: { type: 'DataCollector[]' },
                  escalation: { type: 'EscalationConfig' },
                  priority: { type: 'number', min: 0, max: 100, default: 50 },
                  cooldownMs: { type: 'number', min: 0, default: 0 },
                },
                triggerTypes: ['cron', 'interval', 'mode', 'sensor', 'event', 'internal', 'composite'],
                actionTypes: ['set_lcd', 'play_chime', 'set_mode', 'mqtt_publish', 'increment_counter', 'log'],
              }),
            }],
          };
        case 'NodeSkill':
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                fields: {
                  id: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  version: { type: 'string', required: true },
                  requires: { type: 'object', properties: ['pir', 'mic', 'bme', 'camera', 'lcd'] },
                  sampling: { type: 'object', properties: ['audioRate', 'audioChunkMs', 'bmeIntervalMs', 'pirDebounceMs', 'micMode', 'cameraMode', 'vadThreshold'] },
                  emits: { type: 'string[]', required: true },
                  expectedBy: { type: 'string', required: true },
                  compatibleConfigs: { type: 'string[]', required: true },
                },
                eventTypes: Object.keys(EVENT_MASK_BITS).map(k => k.toLowerCase()),
                hardwareRequirements: ['pir', 'mic', 'camera', 'bme', 'lcd'],
              }),
            }],
          };
        case 'Configuration':
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                fields: {
                  name: { type: 'string', required: true, pattern: '^[a-z0-9-]{1,32}$' },
                  displayName: { type: 'string', required: true, maxLength: 64 },
                  nodeAssignments: { type: 'Record<string, string>', description: 'nodeRole -> NodeSkill ID' },
                  coreSkills: { type: 'string[]', required: true },
                  brainSkills: { type: 'string[]' },
                  transitions: { type: 'ConfigTransitions' },
                },
                example: {
                  name: 'deep-focus',
                  displayName: 'Deep Focus',
                  nodeAssignments: { 'ceiling-unit': 'daily-life' },
                  coreSkills: ['env-logger'],
                },
              }),
            }],
          };
        default:
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown skillType "${skillType}"` }) }],
            isError: true as const,
          };
      }
    },

    // ============================================================
    // EVENT SUBSCRIPTION TOOLS — Sprint 4
    // Brain subscribes to filtered, rate-limited event streams
    // ============================================================

    xentient_subscribe_events: async ({ eventTypes, maxRateMs }: { eventTypes: string[]; maxRateMs: number }) => {
      if (!deps.eventSubscriptionManager) return { content: [{ type: 'text' as const, text: 'EventSubscriptionManager not initialized' }], isError: true as const };
      const { randomUUID } = await import('crypto');
      const subscriptionId = randomUUID();
      deps.eventSubscriptionManager.subscribe({
        id: subscriptionId,
        eventTypes,
        maxRateMs,
        buffer: [],
        lastFlushAt: 0,
        flushTimer: null,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ subscriptionId, eventTypes, maxRateMs }) }] };
    },

    xentient_unsubscribe_events: async ({ subscriptionId }: { subscriptionId: string }) => {
      if (!deps.eventSubscriptionManager) return { content: [{ type: 'text' as const, text: 'EventSubscriptionManager not initialized' }], isError: true as const };
      const removed = deps.eventSubscriptionManager.unsubscribe(subscriptionId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ removed }) }] };
    },

    // ============================================================
    // NODE PROVISIONING TOOL — Sprint 9 (S5, S9, S11)
    // Generate provisioning tokens for ESP32 WiFiManager portal
    // ============================================================

    xentient_register_node: async ({ spaceId, role, hardware, wifiSsid, wifiPass }: {
      spaceId?: string; role?: string; hardware?: string[]; wifiSsid?: string; wifiPass?: string;
    }) => {
      if (!deps.nodeProvisioner) return { content: [{ type: 'text' as const, text: 'NodeProvisioner not available' }], isError: true as const };
      const sid = spaceId ?? 'default';
      const r = role ?? 'base';
      const hw = hardware ?? ['motion', 'temperature', 'humidity', 'audio', 'camera'];
      const token = deps.nodeProvisioner.generateToken(sid, r, hw, wifiSsid, wifiPass);
      const safeToken = deps.nodeProvisioner.sanitizeToken(token);
      return {
        content: [{
          type: 'text' as const,
          text: `Node registered. Paste this JSON into your Xentient-Setup portal:\n\n${JSON.stringify(safeToken, null, 2)}`,
        }],
      };
    },
  };
}
/**
 * Xentient Wire Contracts — TypeScript source of truth
 *
 * This file IS the runtime enforcement. If it and docs/CONTRACTS.md disagree,
 * CONTRACTS.md wins until this file is updated.
 *
 * Every outbound MQTT/WS message must pass through validate() before hitting
 * the wire. Every inbound message must pass through validate() before persisting.
 */

import { z } from "zod";

// ── Version ──────────────────────────────────────────────────────────
export const PROTOCOL_VERSION = 1 as const;

// ── Peripheral ID Registry ──────────────────────────────────────────
export const PERIPHERAL_IDS = {
  SPEAKER: 0x10,
  PIR: 0x11,
  BME280: 0x12,
  INMP441: 0x13,
  ESP32_CAM: 0x14,
  LCD: 0x15,
} as const;

export type PeripheralId = (typeof PERIPHERAL_IDS)[keyof typeof PERIPHERAL_IDS];

// ── Mode State Machine (DEPRECATED — retained for firmware compat) ──
// These are kept because the ESP32 firmware still uses sleep/listen/active/record.
// Core now uses Configuration + CoreNodeState instead. See 07-REALIGN-PLAN.md.
export const MODE_VALUES = ["sleep", "listen", "active", "record"] as const;
export type Mode = (typeof MODE_VALUES)[number];

/** @deprecated Use Configuration + CoreNodeState instead */
export const MODE_TRANSITIONS: Record<Mode, Mode[]> = {
  sleep: ["listen"],
  listen: ["active", "sleep", "record"],
  active: ["listen", "sleep", "record"],
  record: ["listen", "sleep"],
};

// ── LCD Face Constants ─────────────────────────────────────────────
export const LCD_FACES: Record<Mode, { line1: string; line2: string }> = {
  sleep: { line1: "(_ _) Zzz", line2: "" },
  listen: { line1: "(O_O)", line2: "listening" },
  active: { line1: "(^_^)", line2: "Xentient" },
  record: { line1: "(_ _) REC", line2: "" },
};

// ── NodeProfile (firmware-level contract) ──────────────────────────
export const NODE_PROFILE_DEFAULTS = {
  pirIntervalMs: 1000,
  micMode: 0,        // 0=off, 1=vad-only, 2=always-on
  bmeIntervalMs: 5000,
  cameraMode: 0,     // 0=off, 1=on-motion, 2=stream
  lcdFace: 0,        // enum: 0=calm, 1=alert, 2=listening, 3=speaking
  eventMask: 0b0001,  // bitmask: default = presence only
} as const;

export const MIC_MODES = ['off', 'vad-only', 'always-on'] as const;
export type MicMode = (typeof MIC_MODES)[number];

export const CAMERA_MODES = ['off', 'on-motion', 'stream'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

export const LCD_FACE_ENUM = ['calm', 'alert', 'listening', 'speaking'] as const;
export type LcdFaceEnum = (typeof LCD_FACE_ENUM)[number];

export const EVENT_MASK_BITS = {
  PRESENCE:    0b0000_0001,
  MOTION:      0b0000_0010,
  ENV:         0b0000_0100,
  AUDIO_CHUNK: 0b0000_1000,
  VAD:         0b0001_0000,
  FRAME:       0b0010_0000,
} as const;

export interface NodeProfile {
  profileId: string;
  pirIntervalMs: number;
  micMode: number;
  bmeIntervalMs: number;
  cameraMode: number;
  lcdFace: number;
  eventMask: number;
}

// ── Base Envelope ────────────────────────────────────────────────────
export const VersionedMessage = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.string(),
});

// ── Display Update ──────────────────────────────────────────────────
export const DisplayUpdate = VersionedMessage.extend({
  type: z.literal("display_update"),
  mode: z.enum(["expression", "text", "status"]),
  line1: z.string().max(16),
  line2: z.string().max(16),
  duration: z.number().int().min(0).optional(),
});

// ── Mode Set (Web → Core) ───────────────────────────────────────────
export const ModeSet = VersionedMessage.extend({
  type: z.literal("mode_set"),
  mode: z.enum(MODE_VALUES),
});

// ── Mode Status (Core → Web) ────────────────────────────────────────
export const ModeStatus = VersionedMessage.extend({
  type: z.literal("mode_status"),
  nodeBaseId: z.string(),
  mode: z.enum(MODE_VALUES),
});

// ── NodeProfile MQTT Messages ────────────────────────────────────────
export const NodeProfileSet = VersionedMessage.extend({
  type: z.literal("node_profile_set"),
  profileId: z.string().min(1),
  pirIntervalMs: z.number().int().min(0),
  micMode: z.number().int().min(0).max(2),
  bmeIntervalMs: z.number().int().min(0),
  cameraMode: z.number().int().min(0).max(2),
  lcdFace: z.number().int().min(0).max(3),
  eventMask: z.number().int().min(0),
});

export const NodeProfileAck = VersionedMessage.extend({
  type: z.literal("node_profile_ack"),
  profileId: z.string().min(1),
  status: z.enum(["loaded", "error"]),
  error: z.string().optional(),
});

// ── Space Status ────────────────────────────────────────────────────
export const SpaceStatus = VersionedMessage.extend({
  type: z.literal("space_status"),
  spaces: z.array(
    z.object({
      id: z.string(),
      activePack: z.string(),
      activeConfig: z.string(),
      nodes: z.array(z.object({
        nodeId: z.string(),
        role: z.string(),
        hardware: z.array(z.string()),
        state: z.enum(["dormant", "running"]),
      })),
      integrations: z.array(z.string()),
      online: z.boolean(),
    }),
  ),
});

// ── Pack Control ─────────────────────────────────────────────────────
export const PackSwitch = VersionedMessage.extend({
  type: z.literal("pack_switch"),
  name: z.string().regex(/^[a-z0-9-]{1,32}$/),
});

export const PackListResponse = VersionedMessage.extend({
  type: z.literal("pack_list_response"),
  packs: z.array(z.string()),
  active: z.string(),
});

// ── Pipeline State ──────────────────────────────────────────────────
export const PIPELINE_STATES = ["idle", "listening", "thinking", "speaking"] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

export const PipelineState = VersionedMessage.extend({
  type: z.literal("pipeline_state"),
  sessionId: z.string(),
  state: z.enum(PIPELINE_STATES),
});

// ── Sensor Data ─────────────────────────────────────────────────────
export const BME280Payload = z.object({
  temperature: z.number(),
  humidity: z.number(),
  pressure: z.number(),
});

export const PIRPayload = z.object({
  motion: z.literal(true),
  duration: z.number().int().min(0).optional(),
});

export const SensorData = VersionedMessage.extend({
  type: z.literal("sensor_data"),
  peripheralType: z.number().int().min(0).max(255),
  payload: z.union([BME280Payload, PIRPayload]),
  timestamp: z.number().int().min(0), // millis-since-boot on ESP32, epoch-millis on harness side
});

// ── Session Complete ────────────────────────────────────────────────
export const TurnSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
  startedAt: z.number().int().min(0),
  durationMs: z.number().int().min(0),
});

export const SessionComplete = VersionedMessage.extend({
  type: z.literal("session_complete"),
  sessionId: z.string(),
  nodeBaseId: z.string(),
  spaceId: z.string(),
  startedAt: z.number().int().min(0),
  endedAt: z.number().int().min(0),
  mode: z.enum(MODE_VALUES),
  status: z.enum(["done", "error"]),
  turns: z.array(TurnSchema),
  artifacts: z.object({
    userAudio: z.string(),
    asstAudio: z.string(),
    transcript: z.string(),
    meta: z.string(),
    cameraSnapshot: z.string().optional(),
  }),
});

// ── Session Error ───────────────────────────────────────────────────
export const SessionError = VersionedMessage.extend({
  type: z.literal("session_error"),
  recoverable: z.boolean(),
  message: z.string(),
});

// ── Trigger Pipeline (Web → Core) ──────────────────────────────────
export const TriggerPipeline = VersionedMessage.extend({
  type: z.literal("trigger_pipeline"),
  source: z.enum(["web", "pir", "voice"]),
});

// ── Space Control ────────────────────────────────────────────────────
export const SpaceSwitch = VersionedMessage.extend({
  type: z.literal("space_switch"),
  spaceId: z.string(),
});

// ── Camera Binary Transport Constants ────────────────────────────────
// Prefix bytes for WS binary message discriminator (shared AudioServer port)
export const CAMERA_WS_PREFIX = 0xca as const; // Camera JPEG frame prefix
export const AUDIO_WS_PREFIX = 0xa0 as const;  // Audio PCM chunk prefix (0xAU in spec notation)

// UART frame constants (ESP32-CAM → Node Base chunked transport)
export const UART_SYNC_BYTE_1 = 0xaa as const;
export const UART_SYNC_BYTE_2 = 0x55 as const;
export const UART_CRC8_POLY = 0x07 as const; // CRC-8/ITU polynomial

// ── Camera MQTT Messages ─────────────────────────────────────────────
export const CameraRequest = VersionedMessage.extend({
  type: z.literal("camera_request"),
  frameId: z.number().int().min(0).max(65535), // uint16 LE
});

export const CameraReady = VersionedMessage.extend({
  type: z.literal("camera_ready"),
  frameId: z.number().int().min(0).max(65535), // uint16 LE — unified with UART
  size: z.number().int().min(0),                // total JPEG size in bytes
});

// ── MQTT Topic Map ───────────────────────────────────────────────────
export const MQTT_TOPICS = {
  // Audio (binary WS)
  audioIn: "xentient/audio/in",
  audioOut: "xentient/audio/out",
  // Sensors (JSON MQTT)
  sensorsEnv: "xentient/sensors/env",
  sensorsMotion: "xentient/sensors/motion",
  // Display (JSON MQTT)
  display: "xentient/display",
  displayFaces: "xentient/display/faces",
  // Pack control (JSON MQTT)
  controlPack: "xentient/control/pack",
  statusPacks: "xentient/status/packs",
  // Space & mode (JSON MQTT)
  controlSpace: "xentient/control/space",
  statusSpace: "xentient/status/space",
  controlMode: "xentient/control/mode",
  statusMode: "xentient/status/mode",
  // Pipeline & session (JSON MQTT)
  pipelineState: "xentient/pipeline/state",
  sessionComplete: "xentient/session/complete",
  sessionError: "xentient/session/error",
  // Camera (JSON MQTT + binary WS)
  cameraRequest: "xentient/camera/request",
  cameraStatus: "xentient/camera/status",
  // NodeProfile (JSON MQTT)
  nodeProfileSet: "xentient/node/{nodeId}/profile/set",
  nodeProfileAck: "xentient/node/{nodeId}/profile/ack",
} as const;

// ── Validation helper ───────────────────────────────────────────────
const ALL_SCHEMAS = {
  display_update: DisplayUpdate,
  mode_set: ModeSet,
  mode_status: ModeStatus,
  node_profile_set: NodeProfileSet,
  node_profile_ack: NodeProfileAck,
  space_status: SpaceStatus,
  pack_switch: PackSwitch,
  pack_list_response: PackListResponse,
  pipeline_state: PipelineState,
  sensor_data: SensorData,
  session_complete: SessionComplete,
  session_error: SessionError,
  trigger_pipeline: TriggerPipeline,
  space_switch: SpaceSwitch,
  camera_request: CameraRequest,
  camera_ready: CameraReady,
} as const;

export type MessageType = keyof typeof ALL_SCHEMAS;

export function validateMessage<T extends MessageType>(
  type: T,
  data: unknown,
): z.infer<(typeof ALL_SCHEMAS)[T]> {
  const schema = ALL_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown message type: ${type}`);
  return schema.parse(data) as z.infer<(typeof ALL_SCHEMAS)[T]>;
}

// ── MCP Event Method Names ──────────────────────────────────────────
// Used by core.ts to send notifications over MCP stdio transport.
export const MCP_EVENTS = {
  motion_detected: "xentient/motion_detected",
  voice_start: "xentient/voice_start",
  voice_end: "xentient/voice_end",
  mode_changed: "xentient/mode_changed",
  sensor_update: "xentient/sensor_update",
} as const;

// ── Export all schemas for JSON-Schema generation ────────────────────
export const ALL_CONTRACT_SCHEMAS = ALL_SCHEMAS;

// ============================================================
// XENTIENT LAYERS — Skill Events + Config-centric MCP Tools
// Spec: docs/SPEC-xentient-layers.md §8.2 + 07-REALIGN-PLAN.md
// ============================================================

export const SKILL_EVENTS = {
  SKILL_ESCALATED: 'xentient/skill_escalated',
  SKILL_CONFLICT: 'xentient/skill_conflict',
  SKILL_FIRED: 'xentient/skill_fired',
  CONFIG_CHANGED: 'xentient/config_changed',
} as const;

export type SkillEventKey = keyof typeof SKILL_EVENTS;

// MCP Tool names (Brain → Core)
export const SKILL_TOOLS = {
  REGISTER_SKILL: 'xentient_register_skill',
  UPDATE_SKILL: 'xentient_update_skill',
  DISABLE_SKILL: 'xentient_disable_skill',
  REMOVE_SKILL: 'xentient_remove_skill',
  LIST_SKILLS: 'xentient_list_skills',
  GET_SKILL_LOG: 'xentient_get_skill_log',
  ACTIVATE_CONFIG: 'xentient_activate_config',
  REGISTER_CONFIG: 'xentient_register_config',
  RESOLVE_CONFLICT: 'xentient_resolve_conflict',
  GET_CAPABILITIES: 'xentient_get_capabilities',
  GET_SKILL_SCHEMA: 'xentient_get_skill_schema',
  SUBSCRIBE_EVENTS: 'xentient_subscribe_events',
  UNSUBSCRIBE_EVENTS: 'xentient_unsubscribe_events',
} as const;

// Builtin skill IDs (cannot be removed)
export const BUILTIN_SKILL_IDS = [
  '_pir-wake',
  '_sensor-telemetry',
  '_determine-skill',
  '_voice-capture',
] as const;

export type BuiltinSkillId = typeof BUILTIN_SKILL_IDS[number];

// Default skill execution log capacity
export const SKILL_LOG_CAPACITY = 1000;

// Conflict resolution timeout (ms) — fall back to priority if Brain doesn't respond
export const CONFLICT_TIMEOUT_MS = 10_000;

// ── Event Bridge MCP Tool names ─────────────────────────────────────
export const EVENT_BRIDGE_TOOLS = {
  REGISTER_MAPPING: 'xentient_register_event_mapping',
  REMOVE_MAPPING: 'xentient_remove_event_mapping',
  LIST_MAPPINGS: 'xentient_list_event_mappings',
} as const;

// ── Pack Skill Manifest Zod Schema ─────────────────────────────────
const PackMetaSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
});

const PackSkillSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  trigger: z.record(z.unknown()),
  actions: z.array(z.record(z.unknown())),
  configFilter: z.string().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  cooldownMs: z.number().int().min(0).optional(),
  escalation: z.record(z.unknown()).optional(),
  collect: z.array(z.record(z.unknown())).optional(),
});

// Configuration schema for pack manifest
const ConfigurationSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  nodeAssignments: z.record(z.string()).default({}),
  coreSkills: z.array(z.string()).default([]),
  brainSkills: z.array(z.string()).optional(),
});

// NodeSkill schema for pack manifest
const NodeSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1).default('1.0.0'),
  requires: z.object({
    pir: z.boolean().optional(),
    mic: z.boolean().optional(),
    bme: z.boolean().optional(),
    camera: z.boolean().optional(),
    lcd: z.boolean().optional(),
  }).default({}),
  sampling: z.object({
    audioRate: z.number().optional(),
    audioChunkMs: z.number().optional(),
    bmeIntervalMs: z.number().optional(),
    pirDebounceMs: z.number().optional(),
    micMode: z.number().optional(),
    cameraMode: z.number().optional(),
    vadThreshold: z.number().optional(),
  }).default({}),
  emits: z.array(z.string()).default([]),
  expectedBy: z.string().optional(),
  compatibleConfigs: z.array(z.string()).default([]),
});

export const PackSkillManifestSchema = z.object({
  pack: PackMetaSchema,
  configurations: z.array(ConfigurationSchema).default([]),
  nodeSkills: z.array(NodeSkillSchema).default([]),
  skills: z.array(PackSkillSchema).default([]),
});

// ── API Skill Creation Schema ─────────────────────────────────────────

const SkillTriggerApiSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cron'), schedule: z.string().min(1) }),
  z.object({ type: z.literal('interval'), everyMs: z.number().int().min(1) }),
  z.object({ type: z.literal('mode'), from: z.union([z.string(), z.literal('*')]), to: z.union([z.string(), z.literal('*')]) }),
  z.object({ type: z.literal('sensor'), sensor: z.enum(['temperature', 'humidity', 'pressure', 'motion']), operator: z.enum(['>', '<', '==', '>=', '<=', '!=']), value: z.number() }),
  z.object({ type: z.literal('event'), event: z.string().min(1) }),
  z.object({ type: z.literal('internal'), event: z.string().min(1) }),
  z.object({ type: z.literal('composite'), all: z.array(z.lazy((): any => SkillTriggerApiSchema)).min(1) }),
]);

const CoreActionApiSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_lcd'), line1: z.string(), line2: z.string() }),
  z.object({ type: z.literal('play_chime'), preset: z.enum(['morning', 'alert', 'chime']) }),
  z.object({ type: z.literal('set_mode'), mode: z.string() }),
  z.object({ type: z.literal('mqtt_publish'), topic: z.string().min(1), payload: z.record(z.unknown()) }),
  z.object({ type: z.literal('increment_counter'), name: z.string().min(1) }),
  z.object({ type: z.literal('log'), message: z.string() }),
]);

const DataCollectorApiSchema = z.object({
  type: z.literal('counter'),
  name: z.string().min(1),
  resetAfterMs: z.number().int().min(0).optional(),
});

const EscalationConditionApiSchema = z.object({
  type: z.literal('counter_above'),
  name: z.string().min(1),
  threshold: z.number().int().min(0),
});

const EscalationConfigApiSchema = z.object({
  conditions: z.array(EscalationConditionApiSchema).min(1),
  event: z.string().min(1),
  contextBuilder: z.enum(['counter_snapshot', 'sensor_snapshot', 'combined']),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
});

export const CreateSkillApiSchema = z.object({
  id: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  spaceId: z.string().min(1).optional(),
  trigger: SkillTriggerApiSchema,
  priority: z.number().int().min(0).max(100).optional(),
  actions: z.array(CoreActionApiSchema).min(1),
  collect: z.array(DataCollectorApiSchema).optional(),
  escalation: EscalationConfigApiSchema.optional(),
  cooldownMs: z.number().int().min(0).optional(),
  configFilter: z.string().optional(),
});

// ── Pack Management MCP Tool names ──────────────────────────────────
export const PACK_TOOLS = {
  LOAD_PACK: 'xentient_load_pack',
  LIST_PACKS: 'xentient_list_packs',
  RELOAD_PACK: 'xentient_reload_pack',
} as const;
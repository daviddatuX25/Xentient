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

// ── Mode State Machine ──────────────────────────────────────────────
export const MODE_VALUES = ["sleep", "listen", "active", "record"] as const;
export type Mode = (typeof MODE_VALUES)[number];

// Valid transitions: from → set of allowed to
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

// ── Space Status ────────────────────────────────────────────────────
export const SpaceStatus = VersionedMessage.extend({
  type: z.literal("space_status"),
  spaces: z.array(
    z.object({
      id: z.string(),
      nodeBaseId: z.string(),
      activePack: z.string(),
      mode: z.enum(MODE_VALUES),
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
} as const;

// ── Validation helper ───────────────────────────────────────────────
const ALL_SCHEMAS = {
  display_update: DisplayUpdate,
  mode_set: ModeSet,
  mode_status: ModeStatus,
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
// XENTIENT LAYERS — New MCP Events + Mode constants
// Spec: docs/SPEC-xentient-layers.md §8.2
// ============================================================

export const SKILL_EVENTS = {
  SKILL_ESCALATED: 'xentient/skill_escalated',
  SKILL_CONFLICT: 'xentient/skill_conflict',
  SKILL_FIRED: 'xentient/skill_fired',
  MODE_SWITCHED: 'xentient/mode_switched',
} as const;

export type SkillEventKey = keyof typeof SKILL_EVENTS;

// New MCP Tool names (Brain → Core)
export const SKILL_TOOLS = {
  REGISTER_SKILL: 'xentient_register_skill',
  UPDATE_SKILL: 'xentient_update_skill',
  DISABLE_SKILL: 'xentient_disable_skill',
  REMOVE_SKILL: 'xentient_remove_skill',
  LIST_SKILLS: 'xentient_list_skills',
  GET_SKILL_LOG: 'xentient_get_skill_log',
  SWITCH_MODE: 'xentient_switch_mode',
  RESOLVE_CONFLICT: 'xentient_resolve_conflict',
} as const;

// Builtin skill IDs (cannot be removed)
export const BUILTIN_SKILL_IDS = [
  '_pir-wake',
  '_idle-sleep',
  '_sensor-telemetry',
  '_determine-skill',
] as const;

export type BuiltinSkillId = typeof BUILTIN_SKILL_IDS[number];

// Default skill execution log capacity
export const SKILL_LOG_CAPACITY = 1000;

// Conflict resolution timeout (ms) — fall back to priority if Brain doesn't respond
export const CONFLICT_TIMEOUT_MS = 10_000;
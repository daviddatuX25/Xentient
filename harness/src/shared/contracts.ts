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
  listen: { line1: "(O_O)", line2: "listening..." },
  active: { line1: "(^_^)", line2: "" },
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
  timestamp: z.number().int().min(0), // epoch-millis (JS-safe, ESP32 uses epoch-seconds)
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

// ── Export all schemas for JSON-Schema generation ────────────────────
export const ALL_CONTRACT_SCHEMAS = ALL_SCHEMAS;
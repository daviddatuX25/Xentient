import { z } from "zod";

// ── Tool Input Schemas ────────────────────────────────────────────

export const ReadSensorsInputSchema = z.object({});

export const ReadModeInputSchema = z.object({});

export const SetModeInputSchema = z.object({
  mode: z.enum(["sleep", "listen", "active", "record"]),
});

export const PlayAudioInputSchema = z.object({
  data: z.string().describe("Base64-encoded PCM s16le audio"),
  format: z.literal("pcm_s16le"),
});

export const SetLcdInputSchema = z.object({
  line1: z.string().max(16),
  line2: z.string().max(16),
});

export const CaptureFrameInputSchema = z.object({});

export const MqttPublishInputSchema = z.object({
  topic: z.string(),
  payload: z.record(z.unknown()),
});

// ── Tool Output Schemas ───────────────────────────────────────────

export const SensorsOutputSchema = z.object({
  temperature: z.number().nullable(),
  humidity: z.number().nullable(),
  pressure: z.number().nullable(),
  motion: z.boolean().nullable(),
});

export const ModeOutputSchema = z.object({
  mode: z.enum(["sleep", "listen", "active", "record"]),
});

export const FrameOutputSchema = z.object({
  frameId: z.number(),
  jpeg: z.string().describe("Base64-encoded JPEG"),
});

// ── Event Schemas ──────────────────────────────────────────────────

export const MotionDetectedEventSchema = z.object({
  timestamp: z.number(),
  nodeBaseId: z.string(),
});

export const VoiceStartEventSchema = z.object({
  timestamp: z.number(),
});

export const VoiceEndEventSchema = z.object({
  timestamp: z.number(),
  duration_ms: z.number(),
  audio: z.string().describe("Base64-encoded PCM s16le audio"),
});

export const ModeChangedEventSchema = z.object({
  from: z.enum(["sleep", "listen", "active", "record"]),
  to: z.enum(["sleep", "listen", "active", "record"]),
  timestamp: z.number(),
});

export const SensorUpdateEventSchema = z.object({
  temperature: z.number(),
  humidity: z.number(),
  pressure: z.number(),
});
/**
 * Shared type definitions used across multiple subsystems.
 *
 * Placed here (rather than in comms/ or mcp/) to avoid circular dependencies.
 */

import type { Mode } from "./contracts";

// ── Sensor Cache ──────────────────────────────────────────────────────

/** Sensor cache populated by MQTT sensor events, consumed by MCP tools. */
export interface SensorCache {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  motion: boolean | null;
  lastMotionAt: number | null;
}

// ── Rule Engine Types ──────────────────────────────────────────────────

/** Sensor keys that can be used in rule triggers and conditions. */
export type SensorKey = "temperature" | "humidity" | "pressure" | "motion";

/** Rule trigger — what activates a rule. */
export type Trigger =
  | { type: "cron"; schedule: string }
  | { type: "interval"; everyMs: number }
  | { type: "mode"; from: Mode; to: Mode }
  | { type: "sensor"; sensor: SensorKey; operator: ">" | "<" | "==" | ">=" | "<="; value: number }
  | { type: "event"; event: string }
  | { type: "composite"; all: Trigger[] };

/** Condition — additional guard that must ALL be true for a rule to fire. */
export interface Condition {
  field: "mode" | SensorKey | "time" | "dayOfWeek" | "lastMotionAgoMs";
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in";
  value: string | number | string[];
}

/** Rule action — what happens when a rule fires. */
export type RuleAction =
  | { type: "set_mode"; mode: Mode }
  | { type: "set_lcd"; line1: string; line2: string }
  | { type: "play_chime"; preset: "morning" | "alert" | "chime" }
  | { type: "mqtt_publish"; topic: string; payload: Record<string, unknown> }
  | { type: "notify"; event: string; context?: Record<string, unknown> }
  | { type: "chain"; actions: RuleAction[] };

/** A single rule evaluated by the heartbeat loop. */
export interface Rule {
  id: string;
  enabled: boolean;
  priority: number;
  source: "static" | "dynamic";
  cooldownMs: number;
  trigger: Trigger;
  condition?: Condition[];
  action: RuleAction;
  lastFiredAt?: number;
}

/** Evaluation context available to trigger and condition checks. */
export interface RuleContext {
  mode: Mode;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  motion: boolean | null;
  lastMotionAgoMs: number | null;
  time: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
}

// ── Health Monitor Types ──────────────────────────────────────────────

/** Brain connection health status. */
export interface BrainHealth {
  connected: boolean;
  brainType: "basic" | "hermes" | null;
  lastActivityAt: number;
  reconnectCount: number;
}
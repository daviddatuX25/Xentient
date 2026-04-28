/**
 * Shared type definitions used across multiple subsystems.
 *
 * Placed here (rather than in comms/ or mcp/) to avoid circular dependencies.
 */

/** Sensor cache populated by MQTT sensor events, consumed by MCP tools. */
export interface SensorCache {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  motion: boolean | null;
  lastMotionAt: number | null;
}

// ============================================================
// XENTIENT LAYERS — CoreSkill + Space + Observability Types
// Spec: docs/SPEC-xentient-layers.md
// ============================================================

// ---- Mode (behavioral profile, NOT the same as SpaceMode hardware state) ----

/** Behavioral profile — "student" | "family" | "developer" | "default" or custom. */
export type BehavioralMode = string;

/**
 * SpaceMode alias — the hardware operational state (sleep/listen/active/record).
 * Deliberately separate from BehavioralMode to prevent mix-ups.
 * Source of truth: contracts.ts `Mode` type.
 */
export type SpaceMode = import('./contracts').Mode;

// ---- Space ----

export interface Space {
  id: string;
  nodeBaseId: string;
  activePack: string;
  spaceMode: SpaceMode;
  activeMode: BehavioralMode;
  integrations: SpaceIntegration[];
  role?: string;
  sensors: string[];
}

export interface SpaceIntegration {
  type: string;
  config: Record<string, unknown>;
}

// ---- CoreSkill ----

export interface CoreSkill {
  id: string;
  displayName: string;
  enabled: boolean;
  spaceId: string;

  trigger: SkillTrigger;
  priority: number;

  actions: CoreAction[];
  collect?: DataCollector[];

  escalation?: EscalationConfig;

  source: 'pack' | 'brain' | 'builtin';
  cooldownMs: number;
  lastFiredAt?: number;
  fireCount: number;
  lastEscalatedAt?: number;
  escalationCount: number;

  modeFilter?: BehavioralMode;
  _pack?: string; // Set when source='pack' — the pack name this skill came from
}

// ---- Triggers ----

/**
 * SkillTrigger — defines what activates a skill.
 *
 * Note on composite triggers (v1): Only sensor sub-triggers work inside
 * { type: 'composite', all: [...] }. Cron, interval, mode, and event
 * sub-triggers are NOT evaluated within composites — they are handled
 * by their own dispatch paths (tick loop, cron scheduler, EventBridge).
 * See SkillExecutor.evaluateTrigger() for the implementation.
 */
export type SkillTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'interval'; everyMs: number }
  | { type: 'mode'; from: SpaceMode | '*'; to: SpaceMode | '*' }
  | { type: 'sensor'; sensor: SensorKey; operator: CompareOperator; value: number }
  | { type: 'event'; event: string }
  | { type: 'internal'; event: string }
  | { type: 'composite'; all: SkillTrigger[] }

export type SensorKey = 'temperature' | 'humidity' | 'pressure' | 'motion';
export type CompareOperator = '>' | '<' | '==' | '>=' | '<=' | '!=';

// ---- L1 Actions ----

export type CoreAction =
  | { type: 'set_lcd'; line1: string; line2: string }
  | { type: 'play_chime'; preset: ChimePreset }
  | { type: 'set_mode'; mode: SpaceMode }
  | { type: 'mqtt_publish'; topic: string; payload: Record<string, unknown> }
  | { type: 'increment_counter'; name: string }
  | { type: 'log'; message: string }

export type ChimePreset = 'morning' | 'alert' | 'chime';

// ---- Data Collection (for escalation context) ----

/**
 * DataCollector — defines how a skill accumulates data for escalation context.
 *
 * Counter namespace: counters use a flat, shared namespace across all skills
 * in the same executor. If two skills define a counter named "alertCount",
 * they share the same counter. Use unique names (e.g., "mySkill_alertCount")
 * to avoid collisions.
 *
 * Reset timers: resetAfterMs is per-skill — each skill that defines a collector
 * gets its own reset timer (keyed by `${skillId}:${collectorName}`). Removing
 * the skill clears its timers, but does NOT reset the counter value.
 */
export interface DataCollector {
  type: 'counter';
  name: string;
  resetAfterMs?: number;
}

// ---- Escalation ----

export interface EscalationConfig {
  conditions: EscalationCondition[];
  event: string;
  contextBuilder: ContextBuilderType;
  priority: EscalationPriority;
  cooldownMs: number;
  conflictGroup?: string;
}

export interface EscalationCondition {
  field: string;
  operator: CompareOperator;
  value: number;
}

export type ContextBuilderType =
  | 'sensor-snapshot'
  | 'camera-snapshot'
  | 'full-context'
  | 'minimal'

export type EscalationPriority = 'low' | 'normal' | 'urgent';

// ---- Observability Events ----

export interface SkillFireEvent {
  type: 'skill_fired';
  skillId: string;
  spaceId: string;
  mode: string;
  trigger: string;
  actionsExecuted: string[];
  escalated: boolean;
  timestamp: number;
}

export interface SkillEscalationEvent {
  type: 'skill_escalated';
  skillId: string;
  spaceId: string;
  event: string;
  priority: EscalationPriority;
  brainConnected: boolean;
  timestamp: number;
}

export interface SkillConflictEvent {
  type: 'skill_conflict';
  conflictingSkills: string[];
  spaceId: string;
  resolution: 'priority' | 'brain' | 'pending';
  timestamp: number;
}

export type ObservabilityEvent = SkillFireEvent | SkillEscalationEvent | SkillConflictEvent;

// ---- Skill Execution Log ----

export interface SkillLogEntry {
  skillId: string;
  spaceId: string;
  mode: string;
  firedAt: number;
  triggerData: Record<string, unknown>;
  actionsExecuted: string[];
  escalated: boolean;
  escalationResponse?: {
    brainType: string;
    responseMs: number;
    actions: string[];
  };
  conflictWith?: string[];
  resolution?: string;
}

// ---- Conflict Resolution (Brain → Core response) ----

export interface ConflictResolution {
  execute: string[];
  skip: string[];
  reason: string;
}

// ---- Pending Conflict (held while awaiting Brain) ----

export interface PendingConflict {
  conflictingSkills: string[];
  spaceId: string;
  triggerData: Record<string, unknown>;
  startedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

// ---- Pack Skill Manifest ----

export interface PackSkillManifest {
  pack: {
    name: string;
    version: string;
    description?: string;
    author?: string;
  };
  skills: PackSkill[];
}

export interface PackSkill {
  id: string;
  displayName: string;
  trigger: SkillTrigger;
  actions: CoreAction[];
  modeFilter?: BehavioralMode;
  priority?: number;
  cooldownMs?: number;
  escalation?: EscalationConfig;
  collect?: DataCollector[];
}
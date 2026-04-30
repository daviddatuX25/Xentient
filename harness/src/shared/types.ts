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

// ---- Configuration-centric types (replaces BehavioralMode + SpaceMode) ----

/** Configuration — a named bundle of NodeSkill assignments, CoreSkills, and transition rules. */
export interface Configuration {
  name: string;
  displayName: string;
  nodeAssignments: Record<string, string>; // nodeRole -> NodeSkill ID
  coreSkills: string[];
  brainSkills?: string[];
  transitions?: ConfigTransitions;
}

export interface ConfigTransitions {
  activateWhen?: ConfigTrigger;
  deactivateWhen?: ConfigTrigger;
}

export type ConfigTrigger =
  | { cron: string }
  | { idle: number }
  | { sensor: SensorKey; operator: CompareOperator; value: number };

// ---- Node ----

export type CoreNodeState = 'dormant' | 'running';

export interface SpaceNode {
  nodeId: string;
  role: string;
  hardware: string[];
  state: CoreNodeState;
}

// ---- NodeSkill ----

export type NodeEventType = 'presence' | 'motion' | 'env' | 'audio_chunk' | 'vad' | 'frame';

export interface NodeSkill {
  id: string;
  name: string;
  version: string;
  requires: {
    pir?: boolean;
    mic?: boolean;
    bme?: boolean;
    camera?: boolean;
    lcd?: boolean;
  };
  sampling: {
    audioRate?: number;
    audioChunkMs?: number;
    bmeIntervalMs?: number;
    pirDebounceMs?: number;
    micMode?: number;      // 0=off, 1=vad-only, 2=always-on
    cameraMode?: number;   // 0=off, 1=on-motion, 2=stream
    vadThreshold?: number;
  };
  emits: NodeEventType[];
  expectedBy: string;        // paired CoreSkill
  compatibleConfigs: string[];
  modeTask?: {
    lcdFace?: number;
    chime?: ChimePreset;
  };
}

// ---- Space ----

export interface Space {
  id: string;
  nodes: SpaceNode[];
  activePack: string;
  activeConfig: string;
  availableConfigs: string[];
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

  configFilter?: string;
  _pack?: string; // Set when source='pack' -- the pack name this skill came from
}

// ---- Triggers ----

/**
 * SkillTrigger -- defines what activates a skill.
 *
 * Note on composite triggers (v1): Only sensor sub-triggers work inside
 * { type: 'composite', all: [...] }. Cron, interval, mode, and event
 * sub-triggers are NOT evaluated within composites -- they are handled
 * by their own dispatch paths (tick loop, cron scheduler, EventBridge).
 * See SkillExecutor.evaluateTrigger() for the implementation.
 */
export type SkillTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'interval'; everyMs: number }
  | { type: 'mode'; from: string | '*'; to: string | '*' }
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
  | { type: 'set_mode'; mode: string }
  | { type: 'mqtt_publish'; topic: string; payload: Record<string, unknown> }
  | { type: 'increment_counter'; name: string }
  | { type: 'log'; message: string }

export type ChimePreset = 'morning' | 'alert' | 'chime';

// ---- Data Collection (for escalation context) ----

/**
 * DataCollector -- defines how a skill accumulates data for escalation context.
 *
 * Counter namespace: counters use a flat, shared namespace across all skills
 * in the same executor. If two skills define a counter named "alertCount",
 * they share the same counter. Use unique names (e.g., "mySkill_alertCount")
 * to avoid collisions.
 *
 * Reset timers: resetAfterMs is per-skill -- each skill that defines a collector
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

// ---- Conflict Resolution (Brain -> Core response) ----

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
  configurations: Configuration[];
  nodeSkills: NodeSkill[];
  skills: PackSkill[];
}

export interface PackSkill {
  id: string;
  displayName: string;
  trigger: SkillTrigger;
  actions: CoreAction[];
  configFilter?: string;
  priority?: number;
  cooldownMs?: number;
  escalation?: EscalationConfig;
  collect?: DataCollector[];
}
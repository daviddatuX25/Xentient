# Xentient Realignment Plan — Configuration-Centric Architecture

**Date:** 2026-04-30
**Status:** Ready for execution (v2 — incorporates three corrections from architecture review)
**Source:** User's definitive architecture + gap analysis + four clarifications + three corrections

---

## The Shift

Core's operating concept changes from **"which mode is active"** to **"which configuration is active."**

A configuration bundles everything: NodeSkill assignments per node role, a set of CoreSkills, a set of BrainSkills, and transition rules. When a configuration activates, Core iterates every node in the space, looks up each node's role in the configuration's `nodeAssignments`, compiles the matching NodeSkill to a NodeProfile, and pushes it to that specific node. Each node gets the right behavior for its physical position and purpose.

The four hardware states (sleep/listen/active/record) are **removed** from Core's type system. They were behavioral labels from the old mode-centric thinking. The pack now owns all behavioral meaning through configurations and NodeSkills. Core only needs to know: is this node `dormant` or `running`.

---

## Firm Decisions (Pre-Implementation)

### D1: NodeSkill vs NodeProfile — Two Layers, One Compilation

**Correction:** NodeSkill `sampling` now includes an explicit `micMode` field (0=off, 1=vad-only, 2=always-on). The original `toNodeProfile()` mapped `vadThreshold ? 1 : 0` which made always-on unreachable from packs. Now pack authors explicitly declare mic mode.

**NodeSkill** is the Core-level abstraction. It lives in the pack manifest. It has human-readable names, hardware requirements, event declarations, and a `compatibleConfigs` field. Brain authors these. Pack authors write these. Humans read these.

**NodeProfile** is the firmware-level contract. It's what Core compiles a NodeSkill down to before pushing to the ESP32. A simple C struct — no names, no requirements checking, just numbers and enums. The firmware never sees a NodeSkill, only a NodeProfile.

**`toNodeProfile()`** is the bridge function. Core validates the NodeSkill (hardware present? config compatible?), then compiles it to a NodeProfile struct and pushes that over MQTT. If validation fails, Core refuses the push and falls back to the default NodeProfile for the target configuration.

### D5: Space is a room, not a node — SpaceNode replaces nodeBaseId

A Space maps to a physical environment (the classroom), not a single Node Base. Multiple Node Bases can belong to one Space, each with a declared role. `Space.nodeBaseId: string` becomes `Space.nodes: SpaceNode[]`.

```typescript
interface SpaceNode {
  nodeId: string         // hardware identifier
  role: string           // e.g. "ceiling-unit", "teacher-desk", "door-entrance"
  hardware: string[]     // what's physically on this node
}
```

### D6: Configuration declares NodeSkill per role, not one NodeSkill

`Configuration.nodeSkill: string` becomes `Configuration.nodeAssignments: Record<string, string>` — a map of node role to NodeSkill ID. When `activateConfig()` fires, Core iterates `space.nodes`, looks up each node's role in `nodeAssignments`, compiles the matching NodeSkill to a NodeProfile, and pushes it to that specific node via MQTT.

### D7: SpaceMode four-state enum is removed from Core

Remove `SpaceMode` (sleep/listen/active/record) from Core's type system entirely. Replace with:

```typescript
type CoreNodeState = 'dormant' | 'running'
```

Those four states were behavioral labels from the old mode-centric thinking. The pack owns all behavioral meaning through configurations and NodeSkills. Core only needs to know: is this node dormant or is a configuration running on it. The `xentient_set_mode` MCP tool becomes `xentient_set_dormant` — the only manual override Core needs.

Every MQTT event a node emits gets tagged with `nodeId` and `role` so CoreSkills and Brain can filter by role.

This decision unblocks Configuration type design, xentient_get_capabilities, and firmware implementation simultaneously.

### D2: TransitionQueue ships with activateConfig(), not after

If you implement `activateConfig()` without the queue, you have a race window between implementation and the queue being added. The queue prevents concurrent state mutations — config activations, mode changes, skill registrations all append to one queue, the heartbeat tick drains it one item at a time. Build them as one unit of work.

### D3: xentient_subscribe_events uses maxRateMs rate limiting

Core does NOT push every matching event to Brain in real time. Brain declares interest with a `maxRateMs` parameter. Core batches matching events and flushes no faster than that rate. `maxRateMs: 0` means real-time (Brain accepts the flood). Default is `maxRateMs: 1000` (1 event per second per subscription). Without this, high-frequency events like `audio_chunk` or `motion` at 500ms intervals will flood the MCP connection.

### D4: Pipeline.ts cutover gate is explicit

Pipeline.ts stays alive until items 1-7 in this plan are complete AND a full voice escalation has been proven end-to-end through brain-basic. That's the cutover gate. Written explicitly in CONTEXT.md so no one deletes Pipeline.ts early. The gate: `brain-basic receives escalation → STT → LLM → TTS → xentient_play_audio → audio plays on speaker` — all via MCP, none via Pipeline.ts.

---

## Implementation Sprints

### Sprint 1: Type Foundation

**Goal:** Add Configuration, NodeProfile, and toNodeProfile to the type system. No behavior changes yet — just types.

#### 1.1 Add NodeProfile to contracts.ts

```typescript
// Firmware-level contract — the C struct pushed to ESP32
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

// Event mask bits (firmware uses these to decide what to emit)
export const EVENT_MASK_BITS = {
  PRESENCE:    0b0000_0001,
  MOTION:      0b0000_0010,
  ENV:         0b0000_0100,
  AUDIO_CHUNK: 0b0000_1000,
  VAD:         0b0001_0000,
  FRAME:       0b0010_0000,
} as const;

export interface NodeProfile {
  profileId: string;        // matches the NodeSkill id that produced this
  pirIntervalMs: number;
  micMode: number;          // 0, 1, or 2
  bmeIntervalMs: number;
  cameraMode: number;       // 0, 1, or 2
  lcdFace: number;          // 0-3
  eventMask: number;        // bitmask of EVENT_MASK_BITS
}
```

Also add the MQTT contract for profile push:

```typescript
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
```

Add to MQTT_TOPICS:
```typescript
nodeProfileSet: "xentient/node/{nodeId}/profile/set",
nodeProfileAck: "xentient/node/{nodeId}/profile/ack",
```

Add to ALL_SCHEMAS.

#### 1.2 Add Configuration to types.ts

```typescript
export interface Configuration {
  name: string;                    // e.g. "meeting", "deep-focus"
  displayName: string;            // human-readable
  nodeAssignments: Record<string, string>;  // nodeRole → NodeSkill ID
  coreSkills: string[];            // CoreSkill IDs enabled for this config
  brainSkills?: string[];          // BrainSkill IDs (informational for v1)
  transitions?: ConfigTransitions; // optional auto-transition rules
}

export interface ConfigTransitions {
  activateWhen?: ConfigTrigger;    // when to auto-activate this config
  deactivateWhen?: ConfigTrigger;  // when to auto-deactivate (revert to previous)
}

export type ConfigTrigger =
  | { cron: string }               // e.g. "0 9 * * 1-5" (weekdays 9am)
  | { idle: number }                // ms of idle before deactivation
  | { sensor: SensorKey; operator: CompareOperator; value: number }
```

#### 1.2b Add SpaceNode + CoreNodeState, remove SpaceMode

```typescript
export type CoreNodeState = 'dormant' | 'running';

export interface SpaceNode {
  nodeId: string;           // hardware identifier
  role: string;            // e.g. "ceiling-unit", "teacher-desk", "door-entrance"
  hardware: string[];      // what's physically on this node
  state: CoreNodeState;    // dormant or running
}

export interface Space {
  id: string;
  nodes: SpaceNode[];              // REPLACES nodeBaseId — multiple nodes per space
  activePack: string;
  activeConfig: string;            // REPLACES activeMode — which configuration is active
  availableConfigs: string[];      // list of config names available in this space
  integrations: SpaceIntegration[];
}
```

**Migration note:** `activeMode` (BehavioralMode) replaced by `activeConfig`. `modeFilter` on CoreSkill becomes `configFilter`. `SpaceMode` (sleep/listen/active/record) replaced by `CoreNodeState` (dormant/running) per node. `Space.nodeBaseId` replaced by `Space.nodes[]`. All MQTT events from nodes gain `nodeId` and `role` fields.

#### 1.3 Add toNodeProfile() function

New file: `harness/src/engine/nodeProfileCompiler.ts`

```typescript
import { NodeSkill, NodeProfile, EVENT_MASK_BITS } from '../shared/contracts';
import type { SpaceNode } from './types';

/**
 * Compiles a Core-level NodeSkill into a firmware-level NodeProfile.
 * Validates hardware requirements against the specific node's hardware list.
 * Returns null if requirements not met (caller handles fallback).
 */
export function toNodeProfile(
  nodeSkill: NodeSkill,
  node: SpaceNode,
): NodeProfile | null {
  // Hardware check — against this specific node's hardware
  if (nodeSkill.requires.pir && !node.hardware.includes('motion')) return null;
  if (nodeSkill.requires.mic && !node.hardware.includes('audio')) return null;
  if (nodeSkill.requires.bme && !node.hardware.includes('temperature')) return null;
  if (nodeSkill.requires.camera && !node.hardware.includes('camera')) return null;

  // Compile event mask from emits array
  let eventMask = 0;
  for (const eventType of nodeSkill.emits) {
    const bit = EVENT_MASK_BITS[eventType.toUpperCase() as keyof typeof EVENT_MASK_BITS];
    if (bit) eventMask |= bit;
  }

  return {
    profileId: nodeSkill.id,
    pirIntervalMs: nodeSkill.sampling.pirDebounceMs ?? 1000,
    micMode: nodeSkill.sampling.micMode ?? 0,  // explicit: 0=off, 1=vad-only, 2=always-on
    bmeIntervalMs: nodeSkill.sampling.bmeIntervalMs ?? 5000,
    cameraMode: nodeSkill.sampling.cameraMode ?? 0,
    lcdFace: 0,    // v1: calm default, LCD managed by set_lcd action
    eventMask,
  };
}
```

#### 1.4 Update NodeSkill type

Add `compatibleConfigs` to NodeSkill in NODE-SKILLS.md / types.ts:

```typescript
export interface NodeSkill {
  id: string;
  name: string;
  version: string;
  requires: { /* unchanged */ };
  sampling: {
    audioRate?: number;
    audioChunkMs?: number;
    bmeIntervalMs?: number;
    pirDebounceMs?: number;
    micMode?: number;            // 0=off, 1=vad-only, 2=always-on — explicit
    cameraMode?: number;         // 0=off, 1=on-motion, 2=stream — explicit
    vadThreshold?: number;
  };
  emits: NodeEventType[];
  expectedBy: string;              // paired CoreSkill
  compatibleConfigs: string[];     // which configurations can use this NodeSkill
  modeTask?: { /* unchanged */ };
}
```

#### 1.5 Update PackSkillManifest

Add configurations section to the pack manifest schema:

```typescript
export interface PackManifest {
  pack: {
    name: string;
    version: string;
    description?: string;
    author?: string;
  };
  configurations: Configuration[];   // NEW — the named configs this pack defines
  nodeSkills: NodeSkill[];           // NEW — NodeSkills this pack provides
  skills: PackSkill[];               // existing CoreSkills
}
```

Update `PackSkillManifestSchema` in contracts.ts to include these.

#### 1.6 Remove BehavioralMode and modeFilter

- Remove `BehavioralMode` type from `types.ts`
- Remove `modeFilter` field from `CoreSkill` interface
- Add `configFilter?: string` to `CoreSkill` (config name or `"*"` for all configs)
- Update `SkillExecutor.matchesSpace()` to use `configFilter` instead of `modeFilter`
- Update all builtin skills in `builtins.ts` to use `configFilter: "*"`
- Update `SpaceManager.switchMode()` → `SpaceManager.switchConfig()` (rename)
- Update `xentient_switch_mode` MCP tool → `xentient_activate_config` (rename)
- Update `SKILL_EVENTS.MODE_SWITCHED` → `SKILL_EVENTS.CONFIG_CHANGED` (rename)
- Update all test files referencing `activeMode`, `modeFilter`, `switchMode`

**Files touched:** types.ts, contracts.ts, SkillExecutor.ts, SpaceManager.ts, builtins.ts, tools.ts, core.ts, all test files

**Deliverable:** Types compile. All tests pass after rename. No new behavior yet — just the type system realigned.

---

### Sprint 2: activateConfig + TransitionQueue

**Goal:** The architectural hinge. Core thinks in configurations. Config transitions are queued, not immediate.

#### 2.1 Implement TransitionQueue

New file: `harness/src/engine/TransitionQueue.ts`

```typescript
export type TransitionAction =
  | { type: 'activate_config'; configName: string; spaceId: string }
  | { type: 'set_node_state'; nodeId: string; state: CoreNodeState }
  | { type: 'register_skill'; skill: CoreSkill; spaceId: string }
  | { type: 'remove_skill'; skillId: string; spaceId: string };

export class TransitionQueue {
  private queue: TransitionAction[] = [];
  private processing = false;

  enqueue(action: TransitionAction): void {
    this.queue.push(action);
  }

  /**
   * Drain one item from the queue. Called by the heartbeat tick.
   * Returns the action that was processed, or null if queue is empty.
   */
  drain(): TransitionAction | null {
    if (this.queue.length === 0) return null;
    return this.queue.shift() ?? null;
  }

  get pending(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}
```

#### 2.2 Wire TransitionQueue into SpaceManager

`SpaceManager` gets a `TransitionQueue` instance. All state-mutating methods (activateConfig, switchMode, registerSkill, removeSkill) append to the queue instead of executing immediately.

The `SkillExecutor.tick()` method, after completing its skill evaluation cycle, calls `spaceManager.drainTransition()` which processes one queued item.

This guarantees: the current skill tick always completes against a consistent state. No partial transitions.

#### 2.3 Implement activateConfig()

In `SpaceManager`:

```typescript
activateConfig(spaceId: string, configName: string): void {
  // 1. Validate config exists in the active pack
  const pack = this.packLoader.getLoadedPackManifest();
  const config = pack.configurations.find(c => c.name === configName);
  if (!config) throw new Error(`Configuration "${configName}" not found in active pack`);

  // 2. Queue the transition (not immediate!)
  this.transitionQueue.enqueue({
    type: 'activate_config',
    configName,
    spaceId,
  });
}

// Called by heartbeat tick after skill evaluation completes
private executeConfigTransition(spaceId: string, configName: string): void {
  const space = this.spaces.get(spaceId);
  if (!space) return;

  const pack = this.packLoader.getLoadedPackManifest();
  const config = pack.configurations.find(c => c.name === configName);
  if (!config) return;

  const previousConfig = space.activeConfig;

  // 1. Update space state
  space.activeConfig = configName;

  // 2. Push NodeProfile to each Node Base in the space
  for (const node of space.nodes) {
    const nodeSkillId = config.nodeAssignments[node.role];
    if (!nodeSkillId) continue; // no assignment for this role — skip

    const nodeSkill = pack.nodeSkills.find(ns => ns.id === nodeSkillId);
    if (!nodeSkill) {
      logger.warn({ nodeSkillId, role: node.role }, "NodeSkill not found in pack");
      continue;
    }

    const profile = toNodeProfile(nodeSkill, node);
    if (profile) {
      this.mqttClient.publish(
        `xentient/node/${node.nodeId}/profile/set`,
        JSON.stringify({ v: 1, type: "node_profile_set", ...profile })
      );
      node.state = 'running';
    } else {
      // Hardware mismatch — push default profile
      this.pushDefaultProfile(node);
      logger.warn({ configName, nodeId: node.nodeId, role: node.role }, "NodeSkill hardware mismatch, pushed default profile");
    }
  }

  // 3. Enable config-scoped CoreSkills
  const executor = this.executors.get(spaceId);
  if (executor) {
    executor.setActiveConfig(configName);
    // Skills with configFilter matching configName or "*" are active
    // All others are skipped by matchesSpace()
  }

  // 4. Notify Brain via MCP
  this.mcpServer.notification("xentient/config_changed", {
    spaceId,
    previousConfig,
    activeConfig: configName,
    configDetails: config,
    timestamp: Date.now(),
  });

  // 5. Observability
  this.broadcastObservabilityEvent({
    type: 'config_changed',
    spaceId,
    previousConfig,
    activeConfig: configName,
    timestamp: Date.now(),
  });
}
```

#### 2.4 Add setActiveConfig to SkillExecutor

```typescript
// In SkillExecutor
private activeConfig: string = 'default';

setActiveConfig(configName: string): void {
  this.activeConfig = configName;
}

// Update matchesSpace
matchesSpace(skill: CoreSkill): boolean {
  const spaceMatch = skill.spaceId === '*' || skill.spaceId === this.opts.spaceId;
  const configMatch = !skill.configFilter || skill.configFilter === '*' || skill.configFilter === this.activeConfig;
  return spaceMatch && configMatch;
}
```

#### 2.5 Wire drain into heartbeat tick

In `SpaceManager.handleEvent()` or a new `tick()` method:

```typescript
tick(): void {
  for (const [spaceId, executor] of this.executors) {
    executor.tick(); // evaluates skills against current state
  }

  // After all ticks complete, drain one transition
  const transition = this.transitionQueue.drain();
  if (transition) {
    this.executeTransition(transition);
  }
}
```

#### 2.6 Add xentient_activate_config MCP tool

Replaces `xentient_switch_mode`. Tool handler:

```typescript
{
  name: 'xentient_activate_config',
  description: 'Activate a named configuration for a Space',
  inputSchema: {
    type: 'object',
    properties: {
      configName: { type: 'string', description: 'Configuration name from pack manifest' },
      spaceId: { type: 'string', description: 'Target space ID', default: 'default' },
    },
    required: ['configName'],
  },
  handler: async (args) => {
    deps.spaceManager.activateConfig(args.spaceId ?? 'default', args.configName);
    return { queued: true, configName: args.configName };
  }
}
```

**Deliverable:** `activateConfig()` works end-to-end. Config transitions are queued. NodeProfile is pushed to MQTT (firmware doesn't understand it yet — that's Sprint 5). Skill filtering is config-scoped. Tests verify queue ordering and config-scope filtering.

---

### Sprint 3: MCP Capability Discovery

**Goal:** Brain can discover what the room can do without hardcoded knowledge.

#### 3.1 Add xentient_get_capabilities MCP tool

```typescript
{
  name: 'xentient_get_capabilities',
  description: 'Get the full current capability picture of the Xentient system',
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: { type: 'string', default: 'default' },
    },
  },
  handler: async (args) => {
    const spaceId = args.spaceId ?? 'default';
    const space = deps.spaceManager.getSpace(spaceId);
    const executor = deps.spaceManager.getExecutor(spaceId);
    const modeManager = deps.modeManager;

    const pack = deps.packLoader.getLoadedPackManifest();

    return {
      nodes: space.nodes.map(node => ({
        nodeId: node.nodeId,
        role: node.role,
        hardware: node.hardware,
        state: node.state,
        activeProfile: pack.nodeSkills
          ?.find(ns => ns.id === config?.nodeAssignments[node.role])
          ?.id ?? null,
        eventMask: pack.nodeSkills
          ?.find(ns => ns.id === config?.nodeAssignments[node.role])
          ?.emits ?? [],
      })),
      core: {
        activePack: space.activePack,
        activeConfig: space.activeConfig,
        availableConfigs: pack.configurations.map(c => c.name),
        activeSkills: executor?.listSkills(spaceId).filter(s => s.enabled) ?? [],
        availableActions: [
          'set_lcd', 'play_chime', 'set_mode', 'mqtt_publish',
          'increment_counter', 'log',
        ],
      },
      space: {
        id: space.id,
        integrations: space.integrations.map(i => i.type),
        permissions: [], // v1: empty, authorization not yet implemented
      },
    };
  }
}
```

#### 3.2 Add xentient_get_skill_schema MCP tool

```typescript
{
  name: 'xentient_get_skill_schema',
  description: 'Get the schema for a skill type, used by Brain to author new skills',
  inputSchema: {
    type: 'object',
    properties: {
      skillType: {
        type: 'string',
        enum: ['CoreSkill', 'NodeSkill', 'Configuration'],
        description: 'Which schema to return',
      },
    },
    required: ['skillType'],
  },
  handler: async (args) => {
    switch (args.skillType) {
      case 'CoreSkill':
        return {
          fields: {
            id: { type: 'string', required: true, pattern: '^[a-z0-9_-]{1,64}$' },
            displayName: { type: 'string', required: true, maxLength: 64 },
            enabled: { type: 'boolean', default: true },
            spaceId: { type: 'string', default: 'default' },
            configFilter: { type: 'string', description: 'Config name or "*" for all' },
            trigger: { /* full SkillTrigger schema */ },
            actions: { /* full CoreAction schema */ },
            collect: { /* full DataCollector schema */ },
            escalation: { /* full EscalationConfig schema */ },
            priority: { type: 'number', min: 0, max: 100, default: 50 },
            cooldownMs: { type: 'number', min: 0, default: 0 },
          },
          triggerTypes: ['cron', 'interval', 'mode', 'sensor', 'event', 'internal', 'composite'],
          actionTypes: ['set_lcd', 'play_chime', 'set_mode', 'mqtt_publish', 'increment_counter', 'log'],
        };
      case 'NodeSkill':
        return {
          fields: { /* full NodeSkill schema */ },
          eventTypes: Object.keys(EVENT_MASK_BITS).map(k => k.toLowerCase()),
          hardwareRequirements: ['pir', 'mic', 'camera', 'bme', 'lcd'],
        };
      case 'Configuration':
        return {
          fields: { /* full Configuration schema */ },
          example: {
            name: 'deep-focus',
            displayName: 'Deep Focus',
            nodeSkill: 'daily-life',
            coreSkills: ['env-logger'],
            transitions: { deactivateWhen: { idle: 3600000 } },
          },
        };
    }
  }
}
```

**Deliverable:** Brain calls `xentient_get_capabilities` on connect and after config changes. Brain calls `xentient_get_skill_schema` when authoring new skills. Both return structured, typed responses.

---

### Sprint 4: Brain Event Subscription

**Goal:** Brain can passively observe the event stream for pattern recognition, not just react to escalations.

#### 4.1 Add EventSubscription type

```typescript
interface EventSubscription {
  id: string;                       // subscription UUID
  eventTypes: string[];             // which events to receive
  maxRateMs: number;                 // rate limit: 0=real-time, 1000=default
  buffer: unknown[];                // pending events awaiting flush
  lastFlushAt: number;              // timestamp of last flush
  flushTimer: ReturnType<typeof setTimeout> | null;
}
```

#### 4.2 Add xentient_subscribe_events MCP tool

```typescript
{
  name: 'xentient_subscribe_events',
  description: 'Subscribe to a filtered event stream from Core',
  inputSchema: {
    type: 'object',
    properties: {
      eventTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event types to receive (e.g. ["motion_detected", "sensor_update"])',
      },
      maxRateMs: {
        type: 'number',
        default: 1000,
        description: 'Minimum interval between event deliveries. 0 = real-time.',
      },
    },
    required: ['eventTypes'],
  },
  handler: async (args) => {
    const subscriptionId = uuid();
    deps.eventSubscriptionManager.subscribe({
      id: subscriptionId,
      eventTypes: args.eventTypes,
      maxRateMs: args.maxRateMs ?? 1000,
    });
    return { subscriptionId, eventTypes: args.eventTypes, maxRateMs: args.maxRateMs ?? 1000 };
  }
}
```

#### 4.3 Add xentient_unsubscribe_events MCP tool

```typescript
{
  name: 'xentient_unsubscribe_events',
  description: 'Remove an event subscription',
  inputSchema: {
    type: 'object',
    properties: {
      subscriptionId: { type: 'string' },
    },
    required: ['subscriptionId'],
  },
  handler: async (args) => {
    deps.eventSubscriptionManager.unsubscribe(args.subscriptionId);
    return { removed: true };
  }
}
```

#### 4.4 Implement EventSubscriptionManager

New file: `harness/src/engine/EventSubscriptionManager.ts`

- Maintains `Map<subscriptionId, EventSubscription>`
- On any event: check which subscriptions match the event type
- Buffer matching events per subscription
- If `maxRateMs` has elapsed since last flush: flush immediately via MCP notification
- If not elapsed: schedule a flush timer for the remaining time
- On flush: send `xentient/event_batch` MCP notification with buffered events
- On unsubscribe: clear flush timer, remove subscription
- On Brain disconnect: remove all subscriptions for that client

**Notification format:**
```typescript
{
  method: "xentient/event_batch",
  params: {
    subscriptionId: string,
    events: Array<{ type: string; data: unknown; timestamp: number }>,
  }
}
```

**Deliverable:** Brain subscribes to `["motion_detected", "sensor_update"]` with `maxRateMs: 5000`. Core batches matching events and delivers them no faster than every 5 seconds. Brain receives `xentient/event_batch` notifications. Tests verify rate limiting and batching.

---

### Sprint 5: Brain Config Authoring

**Goal:** Brain can create new configurations, not just activate existing ones. The room gets permanently smarter.

#### 5.1 Add xentient_register_config MCP tool

```typescript
{
  name: 'xentient_register_config',
  description: 'Register a new configuration. Brain-authored configs become first-class entries in the pack.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' },
      displayName: { type: 'string', maxLength: 64 },
      nodeSkillId: { type: 'string', description: 'Existing NodeSkill ID to use' },
      coreSkillIds: { type: 'array', items: { type: 'string' } },
      transitions: { /* ConfigTransitions schema */ },
    },
    required: ['name', 'displayName', 'coreSkillIds'],
  },
  handler: async (args) => {
    // Validate nodeSkill exists if specified
    // Validate coreSkill IDs exist
    // Build Configuration object
    // Add to pack manifest (in-memory, persisted to file)
    // Add to space.availableConfigs
    return { registered: true, configName: args.name };
  }
}
```

#### 5.2 PackLoader integration for Brain-authored configs

- `PackLoader.registerConfig(config: Configuration)`: adds to in-memory manifest and persists to `packs/<name>/manifest.json`
- Brain-authored configs have `source: 'brain'` tag for observability
- On Core restart, pack is reloaded from disk — Brain configs survive restarts

**Deliverable:** Brain calls `xentient_register_config` with a "deep-focus" config. Core validates, adds it to the pack manifest, adds it to `availableConfigs`. It appears in `xentient_get_capabilities`. It can be activated with `xentient_activate_config("deep-focus")`.

---

### Sprint 6: Brain Stream

**Goal:** Brain pushes reasoning tokens back to Core's SSE bus for live Dashboard rendering.

#### 6.1 Add xentient_brain_stream MCP tool

```typescript
{
  name: 'xentient_brain_stream',
  description: 'Push a Brain reasoning event to the Core observability bus',
  inputSchema: {
    type: 'object',
    properties: {
      escalation_id: { type: 'string', description: 'Escalation this event belongs to' },
      subtype: {
        type: 'string',
        enum: [
          'escalation_received',
          'reasoning_token',
          'tool_call_fired',
          'tool_call_result',
          'tts_queued',
          'escalation_complete',
        ],
      },
      payload: { type: 'object', additionalProperties: true },
    },
    required: ['escalation_id', 'subtype'],
  },
  handler: async (args) => {
    const event: BrainStreamEvent = {
      type: 'brain_event',
      source: 'brain',
      escalation_id: args.escalation_id,
      subtype: args.subtype,
      payload: args.payload ?? {},
      timestamp: Date.now(),
    };

    // Relay to SSE bus
    deps.controlServer.broadcastSSE(event);

    // If escalation_complete, close the escalation in Core
    if (args.subtype === 'escalation_complete') {
      deps.spaceManager.closeEscalation(args.escalation_id);
    }

    return { relayed: true };
  }
}
```

#### 6.2 Add BrainStreamEvent to types.ts

Already defined in BRAIN-INTERFACE.md. Add to types.ts:

```typescript
export type BrainStreamSubtype =
  | 'escalation_received'
  | 'reasoning_token'
  | 'tool_call_fired'
  | 'tool_call_result'
  | 'tts_queued'
  | 'escalation_complete';

export interface BrainStreamEvent {
  type: 'brain_event';
  source: 'brain';
  escalation_id: string;
  subtype: BrainStreamSubtype;
  payload: Record<string, unknown>;
  timestamp: number;
}
```

**Deliverable:** Brain calls `xentient_brain_stream` with reasoning tokens. Dashboard SSE stream receives `brain_event` entries grouped by `escalation_id`. Tests verify event relay and escalation closure.

---

### Sprint 7: Pipeline.ts Cutover Gate

**Goal:** Define and enforce the gate for removing Pipeline.ts from Core. The gate must cover both happy and failure paths — Pipeline.ts handles error cases that brain-basic must also cover before deletion is safe.

#### 7.1 Write the cutover gate into CONTEXT.md

Add to CONTEXT.md "Current State" section:

```markdown
### Pipeline.ts Cutover Gate

Pipeline.ts will be deleted from Core when ALL of the following are true:

1. Sprint 1-6 of the realignment plan are complete
2. brain-basic successfully processes a voice escalation end-to-end:
   - Receives `xentient/skill_escalated` notification
   - Runs STT on the audio payload
   - Routes to LLM with context
   - Generates TTS audio
   - Calls `xentient_play_audio` via MCP tool
   - Audio plays through the Node Base speaker
3. A second test: Brain streams reasoning via `xentient_brain_stream` and it appears in the Dashboard
4. No regression in existing voice pipeline functionality
5. STT provider fails → Brain receives error notification via MCP and does not hang. (Failure-path test — happy path alone is not sufficient to safely delete Pipeline.ts, which currently handles STT failure, LLM timeout, and TTS provider error.)

Until ALL five conditions are met, Pipeline.ts stays. No exceptions.
```

#### 7.2 Mark Pipeline.ts as deprecated with responsibility surface

Add a deprecation comment at the top of `engine/Pipeline.ts` that explicitly lists what brain-basic must cover before deletion:

```typescript
/**
 * @deprecated — CUTOVER GATE in CONTEXT.md.
 * Current responsibilities that brain-basic must cover before deletion:
 *   - STT (Whisper) with timeout + error handling
 *   - LLM routing with context injection
 *   - TTS with provider fallback
 *   - xentient_play_audio result validation
 *   - Escalation ID correlation across the full chain
 * Do NOT delete until all five are proven via brain-basic.
 * Do NOT add new features to this module.
 */
```

**Deliverable:** Gate is documented with 5 conditions (including failure path). Pipeline.ts is marked deprecated with explicit deletion checklist. No code is deleted yet.

---

### Sprint 8: Firmware Two-Task Model

**Goal:** The ESP32 firmware implements the two-task FreeRTOS model with NodeProfile hot-swap. This is C/FreeRTOS on a physical ESP32-CAM — the risk isn't in writing it, it's in writing it wrong.

#### 8.1 Add NodeProfile C struct to firmware/shared/messages.h

```c
typedef struct {
    char    profile_id[32];
    uint16_t pir_interval_ms;
    uint8_t  mic_mode;        // 0=off, 1=vad-only, 2=always-on
    uint16_t bme_interval_ms;
    uint8_t  camera_mode;     // 0=off, 1=on-motion, 2=stream
    uint8_t  lcd_face;        // 0=calm, 1=alert, 2=listening, 3=speaking
    uint16_t event_mask;     // bitmask of EVENT_MASK_* bits
} NodeProfile;

// Event mask bits — must match harness contracts.ts EVENT_MASK_BITS
#define EVENT_MASK_PRESENCE    0x0001
#define EVENT_MASK_MOTION      0x0002
#define EVENT_MASK_ENV         0x0004
#define EVENT_MASK_AUDIO_CHUNK 0x0008
#define EVENT_MASK_VAD         0x0010
#define EVENT_MASK_FRAME       0x0020
```

#### 8.2 Refactor firmware into two FreeRTOS tasks

**Task 1 — Work Task (Core 1, high priority):**
- Runs the currently loaded NodeProfile
- Reads sensors at declared intervals
- Publishes events to MQTT based on `event_mask`
- Controls actuators (LCD, speaker) when commanded
- Checks `profileUpdateFlag` at end of each iteration
- Registered with ESP32 task watchdog (`esp_task_wdt_add`); resets watchdog after each successful sensor read. If BME280 I2C lockup or PIR hang occurs, watchdog resets the chip → clean recovery instead of silent hang.

**Task 2 — Config Task (Core 0, low priority):**
- Sleeps 500ms
- Wakes, checks `profileUpdateFlag` — does NOT parse JSON (see 8.4)
- If flag set: copies `pendingProfile` → `activeProfile` under critical section, clears flag, reconfigures sensors, sends `node_profile_ack`
- Sleeps again
- Never interrupts Task 1

**Shared state (critical-section protected — NOT just volatile):**

`volatile` prevents compiler register caching but does NOT prevent torn reads when copying a struct larger than 4 bytes on a 32-bit MCU. NodeProfile is ~40 bytes. Use `portENTER_CRITICAL` / `portEXIT_CRITICAL` around every memcpy.

```c
static portMUX_TYPE profileMux = portMUX_INITIALIZER_UNLOCKED;
volatile NodeProfile activeProfile;
volatile NodeProfile pendingProfile;
volatile bool profileUpdateFlag = false;
char lastReceivedProfileId[32];  // echoes in ack regardless of swap timing
```

**Hot-swap protocol (corrected for torn-write safety):**
1. MQTT callback receives `node_profile_set` → parses JSON immediately in MQTT task context, validates, copies to `pendingProfile` under critical section, sets `profileUpdateFlag = true` (see 8.4)
2. Config Task wakes, checks flag
3. If flag set:
   ```c
   portENTER_CRITICAL(&profileMux);
   memcpy((void*)&activeProfile, (void*)&pendingProfile, sizeof(NodeProfile));
   profileUpdateFlag = false;
   portEXIT_CRITICAL(&profileMux);
   ```
4. Config Task reconfigures sensor intervals and event emission from new `activeProfile`
5. Config Task sends `node_profile_ack` with `profileId` from `lastReceivedProfileId` and `status: "loaded"`

#### 8.3 Default NodeProfile on boot

```c
const NodeProfile DEFAULT_PROFILE = {
    .profile_id = "default",
    .pir_interval_ms = 1000,
    .mic_mode = 0,
    .bme_interval_ms = 5000,
    .camera_mode = 0,
    .lcd_face = 0,
    .event_mask = EVENT_MASK_PRESENCE,
};
```

#### 8.4 JSON parsing happens in MQTT callback, not Config Task

Config Task must never parse JSON — stack overflow risk (unpredictable payload sizes) and heap fragmentation risk on long-running embedded systems. Parse and validate in the MQTT message callback (which runs in the MQTT task's context). If valid, copy fields into `pendingProfile` under the critical section. Config Task only does the guarded memcpy.

```c
// In MQTT message callback (runs in MQTT task context)
void onMqttMessage(const char* topic, const char* payload) {
  if (strstr(topic, "/profile/set")) {
    NodeProfile parsed;
    memset(&parsed, 0, sizeof(NodeProfile));
    if (parseNodeProfileJson(payload, &parsed)) {
      portENTER_CRITICAL(&profileMux);
      memcpy((void*)&pendingProfile, &parsed, sizeof(NodeProfile));
      strncpy(lastReceivedProfileId, parsed.profile_id, sizeof(lastReceivedProfileId) - 1);
      profileUpdateFlag = true;
      portEXIT_CRITICAL(&profileMux);
    }
  }
}
```

#### 8.5 node_profile_ack echoes the received profileId

Two rapid profile pushes (e.g. reconnect replay + new config activation) produce two acks. Core matches acks to pushes by `profileId`. The firmware stores the `profile_id` from the incoming JSON immediately in `lastReceivedProfileId` and echoes it in the ack regardless of whether the swap has completed.

```c
void sendProfileAck(const char* profileId, const char* status) {
  char payload[128];
  snprintf(payload, sizeof(payload),
    "{\"v\":1,\"type\":\"node_profile_ack\",\"profileId\":\"%s\",\"status\":\"%s\"}",
    profileId, status);
  mqttClient.publish("xentient/node/{nodeId}/profile/ack", payload);
}
```

#### 8.6 WiFi reconnect triggers MQTT reconnect

WiFi and MQTT reconnect are independent on ESP32. When WiFi reconnects, the MQTT client must explicitly reconnect — this is NOT automatic with all ESP32 MQTT libraries.

```c
void onWifiConnected(WiFiEvent_t event) {
  mqttClient.connect(MQTT_BROKER, MQTT_PORT);
  // Core's reconnect handler will replay the active profile
}
```

#### 8.7 Work Task watchdog registration

```c
// In Work Task setup
esp_task_wdt_add(NULL);  // register this task with the watchdog

// In Work Task loop, after each successful sensor read cycle
esp_task_wdt_reset();
```

If the watchdog fires (default 5s timeout), the ESP32 resets. Core gets an MQTT disconnect, the reconnect handler replays the profile, and the node comes back clean. Much better than a silent hang where Core sees the node as alive but publishing nothing.

#### 8.8 Hardware test protocol

Before marking Sprint 8 done, run this physical verification checklist:

**Boot tests:**
- [ ] Node boots → publishes presence event within 10s
- [ ] Default profile applied (pir_interval=1000, mic_mode=0, event_mask=0x01)

**Profile push tests:**
- [ ] Core sends `node_profile_set` → firmware sends `node_profile_ack` within 5s
- [ ] PIR interval changes (verify with serial monitor timing)
- [ ] mic_mode=1 enables VAD events (speak → VAD event published)
- [ ] mic_mode=2 enables audio_chunk events (verify on MQTT topic)
- [ ] event_mask=0x00 → no events published (silence test)

**Failure recovery tests:**
- [ ] Kill MQTT broker → restart → Core replays profile → ack received
- [ ] Kill WiFi → restore → MQTT reconnects → profile replayed
- [ ] Power cycle node mid-session → boots to default profile → Core detects via reconnect

**Torn-write stress test:**
- [ ] Send 10 `profile_set` messages in rapid succession → node never publishes corrupted sensor data (pir_interval > 60000 or mic_mode > 2)

**Deliverable:** Firmware boots with default profile. Receives `node_profile_set` via MQTT. Hot-swaps the profile under critical section (no torn reads). Sends `node_profile_ack` echoing the received profileId. All sensors respect new intervals and event mask. Watchdog guards against sensor hangs. WiFi reconnect triggers MQTT reconnect. Hardware test protocol passes.

---

### Sprint 9: Documentation Realignment

**Goal:** All docs reflect the configuration-centric architecture. No references to `activeMode`, `modeFilter`, or `BehavioralMode` remain. Robustness additions from Phase 7 patches are documented.

#### 9.1 Update CONTEXT.md
- Replace `activeMode` references with `activeConfig`
- Add Pipeline.ts Cutover Gate section (5 conditions)
- Update "Current State" table with new component statuses
- Update "Next Right Steps" to reflect realignment sprints
- **Mark all 10 robustness patches as complete in the status table** — the pendingAcks map, 5s timeout → node_offline notification, onMqttReconnect() profile replay, ghost skill guard, atomic persistence, debounced writes, dead notification removal, composite trigger docs, atomic pack load, brainConnected callback. These are now core behaviors, not optional. The next person (or Brain, or evaluator) reading CONTEXT.md must see accurate status, not a stale snapshot from before the patches.

#### 9.2 Update NODE-SKILLS.md
- Add NodeSkill → NodeProfile compilation section
- Add `compatibleConfigs` field documentation
- Clarify: NodeSkill is Core-level, NodeProfile is firmware-level

#### 9.3 Update BRAIN-INTERFACE.md
- Add `xentient_get_capabilities`, `xentient_get_skill_schema`, `xentient_subscribe_events`, `xentient_register_config`, `xentient_brain_stream` to Available Tools table
- Add Event Subscription section (Channel 1.5 — passive observation)
- Add Config Authoring section
- **Document `xentient/node_offline` notification**: what triggers it (5s ack timeout on `node_profile_set`), what it contains (`nodeId`), and what Brain should do (don't try to activate configs on that node until `node_online` or reconnect).

#### 9.4 Update SKILLS.md
- Replace `modeFilter` with `configFilter` throughout
- Add Configuration as a first-class concept in the skill ecosystem

#### 9.5 Update PACKS.md — complete runnable example pack
- Add `configurations` and `nodeSkills` sections to pack manifest format
- **Write one complete, runnable example pack manifest** with at least:
  - 2 configurations (e.g. "classroom" and "idle")
  - 2 node roles (e.g. "ceiling-unit" and "teacher-desk")
  - 1 NodeSkill per role
  - `nodeAssignments` wired up in each configuration
  - CoreSkill references
- This single working example is worth more than all the schema documentation combined — it's what evaluators and Brain will use as their first template. Don't just document the schema; write something a person could copy, paste, and actually run.

#### 9.6 Update ARCHITECTURE.md
- Replace behavioral mode concept with configuration concept
- Add NodeProfile compilation pipeline diagram
- Add TransitionQueue to architecture diagram
- **Add ack timeout + reconnect replay flow**: document the `pendingAcks` map, the 5s timeout → `node_offline` notification, and `onMqttReconnect()` profile replay. These are now core behaviors, not optional additions. The architecture diagram must show: Core pushes `node_profile_set` → starts 5s ack timer → if ack received → profile active / if timeout → `xentient/node_offline` notification. Also show: MQTT reconnect → Core replays last-known profile to each node.

**Deliverable:** Zero references to `activeMode`/`modeFilter`/`BehavioralMode` in any doc. All docs consistently use `activeConfig`/`configFilter`/`Configuration`. Robustness additions are documented. PACKS.md has a runnable example pack. ARCHITECTURE.md shows ack timeout and reconnect flows.

---

## Dependency Graph

```
Sprint 1 (Types) ─────────────────────────────────────┐
  │                                                    │
  ▼                                                    │
Sprint 2 (activateConfig + TransitionQueue) ───────────┤
  │                                                    │
  ├──▶ Sprint 3 (xentient_get_capabilities)             │
  │                                                    │
  ├──▶ Sprint 4 (Event Subscription) ──────────────────┤
  │                                                    │
  └──▶ Sprint 5 (Config Authoring)                     │
                                                       │
Sprint 6 (Brain Stream) ─── independent, can start any time after Sprint 1
                                                       │
Sprint 7 (Pipeline Gate) ─── independent, write anytime
                                                       │
Sprint 8 (Firmware) ─── independent, can start after Sprint 1 types are defined
                                                       │
Sprint 9 (Docs) ─── after all sprints, final sweep ◀──┘
```

Sprints 3, 4, 5 can run in parallel after Sprint 2.
Sprints 6, 7, 8 can start after Sprint 1 (they only need the types).
Sprint 9 is always last.

---

## What Does NOT Change

These are locked and untouched by this plan:

- CoreActions enum (exhaustive, type-safe)
- Escalation ID as correlation key
- Node Skill pairing invariant
- Node Skill event type enum (gated, no arbitrary types)
- Core continues without Brain
- Brain never talks to hardware directly
- MQTT topic structure (only additions, no removals)
- Existing builtin skills logic (just rename modeFilter → configFilter)
- Camera/audio WebSocket servers
- ControlServer REST endpoints (only additions)
- NodeProfile C struct and event mask bits (firmware contract is stable)

---

## Test Strategy

Each sprint has its own test requirements:

| Sprint | Test Type | What to Verify |
|--------|-----------|----------------|
| 1 | Unit | Types compile, Zod schemas validate, toNodeProfile compiles correctly |
| 2 | Unit + Integration | activateConfig queues transition, TransitionQueue drains in order, skills filter by config |
| 3 | Unit + MCP | xentient_get_capabilities returns correct shape, xentient_get_skill_schema returns schema |
| 4 | Unit | EventSubscriptionManager rate-limits correctly, batches events, flushes on timer |
| 5 | Unit + MCP | Register config adds to manifest, appears in capabilities, survives restart |
| 6 | Unit + MCP | Brain stream relays to SSE, escalation_complete closes escalation |
| 7 | Docs + Gate | Cutover gate documented with 5 conditions (incl. failure path). Pipeline.ts @deprecated lists 5 responsibilities |
| 8 | Hardware + Stress | Flash firmware, run hardware test protocol (boot, profile push, failure recovery, torn-write stress). Critical-section memcpy, watchdog, MQTT reconnect, profileId echo |
| 9 | Grep | Zero references to activeMode/modeFilter/BehavioralMode in any file |

---

## The Full MCP Tool Surface After Realignment

| Tool | Sprint | Purpose |
|------|--------|---------|
| `xentient_register_skill` | existing | Brain creates a new CoreSkill |
| `xentient_update_skill` | existing | Brain modifies a CoreSkill |
| `xentient_disable_skill` | existing | Brain enables/disables |
| `xentient_remove_skill` | existing | Brain deletes (builtins: reject) |
| `xentient_list_skills` | existing | Query all CoreSkills + state |
| `xentient_get_skill_log` | existing | Read skill execution log |
| `xentient_activate_config` | Sprint 2 | Activate a named configuration |
| `xentient_resolve_conflict` | existing | Brain responds to skill_conflict |
| `xentient_get_capabilities` | Sprint 3 | Full system capability discovery |
| `xentient_get_skill_schema` | Sprint 3 | Schema introspection for skill authoring |
| `xentient_subscribe_events` | Sprint 4 | Subscribe to filtered event stream |
| `xentient_unsubscribe_events` | Sprint 4 | Remove event subscription |
| `xentient_register_config` | Sprint 5 | Brain authors new configuration |
| `xentient_brain_stream` | Sprint 6 | Push reasoning events to SSE bus |
| `xentient_read_sensors` | existing | Read current sensor values |
| `xentient_play_audio` | existing | Play audio through speaker |
| `xentient_set_lcd` | existing | Set LCD display |
| `xentient_set_dormant` | Sprint 2 | Set a node to dormant state (replaces xentient_set_mode) |
| `xentient_load_pack` | existing | Load a pack |
| `xentient_list_packs` | existing | List available packs |
| `xentient_reload_pack` | existing | Reload current pack |

**Removed:** `xentient_switch_mode` (replaced by `xentient_activate_config`)

---

*Plan version: 2.0*
*Date: 2026-04-30*
*Based on: User's definitive architecture + gap analysis + four clarifications + three corrections*

### Three Corrections Applied (v2)

1. **Space is multi-node** — `Space.nodeBaseId` → `Space.nodes: SpaceNode[]`. A Space is a physical room with potentially multiple Node Bases, each with a declared role.

2. **Configuration declares NodeSkill per role** — `Configuration.nodeSkill: string` → `Configuration.nodeAssignments: Record<string, string>`. Each node gets its own NodeProfile when a config activates.

3. **SpaceMode four-state enum removed** — `sleep/listen/active/record` replaced by `CoreNodeState = 'dormant' | 'running'`. The pack owns all behavioral meaning. Core only tracks whether a node is dormant or running a configuration.
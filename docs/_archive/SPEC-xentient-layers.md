# Xentient Layers Specification

> **Status:** DRAFT v2
> **Date:** 2026-04-26
> **Related:** `SPEC-heartbeat-rule-engine.md`, `VISION.md`, `SPACES.md`, `PACKS.md`

---

## 0. Purpose

This spec defines the **two-layer execution model** for Xentient:

- **Layer 1 (Core):** Deterministic skill execution on the heartbeat loop. No LLM. Millisecond response. Runs even without a Brain connected.
- **Layer 2 (Brain):** Intelligent skill execution via MCP-connected applications (Hermes, Archon, custom agents). LLM reasoning, memory, workflows.

Skills are grouped by **Modes**. Modes run within **Spaces**. Spaces bind to physical **Node Bases**.

---

## 1. Terminology

| Term | Layer | Definition |
|------|-------|------------|
| **Core Skill** | L1 | A deterministic script that runs on the heartbeat loop inside Core. No LLM. Executes in <1ms. Examples: LCD update, chime, mode change, MQTT publish, sensor read. |
| **Brain Skill** | L2 | A skill executed by the Brain (Hermes/Archon/custom). Uses LLM, memory, tools, workflows. Examples: greet visitor by name, generate prayer, analyze build error. |
| **Escalation** | L1→L2 | When a Core Skill's threshold is met, it sends context to the Brain via MCP notification. The Brain then runs a Brain Skill in response. |
| **Mode** | — | A behavioral profile that groups Core Skills + Brain Skills into an active set. "student", "family", "developer". |
| **SpaceMode** | — | Hardware operational state: sleep/listen/active/record. Controls power and audio pipeline. |
| **Space** | — | Identity context binding a Node Base to a Pack, Mode, SpaceMode, and integrations. |
| **Node Base** | HW | Physical ESP32 unit with peripherals. One per Space (v1). |

**Key distinction:** Core Skills live in the Core process and execute on the tick loop. Brain Skills live in the Brain process and execute when the Brain decides. Core Skills can *escalate* to Brain Skills but never *become* them — they are separate code in separate processes.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 2: BRAIN                                                       │
│                                                                       │
│  Brain Skills (executed by Brain, not Core):                         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Hermes Brain Skills:           Archon Brain Skills:            │  │
│  │  • greet-visitor (LLM+memory)   • fix-build (DAG workflow)    │  │
│  │  • morning-prayer (LLM+Mem0)    • deploy-app (deterministic)  │  │
│  │  • study-coach (LLM+context)    • code-review (LLM+tools)     │  │
│  │  • skill-improver (meta-skill)                                 │  │
│  │  • determine-skill (arbitrator)                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Brain can: create/modify/disable/monitor Core Skills via MCP        │
│  Brain can: run its own skills independently (cron, self-initiated)  │
│  Brain can: launch sub-workflows (Archon DAGs, Hermes subagents)    │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ MCP (tools + notifications)
┌───────────────────────────┴───────────────────────────────────────────┐
│ LAYER 1: CORE                                                          │
│                                                                         │
│  Heartbeat Loop (tick every 1-5s):                                     │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ FOR each Core Skill in currentMode.coreSkills:                    │ │
│  │   evaluate trigger → run L1 actions → check escalation → notify  │ │
│  │                                                                    │ │
│  │ Conflict Resolver:                                                │ │
│  │   IF multiple skills trigger on same event:                       │ │
│  │     → priority ordering (deterministic)                           │ │
│  │     → OR escalate to Brain via determine-skill (intelligent)      │ │
│  │                                                                    │ │
│  │ Observability Bus:                                                │ │
│  │   → Every skill fire → SSE event to Web Dashboard                │ │
│  │   → Every escalation → SSE event to Web Dashboard                │ │
│  │   → Skill state (enabled, cooldown, lastFired) queryable via MCP │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  MCP Server (Brain manages skills through these):                      │
│    xentient_register_skill    → Brain creates a Core Skill             │
│    xentient_update_skill      → Brain modifies a Core Skill            │
│    xentient_disable_skill     → Brain toggles a Core Skill             │
│    xentient_list_skills       → Brain queries all Core Skills + state  │
│    xentient_get_skill_log     → Brain reads skill execution history    │
│    xentient_switch_mode       → Brain changes active Mode              │
│    xentient_resolve_conflict  → Brain decides which skills fire        │
│                                                                         │
│  Notifications (Core → Brain):                                         │
│    xentient/skill_escalated   → Core Skill needs Brain reasoning       │
│    xentient/skill_conflict    → Multiple skills triggered, need arbiter│
│    xentient/skill_fired       → Observability: skill executed          │
│                                                                         │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ MQTT + WebSocket
┌───────────────────────────┴─────────────────────────────────────────────┐
│ HARDWARE: Node Bases (1 per Space)                                       │
│                                                                           │
│  Space: "study-desk"          Space: "living-room"                       │
│  Node Base: node-02           Node Base: node-01                         │
│  Mode: "student"              Mode: "family"                             │
│  SpaceMode: active            SpaceMode: listen                          │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Spaces and Multi-Node

### 3.1 Space Model (from SPACES.md, extended)

Each Space binds exactly one Node Base to a behavioral configuration:

```typescript
interface Space {
  id: string;               // "study-desk", "living-room"
  nodeBaseId: string;        // MQTT node ID of physical hardware
  activePack: string;        // which pack is loaded
  spaceMode: SpaceMode;      // hardware state: sleep/listen/active/record
  activeMode: string;        // behavioral profile: "student", "family", "developer"
  integrations: Integration[];
  role?: string;
  sensors: string[];
}
```

### 3.2 Multi-Node: Each Space is Independent

Multiple Node Bases run as **independent Spaces**, each with its own Mode and skill set:

```
┌──────────────────────────┐  ┌──────────────────────────┐
│ Space: "study-desk"       │  │ Space: "living-room"      │
│ Node: node-02             │  │ Node: node-01              │
│ SpaceMode: active         │  │ SpaceMode: listen          │
│ Mode: "student"           │  │ Mode: "family"             │
│                            │  │                            │
│ Core Skills running:      │  │ Core Skills running:       │
│  • class-reminder         │  │  • ambient-comfort         │
│  • study-monitor          │  │  • prayer-time             │
│  • environment-check      │  │  • security-watch          │
│  • identify-guest         │  │                            │
│                            │  │                            │
│ Brain: Hermes (shared)    │  │ Brain: Hermes (shared)     │
└──────────────────────────┘  └──────────────────────────┘
```

**Key rules:**
- Each Space has its own heartbeat loop evaluating its own Core Skills
- All Spaces share the same Brain connection (one Hermes instance serves all)
- Escalation notifications include `spaceId` so the Brain knows which Space triggered
- The Brain can register different Core Skills into different Spaces
- SpaceMode `sleep` suspends all Core Skills for that Space (hardware off)
- SpaceMode `listen` runs only trigger-watch skills (PIR, wake word)
- SpaceMode `active` runs all skills in the active Mode

### 3.3 Cross-Space Skills (future)

A Brain Skill can read sensors from multiple Spaces:
```
Hermes receives escalation from study-desk: "student idle 45min"
  → Hermes calls xentient_read_sensors(space: "living-room")
  → If living-room has people → "Your family is in the living room, take a break?"
  → If nobody home → "Everyone's out. Good time for focused study."
```

---

## 4. Core Skills (Layer 1)

### 4.1 Schema

```typescript
interface CoreSkill {
  id: string;                    // "class-reminder"
  displayName: string;           // "Class Reminder"
  enabled: boolean;
  spaceId: string;               // which Space this skill belongs to

  // --- Trigger ---
  trigger: SkillTrigger;
  priority: number;              // conflict resolution: lower = higher priority

  // --- Layer 1 Actions (deterministic, no LLM) ---
  actions: CoreAction[];
  collect?: DataCollector[];     // gather data each fire (for escalation context)

  // --- Escalation to Layer 2 ---
  escalation?: EscalationConfig;

  // --- Metadata ---
  source: "pack" | "brain" | "builtin";
  cooldownMs: number;
  lastFiredAt?: number;
  fireCount: number;             // observable: total times fired
  lastEscalatedAt?: number;
  escalationCount: number;       // observable: total times escalated
}

type CoreAction =
  | { type: "set_lcd"; line1: string; line2: string }
  | { type: "play_chime"; preset: string }
  | { type: "set_mode"; mode: SpaceMode }
  | { type: "mqtt_publish"; topic: string; payload: object }
  | { type: "increment_counter"; name: string }   // internal state tracking
  | { type: "log"; message: string }               // observability

interface EscalationConfig {
  conditions: EscalationCondition[];
  event: string;                      // MCP notification event name
  contextBuilder: ContextBuilderType;
  priority: "low" | "normal" | "urgent";
  cooldownMs: number;
  conflictGroup?: string;            // skills in same group go through conflict resolution
}

type ContextBuilderType =
  | "sensor-snapshot"    // all sensor readings
  | "camera-snapshot"    // latest JPEG frame
  | "full-context"       // sensors + camera + mode history + counters
  | "minimal"            // just skill ID + trigger info
```

### 4.2 Builtin Core Skills

These ship with the Core and are always available. They form the foundation:

| Skill ID | Trigger | Actions | Escalation | Purpose |
|----------|---------|---------|------------|---------|
| `_pir-wake` | PIR motion | set_mode → listen | None | Wake from sleep |
| `_idle-sleep` | interval (configurable) | set_mode → sleep | None | Return to sleep after idle |
| `_sensor-telemetry` | interval (30s) | log sensor readings | None | Feed observability bus |
| `_determine-skill` | internal (conflict) | None | Always → Brain | Arbitrate skill conflicts |

Builtin skills are prefixed with `_` and cannot be deleted via MCP. They can be disabled.

---

## 5. Brain Skills (Layer 2)

Brain Skills are **not defined in Core**. They live inside the Brain (Hermes skill registry, Archon workflow definitions, custom agent code). Core knows nothing about their internals.

### 5.1 How Brain Skills Are Invoked

1. **Via escalation:** A Core Skill triggers → escalation conditions met → `xentient/skill_escalated` sent → Brain's skill handler picks it up
2. **Self-initiated:** Brain's own scheduler fires (Hermes cron, Archon trigger) → Brain calls MCP tools to interact with the room
3. **User-initiated:** User speaks → voice pipeline → Brain processes → Brain calls MCP tools

### 5.2 Advanced Brain Skills (Hermes)

| Brain Skill | What It Does | Invoked By |
|------------|-------------|------------|
| `greet-visitor` | Vision-LLM identifies person, greets by name using memory | `guest_detected` escalation |
| `morning-prayer` | Generates personalized prayer using Mem0 context | `prayer_time` escalation or Hermes cron |
| `study-coach` | Analyzes study patterns, suggests breaks | `student_idle` escalation |
| `skill-improver` | Meta-skill: analyzes Core Skill fire/escalation ratios, adjusts thresholds | Hermes scheduled (daily) |
| `determine-skill` | Arbitrates when multiple Core Skills conflict (see §6) | `skill_conflict` notification |

### 5.3 Brain Creates Core Skills

The Brain can dynamically register Core Skills via MCP:

```
User: "Remind me to drink water every hour"

Hermes calls xentient_register_skill({
  id: "water-reminder",
  displayName: "Water Reminder",
  spaceId: "study-desk",
  trigger: { type: "interval", everyMs: 3600000 },
  actions: [
    { type: "set_lcd", line1: "(^_^) Hydrate!", line2: "Drink water~" },
    { type: "play_chime", preset: "chime" }
  ],
  // No escalation — pure Layer 1
  priority: 15,
  cooldownMs: 3600000,
  source: "brain"
})
```

This skill now runs on the heartbeat loop **without any Brain involvement**. Brain created it once; Core executes it forever until Brain removes it.

---

## 6. Skill Conflict Resolution

### 6.1 The Problem

Two Core Skills can have identical or overlapping triggers:

```
Skill A: "identify-guest"    trigger: PIR motion    priority: 10
Skill B: "security-alert"    trigger: PIR motion    priority: 10
```

Both fire on the same PIR event. What happens?

### 6.2 Resolution Strategy (Three Tiers)

**Tier 1 — Priority ordering (deterministic, no Brain):**
```
IF skills have different priorities:
  → Fire highest priority (lowest number) first
  → Fire others in order, respecting cooldowns
  → This is the default for most cases
```

**Tier 2 — Conflict group arbitration (escalate to Brain):**
```
IF skills share a conflictGroup AND fire simultaneously:
  → Pause both
  → Send xentient/skill_conflict notification to Brain
  → Brain's determine-skill analyzes context and responds:
    { execute: ["identify-guest"], skip: ["security-alert"], reason: "daytime, expected visitor" }
  → Core executes the Brain's decision
  → IF Brain not connected → fall back to priority ordering
```

**Tier 3 — Brain-side intelligent weighing (advanced, Hermes):**
```
Hermes skill-improver runs daily:
  → Reads skill fire/escalation logs via xentient_get_skill_log
  → Analyzes patterns: "security-alert fires 50x/day but only 2 are real alerts"
  → Adjusts: xentient_update_skill("security-alert", { cooldownMs: 300000 })
  → Or: xentient_update_skill("security-alert", { priority: 20 })
```

### 6.3 The `_determine-skill` Builtin

This is a **builtin Core Skill** that handles conflict group arbitration:

```typescript
const determineSkill: CoreSkill = {
  id: "_determine-skill",
  displayName: "Skill Conflict Arbitrator",
  enabled: true,
  spaceId: "*",  // global, all spaces
  trigger: { type: "internal", event: "skill_conflict" },
  actions: [],   // no L1 actions — pure escalation
  escalation: {
    conditions: [{ field: "conflictCount", operator: ">=", value: 2 }],
    event: "skill_conflict",
    contextBuilder: "full-context",
    priority: "urgent",
    cooldownMs: 0,
  },
  source: "builtin",
  priority: 0,  // highest priority
  cooldownMs: 0,
  fireCount: 0,
  escalationCount: 0,
};
```

---

## 7. Observability

### 7.1 Every Skill Fire is Observable

Core emits SSE events for **every** skill action. The Web Dashboard consumes these in real-time.

```typescript
// SSE event emitted on every Core Skill fire
interface SkillFireEvent {
  type: "skill_fired";
  skillId: string;
  spaceId: string;
  mode: string;
  trigger: string;            // what triggered it
  actionsExecuted: string[];  // ["set_lcd", "play_chime"]
  escalated: boolean;
  timestamp: number;
}

// SSE event for escalation
interface SkillEscalationEvent {
  type: "skill_escalated";
  skillId: string;
  spaceId: string;
  event: string;
  priority: string;
  brainConnected: boolean;    // did escalation reach a Brain?
  timestamp: number;
}

// SSE event for conflict
interface SkillConflictEvent {
  type: "skill_conflict";
  conflictingSkills: string[];
  spaceId: string;
  resolution: "priority" | "brain" | "pending";
  timestamp: number;
}
```

### 7.2 Web Dashboard Integration

The Web Dashboard (Laravel + Livewire) displays:

| Panel | Data Source | Shows |
|-------|-----------|-------|
| **Skill Activity Feed** | SSE `skill_fired` events | Real-time log of every skill fire with timestamp, space, action |
| **Active Skills per Space** | MCP `xentient_list_skills` | Table: skill name, status, lastFired, fireCount, escalationCount |
| **Escalation Queue** | SSE `skill_escalated` events | Pending escalations waiting for Brain response |
| **Conflict Log** | SSE `skill_conflict` events | Conflicts and their resolutions |
| **Mode Selector** | MCP `xentient_switch_mode` | Dropdown per Space to change active Mode |
| **Skill Toggle** | MCP `xentient_disable_skill` | Enable/disable individual Core Skills from the dashboard |

### 7.3 Skill Execution Log (Persistent)

Core persists a ring buffer of the last N skill executions (default: 1000) for the Brain and Dashboard to query:

```typescript
interface SkillLogEntry {
  skillId: string;
  spaceId: string;
  mode: string;
  firedAt: number;
  triggerData: object;
  actionsExecuted: string[];
  escalated: boolean;
  escalationResponse?: {     // Brain's response (if escalated)
    brainType: string;
    responseMs: number;
    actions: string[];
  };
  conflictWith?: string[];   // other skills that triggered simultaneously
  resolution?: string;
}
```

---

## 8. MCP Interface (Complete)

### 8.1 Skill Management Tools (Brain → Core)

| Tool | Purpose |
|------|---------|
| `xentient_register_skill` | Brain creates a new Core Skill on the heartbeat loop |
| `xentient_update_skill` | Brain modifies a Core Skill (priority, cooldown, actions, escalation) |
| `xentient_disable_skill` | Brain enables/disables a Core Skill |
| `xentient_remove_skill` | Brain deletes a dynamic Core Skill (builtin skills cannot be removed) |
| `xentient_list_skills` | Brain queries all Core Skills with current state (per space or all) |
| `xentient_get_skill_log` | Brain reads the skill execution log (filterable by space, skill, time range) |
| `xentient_switch_mode` | Brain changes the active Mode for a Space (changes which skills run) |
| `xentient_resolve_conflict` | Brain responds to a skill_conflict notification with execution decision |

### 8.2 Notifications (Core → Brain)

| Notification | When | Payload |
|-------------|------|---------|
| `xentient/skill_escalated` | Core Skill escalation threshold met | `{ skillId, spaceId, event, context, priority }` |
| `xentient/skill_conflict` | Multiple skills in same conflict group triggered | `{ conflictingSkills[], spaceId, triggerData }` |
| `xentient/skill_fired` | Any Core Skill fires (observability) | `{ skillId, spaceId, actions[], escalated }` |
| `xentient/mode_switched` | Mode changed for a Space | `{ spaceId, previousMode, newMode, activeSkills[] }` |

### 8.3 Example MCP Flows

**Brain monitors and adjusts skills:**
```
1. Hermes calls xentient_list_skills(spaceId: "study-desk")
   → returns all skills with fireCount, escalationCount, lastFired

2. Hermes sees: security-alert.fireCount = 847, escalationCount = 3
   → "This skill fires too often but rarely needs me"
   → Hermes calls xentient_update_skill("security-alert", {
       cooldownMs: 600000,   // was 5000, now 10min
       escalation: { conditions: [{ field: "motionCount", operator: ">=", value: 5 }] }
     })

3. Hermes calls xentient_get_skill_log(spaceId: "study-desk", since: "1h")
   → sees pattern: class-reminder fires but student is already in class
   → Hermes calls xentient_disable_skill("class-reminder")
   → Hermes calls xentient_register_skill({
       id: "class-reminder-v2",
       trigger: { type: "cron", schedule: "50 * * * 1-5" },  // adjusted timing
       ...
     })
```

**Brain responds to conflict:**
```
Core sends: xentient/skill_conflict {
  conflictingSkills: ["identify-guest", "security-alert"],
  spaceId: "study-desk",
  triggerData: { motion: true, time: "14:30", dayOfWeek: 3 }
}

Hermes determine-skill:
  → Checks time: 2:30 PM, weekday
  → Checks memory: "user's sister visits on Wednesdays"
  → Calls xentient_resolve_conflict({
      execute: ["identify-guest"],
      skip: ["security-alert"],
      reason: "Weekday afternoon, expected family visit"
    })

Core executes identify-guest only.
```

---

## 9. Example Use Cases

### 9.1 Student Mode — 4 Core Skills

| # | Core Skill | Trigger | L1 Actions | Escalation to Brain |
|---|-----------|---------|------------|---------------------|
| 1 | `class-reminder` | cron | LCD: "Math 15min", chime | 5min before → Brain generates motivational message |
| 2 | `study-monitor` | interval 30s | Track idle counter | Idle >45min → Brain suggests break with context |
| 3 | `environment-check` | interval 5min | Read sensors, LCD: temp | Temp >35°C → Brain: "Turn on AC?" |
| 4 | `identify-guest` | PIR event | Camera snap, LCD: "(O_O)" | motionCount ≥2 in 30s → Brain does vision-LLM |

**Detailed: `identify-guest` flow:**
```
[PIR fires]
  L1 (immediate): camera snap, LCD "(O_O) someone?", increment motionCount
  
  Escalation check: motionCount >= 2 in 30s?
    NO → done (L1 only, shadow passed)
    YES → escalate:
  
  L2 (Brain receives xentient/skill_escalated):
    → Hermes captures frame via xentient_capture_frame
    → Hermes sends to vision-LLM: "Who is this?"
    → Hermes checks Mem0: known faces
    → Hermes calls xentient_play_audio(TTS: "Hi Tatay!")
    → Hermes calls xentient_set_lcd("(^_^) Hi Tatay!", "David studying")
```

### 9.2 Security Mode — Pure Layer 1 (No Brain)

| # | Core Skill | Trigger | L1 Actions Only |
|---|-----------|---------|-----------------|
| 1 | `motion-logger` | PIR event | Camera snap → save to disk, LCD: timestamp |
| 2 | `temp-alarm` | sensor temp>40°C | Chime: alert, LCD: "TEMP WARNING", MQTT: relay off |
| 3 | `heartbeat-alive` | interval 60s | LCD: clock, MQTT: status publish |

Proves the system works **without any Brain**. Pure deterministic Core Skills.

### 9.3 Multi-Node: study-desk + living-room

```
[14:30 — PIR fires on node-02 (study-desk)]
  study-desk Core Skill "identify-guest" fires (L1)
  Escalates to Brain with camera frame

[Brain (Hermes) receives escalation]
  → Identifies visitor as Tatay (memory)
  → Calls xentient_read_sensors(space: "living-room")  // cross-space query
  → Living room is empty
  → Calls xentient_set_lcd(space: "living-room", "Tatay is here!", "In study room")
  → Calls xentient_play_audio(space: "study-desk", "Tatay just arrived")
  
Brain orchestrates BOTH Spaces from a single escalation.
```

---

## 10. Relationship to Existing Specs

| Spec | Relationship |
|------|-------------|
| `SPEC-heartbeat-rule-engine.md` | Rules → become the trigger+condition mechanism inside Core Skills. RuleEngine → becomes SkillExecutor. |
| `VISION.md` | Integration tiers (basic/hermes/archon) → map to Brain Interface types. Brain Router → routes escalations to correct Brain. |
| `SPACES.md` | SpaceMode = hardware state. This spec adds Mode = behavioral profile within active SpaceMode. |
| `PACKS.md` | Packs now include `skills.json` (Core Skill definitions) and `modes` in manifest. |
| `ARCHITECTURE-REFINEMENT-core-as-mcp.md` | Core as thin MCP shell confirmed. Core Skills are what the shell executes. Brain Skills are what the connected agent executes. |

---

## 11. Implementation Priority

| Phase | What | Depends On |
|-------|------|-----------|
| **A** | `CoreSkill` + `Mode` types in `shared/types.ts` | Heartbeat spec Phase 2 done |
| **B** | SkillExecutor (extends RuleEngine with L1 actions + collection) | A |
| **C** | Escalation pipeline (`xentient/skill_escalated` notification) | B |
| **D** | Conflict resolver + `_determine-skill` builtin | B, C |
| **E** | Observability SSE events (`skill_fired`, `skill_escalated`, `skill_conflict`) | B |
| **F** | MCP skill management tools (register/update/disable/list/log) | B |
| **G** | Mode switcher (`xentient_switch_mode` + mode-aware activation) | B |
| **H** | Pack integration (`skills.json` + `modes` in manifest) | A |
| **I** | Web Dashboard skill panels (Livewire components consuming SSE) | E, F |
| **J** | Brain skill registration flow (Hermes registers Core Skills dynamically) | F |

---

## 12. Glossary

- **Core Skill (L1):** Deterministic script on heartbeat loop. No LLM. Millisecond response.
- **Brain Skill (L2):** Intelligent skill in Brain process. LLM, memory, workflows.
- **Escalation:** L1 Core Skill sends context to L2 Brain via MCP notification.
- **Mode:** Behavioral profile grouping skills. "student", "family", "developer".
- **SpaceMode:** Hardware state. sleep/listen/active/record.
- **Space:** Identity context binding Node Base to Pack + Mode + SpaceMode + integrations.
- **Conflict Group:** Set of Core Skills that might fire on the same trigger. Arbitrated by `_determine-skill`.
- **Observability Bus:** SSE event stream from Core to Web Dashboard showing all skill activity.
- **Skill Log:** Persistent ring buffer of skill executions queryable by Brain and Dashboard.

---

*Cross-references: SPEC-heartbeat-rule-engine.md, VISION.md, SPACES.md, PACKS.md, ARCHITECTURE-REFINEMENT-core-as-mcp.md, WEB_CONTROL.md*

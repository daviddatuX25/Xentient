# Xentient Skills — Unified Reference

> What a skill is across all three layers. The one place for skill developers.
> See `docs/NODE-SKILLS.md` for L0 full spec, `docs/BRAIN-INTERFACE.md` for L2 channels.

---

## What a Skill Is

A skill is the **unit of behavior in Xentient**. Regardless of layer, a skill:
- Has a unique `id` and `name`
- Has a trigger condition (when it fires)
- Has actions (what it does when it fires)
- Can be enabled or disabled
- Is logged when it fires (fire count, last fire time, state)

What differs between layers is **where it executes** and **what it can call**.

---

## L0 — Node Skills

**Where:** ESP32 Node Base firmware (FreeRTOS Mode Task)
**Who creates:** Core pushes via MQTT
**What it does:** Configures sampling, sensors, event emission frequency, local LCD state
**What it can call:** Nothing — it emits events to Core via MQTT

### Shape

```typescript
interface NodeSkill {
  id: string
  name: string
  version: string
  requires: HardwareDeclaration    // what hardware this skill needs
  sampling: SamplingProfile        // audio rate, sensor intervals, debounce
  emits: NodeEventType[]           // enum-gated event types it sends
  expectedBy: string               // CoreSkill ID that interprets its output
  modeTask: NodeTaskConfig         // onEntry, onExit, local state machine
}
```

**Key constraint:** `emits` is enum-gated. No arbitrary MQTT floods from firmware. Every event type is defined in the `NodeEventType` union.

**Key constraint:** `expectedBy` must reference an active CoreSkill. Core refuses to push a Node Skill whose paired CoreSkill is not running.

**Full spec:** See `docs/NODE-SKILLS.md`

---

## L1 — Core Skills

**Where:** Core process (harness/src/engine/SkillExecutor.ts)
**Who creates:** Pack manifests OR Brain via `xentient_register_skill` MCP tool
**What it does:** Evaluates trigger conditions on heartbeat tick, fires L1 actions, optionally escalates to Brain
**What it can call:** Core internals only — no network, no LLM, <1ms per tick

### Shape

```typescript
interface CoreSkill {
  id: string
  name: string
  enabled: boolean
  trigger: TriggerCondition          // what fires this skill
  actions: CoreAction[]              // what happens when it fires
  escalate: boolean                  // whether to notify Brain
  conflictGroup?: string             // mutual exclusion group
  modeFilter?: string[]              // only fire in these behavioral modes
  cooldownMs?: number                // minimum time between fires
  dataCollectors?: DataCollector[]   // accumulate data before firing
}

type TriggerCondition =
  | { type: 'event'; event: string }
  | { type: 'cron'; expression: string }
  | { type: 'mode'; from?: SpaceMode; to: SpaceMode }
  | { type: 'composite'; all: TriggerCondition[] }

interface CoreAction {
  type: 'set_mode' | 'play_audio' | 'push_lcd' | 'log_event' | 'custom'
  payload: Record<string, unknown>
}

interface DataCollector {
  id: string
  source: string              // event type to collect
  windowMs: number            // time window
  resetAfterMs?: number       // auto-reset counter after this period
  aggregate: 'count' | 'sum' | 'max' | 'min' | 'last'
  threshold?: number          // fire only if aggregate meets threshold
}
```

**Key constraint:** CoreSkills are deterministic. Same inputs → same outputs. No randomness, no network calls, no LLM.

**Key constraint:** CoreSkills always run, even when Brain is offline. If `escalate: true` and no Brain is connected, the escalation is logged but not acted upon.

### Trigger Types

| Type | Description | Example |
|------|-------------|---------|
| `event` | Fire when a named event is emitted | `motion` from PIR |
| `cron` | Fire on schedule | Every hour at :00 |
| `mode` | Fire on mode transition | sleep → listen |
| `composite` | Fire when ALL sub-triggers are met | motion AND env.temp > 30 |

### Action Types

| Type | Description | Example |
|------|-------------|---------|
| `set_mode` | Change SpaceMode | listen → active |
| `play_audio` | Queue audio for playback | Alert chime |
| `push_lcd` | Update LCD display | Show temperature |
| `log_event` | Emit custom event to SSE | skill_fired, skill_conflict |
| `custom` | Extension point for future actions | — |

### Escalation

When a CoreSkill has `escalate: true` and its trigger fires:

1. SkillExecutor packages an `EscalationPayload` with `escalation_id`, skill context, sensor snapshot, and optional audio.
2. The payload is sent to all connected MCP clients via `xentient/skill_escalated` notification.
3. Any connected Brain can pick it up and respond via Channel 3 tool calls.

---

## L2 — Brain Skills

**Where:** Brain process (any MCP client — Hermes, custom script, etc.)
**Who creates:** Brain process itself via `xentient_register_skill` MCP tool
**What it does:** LLM-powered reasoning, multi-step workflows, memory recall, tool use
**What it can call:** Any `xentient_*` MCP tool + external APIs

### Shape

Brain Skills are registered via MCP with the same `CoreSkill` interface (they appear in `xentient_list_skills`), but they differ in execution:

- **Registration:** Brain calls `xentient_register_skill` with trigger conditions. Core watches for the trigger and notifies the Brain.
- **Execution:** When the trigger fires, Core sends an escalation. The Brain decides what to do — it may call LLMs, check memory, use external APIs, and then call Core tools to act.
- **Persistence:** Brain-registered skills persist across Core restarts (saved to `var/skills.json`).

### How Brain Skills Register

```typescript
// Brain calls this MCP tool to register a skill
await client.callTool("xentient_register_skill", {
  skill: {
    id: "voice-responder",
    name: "Voice Responder",
    trigger: { type: "event", event: "vad_triggered" },
    actions: [],  // Brain handles actions itself, not Core
    escalate: true,
    modeFilter: ["listen", "active"]
  }
});
```

### How Brain Skills Respond

```typescript
// Brain receives escalation notification
client.onNotification("xentient/skill_escalated", async (payload) => {
  // Brain decides what to do based on the escalation context
  const result = await myLLMOrMemoryOrWhatever(payload);

  // Brain calls Core tools to act
  await client.callTool("xentient_play_audio", { audio_base64: result.audio });
  await client.callTool("xentient_brain_stream", {
    escalation_id: payload.escalation_id,
    subtype: "escalation_complete",
    payload: {}
  });
});
```

---

## The Skill Lifecycle

### 1. Created

- **L0:** Core creates a NodeSkill config and pushes it to the Node Base.
- **L1:** Pack manifest declares it, or Brain registers it via MCP.
- **L2:** Brain registers it via `xentient_register_skill`.

### 2. Registered

- Core stores the skill in `SkillExecutor.activeSkills`.
- It appears in `xentient_list_skills` output.
- Brain-registered skills are persisted to `var/skills.json`.

### 3. Fired

- L1 triggers evaluate on every heartbeat tick.
- When a trigger matches, actions fire immediately (L1) or an escalation is sent (L2).
- Every fire is logged: `skill_fired` SSE event with skill ID, trigger, actions, timestamp.
- Fire count and last-fire-time are updated in the skill's state.

### 4. Logged

- `xentient_get_skill_log` returns the fire history for any skill.
- Logs include trigger conditions that matched, actions taken, escalation payloads.

### 5. Improved

The self-optimization loop:

```
Core runs skills → emits skill_fired events
Brain reads xentient_get_skill_log
Brain detects patterns (too many false positives, wrong cooldown timing)
Brain calls xentient_update_skill with better parameters
Core runs updated skills
→ System gets smarter without developer intervention
```

This is what Hermes's `skill-improver` meta-skill does. Xentient is the platform that enables it.

---

## Cross-Layer Reference

| Concern | L0 Node Skill | L1 Core Skill | L2 Brain Skill |
|---------|--------------|---------------|----------------|
| **Where** | ESP32 firmware | Core process | Brain process |
| **Created by** | Core push | Pack manifest or Brain MCP | Brain MCP |
| **Trigger** | Sensor events, timers | Event/cron/mode/composite | Escalation from Core |
| **Actions** | Change sampling, emit events | Set mode, play audio, push LCD | Any xentient_* tool + external APIs |
| **Can call network** | No | No | Yes |
| **Can call LLM** | No | No | Yes |
| **Latency** | <1ms (firmware) | <1ms (Core tick) | Variable (LLM) |
| **Runs without Brain** | Yes | Yes | No |
| **Paired with** | A CoreSkill (`expectedBy`) | May pair with Node Skill | May pair with CoreSkill escalation |
| **Persistence** | MQTT push per mode change | Pack manifest or var/skills.json | var/skills.json |
| **Failure mode** | Fallback to default config | Log error, continue | Escalation logged, no action |
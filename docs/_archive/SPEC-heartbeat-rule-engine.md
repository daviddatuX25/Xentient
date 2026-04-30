# Xentient Heartbeat & Rule Engine Specification

> **Status:** DRAFT — For senior developer review and decision
> **Date:** 2026-04-25
> **Author:** sarmi + Claude
> **Replaces:** ad-hoc "heartbeat" discussions from sessions 2026-04-24/25
> **Related:** `docs/ARCHITECTURE-REFINEMENT-core-as-mcp.md`, bead `Xentient-7lm`

---

## 0. Problem Statement

The current system has a **gap**: every event that reaches the Brain requires LLM inference. This is:
- **Token-wasteful** — a 7:00 AM Saturday alarm doesn't need GPT to say "good morning"
- **Latency-adding** — every action waits for an LLM round-trip
- **Single-brained** — brain-basic is the only brain, and it only reacts to voice

The real architecture needs **two execution paths**:
1. **FAST path** — deterministic rules evaluated by Core every tick, no LLM involved
2. **SLOW path** — contextual reasoning delegated to the Brain via MCP

This spec defines: what the Core heartbeat loop evaluates, how rules are defined, how the Brain registers rules, and what happens when no Brain is connected.

---

## 1. Current State (What Exists Now)

### 1.1 Core (`src/core.ts` + `src/mcp/`)

The Core is a Node.js process that:
- Owns MQTT client, AudioServer (WS), CameraServer (WS), ModeManager, ControlServer (HTTP+SSE)
- Exposes an **MCP server** over `stdio` with 7 tools:
  - `xentient_read_sensors` — returns cached sensor data
  - `xentient_read_mode` — returns current mode
  - `xentient_set_mode` — transitions mode state machine
  - `xentient_play_audio` — plays PCM audio on speaker
  - `xentient_set_lcd` — writes 2 lines to LCD
  - `xentient_capture_frame` — returns latest JPEG from camera
  - `xentient_mqtt_publish` — publishes arbitrary MQTT payload
- Pushes **MCP notifications** to connected Brain:
  - `xentient/motion_detected` — PIR trigger
  - `xentient/voice_start` — VAD open
  - `xentient/voice_end` — VAD close (with audio buffer)
  - `xentient/mode_changed` — mode transition
  - `xentient/sensor_update` — BME280 periodic data
- **Has NO heartbeat, NO rule engine, NO scheduling, NO connection health monitoring**

### 1.2 brain-basic (`src/brain-basic.ts` + `src/brain-basic/Pipeline.ts`)

The brain-basic is a separate Node.js process that:
- Spawns Core as a child process via `StdioClientTransport`
- Connects as an MCP **client**
- Reacts to notifications:
  - `motion_detected` → set mode to `listen`
  - `voice_start` → set mode to `active`
  - `voice_end` → run STT→LLM→TTS pipeline, then return to `listen`
- Owns providers: OpenAI (LLM), Deepgram/Whisper (STT), ElevenLabs (TTS)
- Has supervised restart loop (max 5 restarts with backoff)

### 1.3 Mode State Machine

```
sleep ──PIR/web──→ listen ──VAD open──→ active
  ↑                  │                     │
  │     idle(60s)    │    idle(5min)      │
  └──────────────────┘←───────────────────┘
  │                  │                     │
  │               record←──────────────────┘
```

Valid transitions defined in `contracts.ts` `MODE_TRANSITIONS`. Enforced by `ModeManager.ts`.

### 1.4 Transport

- **Current**: stdio only — brain-basic spawns Core as a child process
- **Needed**: SSE transport for remote Brain (Hermes) — not yet implemented

### 1.5 Known Bugs (from VALIDATION-2026-04-25.md)

| # | Priority | Issue |
|---|----------|-------|
| 2 | P0 | PIR interrupt not wired in firmware — `sleep→listen` broken |
| 1 | P1 | Dead `xentient/sensors/vad` MQTT subscription |
| 5 | P1 | Audio send path missing `0xA0` prefix byte |
| 6 | P1 | CameraServer port naming confusion in docs |
| 3 | P2 | LCD face text drift |
| 4 | P2 | Timestamp comment wrong |

---

## 2. Proposed Architecture

### 2.1 Three-Layer Model

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: BRAIN (Hermes Agent)                                   │
│                                                                   │
│  - Persistent memory (Honcho/Mem0)                               │
│  - Skill registry (greet-visitor, environment-check, etc.)       │
│  - LLM reasoning (only when slow path triggers)                  │
│  - Registers rules with Core via MCP                             │
│  - Scheduled automations (cron)                                  │
│  - Subagent delegation                                            │
│                                                                   │
│  Connects via: MCP client (SSE transport for remote,             │
│                stdio for local/embedded)                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP (tools + notifications)
┌───────────────────────────────┴─────────────────────────────────┐
│ LAYER 2: CORE (thin MCP shell + rule engine)                     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ HEARTBEAT LOOP (every 1-5 seconds)                         │ │
│  │                                                             │ │
│  │  For each rule in RuleStore:                                │ │
│  │    Evaluate trigger condition                               │ │
│  │    If match:                                                │ │
│  │      FAST path → execute action directly (no LLM)          │ │
│  │      SLOW path → send MCP notification to Brain             │ │
│  │                                                             │ │
│  │  Connection health:                                         │ │
│  │    Track lastBrainActivityAt                                │ │
│  │    If no activity > threshold → mark Brain disconnected     │ │
│  │    On disconnect → activate failover (brain-basic or idle)  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  - MCP Server (7 tools + 5 notifications)                        │
│  - MQTT bridge (ESP32 ↔ Harness)                                 │
│  - AudioServer (WS binary, 0xA0/0xCA prefix)                    │
│  - CameraServer (WS binary relay to dashboard)                  │
│  - ModeManager (state machine)                                   │
│  - ControlServer (HTTP API + SSE + static files)                │
│  - SensorCache (latest readings)                                 │
│  - RuleStore (static config + dynamic MCP registration)          │
│  - HealthMonitor (Brain connection state)                        │
└─────────────────────────────────────────────────────────────────┘
                                │ MQTT + WS
┌───────────────────────────────┴─────────────────────────────────┐
│ LAYER 1: HARDWARE (ESP32 + sensors + actuators)                  │
│                                                                   │
│  - ESP32-CAM (Node Base) + peripherals                           │
│  - INMP441 mic (I2S)                                             │
│  - MAX98357A speaker (I2S)                                       │
│  - BME280 (I2C: temp/humidity/pressure)                          │
│  - PIR (GPIO13 interrupt)                                        │
│  - LCD (I2C: 0x27)                                               │
│  - ESP32-CAM module (UART2 → JPEG frames)                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 What "Brain" Means (Clarified)

| Concept | What it is | Runs where | LLM needed? |
|---------|-----------|-------------|-------------|
| **brain-basic** | Voice pipeline: STT→LLM→TTS | Node.js, spawned as child | Yes, every utterance |
| **brain-hermes** | Situational agent: reason, schedule, memory, tools | Python, separate process (remote OK) | Yes, but only on SLOW path |
| **fallback mode** | Core operates without any Brain | Core itself | No — rules only |

**brain-basic is NOT removed.** It becomes the **voice skill** within Hermes, or the **standalone fallback** when Hermes is disconnected.

### 2.3 What "Heartbeat" Means (Clarified)

There are **three** distinct concepts that have been conflated:

| # | Concept | Owner | Purpose | Mechanism |
|---|---------|-------|---------|-----------|
| 1 | **Rule evaluation loop** | Core | Evaluate deterministic rules every tick without LLM | `setInterval` in Core, checks RuleStore |
| 2 | **Connection health** | Core | Detect Brain disconnection for failover | Track `lastBrainActivityAt`, no MCP request > Ns = disconnected |
| 3 | **Agent responsiveness** | Brain | Prove agent is processing, not hung | Brain periodically calls `xentient_read_sensors` or similar — implicit in natural tool calls |

**When we say "heartbeat in the Core," we mean #1 (rule evaluation loop) + #2 (connection health).** These are NOT the same as #3, which is implicit and optional.

---

## 3. Rule Engine Specification

### 3.1 Rule Schema

```typescript
interface Rule {
  id: string;                          // unique identifier, e.g. "morning-reminder"
  enabled: boolean;                    // can be toggled without deletion
  trigger: Trigger;                    // what activates the rule
  condition?: Condition[];             // additional conditions (ALL must be true)
  action: RuleAction;                  // what to do when triggered
  priority: number;                    // lower = higher priority (0 = highest)
  source: "static" | "dynamic";        // from config file or MCP registration
  lastFiredAt?: number;                // timestamp of last firing
  cooldownMs?: number;                 // minimum ms between fires
}

type Trigger =
  | { type: "cron"; schedule: string }          // cron expression, e.g. "0 7 * * 6"
  | { type: "interval"; everyMs: number }       // periodic, e.g. every 30000
  | { type: "mode"; from: Mode; to: Mode }      // on mode transition
  | { type: "sensor"; sensor: SensorKey; operator: ">" | "<" | "==" | ">=" | "<="; value: number }
  | { type: "event"; event: string }             // MCP notification name, e.g. "motion_detected"
  | { type: "composite"; all: Trigger[] }        // ALL triggers must match

type SensorKey = "temperature" | "humidity" | "pressure" | "motion";

interface Condition {
  field: "mode" | SensorKey | "time" | "dayOfWeek" | "lastMotionAgoMs";
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in";
  value: string | number | string[];
}

type RuleAction =
  | { type: "set_mode"; mode: Mode }                                    // FAST: direct mode change
  | { type: "set_lcd"; line1: string; line2: string }                  // FAST: LCD update
  | { type: "play_chime"; preset: "morning" | "alert" | "chime" }     // FAST: play preset sound
  | { type: "mqtt_publish"; topic: string; payload: object }            // FAST: raw MQTT command
  | { type: "notify"; event: string; context?: Record<string, unknown> } // SLOW: escalate to Brain
  | { type: "chain"; actions: RuleAction[] }                            // multiple actions in sequence
```

### 3.2 Rule Examples

```typescript
// Example 1: Saturday 7AM morning reminder (student mode)
const saturdayMorning: Rule = {
  id: "saturday-morning-reminder",
  enabled: true,
  trigger: { type: "cron", schedule: "0 7 * * 6" },  // 7:00 every Saturday
  condition: [
    { field: "mode", operator: "==", value: "student" }
  ],
  action: { type: "notify", event: "morning_reminder", context: { day: "saturday" } },
  priority: 10,
  source: "dynamic",  // Brain registered this
  cooldownMs: 3600000, // don't re-fire for 1 hour
};

// Example 2: Temperature warning (FAST path, no LLM)
const tempWarning: Rule = {
  id: "high-temp-warning",
  enabled: true,
  trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
  action: { type: "set_lcd", line1: "(T_T)", line2: "Its hot!" },
  priority: 5,
  source: "static",
  cooldownMs: 300000,  // 5 min cooldown
};

// Example 3: Motion wake from sleep (already exists in ModeManager, but as a rule)
const pirWake: Rule = {
  id: "pir-wake",
  enabled: true,
  trigger: { type: "event", event: "motion_detected" },
  condition: [
    { field: "mode", operator: "==", value: "sleep" }
  ],
  action: { type: "set_mode", mode: "listen" },
  priority: 0,  // highest priority
  source: "static",
  cooldownMs: 0,
};

// Example 4: 5 minutes before class, student still at computer (SLOW path)
const classWarning: Rule = {
  id: "class-warning-5min",
  enabled: true,
  trigger: { type: "cron", schedule: "* 7-17 * * 1-5" },  // school hours weekdays
  condition: [
    { field: "mode", operator: "==", value: "student" },
    // "time_before_class" would need a schedule data source — Brain provides this
  ],
  action: { type: "notify", event: "class_warning", context: { minutesBefore: 5 } },
  priority: 15,
  source: "dynamic",
  cooldownMs: 300000,
};

// Example 5: Ambient sensor check every 30 minutes (brain-initiated, from Hermes docs)
const envCheck: Rule = {
  id: "environment-check-30min",
  enabled: true,
  trigger: { type: "interval", everyMs: 1800000 },  // 30 minutes
  action: { type: "notify", event: "environment_check" },
  priority: 20,
  source: "dynamic",
  cooldownMs: 0,
};
```

### 3.3 Rule Evaluation Loop

```typescript
class RuleEngine {
  private rules: Rule[] = [];
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private sensorCache: SensorCache,
    private modeManager: ModeManager,
    private mcpServer: McpServer,
    private tickMs: number = 5000,  // default: evaluate every 5 seconds
  ) {}

  start(): void {
    this.intervalHandle = setInterval(() => this.tick(), this.tickMs);
  }

  private tick(): void {
    const now = Date.now();
    const ctx = this.buildContext(now);

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.cooldownMs && rule.lastFiredAt && (now - rule.lastFiredAt < rule.cooldownMs)) continue;

      if (this.evaluateTrigger(rule.trigger, ctx) && this.evaluateConditions(rule.condition ?? [], ctx)) {
        this.executeAction(rule, ctx);
        rule.lastFiredAt = now;
      }
    }
  }

  private buildContext(now: number): RuleContext {
    return {
      mode: this.modeManager.getMode(),
      temperature: this.sensorCache.temperature,
      humidity: this.sensorCache.humidity,
      pressure: this.sensorCache.pressure,
      motion: this.sensorCache.motion,
      lastMotionAgoMs: this.sensorCache.lastMotionAt ? now - this.sensorCache.lastMotionAt : null,
      time: now,
      dayOfWeek: new Date(now).getDay(),
      hour: new Date(now).getHours(),
      minute: new Date(now).getMinutes(),
    };
  }
}
```

### 3.4 FAST vs SLOW Path Decision

| Action type | Path | LLM needed? | Latency | Example |
|-------------|------|-------------|---------|---------|
| `set_mode` | FAST | No | <1ms | PIR wakes from sleep |
| `set_lcd` | FAST | No | <1ms | "It's hot!" warning |
| `play_chime` | FAST | No | <1ms | Morning alarm sound |
| `mqtt_publish` | FAST | No | <1ms | Turn on AC relay |
| `notify` | SLOW | Yes | 1-5s | "Someone walked in, greet them" |
| `chain` (mixed) | Depends | Per-action | Varies | LCD update (fast) + notify (slow) |

**Key principle: If the action can be determined without understanding context or generating language, it's FAST. If it needs judgment, memory, or language generation, it's SLOW.**

---

## 4. MCP Interface Changes

### 4.1 New MCP Tool: `xentient_register_rule`

```typescript
server.tool(
  "xentient_register_rule",
  "Register a deterministic rule in the Core rule engine. " +
  "Rules are evaluated every tick without LLM inference. " +
  "FAST actions execute immediately. SLOW actions send notifications to the Brain.",
  {
    id: z.string().describe("Unique rule identifier"),
    enabled: z.boolean().default(true),
    trigger: z.discriminatedUnion("type", [
      z.object({ type: z.literal("cron"), schedule: z.string() }),
      z.object({ type: z.literal("interval"), everyMs: z.number() }),
      z.object({ type: z.literal("mode"), from: z.enum(MODE_VALUES), to: z.enum(MODE_VALUES) }),
      z.object({ type: z.literal("sensor"), sensor: z.enum(["temperature","humidity","pressure","motion"]),
                 operator: z.enum([">","<","==",">=","<="]), value: z.number() }),
      z.object({ type: z.literal("event"), event: z.string() }),
      z.object({ type: z.literal("composite"), all: z.array(z.any()) }),  // recursive
    ]),
    condition: z.array(z.object({
      field: z.string(),
      operator: z.enum(["==","!=",">","<",">=","<=","in"]),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
    })).optional(),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("set_mode"), mode: z.enum(MODE_VALUES) }),
      z.object({ type: z.literal("set_lcd"), line1: z.string(), line2: z.string() }),
      z.object({ type: z.literal("play_chime"), preset: z.enum(["morning","alert","chime"]) }),
      z.object({ type: z.literal("mqtt_publish"), topic: z.string(), payload: z.record(z.unknown()) }),
      z.object({ type: z.literal("notify"), event: z.string(), context: z.record(z.unknown()).optional() }),
      z.object({ type: z.literal("chain"), actions: z.array(z.any()) }),  // recursive
    ]),
    priority: z.number().default(10),
    cooldownMs: z.number().default(0),
  },
  async (params) => { /* register in RuleStore */ }
);
```

### 4.2 New MCP Tool: `xentient_unregister_rule`

```typescript
server.tool(
  "xentient_unregister_rule",
  "Remove a rule from the Core rule engine",
  { id: z.string() },
  async ({ id }) => { /* remove from RuleStore */ }
);
```

### 4.3 New MCP Tool: `xentient_list_rules`

```typescript
server.tool(
  "xentient_list_rules",
  "List all registered rules and their current state",
  {},
  async () => { /* return RuleStore contents */ }
);
```

### 4.4 New MCP Notification: `xentient/rule_triggered`

When a rule with `action.type === "notify"` fires, Core sends:

```json
{
  "method": "xentient/rule_triggered",
  "params": {
    "ruleId": "saturday-morning-reminder",
    "event": "morning_reminder",
    "context": { "day": "saturday", "temperature": 28.5 },
    "timestamp": 1745476800000
  }
}
```

### 4.5 New MCP Notification: `xentient/brain_connected` / `xentient/brain_disconnected`

For dashboard awareness:

```json
{ "method": "xentient/brain_connected", "params": { "brainType": "hermes", "version": "1.0.0" } }
{ "method": "xentient/brain_disconnected", "params": { "reason": "timeout" } }
```

---

## 5. Connection Health & Failover

### 5.1 Health Monitor

```typescript
interface BrainHealth {
  connected: boolean;
  brainType: "basic" | "hermes" | null;  // null = no brain connected
  lastActivityAt: number;                 // timestamp of last MCP request/notification
  reconnectCount: number;
}
```

The Core tracks `lastActivityAt` — every time the Brain makes any MCP tool call, this timestamp updates. No explicit heartbeat tool needed; **natural tool calls are the heartbeat.**

### 5.2 Failover Logic

```
IF no MCP request from Brain for > 60 seconds:
  → Log warning: "Brain unresponsive"
  → Broadcast SSE: { type: "brain_status", status: "unresponsive" }

IF no MCP request for > 120 seconds:
  → Mark Brain as disconnected
  → Broadcast SSE: { type: "brain_status", status: "disconnected" }
  → Activate failover mode:
      Option A: Attempt to spawn brain-basic as child process (local fallback)
      Option B: Continue in rule-only mode (Core rules still execute)
      Option C: Set mode to "sleep" (safe idle)

ON Brain reconnection:
  → Reset timers
  → Broadcast SSE: { type: "brain_status", status: "connected" }
  → Resume SLOW-path rule processing
```

**Decision needed: which failover option?** Recommendation is Option B (rule-only mode) with Option C (sleep) as a configurable timeout after extended disconnection.

---

## 6. SSE Transport Addition

### 6.1 Why

Current transport is stdio-only. This means the Brain MUST be a child process of Core. Hermes runs as a separate Python process, potentially on a different machine. The Core needs to accept remote MCP connections.

### 6.2 How

The MCP SDK provides `SSEServerTransport`. Add to `server.ts`:

```typescript
// Existing: stdio transport (for brain-basic child process)
if (process.env.MCP_TRANSPORT !== "sse") {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// New: SSE transport (for remote Brain like Hermes)
if (process.env.MCP_TRANSPORT === "sse" || process.env.MCP_DUAL === "true") {
  const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
  const express = await import("express");
  const app = express();
  const sseTransport = new SSEServerTransport("/mcp", app);
  await server.connect(sseTransport);
  app.listen(process.env.MCP_PORT ?? 3001);
}
```

**Decision needed: dual transport (stdio + SSE simultaneously) or exclusive mode?** Recommendation: dual mode for flexibility.

---

## 7. File Structure (Proposed)

```
harness/src/
├── core.ts                          # EXISTING — add RuleEngine + HealthMonitor init
├── index.ts                         # EXISTING — entry point
├── engine/
│   ├── ModeManager.ts               # EXISTING — no changes
│   ├── Pipeline.ts                  # EXISTING — no changes
│   ├── RuleEngine.ts                # NEW — heartbeat loop + rule evaluation
│   └── HealthMonitor.ts             # NEW — Brain connection tracking + failover
├── brain-basic/
│   └── Pipeline.ts                  # EXISTING — no changes
├── brain-basic.ts                   # EXISTING — no changes (fallback brain)
├── mcp/
│   ├── server.ts                    # EXISTING — add SSE transport option
│   ├── tools.ts                     # EXISTING — add register/unregister/list_rules
│   ├── events.ts                    # EXISTING — add rule_triggered notification
│   └── types.ts                     # EXISTING — no changes
├── comms/
│   ├── MqttClient.ts                # EXISTING — no changes
│   ├── AudioServer.ts               # EXISTING — no changes
│   ├── CameraServer.ts              # EXISTING — no changes
│   └── ControlServer.ts             # EXISTING — add brain_status SSE events
├── shared/
│   ├── contracts.ts                 # EXISTING — add MCP_EVENTS for new notifications
│   ├── contracts-schemas.ts         # EXISTING — add Zod schemas for rules
│   ├── contracts-verify.ts          # EXISTING — add validation for rule payloads
│   └── types.ts                     # EXISTING — add RuleStore, Rule, BrainHealth types
└── config/
    └── default.json                 # EXISTING — add rules section
```

---

## 8. Implementation Priority

### Phase 1: Foundation (demo-blocking)

| # | Task | Depends on | Priority |
|---|------|-----------|----------|
| 1 | Fix PIR interrupt in firmware | None | P0 |
| 2 | Fix audio 0xA0 prefix | None | P1 |
| 3 | Fix dead vad subscription | None | P1 |
| 4 | Hardware assembly | PIR fix | P1 |

### Phase 2: Rule Engine Core

| # | Task | Depends on | Priority |
|---|------|-----------|----------|
| 5 | Implement `RuleEngine.ts` | None | P2 |
| 6 | Add static rules in `default.json` | #5 | P2 |
| 7 | Wire RuleEngine into `core.ts` | #5 | P2 |
| 8 | Add `xentient_register_rule` MCP tool | #5 | P2 |
| 9 | Add `xentient_list_rules` + `xentient_unregister_rule` | #5 | P2 |
| 10 | Add `xentient/rule_triggered` notification | #5, #7 | P2 |
| 11 | Unit tests for rule evaluation | #5 | P2 |

### Phase 3: Health & Transport

| # | Task | Depends on | Priority |
|---|------|-----------|----------|
| 12 | Implement `HealthMonitor.ts` | None | P2 |
| 13 | Wire HealthMonitor into `core.ts` | #12 | P2 |
| 14 | Add SSE transport option to `server.ts` | None | P2 |
| 15 | Add `xentient/brain_connected` / `brain_disconnected` events | #12, #14 | P2 |
| 16 | Add brain_status to ControlServer SSE | #12 | P2 |

### Phase 4: Hermes Integration

| # | Task | Depends on | Priority |
|---|------|-----------|----------|
| 17 | Create `brain-hermes.ts` entry point | #14 | P3 |
| 18 | Implement SkillRegistry | #17 | P3 |
| 19 | Implement ContextBuilder (calls MCP tools) | #17 | P3 |
| 20 | Register default skills (greet-visitor, env-check, etc.) | #18, #19 | P3 |
| 21 | End-to-end test: Hermes → Core → ESP32 | #17-#20 | P3 |

---

## 9. Decision Points for Senior Developer

| # | Question | Options | Recommendation |
|---|----------|---------|---------------|
| D1 | **Should the rule engine tick interval be configurable?** | A) Fixed 5s, B) Configurable per-rule, C) Configurable globally | **B** — different rules need different evaluation frequencies |
| D2 | **Should static rules live in `default.json` or a separate `rules.json`?** | A) `default.json`, B) Separate `rules.json`, C) Both (default.json for boot, rules.json for overrides) | **C** — defaults in default.json, overrides in rules.json |
| D3 | **Failover mode when Brain disconnects?** | A) Spawn brain-basic, B) Rule-only mode, C) Sleep mode, D) Configurable | **D** — configurable, default to rule-only (B) |
| D4 | **Should SSE and stdio transports run simultaneously (dual mode)?** | A) Dual mode (both), B) Exclusive mode (one or the other), C) Stdio only + SSE optional | **A** — dual mode for maximum flexibility |
| D5 | **Should `play_chime` presets be hardcoded or loadable audio files?** | A) Hardcoded frequencies, B) WAV files in assets/, C) TTS-generated on demand | **B** — WAV files, simplest and most flexible |
| D6 | **Who owns cron scheduling — Core or Hermes?** | A) Core (via RuleEngine), B) Hermes (via node-cron/scheduler), C) Both (Core for fast rules, Hermes for complex workflows) | **C** — Core handles time-based rule triggers, Hermes handles complex scheduled workflows |
| D7 | **Should brain-basic remain a standalone process or become a library?** | A) Standalone process (spawned by Core on failover), B) Library imported by Core, C) MCP skill within Hermes | **A** — keep standalone for isolation, fall back to it when Hermes disconnects |

---

## 10. What Does NOT Change

- All wire contracts (MQTT topics, WS binary format, UART framing, protocol version)
- All hardware decisions (B1-B7, pin assignments, BOM)
- Mode state machine transitions
- Pack/Space concepts from VISION.md
- Three-tier architecture (Hardware → Core → Brain)
- brain-basic as fallback voice pipeline
- MCP tool interface (existing 7 tools unchanged)
- ControlServer HTTP/SSE API (additive only)

---

## 11. Open Questions

1. **Schedule data source**: How does Core know about class schedules? Options: (a) Brain registers cron rules with class times embedded, (b) Brain provides a schedule endpoint Core can query, (c) Core has a simple schedule store. Recommendation: (a) — Brain registers rules with times already resolved.

2. **Computer activity detection**: The "student still on computer" trigger requires a data source not currently in the system. Options: (a) MQTT message from a desktop agent, (b) Network presence detection (ping/ARP), (c) Bluetooth proximity. This is a hardware/software decision that needs scoping.

3. **Rule persistence**: When Hermes registers dynamic rules, should they persist across Core restarts? Options: (a) In-memory only (lost on restart, Hermes re-registers), (b) Persisted to disk (rules.json), (c) Database. Recommendation: (a) for now — simpler, and Hermes re-registers on connection.

4. **Rule conflict resolution**: What if two rules fire simultaneously? Current spec uses `priority` field (lower = higher priority). Is this sufficient, or do we need conflict resolution strategies?
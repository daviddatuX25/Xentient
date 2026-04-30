# Xentient — Heartbeat & Rule Engine: Implementation Plan

> **Status:** LOCKED — Ready for agent execution  
> **Date:** 2026-04-25  
> **Spec source:** `docs/SPEC-heartbeat-rule-engine.md`  
> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Each task has checkbox syntax. Phases are gates — do not start Phase N+1 until Phase N smoke test passes.

---

## Decisions Locked (§9 of Spec — All Resolved)

| # | Decision | Resolution | Rationale |
|---|----------|-----------|-----------|
| D1 | Rule tick interval | **2s default, configurable per-rule via `minIntervalMs`** | 5s misses sensor spikes; 2s is safe for <20 rules |
| D2 | Static rules location | **`config/default.json` under `"rules"` key** | Single source of truth for boot config |
| D3 | Failover mode | **Rule-only (Option B) by default; configurable via `failoverMode` in config** | Safest for demo — system still works if Hermes drops |
| D4 | Dual transport | **Yes — stdio + SSE simultaneously when `MCP_DUAL=true`** | brain-basic keeps stdio; Hermes uses SSE |
| D5 | Chime assets | **WAV files in `harness/assets/chimes/`** — generate with Node.js tone generator at plan start | Simplest, no TTS latency |
| D6 | Cron ownership | **Core owns time-based rule triggers; Hermes owns complex scheduled workflows** | Core evaluates `cron` and `interval` triggers natively via `node-cron` |
| D7 | brain-basic | **Stays standalone process, spawned by Core on failover** | Isolation — if Hermes crashes, brain-basic is unaffected |

**Rule persistence decision (Open Question §11.3):** In-memory only for demo. On Core restart, Hermes re-registers. Document as known limitation in `README.md`.

---

## Phase 0 — Pre-flight (Before Any Code)

These must be done before Phase 1 begins. They take minutes each.

- [ ] **P0-1: Generate chime WAV files**
  - Create `harness/assets/chimes/` directory
  - Run this Node.js script once to generate 3 chimes:
    ```javascript
    // scripts/generate-chimes.js
    // 440Hz morning chime (C-E-G, 200ms each), 600Hz alert (2x beep), 523Hz single chime
    // Write as 16kHz mono S16LE PCM wrapped in WAV header
    // Output: assets/chimes/morning.wav, alert.wav, chime.wav
    ```
  - Verify files play via `aplay assets/chimes/morning.wav` or equivalent

- [ ] **P0-2: Confirm MCP SDK SSE import path**
  - Run `node -e "require('@modelcontextprotocol/sdk/server/sse.js')"` in harness dir
  - If it throws: check SDK version in package.json, adjust import path in Phase 3 tasks accordingly
  - Document result as a comment in `server.ts` before Phase 3

- [ ] **P0-3: Lock `default.json` rules section**
  - Add the following to `harness/config/default.json` under a new `"rules"` key (3 static demo rules):
    ```json
    "rules": {
      "tickMs": 2000,
      "failoverMode": "rule-only",
      "static": [
        {
          "id": "pir-wake",
          "enabled": true,
          "priority": 0,
          "source": "static",
          "cooldownMs": 0,
          "trigger": { "type": "event", "event": "motion_detected" },
          "condition": [{ "field": "mode", "operator": "==", "value": "sleep" }],
          "action": { "type": "set_mode", "mode": "listen" }
        },
        {
          "id": "high-temp-warning",
          "enabled": true,
          "priority": 5,
          "source": "static",
          "cooldownMs": 300000,
          "trigger": { "type": "sensor", "sensor": "temperature", "operator": ">", "value": 35 },
          "action": {
            "type": "chain",
            "actions": [
              { "type": "set_lcd", "line1": "(T_T)", "line2": "Its hot!" },
              { "type": "play_chime", "preset": "alert" }
            ]
          }
        },
        {
          "id": "morning-chime",
          "enabled": true,
          "priority": 10,
          "source": "static",
          "cooldownMs": 3600000,
          "trigger": { "type": "cron", "schedule": "0 8 * * *" },
          "action": {
            "type": "chain",
            "actions": [
              { "type": "play_chime", "preset": "morning" },
              { "type": "set_lcd", "line1": "(^_^)/", "line2": "Good morning!" }
            ]
          }
        }
      ]
    }
    ```

---

## Phase 1 — Demo Blockers (P0/P1 Fixes)

**Gate:** Phase 2 does not start until the Phase 1 smoke test passes.  
**Smoke test:** PIR sensor triggers sleep→listen mode change. LCD updates. Console shows MCP notification `motion_detected`.

### Firmware Fixes (ESP32 — C++)

- [ ] **FW-1: Add PIR ISR to `main.cpp`**
  - File: `firmware/src/main.cpp`
  - In `setup()`, after all peripheral init:
    ```cpp
    attachInterrupt(digitalPinToInterrupt(PIN_PIR_INT), pir_isr, RISING);
    ```
  - Add ISR handler (IRAM_ATTR):
    ```cpp
    void IRAM_ATTR pir_isr() {
      // Publish sensor_data with peripheralType 0x11, payload {motion: true}
      // Use a flag + main loop publish pattern to avoid MQTT calls in ISR
      pirTriggered = true;
    }
    ```
  - In `loop()`: check `pirTriggered` flag, publish to `xentient/sensors/motion`, reset flag
  - Flash and verify: `pio run -e node_base --target upload`

- [ ] **FW-2: Fix MQTT inbound dispatch in `mqtt_callback`**
  - File: `firmware/src/main.cpp` (or wherever `mqtt_callback` lives)
  - Currently: logs hex, never parses
  - Fix: parse `xentient/control/mode` → call `ModeManager.transition()`, parse `xentient/display` → call `lcd.print()`
  - Test: Dashboard button → mode changes → LCD text updates

- [ ] **FW-3: Add I2S TX driver for speaker (I2S_NUM_1)**
  - The mic (INMP441) uses I2S_NUM_0 on GPIO26/25. Use I2S_NUM_1 for MAX98357A on available GPIOs.
  - Preferred GPIO assignment for TX: BCLK=GPIO33, LRCK=GPIO32, DIN=GPIO27 (verify no conflicts with existing pin map)
  - Install I2S TX driver in `setup()` on I2S_NUM_1
  - Add WebSocket binary consumer: when `xentient/audio/out` binary arrives (0xA0 prefix), strip prefix, write PCM to I2S TX

- [ ] **FW-4: Strip 0xA0 prefix on ESP32 receive side**
  - Pairs with HW-2 (harness sends prefix). ESP32 WS receive handler must strip first byte before writing to I2S TX.

### Harness Fixes (TypeScript)

- [ ] **HW-1: Remove dead MQTT subscription**
  - File: `src/comms/MqttClient.ts`
  - Remove: `mqtt.subscribe("xentient/sensors/vad")` and its handler
  - This topic was never published by firmware; the subscription just added noise

- [ ] **HW-2: Add 0xA0 prefix to `sendAudio()`**
  - File: `src/comms/AudioServer.ts`
  - Find `sendAudio(buffer: Buffer)` method
  - Change: `ws.send(buffer)` → `ws.send(Buffer.concat([Buffer.from([0xA0]), buffer]))`
  - Existing tests cover prefix — run `vitest run` to confirm they pass after change

- [ ] **HW-3: Fix LCD face text drift**
  - File: `src/shared/contracts.ts`
  - Update `LCD_FACES` map to match `HARDWARE.md` spec values exactly

### Phase 1 Smoke Test

```
1. Start Core: npm run dev (or ts-node src/index.ts)
2. Start brain-basic: npm run brain (in separate terminal)
3. Trigger PIR sensor physically
4. Verify in console: "mode_changed: sleep → listen" and MCP notification logged
5. Verify on dashboard: mode indicator changes
6. Speak into mic → hear response from speaker
```

**If smoke test fails on speaker:** the voice pipeline still works (STT→LLM→TTS) — just no audio out. The demo can continue with Step 6 deferred to FW-3 resolution. Do NOT block Phase 2 on FW-3.

---

## Phase 2 — Rule Engine (Core Changes)

**Gate:** Phase 3 does not start until the Phase 2 smoke test passes.  
**Smoke test:** Temperature rule fires when sensor threshold exceeded. `xentient/rule_triggered` notification appears in brain-basic console. `xentient_list_rules` MCP tool returns the 3 static rules.

### 2.1 Shared Types

- [ ] **T1: Add Rule types to `src/shared/types.ts`**
  - Add exactly the types from Spec §3.1:
    - `Rule`, `Trigger`, `SensorKey`, `Condition`, `RuleAction`, `RuleContext`
  - Also add: `BrainHealth` interface from Spec §5.1
  - Export all. Do NOT define these inline in `RuleEngine.ts` — they must be importable by tools.ts and contracts-schemas.ts

- [ ] **T2: Add Zod schemas to `src/shared/contracts-schemas.ts`**
  - Add `RuleTriggerSchema`, `RuleActionSchema`, `RuleConditionSchema`, `RuleSchema` using discriminatedUnion
  - These are used by the MCP tool handler for validation (not runtime rule evaluation)
  - Reference the TypeScript types from T1 using `z.infer<>` to keep them in sync

### 2.2 RuleEngine Module

- [ ] **T3: Create `src/engine/RuleEngine.ts`**
  - Implement class from Spec §3.3 skeleton, expanded:
    ```typescript
    export class RuleEngine {
      private rules: Rule[] = [];
      private intervalHandle: NodeJS.Timeout | null = null;
      private cronHandles: Map<string, unknown> = new Map(); // cron job handles by rule id

      constructor(
        private sensorCache: SensorCache,
        private modeManager: ModeManager,
        private onFastAction: (action: RuleAction, rule: Rule) => void,
        private onSlowAction: (rule: Rule, ctx: RuleContext) => void,
        private tickMs: number = 2000,
      ) {}

      loadStatic(rules: Rule[]): void { /* from config */ }
      register(rule: Rule): void { /* from MCP */ }
      unregister(id: string): boolean { /* from MCP */ }
      list(): Rule[] { /* for MCP tool */ }
      start(): void { /* start setInterval for non-cron rules, node-cron for cron rules */ }
      stop(): void { /* clear all intervals and cron jobs */ }

      private tick(): void { /* evaluate interval/sensor/event/mode triggers */ }
      private buildContext(now: number): RuleContext { /* from spec §3.3 */ }
      private evaluateTrigger(trigger: Trigger, ctx: RuleContext): boolean { /* per trigger type */ }
      private evaluateConditions(conditions: Condition[], ctx: RuleContext): boolean { /* all must pass */ }
      private executeAction(rule: Rule, ctx: RuleContext): void { /* route to fast or slow callback */ }
    }
    ```
  - **Cron triggers:** use `node-cron` package. Install if not present: `npm install node-cron @types/node-cron`
  - **Event triggers:** `motion_detected`, `voice_end`, `mode_changed` — these need the RuleEngine to subscribe to Core's internal event emitter (not MQTT). See T5 for wiring.
  - **Cooldown:** check `rule.cooldownMs && rule.lastFiredAt && (now - rule.lastFiredAt < rule.cooldownMs)` before firing
  - **Priority:** sort `this.rules` by `priority` ascending on load and on each register

- [ ] **T4: Unit tests for RuleEngine (`src/engine/RuleEngine.test.ts`)**
  - Test: sensor trigger fires when threshold exceeded
  - Test: sensor trigger does NOT fire when cooldown active
  - Test: cron trigger fires at correct time (mock Date)
  - Test: condition blocks rule from firing when condition false
  - Test: `chain` action calls both sub-actions
  - Test: `notify` action calls `onSlowAction` callback, `set_mode` calls `onFastAction`
  - Test: `register` + `list` + `unregister` round-trip
  - Target: 10+ tests, all pass before wiring into Core

### 2.3 Wire into Core

- [ ] **T5: Wire RuleEngine into `src/core.ts`**
  - Import `RuleEngine` and construct after existing module init:
    ```typescript
    const ruleEngine = new RuleEngine(
      sensorCache,
      modeManager,
      (action, rule) => executeFastAction(action, rule),  // implement below
      (rule, ctx) => sendRuleTriggeredNotification(rule, ctx),  // implement below
      config.rules?.tickMs ?? 2000,
    );
    ruleEngine.loadStatic(config.rules?.static ?? []);
    ruleEngine.start();
    ```
  - Implement `executeFastAction()` in core.ts:
    - `set_mode` → `modeManager.transition(action.mode)`
    - `set_lcd` → `mqttClient.publish("xentient/display", { line1, line2 })`
    - `play_chime` → load WAV from `assets/chimes/{preset}.wav`, call `audioServer.sendAudio(buffer)`
    - `mqtt_publish` → `mqttClient.publish(action.topic, action.payload)`
    - `chain` → execute each sub-action in sequence
  - Implement `sendRuleTriggeredNotification()` in core.ts:
    - Calls `mcpServer.sendNotification("xentient/rule_triggered", { ruleId, event, context, timestamp })`
  - Wire event triggers: after `sensorCache` emits `motion_detected` / Core internal events, call `ruleEngine.onEvent(eventName)` — add `onEvent(eventName: string): void` method to RuleEngine that checks event-type triggers

- [ ] **T6: Add `xentient/rule_triggered` notification to `src/mcp/events.ts`**
  - Add constant: `RULE_TRIGGERED = "xentient/rule_triggered"`
  - Add to MCP_EVENTS enum/object in `contracts.ts`
  - This is a SLOW-path notification — Core sends it, Brain receives and decides

### 2.4 MCP Tools for Rule Management

- [ ] **T7: Add `xentient_register_rule` to `src/mcp/tools.ts`**
  - Use the exact Zod schema from Spec §4.1
  - Handler:
    ```typescript
    async (params) => {
      const rule: Rule = { ...params, source: "dynamic", lastFiredAt: undefined };
      ruleEngine.register(rule);
      return { content: [{ type: "text", text: `Rule '${params.id}' registered` }] };
    }
    ```
  - Validate: if `rule.id` already exists, return error: `{ isError: true, content: [...] }`

- [ ] **T8: Add `xentient_unregister_rule` to `src/mcp/tools.ts`**
  - Handler: `ruleEngine.unregister(id)` → return success or `isError: true` if not found

- [ ] **T9: Add `xentient_list_rules` to `src/mcp/tools.ts`**
  - Handler: `ruleEngine.list()` → return as JSON text block
  - Include `lastFiredAt` and `enabled` in output — useful for dashboard debugging

### Phase 2 Smoke Test

```
1. Start Core with Phase 2 changes
2. In dashboard or MQTT CLI: publish a sensor reading with temperature > 35
3. Within 2s: verify LCD message appears (fast path)
4. Check brain-basic console: verify xentient/rule_triggered notification received
5. Call xentient_list_rules via MCP: verify 3 static rules returned
6. Call xentient_register_rule with a test rule, then xentient_list_rules: verify 4 rules
7. Call xentient_unregister_rule: verify 3 rules remain
8. Run vitest: all unit tests pass
```

---

## Phase 3 — Health Monitor & SSE Transport

**Gate:** Phase 4 does not start until the Phase 3 smoke test passes.  
**Smoke test:** Brain connection status visible on dashboard. Hermes can connect over SSE to Core and call `xentient_read_sensors`.

### 3.1 HealthMonitor Module

- [ ] **T10: Create `src/engine/HealthMonitor.ts`**
  ```typescript
  export class HealthMonitor {
    private health: BrainHealth = {
      connected: false,
      brainType: null,
      lastActivityAt: 0,
      reconnectCount: 0,
    };

    constructor(
      private onWarning: () => void,      // 60s no activity
      private onDisconnect: () => void,   // 120s no activity
      private onReconnect: () => void,    // brain reconnects
      private warningMs = 60_000,
      private disconnectMs = 120_000,
    ) {}

    // Call this every time Brain makes any MCP tool call
    recordActivity(brainType: "basic" | "hermes"): void { ... }

    // Call this when Brain MCP connection closes
    recordDisconnect(): void { ... }

    getHealth(): BrainHealth { return { ...this.health }; }

    start(): void { /* setInterval every 10s to check lastActivityAt */ }
    stop(): void { /* clearInterval */ }
  }
  ```
  - The `setInterval` checker: if `Date.now() - lastActivityAt > disconnectMs` and `connected`, call `onDisconnect()`; if `> warningMs`, call `onWarning()`

- [ ] **T11: Wire HealthMonitor into `src/core.ts`**
  - Construct after RuleEngine:
    ```typescript
    const healthMonitor = new HealthMonitor(
      () => controlServer.broadcastSSE({ type: "brain_status", status: "unresponsive" }),
      () => { controlServer.broadcastSSE({ type: "brain_status", status: "disconnected" }); activateFailover(); },
      () => controlServer.broadcastSSE({ type: "brain_status", status: "connected" }),
    );
    healthMonitor.start();
    ```
  - Implement `activateFailover()` in core.ts:
    - If `config.rules?.failoverMode === "rule-only"`: log "Failover: rule-only mode"
    - If `failoverMode === "sleep"`: `modeManager.transition("sleep")`
    - If `failoverMode === "spawn-basic"`: spawn brain-basic as child process (use existing spawn logic from brain-basic.ts)
  - Hook: every MCP tool call handler must call `healthMonitor.recordActivity(brainType)`
    - Add middleware approach: wrap all tool handlers in core.ts with a thin `withActivity()` wrapper

- [ ] **T12: Add brain_status events to `src/comms/ControlServer.ts`**
  - Add `broadcastSSE(payload: object): void` method that pushes to all connected SSE clients
  - Format: `data: ${JSON.stringify(payload)}\n\n`
  - Dashboard should already receive SSE stream — this is additive

- [ ] **T13: Add `xentient/brain_connected` and `xentient/brain_disconnected` to `src/mcp/events.ts`**
  - Add constants and to MCP_EVENTS
  - Emit `brain_connected` when MCP client connects (hook into server's connection event)
  - Emit `brain_disconnected` when MCP client disconnects or HealthMonitor declares timeout

### 3.2 SSE Transport

- [ ] **T14: Add SSE transport to `src/mcp/server.ts`**
  - Verify import path from P0-2 pre-flight check
  - Add alongside existing stdio setup:
    ```typescript
    if (process.env.MCP_DUAL === "true" || process.env.MCP_TRANSPORT === "sse") {
      const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
      // If using newer MCP SDK with StreamableHTTP, adjust accordingly
      const expressApp = express();
      const sseTransport = new SSEServerTransport("/mcp", expressApp);
      await server.connect(sseTransport);
      const mcpPort = parseInt(process.env.MCP_PORT ?? "3001");
      expressApp.listen(mcpPort, () => {
        pino.info({ mcpPort }, "MCP SSE transport listening");
      });
    }
    ```
  - Do NOT share the express instance with ControlServer (different ports: ControlServer=3000, MCP SSE=3001)
  - Add `MCP_PORT=3001` to `.env.example`

- [ ] **T15: Update `config/default.json` with transport config**
  ```json
  "transport": {
    "stdio": true,
    "sse": false,
    "ssePort": 3001
  }
  ```
  - Read in `server.ts` alongside env vars. Env vars take precedence.

### Phase 3 Smoke Test

```
1. Start Core with MCP_DUAL=true
2. Verify brain-basic still connects via stdio (existing behavior unchanged)
3. From a separate process or curl: connect to http://localhost:3001/mcp
4. Issue xentient_read_sensors over SSE connection → receives sensor data
5. Wait 70 seconds with no activity: dashboard shows "brain_status: unresponsive"
6. Wait 130 seconds total: dashboard shows "brain_status: disconnected"
7. Reconnect: dashboard shows "brain_status: connected"
8. Check ControlServer SSE stream (curl http://localhost:3000/api/events): brain_status events appear
```

---

## Phase 4 — Hermes Integration

**Gate:** This phase is P3 — complete only if Phases 1-3 are stable and demo is not imminent.  
**Smoke test:** Hermes connects over SSE, PIR fires, Hermes receives `motion_detected` notification, builds context (sensor + camera frame), generates a greeting via LLM, plays it via `xentient_play_audio`.

### 4.1 Entry Point

- [ ] **T16: Create `src/brain-hermes.ts` entry point**
  - Connects to Core via SSE (`MCPClient` with `SSEClientTransport` to `http://localhost:3001/mcp`)
  - On connect: call `xentient_list_rules` — log existing rules, register Hermes default rules
  - Set up notification handlers (same pattern as brain-basic's `client.setNotificationHandler`)
  - Handle: `motion_detected`, `voice_end`, `xentient/rule_triggered`, `mode_changed`
  - Route each to `SkillRegistry.dispatch(eventName, notification.params)`

### 4.2 SkillRegistry

- [ ] **T17: Create `src/brain-hermes/SkillRegistry.ts`**
  ```typescript
  type SkillHandler = (params: unknown, client: MCPClient) => Promise<void>;

  export class SkillRegistry {
    private skills: Map<string, SkillHandler> = new Map();

    register(eventName: string, handler: SkillHandler): void { ... }
    async dispatch(eventName: string, params: unknown, client: MCPClient): Promise<void> { ... }
  }
  ```
  - Skills are just async functions, not classes
  - Dispatch calls the registered handler, catches errors, logs them — never throws to caller

### 4.3 ContextBuilder

- [ ] **T18: Create `src/brain-hermes/ContextBuilder.ts`**
  ```typescript
  export class ContextBuilder {
    constructor(private client: MCPClient) {}

    async build(): Promise<HermesContext> {
      const [sensors, mode, frame] = await Promise.all([
        this.client.callTool("xentient_read_sensors", {}),
        this.client.callTool("xentient_read_mode", {}),
        this.client.callTool("xentient_capture_frame", {}),
      ]);
      return { sensors, mode, frame, timestamp: Date.now() };
    }

    async buildLite(): Promise<HermesContext> {
      // sensors + mode only — no camera frame (faster, for voice responses)
      ...
    }
  }
  ```
  - Use `Promise.all` — parallel MCP calls, don't serialize them

### 4.4 Default Skills

- [ ] **T19: Create `src/brain-hermes/skills/greet-visitor.skill.ts`**
  - Triggered by: `motion_detected` (when mode transitions to listen)
  - Flow: ContextBuilder.build() → build prompt with sensor + camera data → OpenAI → TTS → `xentient_play_audio`
  - System prompt: "You are Xentient, an embodied AI in a room. Someone just walked in. Greet them naturally and briefly based on the context below."

- [ ] **T20: Create `src/brain-hermes/skills/voice-response.skill.ts`**
  - Triggered by: `voice_end`
  - Same pipeline as brain-basic Pipeline.ts but with memory: prepend conversation history to LLM prompt
  - Store conversation turns in-memory (array, max 10 turns)

- [ ] **T21: Create `src/brain-hermes/skills/environment-check.skill.ts`**
  - Triggered by: `xentient/rule_triggered` with `event === "environment_check"`
  - Flow: ContextBuilder.buildLite() → if temp > threshold → LLM decides → LCD update or alert

- [ ] **T22: Register Hermes default rules at startup**
  - In `brain-hermes.ts`, after connect, call `xentient_register_rule` for:
    - `environment-check-30min`: interval 30 min → notify `environment_check`
    - Any user-session rules from previous Hermes memory (if memory integration is active)

### Phase 4 Smoke Test (End-to-End)

```
1. Start Core with MCP_DUAL=true
2. Start brain-hermes: ts-node src/brain-hermes.ts
3. Trigger PIR → Hermes logs "motion_detected received"
4. Hermes builds context (sensor + frame logged)
5. Hermes calls LLM → TTS → xentient_play_audio
6. Speaker plays greeting
7. Speak into mic → voice_end → Hermes voice-response skill → reply plays
8. Wait 30 min (or mock interval): environment-check rule fires → Hermes logs decision
9. Dashboard shows: brain_status: connected, brainType: hermes
```

---

## File Change Summary

| File | Change type | Phase |
|------|-------------|-------|
| `firmware/src/main.cpp` | Modify — PIR ISR, MQTT dispatch, I2S TX | 1 |
| `src/comms/MqttClient.ts` | Modify — remove dead vad subscription | 1 |
| `src/comms/AudioServer.ts` | Modify — add 0xA0 prefix | 1 |
| `src/shared/contracts.ts` | Modify — fix LCD_FACES, add MCP_EVENTS | 1, 2 |
| `src/shared/types.ts` | Modify — add Rule, BrainHealth, RuleContext types | 2 |
| `src/shared/contracts-schemas.ts` | Modify — add Zod rule schemas | 2 |
| `config/default.json` | Modify — add rules section, transport section | 0, 2, 3 |
| `src/engine/RuleEngine.ts` | **NEW** | 2 |
| `src/engine/RuleEngine.test.ts` | **NEW** | 2 |
| `src/engine/HealthMonitor.ts` | **NEW** | 3 |
| `src/mcp/tools.ts` | Modify — add 3 rule management tools | 2 |
| `src/mcp/events.ts` | Modify — add rule_triggered, brain_connected, brain_disconnected | 2, 3 |
| `src/mcp/server.ts` | Modify — add SSE transport option | 3 |
| `src/comms/ControlServer.ts` | Modify — add broadcastSSE, brain_status events | 3 |
| `src/core.ts` | Modify — wire RuleEngine + HealthMonitor, fast action executor | 2, 3 |
| `src/brain-hermes.ts` | **NEW** | 4 |
| `src/brain-hermes/SkillRegistry.ts` | **NEW** | 4 |
| `src/brain-hermes/ContextBuilder.ts` | **NEW** | 4 |
| `src/brain-hermes/skills/*.ts` | **NEW** (3 files) | 4 |
| `assets/chimes/*.wav` | **NEW** (3 files) | 0 |
| `scripts/generate-chimes.js` | **NEW** | 0 |
| `README.md` | Modify — add rule persistence known limitation | 2 |
| `.env.example` | Modify — add MCP_PORT, MCP_DUAL, MCP_TRANSPORT | 3 |

---

## Known Limitations (Document These, Don't Fix for Demo)

1. **Rule persistence:** Dynamic rules registered by Hermes are lost on Core restart. Hermes re-registers on reconnect. Future: persist to `rules.json`.
2. **Single Brain connection:** The current MCP server supports one connected Brain at a time. Multiple simultaneous connections (e.g., brain-basic + Hermes) would require multiplexed notification dispatch. Future work.
3. **I2S full-duplex:** Mic and speaker cannot operate simultaneously on I2S_NUM_0. Resolved by using I2S_NUM_1 for speaker, but this requires new pin assignment and firmware reflash.
4. **No rule conflict resolution beyond priority:** If two rules fire simultaneously at the same priority, execution order is array insertion order.
5. **Computer activity detection** (§11.2 of spec): Not implemented. The `class-warning-5min` example rule cannot function without a data source for class schedules. Deferred.

---

## Critical Path Summary

```
Phase 0 (30 min) → Phase 1 (2-4 hrs hardware + 30 min harness) → SMOKE TEST
         ↓
Phase 2 (4-6 hrs) → SMOKE TEST
         ↓
Phase 3 (2-3 hrs) → SMOKE TEST
         ↓
Phase 4 (6-8 hrs) → SMOKE TEST
```

**Minimum viable demo requires only Phase 0 + Phase 1 passing.**  
**Rule engine demo requires Phase 0 + 1 + 2.**  
**Hermes demo requires all four phases.**

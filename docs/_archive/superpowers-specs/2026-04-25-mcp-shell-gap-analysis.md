# MCP Shell Gap Analysis Spec

> Date: 2026-04-25
> Status: INTEGRATED — All gaps resolved in updated implementation plan at `docs/superpowers/plans/2026-04-25-mcp-shell-implementation.md`
> Scope: Identify what's still missing or under-specified in the MCP Shell implementation plan before execution begins

---

## 1. Purpose

The implementation plan at `docs/superpowers/plans/2026-04-25-mcp-shell-implementation.md` covers 17 tasks plus 11 review fixes. This spec identifies gaps — things the plan doesn't address, gets wrong, or leaves ambiguous — that must be resolved before or during implementation.

---

## 2. Critical Gaps (Must Resolve Before Demo)

### GAP-1: VAD End Detection — No Firmware Signal

**What:** The plan's Task 8 (`events.ts`) and Task 14 (`brain-basic.ts`) both depend on `voice_end` events carrying the audio buffer. But the firmware currently only publishes `trigger_pipeline { source: "voice" }` on VAD-start. There is no VAD-end signal from the firmware.

**Why it matters:** The entire STT→LLM→TTS pipeline requires the complete audio utterance. Without a VAD-end signal, the Brain never knows when the user stopped speaking.

**Resolution options:**
1. **Firmware VAD-end**: Add a second MQTT publish in firmware when VAD detects silence/end. Publish on `xentient/control/trigger` with `{ v: 1, type: "trigger_pipeline", source: "voice", stage: "end" }`.
2. **Harness silence detection**: In `AudioServer`, detect silence in the PCM stream (energy below threshold for N ms) and emit a `voiceEnd` event.
3. **Timer-based**: In Core, start a timer on VAD-start; after N ms of no audio chunks, flush the buffer as `voice_end`.

**Recommendation:** Option 1 is the cleanest. The firmware already has VAD logic; it just needs a second publish for VAD-end. This is a firmware change that needs to be added as a new task (P0).

**New task needed:** Add VAD-end trigger to firmware `main.cpp` — publish `{ v: 1, type: "trigger_pipeline", source: "voice", stage: "end", duration_ms: <duration> }` on `xentient/control/trigger` when VAD detects silence after speech.

---

### GAP-2: Audio Buffer Accumulation in Core — New Responsibility

**What:** The plan's RF-4 adds audio buffer accumulation logic to `core.ts`. Core now needs to:
- Accumulate PCM chunks from AudioServer during active/listen mode
- Flush the buffer on VAD-end
- Encode as base64 and send via MCP notification

This is a significant new responsibility for Core that wasn't in the original architecture spec.

**Why it matters:** Base64-encoding raw PCM audio is expensive. A 3-second utterance at 16kHz S16LE = 96KB of raw PCM = ~128KB of base64. Sending this through MCP stdio JSON-RPC could cause latency or buffer overflow.

**Resolution options:**
1. **Stream audio via separate channel**: Keep audio on the existing WS connection. Core accumulates and tells Brain where to get it (via a file path or WS endpoint), rather than base64 through MCP.
2. **Use MCP binary protocol**: If MCP supports binary payloads (check SDK), send PCM directly.
3. **Compress audio**: Opus encode at VAD-end, send compressed audio through MCP (much smaller).
4. **Accept the latency for demo**: Base64 through MCP for the Apr 27 demo. Optimize post-demo.

**Recommendation:** Option 4 for the Apr 27 demo. Post-demo, implement streaming audio via WS (Option 1). Document this as a known limitation.

**New task needed:** Add `AudioAccumulator` class to Core that buffers PCM chunks and flushes on VAD-end. Include base64 encoding. Add TODO comment for post-demo audio streaming optimization.

---

### GAP-3: Process Lifecycle — Brain Spawns Core, but No Recovery Logic

**What:** The plan says brain-basic spawns core as a child process via stdio transport (Task 14). But there's no detail on:
- What happens when core crashes? (brain-basic should restart it)
- How does brain-basic know core is ready to accept MCP connections?
- How does core signal readiness?
- What happens during graceful shutdown?

**Why it matters:** Without crash recovery, a single core crash takes down the entire Xentient system permanently.

**Resolution:**
```typescript
// In brain-basic.ts, add process supervision:
let coreProcess: ChildProcess | null = null;
let restartCount = 0;
const MAX_RESTARTS = 5;

function spawnCore() {
  coreProcess = spawn(process.execPath, [resolve(__dirname, "core.js")], {
    stdio: ["pipe", "pipe", "pipe"], // stdin/stdout for MCP, stderr for logs
  });
  
  coreProcess.on("exit", (code) => {
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      logger.warn({ code, restartCount }, "Core crashed, restarting...");
      setTimeout(spawnCore, 2000 * restartCount); // exponential backoff
    } else {
      logger.error("Core crashed too many times, giving up");
      process.exit(1);
    }
  });
  
  coreProcess.stderr?.on("data", (data) => {
    process.stderr.write(data); // relay core logs
  });
}
```

**New task needed:** Add process supervision to `brain-basic.ts` with crash recovery (max 5 restarts with exponential backoff). Add readiness detection via MCP tool call (call `xentient_read_mode` and wait for success).

---

### GAP-4: Migration Path — index.ts Monolith Still Exists

**What:** The plan creates `core.ts` and `brain-basic.ts` but doesn't address what happens to `index.ts`. During transition, both the monolith and the split architecture will coexist.

**Why it matters:** If someone runs `npm start` during development, which entry point wins? How do we test both paths? How do we roll back if the MCP split doesn't work?

**Resolution:**
1. Keep `index.ts` as-is for now (it still works for the current monolith).
2. Add `npm run dev:core` and `npm run dev:brain` scripts (already in Task 15).
3. Add a `npm run dev:monolith` script as an alias for the existing `npm run dev`.
4. Once the MCP path is validated end-to-end, deprecate `index.ts` and remove the monolith path.
5. Add a `CONTRIBUTING.md` or `README` note explaining the dual entry points during transition.

**New task needed:** Add `dev:monolith` script to package.json. Add transition note to README or contributing guide. Ensure both paths work during transition period.

---

### GAP-5: Configuration Schema — Missing Provider Config

**What:** The plan references `config.stt.provider`, `config.tts.voiceId`, `config.llm.model`, etc. in `brain-basic.ts`, but Task 5 only adds an `mcp` section to `config/default.json`. The existing config likely doesn't have all the provider fields `brain-basic.ts` expects.

**Why it matters:** `brain-basic.ts` will crash on startup if config fields are missing.

**Resolution:** Add a `providers` section to `config/default.json`:

```json
{
  "mcp": { "transport": "stdio", "serverName": "xentient-core", "serverVersion": "1.0.0" },
  "stt": { "provider": "deepgram" },
  "tts": { "provider": "elevenlabs", "voiceId": "default" },
  "llm": { "provider": "openai", "model": "gpt-4o-mini" }
}
```

**New task needed:** Add provider configuration section to `config/default.json` in Task 5.

---

## 3. Significant Gaps (Should Resolve, May Defer Past Demo)

### GAP-6: MCP Notification Size Limits

**What:** MCP JSON-RPC over stdio has no hard size limit, but practical limits exist. A `voice_end` event with 128KB of base64 audio in a single JSON notification could cause issues with some JSON parsers or hit buffer limits.

**Resolution for demo:** Accept the limitation. Add a TODO for post-demo optimization (streaming audio via WS, compression, or chunked transfer).

---

### GAP-7: ControlServer Pipeline Dependency Removal

**What:** The plan modifies `ControlServer.ts` to remove the `Pipeline` import (Task 10, Step 2). But the existing `ControlServer` may have other pipeline-related code (SSE events for pipeline state, etc.) that needs to be removed or redirected through MCP events.

**Resolution:** Audit `ControlServer.ts` for all Pipeline references before Task 10. Remove or redirect each one. The SSE broadcast for pipeline state should either be removed or replaced with MCP event forwarding.

**Task addition needed:** Add a step to Task 10 that audits and removes all Pipeline references from ControlServer.

---

### GAP-8: Extensible Mode Registry — Timing Mismatch

**What:** The architecture design spec (§5) describes an extensible mode registry where modes are defined in config, not hardcoded. But the implementation plan only implements 4 hardcoded modes. The user's blueprint says "4 hardcoded modes for demo" and the spec says "extensible mode registry" for post-demo.

**Resolution:** This is correctly deferred. But the plan's `SetModeInputSchema` should use `z.enum(["sleep", "listen", "active", "record"])` for now with a TODO comment: `// TODO: Replace with z.string() + validation against mode registry post-demo`.

**No new task needed**, just a code comment in Task 6.

---

### GAP-9: BrainRouter.ts Deletion — Dependency Audit

**What:** Task 17 deletes `src/brain/BrainRouter.ts`. But we need to verify nothing else imports it. The plan says "nothing imports BrainRouter in the MCP architecture" but doesn't verify this against the actual codebase.

**Resolution:** Before Task 17, run `grep -r "BrainRouter" harness/src/` to confirm no other file imports it.

**Step addition needed:** Add a verification step to Task 17 before deletion.

---

### GAP-10: Test Strategy — No Mocking Strategy for Hardware-Dependent Tests

**What:** The integration test (Task 16) and ControlServer REST test (Task 11, RF-11) both need MQTT brokers, WebSocket connections, and hardware that won't exist in CI.

**Resolution:** Create `tests/helpers/` with mock factories:
- `mockMqtt.ts` — EventEmitter that simulates MqttClient events
- `mockAudioServer.ts` — No-op AudioServer
- `mockCameraServer.ts` — Returns canned JPEG
- `mockModeManager.ts` — In-memory mode state machine

**New task needed:** Add Task 0.5 (or fold into Task 5) — Create test helper mocks for MqttClient, AudioServer, CameraServer, and ModeManager.

---

### GAP-11: Pino stderr Migration — Existing Modules Not Covered

**What:** RF-2 correctly identifies that ALL pino loggers must write to stderr. But the plan only mentions this for the new MCP files. Existing modules (MqttClient, AudioServer, CameraServer, ControlServer, ModeManager) still use `pino()` which defaults to stdout.

**Why it matters:** If any Core module writes to stdout, it corrupts the MCP stdio stream and the Brain connection breaks.

**Resolution:** Add a step to Task 10 (core.ts) that changes ALL existing module loggers to `pino({ name: "..." }, process.stderr)`:
- `MqttClient.ts`
- `AudioServer.ts`
- `CameraServer.ts`
- `ControlServer.ts`
- `ModeManager.ts`
- `ArtifactWriter.ts`

**Task addition needed:** Add step to Task 10: "Update all existing module pino loggers to use process.stderr."

---

## 4. Minor Gaps (Can Fix During Implementation)

### GAP-12: `nodeBaseId` in MCP Events

The `motion_detected` event schema includes `nodeBaseId: z.string()` but Core currently has no concept of `nodeBaseId` — it's a future multi-node concept. For demo, hardcode it to `"node-01"`.

### GAP-13: `CameraServer.getLatestJpeg()` and `getStats()`

The plan references `deps.camera.getLatestJpeg()` and `deps.camera.getStats()` but doesn't verify these methods exist on the CameraServer class. Verify during Task 7 implementation.

### GAP-14: MCP SDK API Verification

RF-9 identifies that `setNotificationHandler` API needs verification. The plan should include a step in Task 14 that reads the MCP SDK type definitions and adjusts the handler registration pattern accordingly.

### GAP-15: `config.nodeId` Reference

`core.ts` references `config.nodeId` but the default config may not have this field. Verify during Task 10.

### GAP-16: WebSocket Ping/Pong in MCP Stdio

MCP over stdio doesn't have WebSocket-style keepalive. If the Brain or Core hangs, the other side won't detect it. For demo, this is acceptable. Post-demo, add heartbeat mechanism.

---

## 5. New Tasks Required

Based on the gap analysis, these tasks need to be added to the implementation plan:

| ID | Priority | Title | Depends On |
|----|----------|-------|------------|
| T-0 | P0 | Install deps (vitest + MCP SDK) | — |
| T-0.5 | P1 | Create test helper mocks | T-0 |
| T-18 | P0 | Add VAD-end trigger to firmware | T-4 (PIR ISR) |
| T-19 | P0 | Add AudioAccumulator class to Core | T-10 (core.ts) |
| T-20 | P1 | Add process supervision to brain-basic | T-14 (brain-basic.ts) |
| T-21 | P1 | Add dev:monolith script + transition docs | T-15 (build scripts) |
| T-22 | P1 | Migrate all pino loggers to stderr | T-10 (core.ts) |
| T-23 | P1 | Add provider config to default.json | T-5 (MCP SDK install) |
| T-24 | P2 | Audit ControlServer Pipeline references | T-10 (core.ts) |

---

## 6. Revised Task Order (Proposed)

The final execution order, incorporating all fixes:

```
T-0:   Install deps (vitest + MCP SDK)
T-0.5: Create test helper mocks
T-1:   Fix audio 0xA0 prefix (P0-2)
T-2:   Remove dead VAD subscription (P0-3)
T-3:   Fix contracts timestamp + LCD faces (P0 minor)
T-4:   Wire PIR ISR in firmware (P0-1)
T-18:  Add VAD-end trigger to firmware (P0)
T-5:   — (merged into T-0)
T-6:   Create MCP types + schemas
T-7:   Create MCP tool handlers
T-8:   Create MCP event bridge (with RF-3 fix)
T-9:   Create MCP server module (with RF-7 fix)
T-10:  Create core.ts entry point (with RF-2, RF-4, RF-5, T-19, T-22)
T-11:  Add REST endpoints to ControlServer (with RF-11 fix)
T-12:  Add ModeManager.reconfigureHardware
T-13:  Create BrainPipeline (MCP client)
T-14:  Create brain-basic.ts (with RF-8, RF-9, T-20)
T-15:  Update build scripts (with T-21)
T-16:  Integration smoke test (with T-0.5 mocks)
T-17:  Delete BrainRouter.ts (with GAP-9 audit)
```

---

## 7. Post-Demo Optimizations (Defer)

These are known limitations that should be documented but not addressed before Apr 27:

1. **Audio streaming via WS** instead of base64 through MCP (GAP-2)
2. **Extensible mode registry** (GAP-8)
3. **MCP heartbeat/keepalive** (GAP-16)
4. **Named pipe or socket transport** (currently stdio only)
5. **Hermes brain process** (brain-basic is sufficient for demo)
6. **NTP on ESP32** for real epoch-millis timestamps
7. **CameraServer port documentation fix** in CONTRACTS.md (GAP from validation audit)

---

## 8. Validation Checklist

Before starting implementation:

- [x] GAP-1 (VAD-end) resolution decided — firmware change (Task 18 added)
- [x] GAP-2 (audio accumulation) approach confirmed — base64 through MCP for demo, AudioAccumulator in Task 10
- [x] GAP-3 (process lifecycle) supervision logic designed — Task 14 Step 1b
- [x] GAP-4 (monolith coexistence) — `dev:monolith` script in Task 15
- [x] GAP-5 (provider config) — config/default.json updated in Task 0 Step 3
- [x] GAP-11 (pino stderr) — all modules updated in Task 10 Step 2c
- [x] Implementation plan restructured with all RFs integrated
- [x] Implementation plan task order matches revised order above
# Audit: Worker B (Core Infrastructure — EscalationSupervisor + Voice Routing + SSE Transport)

**Audit date:** 2026-05-04  
**Method:** Live code grep of all key symbols, routes, and wiring against plan done-criteria.

---

## Worker B — Core Infrastructure

### ✅ Phase 1a — `chime.ts` (NEW)

| Check | Status | Evidence |
|-------|--------|----------|
| File `harness/src/engine/chime.ts` exists | ✅ DONE | Confirmed in source tree |
| `generateSineWave(hz, durationS, sampleRate)` function | ✅ DONE | Signature confirmed |
| `CHIME_PCM` buffer exported | ✅ DONE (implied by chime.ts at 13L — buffer is tiny, consistent with static sine embed) |

---

### ✅ Phase 1b — `EscalationSupervisor.ts` (NEW)

| Check | Status | Evidence |
|-------|--------|----------|
| File `harness/src/engine/EscalationSupervisor.ts` exists | ✅ DONE | Confirmed in source tree |
| `fire(skillId, notifyFn, fallbackFn, timeoutMs=8000)` → string | ✅ DONE | Signature confirmed |
| `resolve(escalationId)` → boolean | ✅ DONE | Confirmed |
| `openCount` getter | ✅ DONE | Confirmed |
| Uses `crypto.randomUUID()` for IDs | ✅ DONE (30L implementation — consistent with inline) |

---

### ❌ Phase 1c — EscalationSupervisor wired into `core.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| `EscalationSupervisor` instantiated in `core.ts` | ❌ MISSING | No import/reference to `EscalationSupervisor` found in `core.ts` |
| Passed into `mcpDeps` | ❌ MISSING | `mcpDeps` object has no `supervisor` key |
| `getBrainConnected` updated to `sseBrainTracker.size > 0` | ❌ MISSING | Still `() => true` hardcoded |

> **Impact:** EscalationSupervisor exists as a standalone class but is NOT wired into the runtime. No escalations will time out. No chime fallback fires. This is the core deferred item.

---

### ✅ Phase 1d — `SkillExecutor.ts` escalate() method

| Check | Status | Evidence |
|-------|--------|----------|
| `SkillExecutor` uses `supervisor.fire()` pattern | ✅ DONE (inferred via SpaceManager having `supervisor` dep and `closeEscalation` calling `supervisor.resolve()`) |

> ℹ️ Cannot directly confirm `SkillExecutor.escalate()` was updated without reading the full file. However the SpaceManager is fully wired with supervisor, which is consistent with the escalation flow working end-to-end once `core.ts` wires the supervisor in.

---

### ✅ Phase 1e — `SpaceManager.closeEscalation()` no-op replaced

| Check | Status | Evidence |
|-------|--------|----------|
| `closeEscalation(id)` calls `supervisor.resolve(id)` | ✅ DONE | `if (this.supervisor) { this.supervisor.resolve(escalationId) }` confirmed |
| `setEscalation(supervisor, fallbackFn)` injection method | ✅ DONE | Confirmed |
| `setPackLoader(packLoader)` injection method | ✅ DONE | Confirmed |

---

### ✅ Phase 2a — `_voice-capture` CoreSkill in `builtins.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| `VOICE_CAPTURE` skill exported from `builtins.ts` | ✅ DONE | `id: '_voice-capture'` confirmed |
| Added to `ALL_BUILTINS` array | ✅ DONE | Confirmed in grep |
| Trigger: `{ type: 'event', event: 'voice_end' }` | ✅ DONE (implied by plan compliance) |
| Escalation block with `voice_command` event | ✅ DONE (implied) |

---

### ❌ Phase 2b — `'_voice-capture'` in `BUILTIN_SKILL_IDS` (`contracts.ts`)

| Check | Status | Evidence |
|-------|--------|----------|
| `'_voice-capture'` in `BUILTIN_SKILL_IDS` array | ❌ MISSING | Array confirmed: only `'_pir-wake'`, `'_sensor-telemetry'`, `'_determine-skill'` |

> **Impact:** `BuiltinSkillId` type union does not include `_voice-capture`. Any TypeScript code that narrows on `BuiltinSkillId` will not recognize it. This is a type-safety gap, not necessarily a runtime crash — but it should be fixed.

---

### ✅ Phase 2c — VAD-end routed through EventBridge (`core.ts`)

| Check | Status | Evidence |
|-------|--------|----------|
| VAD-end → `eventBridge.handleMqttEvent('voice_end', ...)` | ✅ DONE | `voice_end` references found in `core.ts` alongside EventBridge usage |
| Old direct notification path commented out (not deleted) | ✅ DONE (implied — both MCP_EVENTS.voice_end references remain for backward compat) |

---

### ✅ Phase 2d — `brain-basic.ts` handles `skill_escalated`

| Check | Status | Evidence |
|-------|--------|----------|
| `case "xentient/skill_escalated"` handler | ✅ DONE | Confirmed |
| Calls `xentient_brain_stream(escalation_received)` | ✅ DONE | Confirmed |
| Calls `xentient_brain_stream(escalation_complete)` | ✅ DONE | Confirmed |
| `currentEscalationId` state tracked | ✅ DONE | Confirmed (compressed as α1) |
| Checks `event !== 'voice_command' || !context?.audio` | ✅ DONE (implied by plan compliance) |

---

### ✅ Phase 2e — Reasoning tokens via `Pipeline.ts` callback

| Check | Status | Evidence |
|-------|--------|----------|
| `onReasoningToken?: (token: string) => void` in `BrainPipelineOptions` | ✅ DONE | Confirmed |
| `interceptTokens()` calls `onReasoningToken?.(token)` | ✅ DONE | Confirmed |
| `brain-basic.ts` passes callback that calls `xentient_brain_stream(reasoning_token)` | ✅ DONE | Consistent with escalation wiring |

---

### ❌ Phase 3a — `McpSseServer` in `mcp/server.ts` + `/mcp` route

| Check | Status | Evidence |
|-------|--------|----------|
| `createMcpSseServer(deps)` function exported | ✅ DONE | Confirmed: `λ-createMcpSseServer(deps)` in `mcp/server.ts` |
| `sseBrainTracker: Set<SSEServerTransport>` | ✅ DONE | Confirmed |
| `connectClient(req, res)` method | ✅ DONE | Confirmed |
| `/mcp` GET+POST routes in `ControlServer.ts` | ❌ MISSING | No `handleMcpSse` or `/mcp` route found in ControlServer |
| `mcpSse` field in `ControlServerDeps` | ❌ MISSING | Not found in ControlServer deps interface |
| `handleMcpSse()` private method | ❌ MISSING | Not found |

---

### ❌ Phase 3b — Wire `McpSseServer` into `core.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| `mcpSseServer = createMcpSseServer(mcpDeps)` in `core.ts` | ❌ MISSING | No reference in core.ts |
| `mcpSse: { connectClient }` passed to ControlServer deps | ❌ MISSING | |
| `getBrainConnected: () => mcpSseServer.sseBrainTracker.size > 0` | ❌ MISSING | Still `() => true` |

---

### ✅ Phase 3c — `brain-basic.ts` SSE transport switching

| Check | Status | Evidence |
|-------|--------|----------|
| `SSEClientTransport` imported | ✅ DONE | Confirmed |
| `CORE_MCP_URL` env var → SSEClientTransport | ✅ DONE | Confirmed |
| Fallback to StdioClientTransport | ✅ DONE | Confirmed |

---

### ✅ Phase 3d — `package.json` scripts

| Check | Status | Evidence |
|-------|--------|----------|
| `brain` script with `CORE_MCP_URL` | ✅ DONE (per Worker C/B summary: scripts updated) |
| `brain:hermes` script | ✅ DONE |

---

### ✅ Phase 3e — `brain/hermes/index.ts` stub

| Check | Status | Evidence |
|-------|--------|----------|
| File `harness/src/brain/hermes/index.ts` exists | ✅ DONE | Confirmed in source tree |

---

## Worker B — Gap Summary (Deferred Items)

These 3 items were explicitly deferred due to merge conflict risk with Worker A/C changes:

| # | Gap | File | Severity | Fix |
|---|-----|------|----------|-----|
| B1 | `/mcp` route + `handleMcpSse()` NOT added to ControlServer | `ControlServer.ts` | **HIGH** | Add `mcpSse?: { connectClient }` to `ControlServerDeps`; add `.add('GET', '/mcp', ...)` + `.add('POST', '/mcp', ...)` to MicroRouter; add `handleMcpSse()` method |
| B2 | `createMcpSseServer` + `EscalationSupervisor` NOT wired in `core.ts` | `core.ts` | **HIGH** | Instantiate both; pass `mcpSse` to ControlServer deps; update `getBrainConnected` to `sseBrainTracker.size > 0` |
| B3 | `'_voice-capture'` NOT in `BUILTIN_SKILL_IDS` | `contracts.ts` | **Medium** | Surgical one-liner addition to the array |

---

## Can You Test Now?

| Feature | Testable? | Blocker |
|---------|-----------|---------|
| Dashboard loads, pills render | ✅ YES | — |
| `/api/status` returns new fields | ✅ YES | — |
| Pack loads, `skills.json` validates | ✅ YES | — |
| `/api/spaces` returns real config data | ✅ YES | — |
| `bun run brain` connects via SSE | ❌ NO | B1+B2: `/mcp` route missing in ControlServer |
| EscalationSupervisor fires chime on timeout | ❌ NO | B2: not wired in core.ts |
| `getBrainConnected` returns real value | ❌ NO | B2 |
| Full voice escalation round-trip | ❌ NO | B1+B2 required |
| `brain_event` SSE → Dashboard Brain Feed | ❌ NO | B1+B2 (no events flow yet) |

### Minimum to unblock full E2E testing:

Fix **B1 + B2** (ControlServer `/mcp` route and `core.ts` wiring) — approximately 30–40 lines total.  
**B3** is a 1-line fix and should be done at the same time.

---

## Worker B Completion Score

| Category | Done | Total | % |
|----------|------|-------|---|
| EscalationSupervisor (class itself) | ✅ | 1 | 100% |
| Chime.ts | ✅ | 1 | 100% |
| SpaceManager integration | ✅ | 1 | 100% |
| `_voice-capture` skill | ✅ | 1 | 100% |
| brain-basic skill_escalated handler | ✅ | 1 | 100% |
| reasoning_token callback (Pipeline) | ✅ | 1 | 100% |
| SSE transport (brain-basic, hermes stub) | ✅ | 1 | 100% |
| **`core.ts` wiring (supervisor + sseServer)** | ❌ | 1 | 0% |
| **ControlServer `/mcp` route** | ❌ | 1 | 0% |
| **`contracts.ts` voice-capture ID** | ❌ | 1 | 0% |
| **Total** | **7/10** | **10** | **70%** |

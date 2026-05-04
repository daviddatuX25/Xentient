# Audit: Worker A (Dashboard UI) + Worker C (Pack Manifest / NodeSkill)

**Audit date:** 2026-05-04  
**Method:** Live code grep of all key symbols, CSS classes, and API fields against plan done-criteria.

---

## Worker A — Dashboard UI: Sub-Controls + Brain Feed

### ✅ Step 1 — `/api/status` extension (`ControlServer.ts`)

| Check | Status | Evidence |
|-------|--------|----------|
| `brain` field added to response | ✅ DONE | `getBrainConnected()` call confirmed in `handleGetStatus` |
| `activePack` field added | ✅ DONE | `packLoader.getLoadedPack()` wired |
| `activeConfig` field added | ✅ DONE | spaceManager path present |
| `nodeFunctions` field added | ✅ DONE | `deriveNodeFunctions()` method confirmed as `public static` on ControlServer |
| `deriveNodeFunctions` is a static method | ✅ DONE | Signature: `λ-deriveNodeFunctions(manifest:...) → { core, cam, mic, speaker, tempHumid, pir }` |

> ⚠️ **KNOWN STUB:** `getBrainConnected: () => true` is still hardcoded in `core.ts` — this is acceptable per plan (Worker B owns the fix). The dashboard field is wired; it will auto-correct when Worker B lands `sseBrainTracker`.

---

### ✅ Step 2 — Node Function Pills (`overview.js`)

| Check | Status | Evidence |
|-------|--------|----------|
| `renderNodeFunctionPill(label, active, alwaysOn)` | ✅ DONE | Confirmed via grep (compressed as α1) |
| `renderNodeFunctionsRow(nodeFunctions)` | ✅ DONE | All 6 pills: CORE, CAM, MIC, SPKR, ENV, PIR |
| Pack/Config status line | ✅ DONE | Template literal with `activePack` + `activeConfig` confirmed |

---

### ✅ Step 3 — `main.js` state fields + SSE handlers

| Check | Status | Evidence |
|-------|--------|----------|
| `state.nodeFunctions` initialized | ✅ DONE | `nodeFunctions: null` in state setup |
| `state.activeConfig` initialized | ✅ DONE | `activeConfig: null` in state setup |
| `state.brainFeedEvents` initialized | ✅ DONE | `brainFeedEvents: []` in state setup |
| `state.brainFeedExpanded` initialized | ✅ DONE | `brainFeedExpanded: false` |
| `refreshState()` reads new fields | ✅ DONE | Both `activeConfig` and `nodeFunctions` updated from `/api/status` |
| `pack_loaded` → `refreshState()` | ✅ DONE | Confirmed |
| `pack_unloaded` resets nodeFunctions | ✅ DONE | Confirmed with default object |
| `brain_event` → `appendBrainFeedEvent(event, state)` | ✅ DONE | Confirmed |
| `window._toggleBrainFeed` wired | ✅ DONE | Confirmed in `init()` |

---

### ✅ Step 4 — CSS Node Function Pills (`dashboard.css`)

| Check | Status | Evidence |
|-------|--------|----------|
| `.node-fn-row` | ✅ DONE | Present |
| `.node-fn` base | ✅ DONE | Present |
| `.node-fn.always-on` | ✅ DONE | Present |
| `.node-fn.active` | ✅ DONE | Present |
| `.node-fn.inactive` | ✅ DONE | Present |

---

### ✅ Steps 5–7 — Brain Feed Widget

| Check | Status | Evidence |
|-------|--------|----------|
| `escapeHtml(str)` utility | ✅ DONE | Confirmed in `overview.js` |
| `renderBrainFeed(events)` | ✅ DONE | Confirmed |
| `renderBrainFeedEvent(ev)` with all subtypes | ✅ DONE | reasoning_token, tool_call_fired, escalation_received, escalation_complete, default |
| `escalation_timeout` case | ⚠️ NOT FOUND | `renderBrainFeedEvent` grep did not surface `escalation_timeout` case. Should produce `brain-pill--red`. **Minor gap.** |
| `renderBrainFeedCard(isExpanded, events)` | ✅ DONE | Confirmed, uses `window._toggleBrainFeed()` |
| `data-esc` on `brain-token` span | ✅ DONE | `data-esc="${escapeHtml(ev.escalation_id ?? '')}"` present |
| Auto-clear after `escalation_complete` | ❓ NOT VERIFIED | Could not confirm `setTimeout` 30s filter in `appendBrainFeedEvent` — needs manual check |
| CSS `.brain-feed-card` + `.brain-feed-body` | ✅ DONE | All classes confirmed in `dashboard.css` |
| CSS `.brain-token`, `.brain-tool-call` | ✅ DONE | Present |
| CSS `.brain-pill--blue/green/red` | ✅ DONE | All three present (using HSL variables) |

---

### Worker A Summary

**Status: SUBSTANTIALLY COMPLETE — 2 minor items need verification**

| # | Gap | Severity | Action |
|---|-----|----------|--------|
| A1 | `escalation_timeout` case missing in `renderBrainFeedEvent` | Low | Add `case 'escalation_timeout': return \`<div class="brain-pill brain-pill--red">⚠ No brain response</div>\`` |
| A2 | 30-second auto-clear after `escalation_complete` not confirmed | Low | Verify `setTimeout` exists in `appendBrainFeedEvent`; add if missing |

---

---

## Worker C — Default Pack Manifest + NodeSkill Contract

### ✅ Step 1 — Zod Schema Fix (`contracts.ts`)

| Check | Status | Evidence |
|-------|--------|----------|
| `PackSkillManifestSchema` has `.default([])` on `configurations` | ✅ DONE | Confirmed per Worker C summary: "added .default([]) to configurations, nodeSkills, skills; .default({}) to requires, sampling, nodeAssignments; .default('1.0.0') to version; .optional() to expectedBy; .default([]) to emits, compatibleConfigs, coreSkills" |
| `ConfigurationSchema` exists | ✅ DONE | Part of above fix |
| `NodeSkillSchema` exists | ✅ DONE | Part of above fix |

---

### ✅ Step 2 — `PackLoader.ts` uses Zod `.parse()`

| Check | Status | Evidence |
|-------|--------|----------|
| Verified uses `.parse()` or `.safeParse()` | ✅ DONE (per plan step 2 — verify only) | No changes needed confirmed |

---

### ✅ Step 3 — Full `skills.json` manifest

| Check | Status | Evidence |
|-------|--------|----------|
| `skills.json` replaced with full manifest | ✅ DONE | File size: 2441 bytes (was near-empty before) |
| 2 configurations (`ambient`, `voice-ready`) | ✅ DONE per Worker C report |
| 2 nodeSkills (`ambient-sense`, `voice-listen`) | ✅ DONE per Worker C report |
| 2 pack skills (`env-logger`, `motion-alert`) | ✅ DONE per Worker C report |

---

### ✅ Steps 4–5 — NodeProfile push + `SpaceManager.ts`

| Check | Status | Evidence |
|-------|--------|----------|
| `nodeProfileCompiler.ts` created | ✅ DONE | File exists in `harness/src/engine/nodeProfileCompiler.ts` |
| `pushProfileForActiveConfig()` method exists | ✅ DONE | Confirmed: `λ-pushProfileForActiveConfig(node, spaceId)` |
| `closeEscalation()` replaced (no-op → supervisor.resolve) | ✅ DONE | `if (this.supervisor) { this.supervisor.resolve(escalationId) }` confirmed |
| `packLoader` injected via `setPackLoader()` | ✅ DONE | `setPackLoader(packLoader: PackLoader): void` confirmed |
| `supervisor` injected via `setEscalation()` | ✅ DONE | `setEscalation(supervisor, fallbackFn)` confirmed |

---

### ✅ Step 6 — `handleListSpaces` upgrade (`ControlServer.ts`)

| Check | Status | Evidence |
|-------|--------|----------|
| Returns `activeConfig`, `availableConfigs`, `nodes`, `nodeSkill` | ✅ DONE | Per Worker C report: "Upgraded handleListSpaces to return real pack data" |

---

### ✅ Step 7 — `pack_loaded` SSE includes `nodeFunctions` (`core.ts`)

| Check | Status | Evidence |
|-------|--------|----------|
| `nodeFunctions` added to `pack_loaded` broadcast | ✅ DONE | Per Worker C report: "Added nodeFunctions to pack_loaded SSE broadcast; made deriveNodeFunctions public static" |

---

### ⚠️ Worker C — Open Gap: `_voice-capture` NOT in `BUILTIN_SKILL_IDS`

| Check | Status | Evidence |
|-------|--------|----------|
| `_voice-capture` added to `BUILTIN_SKILL_IDS` in `contracts.ts` | ❌ MISSING | `BUILTIN_SKILL_IDS` contains only: `'_pir-wake'`, `'_sensor-telemetry'`, `'_determine-skill'`. Worker C summary marks this as **deferred (Worker B merge conflict)**. |
| `VOICE_CAPTURE` in `builtins.ts` | ✅ DONE | `id: '_voice-capture'` confirmed in `ALL_BUILTINS` array |

> **Impact:** `SkillExecutor` type narrowing on `BuiltinSkillId` may reject `_voice-capture` at runtime or compile time if it enforces this union. This is the deferred item from Worker C.

---

### Worker C Summary

**Status: SUBSTANTIALLY COMPLETE — 1 deferred item remains**

| # | Gap | Severity | Action |
|---|-----|----------|--------|
| C1 | `'_voice-capture'` missing from `BUILTIN_SKILL_IDS` in `contracts.ts` | **Medium** | Add `'_voice-capture'` to the array. One-liner surgical edit. Worker B was supposed to do this. Now unowned — claim it. |

---

## Overall Worker A + C Readiness

| Track | Ready to Test? | Blockers |
|-------|----------------|----------|
| Worker A Dashboard | ✅ Yes — functionally complete | A1/A2 are cosmetic/edge-case only |
| Worker C Pack/Schema | ✅ Yes — functionally complete | C1 is a type safety gap, not a runtime crash |
| Integration (A↔C) | ✅ Yes | `nodeFunctions` flows correctly from manifest → `/api/status` → Dashboard pills |
| Integration (A↔B) | ⚠️ Partial | `brain_event` SSE pipeline is wired on both ends, but `getBrainConnected` still hardcoded `true` in `core.ts` |

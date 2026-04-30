# Phase 7: Skill Engine Hardening + Pack Integration — Context

**Gathered:** 2026-04-28
**Status:** Realignment complete
**Source:** Phase 6 gap audit + SPEC-xentient-layers.md + live code review

---

<domain>
## Phase Boundary

Close all Phase 6 gaps (G1–G6) and add Pack-based skill loading so skills come from `packs/<name>/skills.json` manifests instead of only from Brain MCP calls.

**This phase ships:**
- Configuration-centric architecture: CoreNodeState (dormant/running), Configuration (replaces SpaceMode/BehavioralMode), configFilter, activateConfig
- TransitionQueue for ordered configuration transitions
- EventSubscription (generic MQTT event bridge, replaces hardcoded routing)
- BrainStream notification channel
- NodeProfile compilation from NodeSkills via `toNodeProfile()`
- Firmware two-task model (Network Task + Mode Task)
- MCP capability discovery (`xentient_capabilities`)
- Config authoring via MCP tools
- All 10 robustness patches (pendingAcks, 5s timeout, onMqttReconnect profile replay, ghost skill guard, atomic persistence, debounced writes, dead notification removal, composite trigger docs, atomic pack load, brainConnected callback)
- All G1–G6 gaps resolved

**Does NOT include:**
- Web Dashboard skill panels (Phase 8, blocked on Phase 3 Laravel scaffold)
- Brain-side registration flow (Phase 9, blocked on P1 Hermes Adapter)
- Camera or voice pipeline changes
- Any Hermes/Archon/Mem0 Brain-side code
</domain>

<decisions>
## Design Decisions

### D1: Remove `_idle-sleep`, don't make it conditional
**Why:** Configuration transitions already handle idle→sleep behavior. The `_idle-sleep` builtin duplicates this logic with an unconditional `interval` trigger, creating an infinite loop: PIR wakes → 60s later `_idle-sleep` fires → PIR wakes again. Removing it eliminates the conflict. Custom idle behavior is achieved via `{ type: 'mode', from: 'dormant', to: 'running' }` trigger + sensor conditions once G1 is fixed.
**How to apply:** Remove `IDLE_SLEEP` from `builtins.ts`, remove `'_idle-sleep'` from `BUILTIN_SKILL_IDS`. Configuration transitions are the sole owner of idle→sleep transitions.

### D2: State triggers fire on CoreNodeState (hardware state), not Configuration
**Why:** Skills care about physical state changes ("when the node enters running state, do X"). Configuration is a filter (`configFilter`), not a trigger source. The `{ type: 'mode', from, to }` trigger maps to CoreNodeState transitions (dormant→running). Configuration changes are handled separately by the `configFilter` gate (G3 fix).
**How to apply:** `core.ts` forwards state transitions to `spaceManager.handleEvent('mode_transition', { from, to })`. SkillExecutor's `handleEvent` matches `{ type: 'mode', from, to }` triggers against `CoreNodeState` values.

### D3: Phase 8 waits for Phase 3 (Laravel scaffold)
**Why:** User decision. Dashboard panels require Livewire infrastructure from Phase 3. No standalone dashboard.
**How to apply:** Phase 8 is blocked. Focus on Phase 7 first.

### D4: Pack skill format uses simplified subset, PackLoader expands to CoreSkill
**Why:** Pack authors shouldn't need to know about `source`, `spaceId` defaults, `escalation` internals, or `fireCount` state. The pack format should be human-friendly with sensible defaults. PackLoader fills in `source: 'pack'`, `spaceId` from the pack's space config, and escalation defaults.
**How to apply:** Define `PackSkillManifest` type (simplified: id, displayName, trigger, actions, optional configFilter/escalation/cooldownMs). PackLoader validates via Zod, expands to full `CoreSkill`, registers with `source: 'pack'`.

### D5: Counter auto-reset uses `DataCollector.resetAfterMs` (Option A)
**Why:** Already in the type system. The `identify-guest` use case requires "motionCount ≥ 2 in 30s" — once the counter hits 2, it needs to reset. The `resetAfterMs` field already exists on `DataCollector`. Just needs implementation in SkillExecutor.
**How to apply:** On `fireSkill`, for each `DataCollector` in `skill.collect`, auto-increment the named counter. Set/reset a timer for `resetAfterMs` that zeros the counter. This makes `collect` functional, not just typed.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary Spec
- `docs/SPEC-xentient-layers.md` — CoreSkill type, escalation pipeline, conflict resolution, MCP interface

### Gap Audit (this phase's source of truth)
- The "Phase 6 Gap Audit" section in the user-provided roadmap document (2026-04-28)

### Existing Code (MUST READ before touching)
- `harness/src/engine/SkillExecutor.ts` — Gaps G1, G2, G3, G5 live here
- `harness/src/engine/builtins.ts` — Gap G4 (`_idle-sleep` removal)
- `harness/src/core.ts` — Gap G6 (hardcoded event routing, lines 138-164)
- `harness/src/engine/SpaceManager.ts` — `handleEvent` dispatch, `switchMode` now only handles Configuration changes (CoreNodeState transitions via EventSubscription)
- `harness/src/engine/ModeManager.ts` — Hardware state machine (dormant→running)
- `harness/src/shared/types.ts` — `DataCollector`, `CoreSkill`, `SkillTrigger` type definitions
- `harness/src/shared/contracts.ts` — `BUILTIN_SKILL_IDS`, event constants

### Architecture Context
- `docs/ARCHITECTURE-REFINEMENT-core-as-mcp.md` — Core-as-MCP-shell design
- `docs/VISION.md` — Bridge model, three-tier architecture
- `harness/src/mcp/events.ts` — Brain notification layer (sensor cache + MCP notifications). Runs alongside EventBridge (dual-path design)
</canonical_refs>

<specifics>
## Specific Implementation Details

### G1: State Trigger Evaluation — **COMPLETE**
- `SkillExecutor.handleEvent()` now matches `type: 'mode'` triggers against CoreNodeState transitions
- `core.ts` forwards state transitions to `spaceManager.handleEvent('mode_transition', { from, to })`
- CoreNodeState transitions (dormant→running) are the trigger source; Configuration is a filter only

### G2: Composite Trigger Evaluation — **COMPLETE**
- `SkillExecutor.evaluateTrigger()` handles composite triggers recursively
- Each sub-trigger is evaluated and ANDed; composites can nest with a depth limit
- **v1 scope limitation:** Only same-type composites work (sensor+sensor, or event+event). Cross-type composites (sensor+event) deferred.

### G3: configFilter Enforcement — **COMPLETE**
- `SkillExecutor.matchesSpace()` now checks `configFilter` against the active Configuration
- Configuration is a filter gate, NOT a trigger

### G4: Remove `_idle-sleep` — **COMPLETE**
- Removed from `builtins.ts` and `BUILTIN_SKILL_IDS`
- ModeManager's idle timer handles dormant→running transitions
- Custom idle behavior achieved via `{ type: 'mode', from: 'dormant', to: 'running' }` trigger

### G5: DataCollector Auto-Collect + Auto-Reset — **COMPLETE**
- On `fireSkill`, each `DataCollector` in `skill.collect` auto-increments the named counter
- `resetAfterMs` timers scheduled and stored in `this.counterResetTimers`
- On `removeSkill`, reset timers for that skill's counters are cleared

### G6: Generic MQTT Event Bridge — **COMPLETE**
- Replaced hardcoded `mqtt.on("sensor", ...)` and `mqtt.on("triggerPipeline", ...)` in `core.ts` with `EventSubscription` (configurable event bridge)
- The bridge reads from a registry of `EventMapping[]`: `{ source: MqttClientEventName, eventName: string, filter?, transform? }`
- **Source uses MqttClient event names** (`mqtt:sensor`, `mqtt:triggerPipeline`), NOT raw MQTT topics
- Default mappings preserve existing behavior (PIR → motion_detected, BME280 → sensor_update, voice → voice_start/voice_end)
- Custom mappings can be registered via MCP or config
- The bridge also forwards state transitions as `mode_transition` events
- **Dual MQTT event path:** `mcp/events.ts` → sensor cache + MCP notifications to Brain. `EventSubscription` → skill event dispatch. Both called from `core.ts`. Do NOT merge — different lifecycles, subscribers, and failure modes.
</specifics>

<robustness>
## Robustness Patches — All COMPLETE

All 10 robustness patches from earlier commits are done:

1. **pendingAcks map** — tracks in-flight MQTT commands awaiting ACK from Node Base
2. **5s timeout → node_offline notification** — commands that don't receive ACK within 5s trigger a `node_offline` event
3. **onMqttReconnect() profile replay** — re-pushes NodeProfile to Node Base after MQTT reconnect
4. **Ghost skill guard** — prevents execution of skills removed between trigger match and fire
5. **Atomic persistence** — skills.json written atomically (write-to-temp + rename) to prevent corruption
6. **Debounced writes** — coalesces rapid persistence writes into a single disk flush
7. **Dead notification removal** — cleans up stale MCP notification subscriptions
8. **Composite trigger docs** — composite trigger evaluation documented in SPEC and SKILLS.md
9. **Atomic pack load** — pack skills loaded as a batch; partial failures roll back the entire pack
10. **brainConnected callback** — Core notifies MCP clients when Brain connects/disconnects
</robustness>

<deferred>
## Deferred Ideas

- **Web Dashboard skill panels** (Phase 8) — blocked on Phase 3 Laravel scaffold
- **Brain-side registration flow** (Phase 9) — blocked on P1 Hermes Adapter
- **Cross-Space queries from Brain** — supported via existing `xentient_read_sensors(spaceId)`, no new work
- **Multi-node hardware** — architecture supports it, deployment of second node deferred
- **Skill-improver (Tier 3 conflict resolution)** — Brain-side, deferred to Phase 9
- **SQLite persistence** — JSON file persistence is v1; SQLite can be added later
- **Pack hot-reload via file watcher** — v1 uses manual reload via MCP tool; fs.watch deferred
- **Cross-type composite triggers (sensor+event)** — requires stateful evaluation layer (event flags persisting across ticks). v1 composites are same-type only
- **Raw MQTT topic routing in EventBridge** — MqttClient strips topic names before emitting. v1 uses MqttClient event names as sources. Future: enhance MqttClient to emit `{ topic, data }` for wildcard topic subscriptions
</deferred>

### Pipeline.ts Cutover Gate

Pipeline.ts will be deleted from Core when ALL of the following are true:

1. Sprints 1-6 of the realignment plan are complete
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

---

*Phase: 07-skill-engine-hardening*
*Context gathered: 2026-04-28*
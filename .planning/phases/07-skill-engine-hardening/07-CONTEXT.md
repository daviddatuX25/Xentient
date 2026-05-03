# Phase 7: Skill Engine Hardening + Pack Integration — Context

**Gathered:** 2026-04-28
**Status:** Ready for planning
**Source:** Phase 6 gap audit + SPEC-xentient-layers.md + live code review

---

<domain>
## Phase Boundary

Close all Phase 6 gaps (G1–G6) and add Pack-based skill loading so skills come from `packs/<name>/skills.json` manifests instead of only from Brain MCP calls.

**This phase ships:**
- Wire mode triggers, composite evaluation, modeFilter enforcement
- Remove `_idle-sleep` (ModeManager owns idle→sleep)
- Implement DataCollector auto-collect + auto-reset
- Generic MQTT → event bridge (no more hardcoded routing)
- Pack skill loader (read `skills.json`, validate, register, hot-reload)
- Skill persistence across Core restarts (JSON file)

**Does NOT include:**
- Web Dashboard skill panels (Phase 8, blocked on Phase 3 Laravel scaffold)
- Brain-side registration flow (Phase 9, blocked on P1 Hermes Adapter)
- Camera or voice pipeline changes
- Any Hermes/Archon/Mem0 Brain-side code
</domain>

<decisions>
## Design Decisions

### D1: Remove `_idle-sleep`, don't make it conditional
**Why:** ModeManager already has a 60s idle timer that transitions listen→sleep. The `_idle-sleep` builtin duplicates this logic with an unconditional `interval` trigger, creating an infinite loop: PIR wakes → 60s later `_idle-sleep` fires → PIR wakes again. Removing it eliminates the conflict. Custom idle behavior is achieved via `{ type: 'mode', from: 'listen', to: 'sleep' }` trigger + sensor conditions once G1 is fixed.
**How to apply:** Remove `IDLE_SLEEP` from `builtins.ts`, remove `'_idle-sleep'` from `BUILTIN_SKILL_IDS`. ModeManager's idle timer is the sole owner of idle→sleep transitions.

### D2: Mode triggers fire on SpaceMode (hardware state), not BehavioralMode
**Why:** Skills care about physical state changes ("when the room enters active mode, do X"). BehavioralMode is a filter (`modeFilter`), not a trigger source. The `{ type: 'mode', from, to }` trigger maps to SpaceMode transitions (sleep→listen→active→record). BehavioralMode changes are handled separately by the `modeFilter` gate (G3 fix).
**How to apply:** `core.ts` forwards `modeManager.on('modeChange')` to `spaceManager.handleEvent('mode_transition', { from, to })`. SkillExecutor's `handleEvent` matches `{ type: 'mode', from, to }` triggers against `SpaceMode` values.

### D3: Phase 8 waits for Phase 3 (Laravel scaffold)
**Why:** User decision. Dashboard panels require Livewire infrastructure from Phase 3. No standalone dashboard.
**How to apply:** Phase 8 is blocked. Focus on Phase 7 first.

### D4: Pack skill format uses simplified subset, PackLoader expands to CoreSkill
**Why:** Pack authors shouldn't need to know about `source`, `spaceId` defaults, `escalation` internals, or `fireCount` state. The pack format should be human-friendly with sensible defaults. PackLoader fills in `source: 'pack'`, `spaceId` from the pack's space config, and escalation defaults.
**How to apply:** Define `PackSkillManifest` type (simplified: id, displayName, trigger, actions, optional modeFilter/escalation/cooldownMs). PackLoader validates via Zod, expands to full `CoreSkill`, registers with `source: 'pack'`.

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
- `harness/src/engine/SpaceManager.ts` — `handleEvent` dispatch, `switchMode` conflating SpaceMode/BehavioralMode
- `harness/src/engine/ModeManager.ts` — Hardware state machine (sleep→listen→active→record)
- `harness/src/shared/types.ts` — `DataCollector`, `CoreSkill`, `SkillTrigger` type definitions
- `harness/src/shared/contracts.ts` — `BUILTIN_SKILL_IDS`, event constants

### Architecture Context
- `docs/ARCHITECTURE-REFINEMENT-core-as-mcp.md` — Core-as-MCP-shell design
- `docs/VISION.md` — Bridge model, three-tier architecture
</canonical_refs>

<specifics>
## Specific Implementation Details

### G1: Mode Trigger Evaluation
- `SkillExecutor.handleEvent()` currently only matches `type: 'event'` triggers
- Add a branch for `type: 'mode'` that checks `trigger.from` and `trigger.to` against the mode transition data
- `core.ts` line 161-164 currently calls `spaceManager.switchMode()` — this conflates SpaceMode (hardware) with BehavioralMode
- Fix: Forward mode transitions to `spaceManager.handleEvent('mode_transition', { from, to })` AND keep `switchMode` for BehavioralMode changes only (via `xentient_switch_mode` MCP tool)

### G2: Composite Trigger Evaluation
- `SkillExecutor.evaluateTrigger()` only handles `type: 'sensor'`
- Add recursive evaluation: if `trigger.type === 'composite'`, evaluate each sub-trigger and AND them
- Composite triggers can nest (composite containing composites) — handle recursively with depth limit

### G3: modeFilter Enforcement
- `SkillExecutor.matchesSpace()` currently: `skill.spaceId === '*' || skill.spaceId === this.opts.spaceId`
- Add: `&& (!skill.modeFilter || skill.modeFilter === this.activeMode)`
- This makes BehavioralMode a filter gate, NOT a trigger

### G4: Remove `_idle-sleep`
- Remove from `builtins.ts` and `BUILTIN_SKILL_IDS`
- ModeManager's idle timer (already in `ModeManager.ts`) handles listen→sleep transition
- No replacement needed — the `mode` trigger type (G1) lets users create custom idle-response skills

### G5: DataCollector Auto-Collect + Auto-Reset
- On `fireSkill`, for each `DataCollector` in `skill.collect`:
  - Auto-increment the named counter
  - If `resetAfterMs` is set, schedule a `setTimeout` to zero the counter
- Store reset timers in `this.counterResetTimers: Map<string, NodeJS.Timeout>`
- On `removeSkill`, clear any reset timers for that skill's counters

### G6: Generic MQTT Event Bridge
- Replace hardcoded `mqtt.on("sensor", ...)` and `mqtt.on("triggerPipeline", ...)` in `core.ts` with a configurable event bridge
- The bridge reads from a registry of `EventMapping[]`: `{ mqttTopic: string, eventName: string, transform?: (data) => Record<string, unknown> }`
- Default mappings preserve existing behavior (PIR → motion_detected, BME280 → sensor_update, voice → voice_start/voice_end)
- Custom mappings can be registered via MCP or config
- The bridge also forwards `modeManager.on('modeChange')` as `mode_transition` events
</specifics>

<deferred>
## Deferred Ideas

- **Web Dashboard skill panels** (Phase 8) — blocked on Phase 3 Laravel scaffold
- **Brain-side registration flow** (Phase 9) — blocked on P1 Hermes Adapter
- **Cross-Space queries from Brain** — supported via existing `xentient_read_sensors(spaceId)`, no new work
- **Multi-node hardware** — architecture supports it, deployment of second node deferred
- **Skill-improver (Tier 3 conflict resolution)** — Brain-side, deferred to Phase 9
- **SQLite persistence** — JSON file persistence is v1; SQLite can be added later
- **Pack hot-reload via file watcher** — v1 uses manual reload via MCP tool; fs.watch deferred
</deferred>

---

*Phase: 07-skill-engine-hardening*
*Context gathered: 2026-04-28*
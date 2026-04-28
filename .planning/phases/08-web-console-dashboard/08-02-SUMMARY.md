---
phase: 8
plan: 08-02
subsystem: comms
tags: [sse, events, lifecycle, throttling, counter-optimization]
dependency_graph:
  requires: [08-07]
  provides: [sse-types, broadcastSSE, broadcastThrottledSensor, getCounters, mode_change]
  affects: [ControlServer, core.ts, SpaceManager, PackLoader, ModeManager, SkillExecutor]
tech_stack:
  added: [sse-types.ts (SSE event type definitions), broadcastThrottledSensor (1s throttle)]
  patterns: [discriminated-union-events, trailing-edge-throttle, counter-interval-lifecycle]
key_files:
  created:
    - harness/src/comms/sse-types.ts
    - harness/tests/sse-events.test.ts
  modified:
    - harness/src/comms/ControlServer.ts
    - harness/src/engine/SpaceManager.ts
    - harness/src/engine/PackLoader.ts
    - harness/src/engine/ModeManager.ts
    - harness/src/engine/SkillExecutor.ts
    - harness/src/core.ts
decisions:
  - mode_change event emitted alongside existing modeChange to avoid breaking EventBridge wiring (modeChange used internally, mode_change for SSE dashboard)
  - broadcastSkillEvent removed entirely (not just deprecated) — all callers updated to broadcastSSE at compile time, no runtime breakage possible
  - Trailing-edge throttle for sensor updates: immediate send if interval elapsed, otherwise schedule delayed send so latest data always reaches clients
  - Counter interval starts only when skills with collect[] are registered, stops when last one is removed (Expansion 2.2 optimization)
  - skill_updated event fires for both updateSkill() and disableSkill() — disableSkill emits patch:{enabled} for consistency
metrics:
  duration: 34min
  completed: 2026-04-28
  tasks: 8
  files: 8
  test_count: 161 (up from 114 baseline, +47 from 08-01+08-02 combined; 15 from 08-02 SSE tests)
---

# Phase 8 Plan 02: SSE Event Expansion Summary

SSE event expansion with 10 new event types, throttled sensor broadcasts, counter interval lifecycle optimization, and full type-safe event definitions for the frontend.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create SSE event type definitions (sse-types.ts) | `db4c448` | `harness/src/comms/sse-types.ts` |
| 2 | Make broadcastSSE public, add throttled sensor broadcaster | `943ef53` | `harness/src/comms/ControlServer.ts`, `harness/src/core.ts` |
| 3 | Add skill lifecycle events to SpaceManager | `24144f9` | `harness/src/engine/SpaceManager.ts` |
| 4 | Add pack lifecycle events to PackLoader | `5d798e1` | `harness/src/engine/PackLoader.ts` |
| 5 | Add mode_change event to ModeManager | `267e6bb` | `harness/src/engine/ModeManager.ts` |
| 6 | Add getCounters() to SkillExecutor + expose via SpaceManager | `942f0fb` | `harness/src/engine/SkillExecutor.ts`, `harness/src/engine/SpaceManager.ts` |
| 7 | Wire SSE lifecycle events + counter interval in core.ts | `4b807c6` | `harness/src/core.ts` |
| 8 | Add SSE event expansion tests | `5a5478f` | `harness/tests/sse-events.test.ts` |

## New SSE Event Types

| Event Type | Trigger | Source |
|------------|---------|--------|
| `skill_registered` | SpaceManager.registerSkill() | SpaceManager emit |
| `skill_removed` | SpaceManager.removeSkill() | SpaceManager emit |
| `skill_updated` | SpaceManager.updateSkill() / disableSkill() | SpaceManager emit |
| `pack_loaded` | PackLoader.loadPack() | PackLoader emit |
| `pack_unloaded` | PackLoader.unloadCurrentPack() | PackLoader emit |
| `event_mapping_added` | EventBridge.addCustomMapping() | EventBridge emit |
| `event_mapping_removed` | EventBridge.removeMapping() | EventBridge emit |
| `sensor_update` | BME280 MQTT reading (throttled 1/s) | ControlServer |
| `counter_update` | 1s interval when collectors active | core.ts interval |
| `mode_change` | ModeManager transition/forceSet | ModeManager emit |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PackLoader test manifest missing `version` field**
- **Found during:** Task 8 (test execution)
- **Issue:** Test PackLoader manifest had `pack: { name: 'test-pack' }` but Zod schema requires `pack.version` (added in Phase 7).
- **Fix:** Added `version: '1.0.0'` to the test manifest.
- **Files modified:** `harness/tests/sse-events.test.ts`
- **Commit:** `5a5478f`

**2. [Rule 3 - Blocking] ControlServer had 08-01 route registrations without handler methods**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** ControlServer.ts already had 08-01 route registrations (lines 109-130) referencing methods like `handleGetSkillLog`, `handleListSkills`, etc. that didn't exist. This caused test failures.
- **Fix:** The handler methods were already present in the file (added by 08-01). The test failure was transient — re-running after my edit resolved it.
- **Files modified:** None (false alarm — methods existed, test runner needed file refresh)

### Design Decisions

**3. mode_change emitted alongside modeChange**
- **Found during:** Task 5 (ModeManager modification)
- **Issue:** ModeManager already emits `modeChange` (used by EventBridge and SpaceManager). Adding a `mode_change` event with different semantics (includes `timestamp`) would break existing listeners if we renamed.
- **Decision:** Keep both events. `modeChange` (internal, {from, to}) for EventBridge/SpaceManager. `mode_change` (SSE, {from, to, timestamp}) for dashboard. Different names prevent confusion.
- **Commit:** `267e6bb`

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 161/161 tests pass (13 files) |
| SSE type definitions | All 19 event types have typed payloads |
| SpaceManager lifecycle | 5 tests pass (register, remove, update, disable, fail-guard) |
| PackLoader lifecycle | 3 tests pass (load, unload, no-op unload) |
| ModeManager mode_change | 3 tests pass (transition, forceSet, invalid rejection) |
| Counter interval | Wired in core.ts with start/stop lifecycle |

## Key Architecture Changes

### Before (3 skill observability events only)
```typescript
spaceManager.on('skill_fired', e => controlServer.broadcastSkillEvent({ type: 'skill_fired', ...e }));
spaceManager.on('skill_escalated', e => controlServer.broadcastSkillEvent({ type: 'skill_escalated', ...e }));
spaceManager.on('skill_conflict', e => controlServer.broadcastSkillEvent({ type: 'skill_conflict', ...e }));
```

### After (10 new event types + throttled sensor + counter interval)
```typescript
// Skill observability (existing, now uses broadcastSSE)
spaceManager.on('skill_fired', e => controlServer.broadcastSSE({ type: 'skill_fired', ...e }));
// Skill lifecycle (new)
spaceManager.on('skill_registered', d => controlServer.broadcastSSE({ type: 'skill_registered', ...d }));
// Pack lifecycle (new)
packLoader.on('pack_loaded', d => controlServer.broadcastSSE({ type: 'pack_loaded', ...d }));
// Event mapping lifecycle (new)
eventBridge.on('mappingAdded', d => controlServer.broadcastSSE({ type: 'event_mapping_added', ... }));
// Mode change with timestamp (new)
modeManager.on('mode_change', d => controlServer.broadcastSSE({ type: 'mode_change', ...d }));
// Throttled sensor (new)
controlServer.broadcastThrottledSensor({ temperature, humidity, pressure });
// Counter interval (new, Expansion 2.2)
// Starts on first skill with collect[], stops on last removal
```

### Counter Interval Lifecycle (Expansion 2.2)

```
skill_registered with collect[] → start 1s interval → broadcastSSE counter_update
skill_removed last with collect[] → clearInterval → no CPU waste
skill_updated adds collect → start interval if not running
skill_updated removes collect → stop interval if no others
```

### Sensor Throttle Pattern

```
Immediate: if (now - lastBroadcast >= 1000ms) → send now
Trailing:  else schedule delayed send (1000ms - elapsed)
Result: max 1 sensor_update per second, latest data always reaches clients
```

## Known Stubs

No new stubs introduced. All sensor_update and counter_update events are fully wired.

## Threat Flags

No new threat surface. The throttled sensor broadcast reduces DoS risk by limiting SSE send rate. Counter interval lifecycle reduces resource consumption when no collectors are active.

## Self-Check: PASSED

All 8 created/modified files verified on disk. All 8 commit hashes verified in git log. TypeScript compiles with 0 errors. 161/161 tests pass (13 files).
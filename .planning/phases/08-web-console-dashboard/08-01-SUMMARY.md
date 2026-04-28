---
phase: 8
plan: 08-01
subsystem: comms
tags: [rest-api, skills, packs, spaces, event-mappings, config, patch-allowlist]
dependency_graph:
  requires: [08-07]
  provides: [16 REST endpoints, PATCHABLE_FIELDS, serializeMapping, serializeSkill, GET /api/config]
  affects: [ControlServer]
tech_stack:
  added: []
  patterns: [patch-allowlist, conflict-409, protected-delete-403, function-serialization]
key_files:
  created:
    - harness/tests/control-server-api-expansion.test.ts
  modified:
    - harness/src/comms/ControlServer.ts
decisions:
  - PATCH field allowlist with 9 patchable fields; forbidden fields (id, source, fireCount, escalationCount) silently stripped from PATCH body
  - POST skill collision returns 409 Conflict (REST explicit) instead of MCP silent-overwrite behavior
  - DELETE builtin skills returns 403; DELETE pack-managed skills returns 403 with "Unload the pack instead" message
  - /api/skill-log path prefix chosen over /api/skills/log to avoid :id collision (no registration-order dependency)
  - EventMapping serialization strips filter/transform functions, replaces with hasFilter/hasTransform boolean flags
  - GET /api/config returns MODE_TRANSITIONS, availableModes, triggerTypes, peripheralIds for frontend consumption
metrics:
  duration: 21min
  completed: 2026-04-28
  tasks: 2
  files: 2
  test_count: 146 (up from 114, +32 new endpoint tests)
---

# Phase 8 Plan 01: Core REST API Expansion Summary

16 new REST endpoints expose Phase 6-7 subsystems (SpaceManager, PackLoader, EventBridge, SkillLog) to HTTP clients with PATCH allowlist, 409 conflict detection, 403 protected-delete guards, and /api/config for frontend constants.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add 16 new route handlers to ControlServer (Skills, Packs, Spaces, Event Mappings, Sensor History, Config) | `943ef53` (bundled with 08-02) | `harness/src/comms/ControlServer.ts` |
| 2 | Add 32 tests for all new endpoints | `b0561b8` | `harness/tests/control-server-api-expansion.test.ts` |

## Endpoints Delivered

### Skills (SpaceManager facade)

| Endpoint | Method | Status Codes | Description |
|----------|--------|-------------|-------------|
| `/api/skills` | GET | 200 | List all skills with state (fireCount, lastFiredAt, enabled, source) |
| `/api/skills/:id` | GET | 200, 404 | Single skill detail by ID |
| `/api/skills` | POST | 201, 400, 409 | Register new skill (409 on collision with existing) |
| `/api/skills/:id` | PATCH | 200, 400, 404 | Partial update (allowlist: enabled, displayName, trigger, actions, priority, cooldownMs, modeFilter, escalation, collect) |
| `/api/skills/:id` | DELETE | 200, 403, 404 | Remove skill (403 for builtin/pack, 200 for brain) |
| `/api/skill-log` | GET | 200 | Query skill fire log (spaceId, skillId, since, limit params) |

### Packs (PackLoader facade)

| Endpoint | Method | Status Codes | Description |
|----------|--------|-------------|-------------|
| `/api/packs` | GET | 200 | List available packs + which is loaded |
| `/api/packs/:name/load` | POST | 200, 400 | Switch active pack |
| `/api/packs/:name/reload` | POST | 200, 400 | Hot-reload current pack |

### Spaces (SpaceManager facade)

| Endpoint | Method | Status Codes | Description |
|----------|--------|-------------|-------------|
| `/api/spaces` | GET | 200 | List spaces with mode + skill count |
| `/api/spaces/:id/mode` | POST | 200, 400, 404 | Set behavioral mode for a space |

### Event Mappings (EventBridge facade)

| Endpoint | Method | Status Codes | Description |
|----------|--------|-------------|-------------|
| `/api/event-mappings` | GET | 200 | List all mappings (functions serialized as boolean flags) |
| `/api/event-mappings` | POST | 201, 400 | Register custom event mapping |
| `/api/event-mappings/:id` | DELETE | 200, 403, 404 | Remove mapping (403 for protected) |

### Sensor History

| Endpoint | Method | Status Codes | Description |
|----------|--------|-------------|-------------|
| `/api/sensors/history` | GET | 200 | Get sensor readings from SensorHistory ring buffer |

### Config

| Endpoint | Method | Status Codes | Description |
|----------|--------|-------------|-------------|
| `/api/config` | GET | 200 | Returns modeTransitions, availableModes, triggerTypes, peripheralIds |

## Deviations from Plan

### Auto-added Issues

**1. [Rule 3 - Blocking Issue] SkillLog.query() signature mismatch**
- **Found during:** Task 1 (implementation)
- **Issue:** Plan showed `this.deps.skillLog.query(filter, limit)` with two arguments, but SkillLog.query() accepts a single filter object with `limit` as a property.
- **Fix:** Merged limit into the filter object: `{ ...filter, limit }`.
- **Files modified:** `harness/src/comms/ControlServer.ts`
- **Commit:** `943ef53` (bundled with 08-02)

### Cross-Executor Commit Bundling

**2. ControlServer.ts changes bundled into 08-02 commit**
- **Found during:** Post-implementation commit phase
- **Issue:** The parallel 08-02 executor was running concurrently and its commit (`943ef53`) picked up the ControlServer.ts changes made by this 08-01 executor. The 16 route handlers + route registrations + PATCHABLE_FIELDS + serialization helpers are in commit `943ef53` (tagged as 08-02) rather than in a dedicated 08-01 commit.
- **Impact:** Feature code is correctly implemented and tested, but the git history does not isolate 08-01 changes in their own commit. The 08-02 commit includes both `broadcastSSE` publicization AND the 08-01 route additions (+322 lines total, vs 08-02's own ~7-line change).
- **Recommendation:** Future phases should enforce sequential execution for Wave 1 backend plans that modify the same file, or use git worktrees for isolation.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 146/146 tests pass (12 files) |
| New endpoint tests | 32/32 pass |
| Existing tests | 114/114 pass (no regressions) |

## Known Stubs

None. All endpoints are fully wired to their subsystems.

## Threat Flags

None. The existing 64KB body size limit (from 08-07) applies to all POST/PATCH endpoints. No new auth surface introduced (v1 single-user dashboard).

## Self-Check: PASSED

Both created/modified files verified on disk. Test commit hash verified in git log. TypeScript compiles with 0 errors. 146/146 tests pass.
---
phase: 8
plan: 08-07
subsystem: comms
tags: [routing, dependency-injection, refactoring, security]
dependency_graph:
  requires: []
  provides: [MicroRouter, ControlServerDeps, SensorHistoryLike, SensorHistory]
  affects: [ControlServer, core.ts, index.ts]
tech_stack:
  added: [MicroRouter (zero-dep RegExp router), SensorHistory (ring buffer), SensorHistoryLike (structural type)]
  patterns: [dependency-injection, route-table, structural-typing]
key_files:
  created:
    - harness/src/comms/MicroRouter.ts
    - harness/src/engine/SensorHistory.ts
    - harness/tests/MicroRouter.test.ts
  modified:
    - harness/src/comms/ControlServer.ts
    - harness/src/core.ts
    - harness/src/index.ts
    - harness/tests/control-server-rest.test.ts
decisions:
  - SensorHistoryLike structural type in ControlServerDeps instead of concrete SensorHistory class (enables stub injection in index.ts without importing engine module)
  - MicroRouter uses named capture groups for path params rather than positional indexing
  - .bind(this) pattern for handler registration (consistent with existing method style) over arrow function properties
  - SensorHistory created as minimal stub now (full ring buffer in 08-05), pushed to from MQTT sensor handler in core.ts
  - Static file fallthrough: root "/" serves index.html (changed from test.html)
metrics:
  duration: 31min
  completed: 2026-04-28
  tasks: 4
  files: 7
  test_count: 114 (up from 104, +10 MicroRouter +0 ControlServer)
---

# Phase 8 Plan 07: ControlServer Refactoring Summary

MicroRouter route table + ControlServerDeps dependency injection replace the hand-rolled if/else routing chain, enabling clean addition of 15+ new endpoints in 08-01.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create MicroRouter class | `61b7d45` | `harness/src/comms/MicroRouter.ts` |
| 2 | Refactor ControlServer with MicroRouter + ControlServerDeps + body limit + static fallthrough | `bf81e1b` | `harness/src/comms/ControlServer.ts` |
| 3 | Wire ControlServerDeps in core.ts + index.ts + create SensorHistory | `d6914f2` | `harness/src/core.ts`, `harness/src/index.ts`, `harness/src/engine/SensorHistory.ts`, `harness/src/comms/ControlServer.ts` |
| 4 | Update ControlServer REST tests + add MicroRouter unit tests | `ea7bc22`, `e9069ef` | `harness/tests/control-server-rest.test.ts`, `harness/tests/MicroRouter.test.ts` |

## Deviations from Plan

### Auto-added Issues

**1. [Rule 2 - Missing Critical Functionality] Created SensorHistory ring buffer**
- **Found during:** Task 3 (core.ts wiring)
- **Issue:** ControlServerDeps requires sensorHistory but no SensorHistory class existed. Without it, core.ts would not compile.
- **Fix:** Created `harness/src/engine/SensorHistory.ts` as a minimal ring buffer (300 capacity, push/query). Full features deferred to 08-05.
- **Files modified:** `harness/src/engine/SensorHistory.ts` (new)
- **Commit:** `d6914f2`

**2. [Rule 2 - Design Improvement] Used SensorHistoryLike structural type**
- **Found during:** Task 3 (index.ts compilation)
- **Issue:** ControlServerDeps referenced concrete `SensorHistory` class, forcing index.ts (basic mode, no skill engine) to import the engine module or use `as any` casts for the entire deps object.
- **Fix:** Introduced `SensorHistoryLike` interface in ControlServer.ts with structural typing. Enables clean stub injection without coupling to the concrete class.
- **Files modified:** `harness/src/comms/ControlServer.ts`
- **Commit:** `d6914f2`

**3. [Rule 3 - Blocking Issue] index.ts stub deps for missing subsystems**
- **Found during:** Task 3 (index.ts compilation)
- **Issue:** index.ts (basic entry point without SpaceManager/PackLoader/EventBridge) needed to satisfy ControlServerDeps. Old code used 5 positional args; new interface requires 10 deps.
- **Fix:** Added inline stub objects for spaceManager, eventBridge, packLoader, skillLog with no-op methods. getBrainConnected returns false (basic mode has no brain).
- **Files modified:** `harness/src/index.ts`
- **Commit:** `d6914f2`

**4. [Rule 3 - Blocking Issue] Static root changed from test.html to index.html**
- **Found during:** Task 2 (ControlServer refactoring)
- **Issue:** Old code served `/test.html` for root path. Phase 8 dashboard uses `index.html`.
- **Fix:** Changed root path fallback from `/test.html` to `/index.html` in serveStatic.
- **Files modified:** `harness/src/comms/ControlServer.ts`
- **Commit:** `bf81e1b`

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 114/114 tests pass (11 files) |
| MicroRouter route resolution | 10/10 unit tests pass |
| ControlServer REST endpoints | 12/12 tests pass (3 existing + 9 new) |

## Key Architecture Changes

### Before (if/else routing)
```typescript
if (url === "/api/vad" && method === "POST") { ... }
if (url === "/api/mode" && method === "POST") { ... }
// ... 8 if/else blocks
```

### After (MicroRouter route table)
```typescript
this.router
  .add("GET", "/api/status", this.handleGetStatus.bind(this))
  .add("GET", "/api/sensors", this.handleGetSensors.bind(this))
  // ... 8 routes, easily extensible
```

### Request Resolution Order
1. CORS headers + OPTIONS preflight (204)
2. SSE `/api/events` (bypass router, long-lived connection)
3. API routes via MicroRouter (`/api/*`)
4. Static files (non-`/api/` paths fall through)
5. JSON 404/405 for unmatched API paths

### Body Size Protection
- 64KB max body size (413 Payload Too Large on overflow)
- Connection destroyed mid-stream on oversized bodies

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| `harness/src/engine/SensorHistory.ts` | Full file | Minimal implementation (push + query only) | Full ring buffer features (capacity config, snapshot API) deferred to 08-05 |
| `harness/src/index.ts` | 103-108 | Inline stub deps for spaceManager, eventBridge, packLoader, skillLog | Basic entry point does not use skill engine; stubs satisfy ControlServerDeps interface |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: dos | harness/src/comms/ControlServer.ts | New body size limit (64KB) mitigates POST body DoS. Previously no limit existed. |

## Self-Check: PASSED

All 7 created/modified files verified on disk. All 5 commit hashes verified in git log. TypeScript compiles with 0 errors. 114/114 tests pass.
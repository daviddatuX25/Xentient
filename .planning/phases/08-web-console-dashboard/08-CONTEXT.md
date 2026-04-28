---
phase: 8
name: Web Console + Dashboard
status: not_started
depends_on: [6, 7]
plans_total: 8
plans_complete: 0
hard_points: 8
---

# Phase 8: Web Console + Dashboard — Context

## Goal

Ship a fully operational Web Console as the operator's control surface for everything Core has built (Phases 1-7). This is the first time a human can **see and manage** Xentient through a browser instead of terminal logs.

## Key Architecture Decision: NOT Laravel (for v1)

The original spec (Phase 3 / WEB_CONTROL.md) called for Laravel + Livewire + Reverb. Revised because:

1. **ControlServer already exists** — serves static files, REST APIs, and SSE on port 3000.
2. **All data sources live in Core** — skills map, sensor cache, mode state, pack list, event bridge mappings, skill log.
3. **Adding Laravel introduces** a PHP runtime, MQTT client duplication, REST API contract, deployment coordination, and data sync problems.
4. **Operator's immediate need** is visibility and control — not RBAC, not MySQL, not Reverb WebSockets.

**Decision:** Build as single-page HTML/JS dashboard served by ControlServer. Laravel remains the path for Platform Track v2 (multi-user, VPS, audit log, persistent DB).

## What This Phase Delivers

- Dashboard Overview Panel (system status, sensor gauges, quick actions)
- Skill Manager Panel (CRUD, pack management, event mappings)
- Live Telemetry & Event Feed (sparklines, motion timeline, skill fire log)
- Mode & Space Control Panel (state machine viz, behavioral mode selector)
- Core REST API expansion (~15 new endpoints)
- SSE event expansion (8 new event types)
- ControlServer route table refactoring (zero-dependency micro-router)

## Dependency Map (Execution Waves)

- **Wave 1** (backend): 8-07 ControlServer Refactor → 8-01 REST API Expansion → 8-02 SSE Event Expansion
- **Wave 2** (frontend, parallel): 8-03 + 8-04 + 8-05 + 8-06
- **Wave 3** (validation): 8-08 Integration Testing + Polish

## Hard Points

| # | Hard Point | Why It's Hard |
|---|-----------|---------------|
| H1 | Zero-dependency route table for ControlServer | ~20 routes with path params, body validation, error handling |
| H2 | Dependency injection expansion | ControlServer currently receives 5 deps, adding 4 more |
| H3 | Trigger form builder | 7 trigger types × different fields = complex form |
| H4 | Sparkline rendering without charting library | Canvas/SVG rolling window with 200 data points, mobile perf |
| H5 | SSE reconnection + state recovery | EventSource auto-reconnects but loses events during disconnect |
| H6 | SpaceMode vs BehavioralMode UX clarity | Two "mode" concepts confuse operators |
| H7 | Historical data for sparklines on first load | SSE only pushes live; need seed data for charts |
| H8 | Sensor history ring buffer | Core only keeps latest sensor values, no history |

## What This Does NOT Include (Deferred to Platform v2)

- Laravel/Livewire, Multi-user auth/RBAC, MySQL/Postgres
- Reverb WebSocket, Audit log, Brain-adapter panels
- Pack upload via web, VPS deployment

## Success Criteria

1. Dashboard loads at `http://localhost:3000` with all 4 panels
2. Mode switch buttons work — badge updates within 200ms via SSE
3. Operator can register, update, enable/disable, remove skills from browser
4. Sensor gauges show live readings from BME280
5. Skill fire events appear in event feed within 1 tick
6. Escalation/conflict events displayed with priority color-coding
7. Pack switching works from UI — skill list updates
8. State machine diagram shows current mode and valid transitions
9. Dashboard reconnects after Core restart (SSE reconnection + state re-fetch)
10. Mobile responsive — functional on phone via tunnel URL

## Core Changes Required (Harness Side)

| File | Change |
|------|--------|
| `ControlServer.ts` | Route table refactor + new endpoints + new deps |
| `SpaceManager.ts` | Emit lifecycle events (skill_registered/removed/updated) |
| `PackLoader.ts` | Emit pack_loaded/pack_unloaded events |
| `SkillExecutor.ts` | Add getCounters() public method |
| `core.ts` | Pass new deps to ControlServer; wire lifecycle events → SSE |
| **NEW** `SensorHistory.ts` | Ring buffer for sensor readings (5min window) |
| `public/` | Dashboard HTML/CSS/JS files |

---
*Context defined: 2026-04-28*
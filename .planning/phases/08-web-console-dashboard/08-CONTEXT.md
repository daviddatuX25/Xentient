---
phase: 8
name: Web Console + Dashboard
status: complete
depends_on: [6, 7]
plans_total: 8
plans_complete: 8
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
- Core REST API expansion (~16 new endpoints + `/api/config`)
- SSE event expansion (9 new event types including `mode_change`)
- ControlServer route table refactoring (zero-dependency micro-router)
- History ring buffers: SensorHistory, MotionHistory, ModeHistory

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
| H4 | Sparkline rendering without charting library | Canvas `<canvas>` with rolling array, retina DPI, flat-line centering |
| H5 | SSE reconnection + state recovery | EventSource auto-reconnects but loses events during disconnect |
| H6 | SpaceMode vs BehavioralMode UX clarity | Two "mode" concepts confuse operators |
| H7 | Historical data for sparklines on first load | SSE only pushes live; need seed data for charts |
| H8 | Sensor history ring buffer | Core only keeps latest sensor values, no history |

## Design System

All frontend plans (08-03 through 08-06) follow `docs/xai-DESIGN.md` for visual decisions. Use the `frontend-design` skill for CSS implementation.

Key tokens (see individual plans for full mapping):
- Background: `#1f2228` (primary), `#0a0a0a` (deep overlays)
- Text: `#ffffff` (primary), `#7d8187` (secondary)
- Accent: `#2563eb` (interactive elements only)
- Font: universalSans (UI), GeistMono (code/data) — self-hosted WOFF2
- Border radius: pill (9999px) for CTAs, 24px for cards
- Elevation: gradient overlays + transparency, NO box-shadows
- Weight: 400 only — hierarchy via size + letter-spacing

Mode badge colors (exceptions to accent-blue-only rule — status indicators):
- sleep: `hsl(240, 60%, 55%)`, listen: `hsl(160, 60%, 45%)`, active: `hsl(40, 90%, 50%)`, record: `hsl(0, 70%, 55%)`

## Frontend Architecture

ES module structure (no build step):
```
harness/public/
├── index.html
├── dashboard.css
├── favicon.ico
├── fonts/
│   ├── universalSans-Regular.woff2
│   └── GeistMono-Regular.woff2
└── js/
    ├── main.js          (init, state, hash routing)
    ├── api.js           (REST API client)
    ├── sse.js           (SSE client + reconnection)
    ├── overview.js      (overview panel)
    ├── skills.js        (skill manager panel)
    ├── telemetry.js     (sparklines, event feed)
    ├── mode.js          (mode + space controls)
    └── components.js    (toast, skeleton, gauge, badge)
```

## Cross-Cutting Expansion Points

### Resolved (already exist from Phase 7 post-implementation):

| Blocker | Status | Evidence |
|---------|--------|----------|
| C1: SkillLog class doesn't exist | **RESOLVED** | `harness/src/engine/SkillLog.ts` exists, imported by SkillExecutor and SpaceManager |
| 1.1: SpaceManager.listSkills() missing | **RESOLVED** | `SpaceManager.ts:124` — iterates all executors, returns flat array |
| 2.3: EventBridge events missing | **RESOLVED** | `EventBridge.ts:217` emits `mappingAdded`, line 230 emits `mappingRemoved` |
| 2.1: broadcastSSE visibility | **RESOLVED** | `broadcastSkillEvent()` is already public (line 253). Plan: rename to `broadcastSSE` and make public. |

### Still Open (integrated into plans):

| ID | Issue | Resolution | Plans Affected |
|----|-------|-----------|---------------|
| 7.1 | `this` binding on handlers | All `.add()` calls use `.bind(this)` | 08-07 |
| 7.2 | Static file fallthrough | API route → SSE → static file → 404 ordering | 08-07 |
| 7.4 | Request body size limit | MAX_BODY_SIZE = 64KB, abort + 413 | 08-07 |
| 1.2 | PATCH field allowlist | Document forbidden vs patchable fields | 08-01 |
| 1.3 | POST skill collision | Return 409 Conflict | 08-01 |
| 1.4 | DELETE pack skills | Return 403 "Unload pack instead" | 08-01 |
| 1.5 | `/api/skills/log` vs `:id` collision | Rename to `/api/skill-log` | 08-01 |
| 6.4 | Frontend can't import TS constants | New `GET /api/config` endpoint | 08-01 |
| 2.2 | Counter interval wastes CPU | Start/stop interval based on collector-using skills | 08-02 |
| 2.4 | SSE event schema docs | New `sse-types.ts` type definitions | 08-02 |
| 5.4 | Motion event history | New `MotionHistory` ring buffer | 08-05 |
| 5.5 | Mode transition history | New `ModeHistory` ring buffer | 08-05 |
| 5.2 | Canvas retina DPI | `devicePixelRatio` handling in Sparkline | 08-05 |
| 5.3 | Sparkline flat-line centering | Center line at `h/2` when range=0 | 08-05 |
| 5.6 | Escalation context rendering | Collapsible `<details>` with JSON, skip camera | 08-05 |
| C2 | Design system mismatch | xai-DESIGN.md directive in all frontend plans | 08-03 to 08-06 |
| C3 | Single dashboard.js unmaintainable | ES module split, no build step | 08-03 to 08-06 |
| 3.3 | Font loading | Self-host WOFF2 with `font-display: swap` | 08-03 |
| 3.4 | Gauge sensor ranges | Temperature 0-50°C, Humidity 0-100%, Pressure 900-1100 hPa | 08-03 |
| 3.5 | Quick action feedback | Loading state → SSE confirm → timeout guard | 08-03 |
| 3.6 | Hash-based tab routing | `window.location.hash` + `hashchange` event | 08-03 |
| 3.7 | Loading skeleton | Gray placeholders on first load | 08-03 |
| 4.2 | Sorting implementation | Sort indicator arrows, toggle asc/desc | 08-04 |
| 4.3 | Detail drawer animation | `translateX(100%)` → `0`, Escape/overlay close | 08-04 |
| 4.4 | Form validation UX | Inline errors, red borders | 08-04 |
| 4.5 | Table scrolling | `max-height` + `overflow-y: auto` + sticky header | 08-04 |
| 4.6 | Delete confirmation | Inline "Confirm Delete" button for 3s | 08-04 |
| 6.2 | 08-06 too thin | Expanded with SVG generation, click handling, API integration | 08-06 |
| 6.3 | SVG click handling | Event delegation, cursor styles | 08-06 |
| 6.5 | Behavioral mode list | Hardcoded + from `/api/config` | 08-06 |
| 6.6 | Peripheral detection | Infer from last sensor timestamp <30s | 08-06 |
| 6.7 | Mode transition failure | Red flash on SVG node + toast explanation | 08-06 |
| 8.1 | SSE testing in Vitest | `eventsource` npm package, test REST→SSE flow | 08-08 |
| 8.2 | Lighthouse target | >70 (not >80), acceptable for v1 | 08-08 |
| 8.3 | Payload size target | <60KB HTML+CSS+JS, fonts excluded | 08-08 |
| 8.4 | Browser test automation | Deferred to Phase 9, manual tests sufficient for v1 | 08-08 |

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
11. Hash-based deep links work (`#skills`, `#telemetry`)
12. All visual elements follow `docs/xai-DESIGN.md` tokens
13. Invalid transitions show clear error feedback (red flash + toast)

## Core Changes Required (Harness Side)

| File | Change |
|------|--------|
| `ControlServer.ts` | Route table refactor + new endpoints + new deps + body size limit |
| `SpaceManager.ts` | Emit lifecycle events (skill_registered/removed/updated) |
| `PackLoader.ts` | Extend EventEmitter, emit pack_loaded/pack_unloaded |
| `SkillExecutor.ts` | Add getCounters() public method |
| `ModeManager.ts` | Emit mode_change event on transitions |
| `core.ts` | Pass new deps to ControlServer; wire lifecycle events → SSE; counter interval lifecycle |
| **NEW** `SensorHistory.ts` | Ring buffer for sensor readings (5min window) |
| **NEW** `MotionHistory.ts` | Ring buffer for PIR motion events (30min window) |
| **NEW** `ModeHistory.ts` | Ring buffer for mode transition intervals |
| **NEW** `sse-types.ts` | SSE event type definitions |
| `public/` | Dashboard HTML/CSS/JS/Fonts files |

---
*Context defined: 2026-04-28 | Hardened: 2026-04-28*
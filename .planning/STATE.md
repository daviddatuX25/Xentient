---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
last_updated: "2026-04-20T17:35:00Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 9
  completed_plans: 4
  percent: 44
---

# Project State: Xentient

## Project Reference

See: [.planning/PROJECT.md](file:///d:/Projects/Xentient/.planning/PROJECT.md) (updated 2026-04-19)

**Core value:** The IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room.
**Current focus:** Phase 5 — doc-architecture-refactor (plans 01-03 complete)

## Active Context

Phase 5 complete: all doc architecture refactor plans executed. ROADMAP.md rewritten with two-track structure (Demo Track + Platform Track P1-P9). PROJECT.md and REQUIREMENTS.md updated for bridge model. NOTES.md trimmed to append-only decision log. xentient.md shrunk to ~90-line L0 pitch. Phase 2 marked SUPERSEDED.

Quick task 260420-4do complete: ModeManager wired into Core runtime — MQTT mode/sensor events, idle timeouts (listen 60s, active 300s), PIR wake (sleep->listen), Pipeline mode-aware audio gating, LCD face display publishing on mode transitions. ModeManager now extends EventEmitter for mode change propagation. Pipeline drops audio in sleep, processes in active, buffers in listen.

## Milestone Status

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| V1 Prototype | 2026-04-24 | In Progress |

## Recent Decisions

- Bridge model adopted: Xentient = IoT terminal, not AI brain
- Three-tier architecture: Hardware / Core (Runtime + Web Control Panel) / AI Brain
- 4-layer doc system established (L0-L4)
- Phase 2 plans superseded by bridge reframe
- Two-track roadmap: Demo Track (frozen) + Platform Track (P1-P9)
- Brain Router: Core's dispatch layer routing handler calls across tiers
- Mem0 as primary memory layer (P2), Hermes as default brain (P1)
- Demo ships current harness as-is — no Platform Track code before Apr 24

## Roadmap Evolution

- Phase 5 added: Doc architecture refactor — restructure all docs to reflect bridge-model vision
- Phase 5 Plan 01 complete: VISION.md, NON_GOALS.md, HARDWARE.md, README.md created
- Phase 5 Plan 02 complete: CONTRACTS.md, PACKS.md, SPACES.md, INTEGRATIONS/*.md created
- Phase 5 Plan 03 complete: ROADMAP.md, PROJECT.md, REQUIREMENTS.md updated; NOTES.md trimmed; xentient.md shrunk; SUPERSEDED.md added

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 05 | 01 | 15 min | 2 | 4 |
| 05 | 02 | 20 min | 2 | 7 |
| 05 | 03 | 10 min | 2 | 7 |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260419-abs | PlatformIO firmware scaffold — Node Base I2C enumeration | 2026-04-19 | a83bb7a | [260419-abs-platformio-node-base](.planning/quick/260419-abs-platformio-node-base/) |
| 260420-lcd | LCD 16x2 I2C driver — Core Face A output | 2026-04-20 | 13353b6 | [260420-lcd-lcd-core-face-a](.planning/quick/260420-lcd-lcd-core-face-a/) |
| 260420-mqtt | MQTT pub/sub client + JSON telemetry protocol | 2026-04-20 | 1f959ab | [260420-mqtt-pub-sub-client](.planning/quick/260420-mqtt-pub-sub-client/) |
| 260420-4do | Mode Manager wired into Core | 2026-04-20 | d21750b | [260420-4do-xentient-ifd](.planning/quick/260420-4do-xentient-ifd/) |

---
*State updated: 2026-04-20 (after quick-260420-4do)*
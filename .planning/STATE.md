---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-04-28T20:30:00.000Z"
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 20
  completed_plans: 7
  percent: 35
---

# Project State: Xentient

## Project Reference

See: [.planning/PROJECT.md](file:///d:/Projects/Xentient/.planning/PROJECT.md) (updated 2026-04-19)

**Core value:** The IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room.
**Current focus:** Phase 7 (Skill Engine Hardening) planned — 5 plans written. Next: Execute 07-01 Gap Fixes.

## Active Context

Phase 1 (firmware), Phase 5 (docs), and Phase 6 (Xentient Layers) all complete. Platform Track P3 (ModeManager) and P4 (SpaceManager) built as part of Phase 6. CoreSkill types, SkillExecutor engine, SpaceManager, 8 MCP skill tools, observability notifications, core.ts wiring, and 34 Vitest tests — all committed and pushed.

Demo scope reduced: no furnished casing required — filming breadboard prototype as-is. P3-ASSY now covers breadboard assembly + validation only (no 3D-printed enclosure).

**Open bugs:** PIR wake not triggering ModeManager sleep→listen transition (9id, P0) — firmware ISR works, harness gap. Two P1 bugs deferred (bgx: dead MQTT sub, b94: audio prefix).

Quick task 260420-4do complete: ModeManager wired into Core runtime — MQTT mode/sensor events, idle timeouts (listen 60s, active 300s), PIR wake (sleep→listen), Pipeline mode-aware audio gating, LCD face display publishing on mode transitions.

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
- Demo scope reduced: breadboard prototype filming, no furnished casing required
- P3-ASSY merged with 03-07: single hardware assembly task, breadboard scope only
- Phase 6 complete: CoreSkill types, SkillExecutor, SpaceManager, MCP tools, core wiring, 34 tests — all waves shipped
- Phase 7 planned: 6 gaps identified (G1-G6), 5 plans written (07-01 through 07-05), 5 design decisions locked
- Phase 1 confirmed complete: firmware (MQTT, LCD, mic, VAD, WS audio, camera relay, BME280, PIR ISR) all built and validated
- Platform Track P3/P4 already built as part of Phase 6 (ModeManager + SpaceManager)
- Roadmap + beads audited and aligned with actual project state
- Phase 8 added: Web Console + Dashboard — single-page HTML/JS dashboard served by ControlServer (NOT Laravel for v1), 8 plans (08-01 through 08-08)

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
| 06 | 01-05 | ~3h | 5 waves | 10+ |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260419-abs | PlatformIO firmware scaffold — Node Base I2C enumeration | 2026-04-19 | a83bb7a | [260419-abs-platformio-node-base](.planning/quick/260419-abs-platformio-node-base/) |
| 260420-lcd | LCD 16x2 I2C driver — Core Face A output | 2026-04-20 | 13353b6 | [260420-lcd-lcd-core-face-a](.planning/quick/260420-lcd-lcd-core-face-a/) |
| 260420-mqtt | MQTT pub/sub client + JSON telemetry protocol | 2026-04-20 | 1f959ab | [260420-mqtt-pub-sub-client](.planning/quick/260420-mqtt-pub-sub-client/) |
| 260420-4do | Mode Manager wired into Core | 2026-04-20 | d21750b | [260420-4do-xentient-ifd](.planning/quick/260420-4do-xentient-ifd/) |

---
*State updated: 2026-04-28 (Phase 7 planned. 5 plans: 07-01 to 07-05. Next: Execute gap fixes.)*

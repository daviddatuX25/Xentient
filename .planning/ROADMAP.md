# Roadmap: Xentient

## Overview

Xentient is the IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room. Two tracks: **Demo Track** (frozen scope, through April 24) and **Platform Track** (post-capstone evolution, P1-P9).

## Demo Track (Frozen — Through Apr 24)

| Phase | Goal | Status |
|-------|------|--------|
| 1: Node Base & Comms | ESP32 firmware + MQTT telemetry | **Complete** (PIR wake bug 9id open) |
| 2: Harness & Intelligence | Voice pipeline + memory (SUPERSEDED by bridge reframe — see note below) | Superseded |
| 3: Web Console (Laravel demo cut) & Assembly | Laravel+Livewire+Reverb console + breadboard assembly | Not started |
| 4: Optimization & Demo Prep | Latency + prototype video demo | Not started |
| 5: Doc Architecture Refactor | Restructure docs to bridge model | Complete |
| 6: Xentient Layers | CoreSkill, SkillExecutor, SpaceManager, MCP tools | Complete |
| 7: Skill Engine Hardening | Gap fixes (G1-G6) + Pack Loader + Skill Persistence | **Complete** |
| 8: Web Console + Dashboard | Single-page HTML/JS dashboard served by ControlServer (NOT Laravel for v1) | Not started |

**Phase 2 Note:** **Phase 2 is SUPERSEDED.** The n8n-style orchestration vision has been replaced by the bridge model (see docs/VISION.md). The custom memory layer (MEM-01/02/03) will be replaced by Hermes+Mem0 integration in Platform Track P1-P2. Phase 2 deliverables that still ship in the demo (voice pipeline, MQTT bridge, basic memory) are carried forward as-is.

## Platform Track (Post-Capstone — Apr 25+)

| Phase | What | LOC Impact | Dependency |
|-------|------|-----------|------------|
| P1: Hermes Adapter | Replace custom LLM+memory loop with Hermes connection | -300 LOC, +80 LOC | Hermes installed |
| P2: Mem0 Integration | Add Mem0 as Hermes plugin + direct API fallback | +30 LOC | Mem0 Docker |
| P3: Mode Manager | sleep/listen/active/record state machine | **Built** in Phase 6 | None |
| P4: Space Manager | Space context + MQTT contract + permissions | **Built** in Phase 6 | P3 |
| P5: Pack Loader v2 | New handler types, space awareness | +60 LOC | P1, P4 |
| P6: Web Console (Laravel) — Full | Expand demo Laravel app: replace direct MQTT publishing with Core REST calls; add Pack/Space CRUD, permission/integration toggles, audit log, multi-user auth, brain-adapter panels (Hermes/Archon/OpenClaw), MySQL/Postgres migration, VPS deploy + artifact sync | +0 LOC to Core; ~3K LOC Laravel app | P3 (demo cut), P4, P5 |
| P7: Communication Bridge | REST/WS/MQTT bridge between Core and AI Brain tier | +100 LOC | P1 |
| P8: OpenClaw Adapter | Computer-use handler (sandboxed/remote machine) | +60 LOC | P5, P7 |
| P9: Archon Adapter | Basic YAML DAG workflow delegation | +50 LOC | P5, P7 |

## Phase Details

### Phase 1: Node Base & Comms Foundation
**Goal**: Establish the "always-on" hardware foundation and telemetry path.
**Depends on**: Nothing
**Requirements**: NODE-01, NODE-02, NODE-04, NODE-05
**Status**: **Complete.** Firmware built: main.cpp, mqtt_client, lcd_driver, i2s_mic, vad, ws_audio, cam_relay, bme_reader. PIR ISR attached (bug 9id: ModeManager doesn't transition sleep→listen on PIR — firmware side works, harness gap). Validation sketches passing.
**Success Criteria** (all met):
  1. Node Base detects peripherals via I2C (LCD 0x27, BME280 0x76).
  2. Voice Activity Detection triggers MQTT notification (trigger_pipeline source=voice).
  3. Sensor telemetry (Temp/Hum/Pressure) published to Mosquitto broker.
**Plans**: 3 plans (all done)
- [x] 01-01: PlatformIO environment + GPIO/Peripheral enumeration
- [x] 01-02: MQTT pub/sub client with retry and JSON protocol
- [x] 01-03: RMS-based Voice Activity Detection and audio chunking

### Phase 2: Harness & Intelligence Layer (SUPERSEDED)
**Goal**: ~~Build the n8n-style orchestration engine and Hermes-Agent memory.~~ Voice pipeline + MQTT bridge + basic memory. Superseded by bridge model — see SUPERSEDED.md in this directory.
**Depends on**: Phase 1
**Requirements**: HARN-01, HARN-02, HARN-03, HARN-04, MEM-01, MEM-02, MEM-03
**Status**: SUPERSEDED. Voice pipeline and MQTT bridge still ship in demo. Custom memory replaced by P1-P2.
**Plans**: 2 plans (superseded)
- [ ] 02-01: Orchestrate the voice pipeline (STT→LLM→TTS).
- [ ] 02-02: Implement SQLite/FTS5 Memory layer with proactive retrieval.

### Phase 3: Web Console (Demo Cut) & Breadboard Assembly
**Goal**: Ship the minimum-viable Laravel + Livewire Web Console plus breadboard prototype assembly (no furnished casing — filming prototype as-is).
**Depends on**: Phase 1 (MQTT contract + telemetry); Phase 2 voice pipeline (carried-forward parts)
**Requirements**: WEB-01, WEB-02, WEB-03, NODE-03, HW-PHYSICAL
**Stack note**: SvelteKit was the prior assumption — superseded by Laravel 12 + Livewire 3 + Reverb (see `docs/WEB_CONTROL.md` Tech Stack). Web Console is a **separate process** from Core, hosted on operator PC + cloudflared tunnel for demo.
**Success Criteria**:
  1. Web Console shows "Online" status + current mode per Node Base.
  2. Operator can switch modes (sleep/listen/active/record) from the Web Console — published via MQTT `mode_set`.
  3. Live telemetry (T2): RMS / sensor sparklines update via Reverb WebSocket as the room is active.
  4. Every voice interaction is recorded as an artifact (audio + transcript on local disk + DB row) and appears as a card in the Sessions feed with ▶ playback.
  5. Web-button trigger ("Run pipeline now") publishes synthetic trigger MQTT message as fallback to wake word.
  6. Breadboard prototype assembled, ESP-CAM UART link operational, power path validated. No furnished casing required.
**Plans**: 3 plans
- [ ] 03-01: Scaffold Laravel + Livewire + Reverb app on Laragon; wire php-mqtt/client; auth-free single-operator pages (Dashboard, Sessions, Telemetry).
- [ ] 03-02: Implement mode-switch + web-button-trigger via MQTT; Reverb-driven live telemetry charts; Sessions feed reading artifacts from Core's disk path.
- [ ] 03-03: Breadboard prototype assembly, ESP-CAM UART link, power path validation, cloudflared tunnel verified end-to-end.

### Phase 4: Optimization & Prototype Video Demo
**Goal**: Polish for prototype video demo — latency + walk-through script.
**Depends on**: Phase 3
**Requirements**: HW-PHYSICAL, WEB-03
**Success Criteria**:
  1. Audio round-trip latency (Silence to Speech) is <3 seconds.
  2. Prototype video demo script runs successfully on breadboard without rebooting the node.
**Plans**: 1 plan
- [ ] 04-01: Latency audit, error-handling polish, and prototype video demo script.

### Phase 5: Doc Architecture Refactor
**Goal**: Restructure all project documentation to reflect the bridge-model vision. Two-track roadmap: Demo Track (frozen) + Platform Track (P1-P9).
**Depends on**: Nothing (documentation-only)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07
**Success Criteria**:
  1. VISION.md exists with bridge model, integration tiers, Spaces/Modes primitives.
  2. CONTRACTS.md, PACKS.md, SPACES.md, HARDWARE.md, NON_GOALS.md all exist as L2 specs.
  3. README.md rewritten to 60-second pitch aligned with bridge model.
  4. ROADMAP.md updated with Demo Track (frozen) + Platform Track (P1-P9).
  5. NOTES.md trimmed to append-only decision log; platform/pack content extracted.
  6. All hardware decisions B1-B7 preserved verbatim in HARDWARE.md.
  7. Archon contradiction resolved (included as P9 in Platform Track, deferred in demo scope).
**Plans**: 3 plans
- [x] 05-01: Create VISION.md, NON_GOALS.md, HARDWARE.md, rewrite README.md
- [ ] 05-02: Create CONTRACTS.md, PACKS.md, SPACES.md, INTEGRATIONS/*.md
- [ ] 05-03: Rewrite ROADMAP.md, PROJECT.md, REQUIREMENTS.md; trim NOTES.md; shrink xentient.md; add SUPERSEDED marker; update STATE.md

### Phase 6: Xentient Layers
**Goal**: Implement the two-layer execution model (CoreSkill L1 + BrainSkill L2) from `docs/SPEC-xentient-layers.md`.
**Depends on**: Existing Core (`harness/src/`), SPEC-heartbeat-rule-engine.md architecture
**Requirements**: PT-03, PT-04
**Success Criteria**:
  1. `CoreSkill` types compile (`npx tsc --noEmit` exits 0).
  2. `SkillExecutor` starts on Core boot and logs `SkillExecutor started`.
  3. Registering a skill via `xentient_register_skill` MCP tool persists it to the heartbeat loop.
  4. An event-triggered skill fires within 1 tick of the matching event.
  5. An escalation-eligible skill sends `xentient/skill_escalated` notification to Brain.
  6. A conflict between two skills in the same `conflictGroup` sends `xentient/skill_conflict` to Brain.
  7. All Vitest suites pass: `npx vitest run` exits 0.
  8. Brain can call `xentient_list_skills` and see all registered skills with `fireCount` + state.
**Plans**: 5 plans
- [x] 06-01: CoreSkill, Space, Mode, SkillLog types (`shared/types.ts` + `contracts.ts`)
- [x] 06-02: SkillExecutor — tick loop, L1 actions, escalation pipeline, conflict detection
- [x] 06-03: SpaceManager + 8 MCP skill management tools (register/update/disable/remove/list/log/switch_mode/resolve_conflict)
- [x] 06-04: Wire SpaceManager into `core.ts` — default Space, MQTT forwarding, SSE relay
- [x] 06-05: Vitest tests for SkillLog, SkillExecutor, SpaceManager

### Phase 7: Skill Engine Hardening + Pack Integration
**Goal**: Close all Phase 6 gaps (G1–G6) and add Pack-based skill loading + persistence.
**Depends on**: Phase 6
**Requirements**: PT-03, PT-04
**Design Decisions**:
  - D1: Remove `_idle-sleep` (ModeManager owns idle→sleep; avoids infinite loop with _pir-wake)
  - D2: Mode triggers fire on SpaceMode (hardware state), not BehavioralMode
  - D3: Phase 8 (Dashboard) waits for Phase 3 (Laravel scaffold)
  - D4: Pack skill format = simplified subset, PackLoader expands to CoreSkill
  - D5: Counter auto-reset uses `DataCollector.resetAfterMs` (already typed, needs impl)
**Success Criteria**:
  1. `{ type: 'mode', from: 'sleep', to: 'listen' }` trigger fires on SpaceMode transition.
  2. `{ type: 'composite', all: [...] }` trigger evaluates all sub-triggers with AND logic.
  3. `modeFilter: 'student'` prevents skill from firing in non-matching behavioral mode.
  4. `_idle-sleep` removed; ModeManager idle timer sole owner of listen→sleep.
  5. DataCollector auto-collects + auto-resets counters after `resetAfterMs`.
  6. Custom MQTT topic → named event mappings registerable via MCP (no core.ts edits).
  7. Skills loaded from `packs/default/skills.json` appear in `xentient_list_skills`.
  8. Brain-registered skills persist across Core restart.
**Plans**: 5 plans
- [x] 07-01: Gap Fixes — mode triggers, composite evaluation, modeFilter, remove _idle-sleep, DataCollector
- [x] 07-02: Generic MQTT Event Bridge — configurable event routing, no hardcoding
- [x] 07-03: Pack Skill Loader — PackSkillManifest, Zod validation, hot-reload
- [x] 07-04: Skill Persistence — var/skills.json, brain skills survive restart
- [x] 07-05: Tests — Vitest for all gap fixes + EventBridge + PackLoader + Persistence

### Phase 8: Web Console + Dashboard
**Goal**: Ship a fully operational Web Console as the operator's control surface for everything Core has built (Phases 1-7). Single-page HTML/JS dashboard served by ControlServer (NOT Laravel for v1).
**Depends on**: Phase 6, Phase 7
**Design Decisions**:
  - D1: NOT Laravel for v1 — ControlServer serves static dashboard (avoids PHP runtime, MQTT duplication, data sync)
  - D2: Zero-dependency route table — micro-router in ControlServer (no Express/Hono import)
  - D3: Vanilla JS + CSS frontend — no React/Vue/Svelte (served as static files from public/)
  - D4: SSE for server→browser push — unidirectional sufficient; Reverb WebSocket deferred to Platform v2
  - D5: SensorHistory ring buffer — 5min window, 300 entries at 1/s, seeded on first load
  - D6: SpaceMode = "Hardware Mode", BehavioralMode = "Skill Profile" in UI labels (H6 disambiguation)
  - D7: REST API contract matches future Laravel consumption — nothing wasted when Platform v2 arrives
**Success Criteria**:
  1. Dashboard loads at `http://localhost:3000` with overview, skill manager, telemetry, and mode control panels.
  2. All 4 mode switch buttons work — mode badge updates within 200ms via SSE.
  3. Operator can register, update, enable/disable, and remove skills entirely from the browser.
  4. Sensor gauges show live temperature, humidity, and pressure readings from BME280.
  5. Skill fire events appear in the event feed within 1 tick of the skill firing.
  6. Escalation and conflict events are clearly displayed with priority color-coding.
  7. Pack switching works from the UI — skill list updates to reflect new pack's skills.
  8. State machine diagram shows current mode and valid transitions.
  9. Dashboard reconnects automatically after Core restart (SSE reconnection + state re-fetch).
  10. Mobile responsive — functional on a phone screen via tunnel URL.
**Plans**: 8 plans
- [ ] 08-01: Core REST API Expansion — ~15 new endpoints exposing Phase 6-7 subsystems
- [ ] 08-02: SSE Event Expansion — 8 new event types for real-time dashboard updates
- [ ] 08-03: Dashboard Overview Panel — system status, sensor gauges, active skills, quick actions
- [ ] 08-04: Skill Manager Panel — CRUD interface, pack management, event mappings
- [ ] 08-05: Live Telemetry & Event Feed — sparklines, motion timeline, skill fire log, escalation feed
- [ ] 08-06: Mode & Space Control Panel — state machine diagram, behavioral mode selector
- [ ] 08-07: ControlServer Refactoring — route table pattern, dependency injection, Zod validation
- [ ] 08-08: Integration Testing + Polish — E2E verification, loading states, error toasts, keyboard nav

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Node Base & Comms | 3/3 | **Complete** | 01-01, 01-02, 01-03 |
| 2. Harness & Intel | 0/2 | Superseded | - |
| 3. Web & Assembly | 0/3 | Not started | - |
| 4. Optimization | 0/1 | Not started | - |
| 5. Doc Refactor | 3/3 | Complete | 05-01, 05-02, 05-03 |
| 6. Xentient Layers | 5/5 | Complete | 06-01 through 06-05 |
| 7. Skill Engine Hardening | 5/5 | Complete | 07-01 through 07-05 |
| 8. Web Console + Dashboard | 0/8 | Not started | - |

## Document Architecture

| Layer | Docs | Purpose |
|-------|------|---------|
| L0 Pitch | README.md, xentient.md | 60-second pitch and narrative |
| L1 Vision | docs/VISION.md, docs/NON_GOALS.md | Bridge model and boundaries |
| L2 Spec | docs/CONTRACTS.md, docs/PACKS.md, docs/SPACES.md, docs/HARDWARE.md, docs/INTEGRATIONS/*.md, .planning/*.md | Implementation-ready references |
| L3 Phase | .planning/phases/*/ | Per-phase research, plans, reviews |
| L4 Ops | NOTES.md, CLAUDE.md, AGENTS.md | Decision log and agent instructions |

---
*Roadmap defined: 2026-04-13*
*Last updated: 2026-04-28 — Phase 8 added (Web Console + Dashboard, 8 plans). Phase 1+5+6+7 complete. Next: Phase 8 planning.*
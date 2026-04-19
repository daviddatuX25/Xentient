# Roadmap: Xentient

## Overview

Xentient is the IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room. Two tracks: **Demo Track** (frozen scope, through April 24) and **Platform Track** (post-capstone evolution, P1-P9).

## Demo Track (Frozen — Through Apr 24)

| Phase | Goal | Status |
|-------|------|--------|
| 1: Node Base & Comms | ESP32 firmware + MQTT telemetry | Not started |
| 2: Harness & Intelligence | Voice pipeline + memory (SUPERSEDED by bridge reframe — see note below) | Superseded |
| 3: Web Console (Laravel demo cut) & Assembly | Laravel+Livewire+Reverb console (mode switch, session feed, T2 telemetry) on Laragon + cloudflared tunnel; final hardware assembly | Not started |
| 4: Optimization & Demo Prep | Latency + demo narrative | Not started |
| 5: Doc Architecture Refactor | Restructure docs to bridge model | In progress |

**Phase 2 Note:** **Phase 2 is SUPERSEDED.** The n8n-style orchestration vision has been replaced by the bridge model (see docs/VISION.md). The custom memory layer (MEM-01/02/03) will be replaced by Hermes+Mem0 integration in Platform Track P1-P2. Phase 2 deliverables that still ship in the demo (voice pipeline, MQTT bridge, basic memory) are carried forward as-is.

## Platform Track (Post-Capstone — Apr 25+)

| Phase | What | LOC Impact | Dependency |
|-------|------|-----------|------------|
| P1: Hermes Adapter | Replace custom LLM+memory loop with Hermes connection | -300 LOC, +80 LOC | Hermes installed |
| P2: Mem0 Integration | Add Mem0 as Hermes plugin + direct API fallback | +30 LOC | Mem0 Docker |
| P3: Mode Manager | sleep/listen/active/record state machine | +60 LOC | None |
| P4: Space Manager | Space context + MQTT contract + permissions | +100 LOC | P3 |
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
**Success Criteria**:
  1. Node Base detects a peripheral in slot 4 via I2C.
  2. Voice Activity Detection (RMS) triggers an MQTT notification.
  3. Sensor telemetry (Temp/Hum) is published to the local Mosquitto broker.
**Plans**: 3 plans
- [ ] 01-01: Setup PlatformIO environment and GPIO/Peripheral enumeration logic.
- [ ] 01-02: Implement MQTT pub/sub client with retry and JSON protocol logic.
- [ ] 01-03: Implement RMS-based Voice Activity Detection and audio chunking.

### Phase 2: Harness & Intelligence Layer (SUPERSEDED)
**Goal**: ~~Build the n8n-style orchestration engine and Hermes-Agent memory.~~ Voice pipeline + MQTT bridge + basic memory. Superseded by bridge model — see SUPERSEDED.md in this directory.
**Depends on**: Phase 1
**Requirements**: HARN-01, HARN-02, HARN-03, HARN-04, MEM-01, MEM-02, MEM-03
**Status**: SUPERSEDED. Voice pipeline and MQTT bridge still ship in demo. Custom memory replaced by P1-P2.
**Plans**: 2 plans (superseded)
- [ ] 02-01: Orchestrate the voice pipeline (STT→LLM→TTS).
- [ ] 02-02: Implement SQLite/FTS5 Memory layer with proactive retrieval.

### Phase 3: Web Console (Demo Cut) & Hardware Assembly
**Goal**: Ship the minimum-viable Laravel + Livewire Web Console plus complete physical assembly.
**Depends on**: Phase 1 (MQTT contract + telemetry); Phase 2 voice pipeline (carried-forward parts)
**Requirements**: WEB-01, WEB-02, WEB-03, NODE-03, HW-PHYSICAL
**Stack note**: SvelteKit was the prior assumption — superseded by Laravel 12 + Livewire 3 + Reverb (see `docs/WEB_CONTROL.md` Tech Stack). Web Console is a **separate process** from Core, hosted on operator PC + cloudflared tunnel for demo.
**Success Criteria**:
  1. Web Console shows "Online" status + current mode per Node Base.
  2. Operator can switch modes (sleep/listen/active/record) from the Web Console — published via MQTT `mode_set`.
  3. Live telemetry (T2): RMS / sensor sparklines update via Reverb WebSocket as the room is active.
  4. Every voice interaction is recorded as an artifact (audio + transcript on local disk + DB row) and appears as a card in the Sessions feed with ▶ playback.
  5. Web-button trigger ("Run pipeline now") publishes synthetic trigger MQTT message as fallback to wake word.
  6. Hardware physically assembled, ESP-CAM UART link operational, power path validated.
**Plans**: 3 plans
- [ ] 03-01: Scaffold Laravel + Livewire + Reverb app on Laragon; wire php-mqtt/client; auth-free single-operator pages (Dashboard, Sessions, Telemetry).
- [ ] 03-02: Implement mode-switch + web-button-trigger via MQTT; Reverb-driven live telemetry charts; Sessions feed reading artifacts from Core's disk path.
- [ ] 03-03: Final hardware assembly, ESP-CAM UART link, power path validation, cloudflared tunnel verified end-to-end.

### Phase 4: Optimization & Demo Prep
**Goal**: Professional polish for the April 24 presentation.
**Depends on**: Phase 3
**Requirements**: HW-PHYSICAL, WEB-03
**Success Criteria**:
  1. Audio round-trip latency (Silence to Speech) is <3 seconds.
  2. The demo script runs successfully without "rebooting" the node.
**Plans**: 1 plan
- [ ] 04-01: Latency audit, error-handling polish, and demo narrative synchronization.

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

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Node Base & Comms | 0/3 | Not started | - |
| 2. Harness & Intel | 0/2 | Superseded | - |
| 3. Web & Assembly | 0/2 | Not started | - |
| 4. Optimization | 0/1 | Not started | - |
| 5. Doc Refactor | 1/3 | In progress | 05-01 |

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
*Last updated: 2026-04-19 — Phase 5 added, two-track structure, bridge model reframe*
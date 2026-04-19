# Roadmap: Xentient

## Overview

Xentient is the IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room. Two tracks: **Demo Track** (frozen scope, through April 24) and **Platform Track** (post-capstone evolution, P1-P9).

## Demo Track (Frozen — Through Apr 24)

| Phase | Goal | Status |
|-------|------|--------|
| 1: Node Base & Comms | ESP32 firmware + MQTT telemetry | Not started |
| 2: Harness & Intelligence | Voice pipeline + memory (SUPERSEDED by bridge reframe — see note below) | Superseded |
| 3: Web-Control & Assembly | Dashboard + hardware assembly | Not started |
| 4: Optimization & Demo Prep | Latency + demo narrative | Not started |
| 5: Doc Architecture Refactor | Restructure docs to bridge model | In progress |

**Phase 2 Note:** The "n8n-style orchestration" vision for Phase 2 has been superseded by the bridge model. The custom memory layer (MemoryDB/FactExtractor/MemoryInjector) will be replaced by Hermes+Mem0 integration in Platform Track P1-P2. Phase 2 deliverables that still ship in the demo (voice pipeline, MQTT bridge, basic memory) are carried forward as-is.

## Platform Track (Post-Capstone — Apr 25+)

| Phase | What | LOC Impact | Dependency |
|-------|------|-----------|------------|
| P1: Hermes Adapter | Replace custom LLM+memory loop with Hermes connection | -300 LOC, +80 LOC | Hermes installed |
| P2: Mem0 Integration | Add Mem0 as Hermes plugin + direct API fallback | +30 LOC | Mem0 Docker |
| P3: Mode Manager | sleep/listen/active/record state machine | +60 LOC | None |
| P4: Space Manager | Space context + MQTT contract + permissions | +100 LOC | P3 |
| P5: Pack Loader v2 | New handler types, space awareness | +60 LOC | P1, P4 |
| P6: Communication Bridge | REST/WS/MQTT bridge to AI brain layer | +100 LOC | P1 |
| P7: OpenClaw Adapter | Computer-use handler | +60 LOC | P5 |
| P8: Archon Adapter | Basic YAML DAG workflow delegation | +50 LOC | P5 |
| P9: Communication Bridge | REST/WS/MQTT bridge to AI brain layer | +100 LOC | P1 |

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

### Phase 3: Web-Control & Hardware Assembly
**Goal**: Visual management and physical completion of the prototype.
**Depends on**: Phase 2
**Requirements**: WEB-01, WEB-02, WEB-03, NODE-03, HW-PHYSICAL
**Success Criteria**:
  1. Web App shows "Online" status for the Node Base.
  2. Camera frames from Node Camera (UART) are visible in the Web Dashboard.
  3. Visual flow editor successfully updates the active Harness logic.
**Plans**: 2 plans
- [ ] 03-01: Develop SvelteKit Control Dashboard with MQTT/Websocket bridge.
- [ ] 03-02: Final hardware assembly, ESP-CAM UART link, and power path validation.

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
  4. ROADMAP.md updated with Demo Track (frozen) + Platform Track (P1-P8).
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
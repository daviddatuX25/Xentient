# Roadmap: Xentient

## Overview
Xentient V1 is building a "Prima Node" prototype: modular hardware orchestrated by a visual intelligence engine (Harness). This roadmap takes us from firmware foundations to a fully functional space-agent by April 24.

## Phases

- [ ] **Phase 1: Node Base & Comms Foundation** - Establish PlatformIO firmware and MQTT data protocol.
- [ ] **Phase 2: Harness & Intelligence Layer** - Build the n8n-style orchestration engine and Hermes-Agent memory.
- [ ] **Phase 3: Web-Control & Hardware Assembly** - Develop the management UI and physically assemble the V1 prototype.
- [ ] **Phase 4: Optimization & Demo Prep** - Final tune-up of latency, reliability, and narrative for the presentation.

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

### Phase 2: Harness & Intelligence Layer
**Goal**: Build the brain that processes audio, vision, and sensors.
**Depends on**: Phase 1
**Requirements**: HARN-01, HARN-02, HARN-03, HARN-04, MEM-01, MEM-02, MEM-03
**Success Criteria**:
  1. Harness receives an audio chunk and returns a Cloud-API-generated response.
  2. Hermes-Agent memory persists a user's name across sessions.
  3. Proactive context injection successfully modifies the LLM prompt based on history.
**Plans**: 2 plans
- [ ] 02-01: Orchestrate the n8n-style Node.js processing pipeline (STT -> LLM -> TTS).
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

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Node Base & Comms | 0/3 | Not started | - |
| 2. Harness & Intel | 0/2 | Not started | - |
| 3. Web & Assembly | 0/2 | Not started | - |
| 4. Optimization | 0/1 | Not started | - |

---
*Roadmap defined: 2026-04-13*
*Last updated: 2026-04-13 after initialization*

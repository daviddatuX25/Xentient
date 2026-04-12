# Requirements: Xentient

**Defined:** 2026-04-13
**Core Value:** Modular, zero-friction spatial intelligence through a visual control plane and high-speed AI orchestration.

## v1 Requirements

Requirements for the April 24 Prototype.

### Node Hardware & Firmware
- [ ] **NODE-01**: ESP32 core detects peripherals via I2C/EEPROM ID.
- [ ] **NODE-02**: RMS-based VAD (Voice Activity Detection) notifies Harness of speech start/end.
- [ ] **NODE-03**: Camera frames forwarded from ESP32-CAM via UART1/2 to Node Base at >5fps.
- [ ] **NODE-04**: Bi-directional MQTT communication for sensor telemetry and control commands.
- [ ] **NODE-05**: Reliable GPIO mapping for all 4 slots (Listen, Speak, Sense, Sight).

### Harness Intelligence Engine
- [ ] **HARN-01**: n8n-style modular processing pipeline (Trigger -> STT -> Logic -> TTS -> Output).
- [ ] **HARN-02**: Mosquitto-based central message brokerage with separate channels for audio/frames/sensors.
- [ ] **HARN-03**: Integration of Cloud LLM APIs (GPT-4o / Gemini 1.5 Pro) for high-speed reasoning.
- [ ] **HARN-04**: Real-time audio ingestion and TTS generation with low latency (<2s round-trip).

### Memory (Hermes-Agent)
- [ ] **MEM-01**: Persistent user profile and context stored in SQLite/FTS5.
- [ ] **MEM-02**: Proactive memory retrieval (LLM reviews history to inject context into current prompt).
- [ ] **MEM-03**: Cross-session identification and greeting based on persistent user model.

### Web Control Plane
- [ ] **WEB-01**: Dashboard showing live heartbeat status of Node Base and Peripherals.
- [ ] **WEB-02**: Visual flow editor to configure "Modes" (Query Mode vs. Workflow Mode).
- [ ] **WEB-03**: Activity log viewer showing processed triggers and AI responses.

## v2 Requirements (Deferred)
- **MESH-01**: Multi-node coordination and spatial presence detection.
- **LOCAL-01**: Fully local LLM/Voice stack (Ollama/Whisper/Piper) on edge server.
- **OTA-01**: Over-the-air firmware updates for Node Base base.

## Out of Scope
| Feature | Reason |
|---------|--------|
| On-node Audio DSP | ESP32 limited processing; STT offloaded to Harness for V1 stability. |
| Custom Case Design | Focus on functional assembly first; parametric enclosure for V1. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NODE-01 | Phase 1 | Pending |
| NODE-02 | Phase 1 | Pending |
| NODE-04 | Phase 1 | Pending |
| HARN-01 | Phase 2 | Pending |
| HARN-02 | Phase 2 | Pending |
| MEM-01 | Phase 2 | Pending |
| WEB-01 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 7 (Initial mapping)
- Unmapped: 8 (Remaining hardware assembly and presentation)

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after initial definition*

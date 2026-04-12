# Xentient

## What This Is

Xentient is a modular IoT hardware and intelligence platform that transforms physical spaces into agentic environments. It consists of the **Prima Node** (a versatile hardware base with plug-and-play peripherals) and the **Harness** (an n8n-inspired visual execution engine managed via a central Web App) that orchestrates high-performance Cloud LLMs and proactive memory.

## Core Value

Modular, zero-friction spatial intelligence through a visual control plane and high-speed AI orchestration.

## Requirements

### Validated

- ✓ **ARCH-V1**: Finalized V1 Technical Specification (Web App Control, Node Base/Peripheral split)
- ✓ **COMMS-V1**: MQTT-based transport protocol for hardware-to-harness communication
- ✓ **MODEL-V1**: Committed to Cloud LLM APIs for V1 performance

### Active

- [ ] **NODE-BASE**: Implement ESP32 PlatformIO firmware with UART peripheral forwarding
- [ ] **HARNESS-CORE**: Build the n8n-style visual workflow engine for data routing
- [ ] **MEMORY-HERMES**: Integrate Hermes-Agent proactive memory (FTS5 + persistent user models)
- [ ] **WEB-CONTROL**: Develop the management UI for hardware status and workflow configuration
- [ ] **HW-PHYSICAL**: Assemble the physical Prima Node V1 prototype with functional peripherals

### Out of Scope

- **Local LLMs (Ollama)**: Deferred for V1 to ensure snappy user experience.
- **Dynamic Firmware Modes**: Logic resides in the Harness; Node Base firmware remains static and modular.
- **Multi-Node Mesh**: V1 is a single-node prototype.
- **On-device Speech-to-Text**: STT is offloaded to Harness/Cloud for V1 accuracy.

## Context

Xentient is currently in the V1 prototyping phase with a hard deadline of April 24, 2026. The architecture emphasizes "dumb hardware" (Node Base) and "heavy intelligence" (Harness/Cloud) to maximize development speed and reliability. 

## Constraints

- **Timeline**: Prototype presentation on April 24, 2026.
- **Transport**: All data flows over MQTT (Mosquitto).
- **Communication**: Camera frames are passed via UART to the Node Base, then MQTT.
- **Frameworks**: SvelteKit (Web App), PlatformIO/Arduino (Firmware), Node.js (Harness).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web App Control Plane | Centralized management of "modes" without firmware reflashing. | — Pending |
| Hermes Memory Pattern | Improved contextual awareness via FTS5 and proactive retrieval. | — Pending |
| Cloud LLM Mandatory | Local execution too slow for interactive prototype throughput requirements. | — Pending |
| UART Camera Path | ESP-CAM frames routed via Node Base to minimize WiFi interference. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-13 after initialization*

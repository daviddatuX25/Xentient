# SUPERSEDED — Bridge Model Reframe

**Date:** 2026-04-19
**Reason:** The "n8n-style orchestration" vision for Phase 2 has been superseded by the bridge model (Xentient = IoT terminal, not AI brain). The custom memory layer (MemoryDB/FactExtractor/MemoryInjector) will be replaced by Hermes+Mem0 integration in Platform Track P1-P2.

**What changed:**
- Phase 2 was originally scoped as "Build the n8n-style orchestration engine and Hermes-Agent memory"
- The bridge reframe means Xentient no longer builds the AI brain — it delegates to Hermes/Mem0/OpenClaw/Archon
- The voice pipeline (STT→LLM→TTS), MQTT bridge, and basic memory still ship in the demo
- Custom memory code (memory/ directory) will be deleted post-demo and replaced by thin adapters

**What still ships in the demo:**
- Voice pipeline (STT→LLM→TTS streaming)
- MQTT hardware bridge + VAD
- Basic memory (MemoryDB/FactExtractor/MemoryInjector — temporary, replaced in P1-P2)
- LCD display (B7)

**What moved to Platform Track (P1-P9):**
- P1: Hermes Adapter (replaces custom LLM+memory loop)
- P2: Mem0 Integration (replaces MemoryDB/FactExtractor/MemoryInjector)
- P3-P9: Mode Manager, Space Manager, Pack Loader v2, Web Control Panel (Core Face B), Communication Bridge, OpenClaw, Archon

**Reference:** See docs/VISION.md for the full bridge model architecture and migration path.
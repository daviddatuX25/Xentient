---
phase: 02
reviewers: [antigravity-self-review]
reviewed_at: 2026-04-13T05:33:00Z
plans_reviewed: [02-01-PLAN.md, 02-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 02

## Antigravity Review

**Summary**
The plans present a mature, production-ready architecture. The pivot to dual-protocol (WebSocket for media, MQTT for telemetry) is highly appropriate for the ESP32 constraints. The Archon-inspired Transform stream pipeline and the Hermes-Agent 3-tier memory system with a "Thinking Step" are excellent paradigms for building a robust, context-aware V1 assistant.

**Strengths**
- Clear segregation of data transport (WebSockets avoiding MQTT audio jitter).
- Use of Node.js Transform streams for the pipeline represents an efficient, non-blocking data flow.
- Separation of abstract provider interfaces (`STTProvider`, etc.) prevents lock-in.
- Usage of SQLite `WAL` mode and `FTS5` is perfectly tailored for sub-millisecond retrieval.
- "Thinking Step" properly routes candidate memories through a low-temperature filter, protecting the primary LLM context window.

**Concerns**
- **Unbounded Audio Buffer (HIGH):** The pipeline buffers raw audio until a `vad_end` event is received. If the sensor is in a noisy environment or VAD logic fails, this buffer will grow indefinitely, risking an Out-Of-Memory (OOM) crash in Node.js.
- **WebSocket Reconnection & State (MEDIUM):** Network drops during a stream could leave the pipeline in a hung `isProcessing` state, preventing subsequent utterances from being processed.
- **API Rate Limiting & Costs (MEDIUM):** Asynchronous fact extraction runs after *every* turn. Rapid, noisy turns could hammer the LLM API, leading to high costs and 429 rate limit errors.

**Suggestions**
- Add a safety timeout or maximum buffer byte size to `AudioReceiver.ts` (e.g., force a VAD-end if buffering exceeds 45 seconds).
- Add circuit breakers for the `FactExtractor` (e.g., only run if turn length > N words, or batch extractions every X minutes).
- Implement explicit teardown/cleanup of audio buffers if a WebSocket disconnection event is detected.

**Risk Assessment**
**MEDIUM.** The core architecture is completely sound and leverages the correct technologies. The primary risks lie in the operational realities of hardware interaction—specifically edge cases around network stability, noisy microphones failing to trigger VAD ends, and uncontrolled API sprawl.

---

## Consensus Summary

The overarching consensus is that the architectural decisions (Node streams, dual-protocol, FTS5) are exceptionally strong. However, defensive programming must be applied to network boundaries and memory limits.

### Agreed Strengths
- High-performance, modular pipeline design.
- Excellent architectural choices for context retrieval (Thinking Step).
- Strict interface boundaries for AI providers.

### Agreed Concerns
- Risk of OOM from unbounded audio buffering if VAD fails.
- Lack of explicit error recovery state resets in the pipeline.

### Recommendations for Planner
Apply the `--reviews` flag to the planner to incorporate:
1. Max buffer size limits in Pipeline.ts.
2. Fact extractor debouncing/batching.

# Roadmap: Xentient

## Overview

Xentient is the room that thinks — a hardware terminal that any AI brain can inhabit. Two tracks: **Demo Track** (complete) and **Platform Track** (Phases 9-15).

## Progress

| Phase | What | Status | Done When |
|-------|------|--------|-----------|
| 1 | Node Base & Comms | **Complete** | Firmware built, MQTT telemetry passing |
| 2 | Harness & Intelligence | **Superseded** | Voice pipeline carried forward, custom memory replaced |
| 3 | Web Console & Assembly | **Superseded** | Phase 8 Dashboard replaces Laravel for v1 |
| 4 | Optimization & Demo Prep | **Superseded** | Merged into Phase 8 |
| 5 | Doc Architecture Refactor | **Complete** | Bridge model docs in place |
| 6 | Xentient Layers | **Complete** | CoreSkill, SkillExecutor, SpaceManager, MCP tools |
| 7 | Skill Engine Hardening | **Complete** | Gap fixes (G1-G6) + Pack Loader + Persistence |
| 8 | Web Console + Dashboard | **Complete** | ControlServer dashboard, SSE, mode control |
| 9 | Pipeline.ts migration | **Not started** | brain-basic processes voice escalation end-to-end via MCP; Core's Pipeline.ts deleted |
| 10 | 4-layer voice CoreSkill pipeline | **Not started** | All four CoreSkills fire in sequence on audio input and escalate to Brain on keyword detection |
| 11 | L0 Node Skills | **Not started** | Core pushes Node Skill to ESP32 via MQTT, ESP32 acks, both halves produce coordinated behavior |
| 12 | Brain Feed | **Not started** | Brain reasoning tokens appear in Dashboard SSE stream in real time |
| 13 | Brain Interface formalization | **Not started** | A minimal Brain script can connect, receive escalations, stream reasoning, and call tools via documented interface |
| 14 | Hermes wiring | **Not started** | Hermes processes voice escalation with memory recall, LLM reasoning, and tool calls visible in Brain Feed |
| 15 | Deployment config | **Not started** | `docker compose up` starts Core + Brain, Brain connects via MCP, voice pipeline works end-to-end |

**Note on Phases 9 and 10:** These are sequential in their starts but can overlap in execution. Begin Phase 10 CoreSkill development once brain-basic proves Channel 1 and 3 work, before Pipeline.ts is deleted. The four-layer CoreSkills feed into the same escalation path being validated in Phase 9.

## Platform Track Detail

### Phase 9: Pipeline.ts Migration
**Goal:** Move STT/LLM/TTS out of Core. Core keeps only Layers 1-4 (noise gate through command capture). The Brain handles the intelligence.
**Depends on:** Phase 8 (Dashboard complete)
**Approach:** Migration, not deletion. Run both Pipeline.ts and brain-basic in parallel until Brain Channel 1 and 3 are confirmed working end-to-end. Cutover point: brain-basic can receive an escalation, call STT/LLM/TTS, and call `xentient_play_audio` successfully. Then Pipeline.ts gets removed.

### Phase 10: 4-Layer Voice CoreSkill Pipeline
**Goal:** noise-gate, voice-classifier, keyword-spotter, command-capture as proper CoreSkills with escalation config.
**Depends on:** Phase 9 (brain-basic proves escalation works)
**Can start overlap:** Once brain-basic proves Channel 1 and 3, before Pipeline.ts is deleted.

### Phase 11: L0 Node Skills
**Goal:** NodeSkill type, MQTT push/ack contract, firmware Mode Task loader, paired activation with CoreSkills, first example skills.
**Depends on:** Phase 7 (Skill Engine)

### Phase 12: Brain Feed
**Goal:** `xentient_brain_stream` MCP tool, SSE relay to Dashboard, live reasoning display.
**Depends on:** Phase 9 (Brain can connect to Core)

### Phase 13: Brain Interface Formalization
**Goal:** `brain/index.ts` three-channel reference implementation, formal escalation schema, stream protocol, tool contract.
**Depends on:** Phase 12 (Brain Feed streaming works)

### Phase 14: Hermes Wiring
**Goal:** `brain/hermes/HermesAdapter.ts`. Make Hermes the reference Brain for the escalated voice pipeline.
**Depends on:** Phase 13 (formal Brain Interface)

### Phase 15: Deployment Config
**Goal:** Docker Compose: Core container + Brain container. Same-host or separate-host.
**Depends on:** Phase 14 (Hermes processes escalations)

## Document Architecture

| Layer | Docs | Purpose |
|-------|------|---------|
| L0 Pitch | README.md | 60-second pitch |
| L1 Vision | CONTEXT.md | Single authoritative direction document |
| L2 Spec | ARCHITECTURE.md, BRAIN-INTERFACE.md, NODE-SKILLS.md, SKILLS.md, CONTRACTS.md, HARDWARE.md, PACKS.md, SPACES.md | Implementation-ready references |
| L3 Phase | .planning/phases/ | Per-phase research, plans, reviews |
| L4 Ops | CLAUDE.md | Agent instructions |

## Archived Docs

Pre-2026-04-30 docs are in `docs/_archive/`. The ROADMAP was archived as `docs/_archive/ROADMAP-pre-2026-04-30.md`.

---
*Roadmap defined: 2026-04-13*
*Rewritten: 2026-04-30 — Phase 8 complete, Phases 9-15 added, Demo Track consolidated*
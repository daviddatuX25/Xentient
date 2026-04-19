# Phase 5 Research: Doc Architecture Refactor

**Created:** 2026-04-19
**Status:** Not started

## Context

The project vision has shifted from "n8n-style visual orchestration engine" to "IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room." This reframe (documented in `docs/repurpose.md`) has not propagated to the project's formal documentation:

- `ROADMAP.md` still describes "n8n-style orchestration" and Hermes memory as core requirements
- `PROJECT.md` still says "visual control plane"
- `REQUIREMENTS.md` lists MEM-01/02/03 as custom memory requirements that will be delegated to Mem0
- `NOTES.md` mixes dated decision logs with platform vision and SDK specs
- `xentient.md` (647 lines) conflates pitch, spec, and timeline

## Problems Identified

1. **Vision drift:** 5 of 7 formal docs describe the old vision
2. **NOTES.md bloat:** Mixes B1–B7 locked decisions with post-demo platform specs that belong in their own docs
3. **Archon contradiction:** NOTES.md says "skip Archon"; repurpose.md adds it back as P7
4. **memory/ deletion risk:** repurpose.md says DELETE memory/ wholesale, but basic mode needs a fallback store
5. **No single source of truth:** Hardware decisions, contracts, and pack specs are scattered across NOTES.md, repurpose.md, and phase plans

## Proposed Document Architecture

| Layer | Doc | One Job |
|-------|-----|---------|
| L0 Pitch | `README.md` | 60-second "what is this" for first-time readers |
| L0 Pitch | `xentient.md` | Long-form narrative pitch (shrunken from 647→~200 lines) |
| L1 Vision | `docs/VISION.md` | Bridge model, integration tiers, Spaces/Modes primitives |
| L1 Vision | `docs/NON_GOALS.md` | Explicit "what Xentient is NOT" list |
| L2 Spec | `.planning/PROJECT.md` | Mission, stakeholders, success criteria |
| L2 Spec | `.planning/REQUIREMENTS.md` | R1…Rn requirements tagged by phase |
| L2 Spec | `.planning/ROADMAP.md` | Two-track: Demo (→Apr 24) + Platform (P1–P8) |
| L2 Spec | `.planning/STATE.md` | Rolling "where are we now" |
| L2 Spec | `docs/CONTRACTS.md` | Wire contracts, MQTT topics, message schemas |
| L2 Spec | `docs/HARDWARE.md` | B1–B7 locked decisions, BOM, enclosures |
| L2 Spec | `docs/PACKS.md` | Pack folder spec, manifest, handlers, lifecycle |
| L2 Spec | `docs/SPACES.md` | Space model, Mode state machine, integration tiers |
| L2 Spec | `docs/INTEGRATIONS/hermes.md` | Hermes adapter contract |
| L2 Spec | `docs/INTEGRATIONS/mem0.md` | Mem0 wiring + fallback |
| L2 Spec | `docs/INTEGRATIONS/openclaw.md` | OpenClaw sidecar contract |
| L3 Phase | `.planning/phases/NN-slug/` | Per-phase RESEARCH/PLAN/REVIEW |
| L4 Ops | `NOTES.md` | Append-only dated decision log only |
| L4 Ops | `CLAUDE.md` / `AGENTS.md` | Agent working instructions |

## Key Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **memory/ dir** | Delegate to Mem0 as main | Custom MemoryDB/FactExtractor/MemoryInjector deleted; Mem0 becomes primary memory layer with basic-mode fallback via direct API |
| **Archon** | Include with basic workflow | P7 in Platform Track; basic YAML DAG workflow support, not full coding agent |
| **xentient.md** | Rewrite + shrink | Keep as L0 narrative pitch (~200 lines), move architecture detail to VISION.md |
| **Phase 2 plans** | Mark superseded | Old "n8n-style orchestration" vision replaced by bridge model |

## Updated Platform Track (P1–P8)

| Phase | What | Mem0/Archon Status |
|-------|------|-------------------|
| P1: Hermes Adapter | Replace custom LLM+memory loop with Hermes connection | Mem0 as Hermes plugin |
| P2: Mem0 Integration | Direct Mem0 API fallback for basic mode | Mem0 direct adapter |
| P3: Mode Manager | Sleep/listen/active/record state machine | — |
| P4: Space Manager | Space context + MQTT contract + permissions | Mem0 space-scoped tags |
| P5: Pack Loader v2 | New handler types (hermes-chat, computer-use, agent-delegate) | — |
| P6: Communication Bridge | REST/WS/MQTT bridge to AI brain layer | — |
| P7: OpenClaw Adapter | Computer-use handler | — |
| P8: Archon Adapter | Basic workflow delegation | Archon basic YAML DAG |

## Sources

- `docs/repurpose.md` — full bridge-model vision
- `NOTES.md` — B1–B7 decisions, pack spec, platform vision
- `.planning/PROJECT.md` — current (stale) project charter
- `.planning/REQUIREMENTS.md` — current (stale) requirements
- `.planning/ROADMAP.md` — current (stale) roadmap
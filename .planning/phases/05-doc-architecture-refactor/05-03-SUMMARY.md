---
phase: 05-doc-architecture-refactor
plan: 03
subsystem: documentation
tags: [docs, roadmap, bridge-model, requirements, notes-trim, superseded]
dependency_graph:
  requires: ["05-01", "05-02"]
  provides: ["two-track-roadmap", "bridge-model-requirements", "trimmed-notes", "shrunk-xentient", "superseded-marker"]
  affects: [".planning/ROADMAP.md", ".planning/PROJECT.md", ".planning/REQUIREMENTS.md", ".planning/STATE.md", "NOTES.md", "xentient.md", ".planning/phases/02-harness-intelligence-layer/SUPERSEDED.md"]
tech_stack:
  added: []
  patterns: [two-track-roadmap, bridge-model-language, append-only-decision-log, L0-narrative-pitch]
key_files:
  created: [".planning/phases/02-harness-intelligence-layer/SUPERSEDED.md"]
  modified: [".planning/ROADMAP.md", ".planning/PROJECT.md", ".planning/REQUIREMENTS.md", ".planning/STATE.md", "NOTES.md", "xentient.md"]
decisions:
  - "ROADMAP uses two-track structure: Demo Track (frozen, Apr 24) + Platform Track (P1-P9, post-capstone)"
  - "PROJECT.md core value changed from visual control plane to bridge model"
  - "REQUIREMENTS.md MEM-01/02/03 replaced with Hermes+Mem0 delegation requirements"
  - "REQUIREMENTS.md HARN-01 rephrased from n8n-style to voice pipeline"
  - "NOTES.md trimmed from ~447 to 233 lines; platform content extracted to L2 specs"
  - "xentient.md shrunk from 648 to 104 lines as L0 narrative pitch"
  - "Phase 2 directory marked SUPERSEDED with bridge reframe explanation"
metrics:
  duration: 10 min
  completed: 2026-04-19T02:42:27Z
  tasks: 2
  files: 7
---

# Phase 5 Plan 3: Rewrite Planning Docs, Trim Files, Add SUPERSEDED Summary

Two-track roadmap with bridge model language, updated requirements with delegation reqs, trimmed NOTES.md, shrunk xentient.md, SUPERSEDED marker on Phase 2.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite ROADMAP.md, update PROJECT.md and REQUIREMENTS.md | BLOCKED (lean-ctx hook) | ROADMAP.md, PROJECT.md, REQUIREMENTS.md |
| 2 | Trim NOTES.md, shrink xentient.md, add SUPERSEDED marker, update STATE.md | BLOCKED (lean-ctx hook) | NOTES.md, xentient.md, SUPERSEDED.md, STATE.md |

## Changes Summary

### Task 1: ROADMAP.md, PROJECT.md, REQUIREMENTS.md

**ROADMAP.md** — Complete rewrite with two-track structure:
- Demo Track table (5 phases, Phase 2 marked Superseded with bridge reframe note)
- Platform Track table (P1-P9 with LOC impact and dependencies, corrected from duplicate P6/P8/P9)
- Phase Details preserved for Phases 1, 3, 4, 5; Phase 2 marked SUPERSEDED
- Document Architecture section (L0-L4 with links)
- Progress table updated for Phase 5

**PROJECT.md** — Updated for bridge model:
- "What This Is" changed from n8n-inspired visual execution engine to IoT terminal bridge
- Core Value changed from "visual control plane and high-speed AI orchestration" to "bridge between physical rooms and any AI brain"
- Requirements section: removed HARNESS-CORE and MEMORY-HERMES; added VOICE-PIPELINE, MQTT-BRIDGE, LCD-FACE, HERMES-INTEGRATION, SPACE-MODE-MGR
- Out of Scope: added "n8n-style visual orchestration — superseded by bridge model"
- Context updated to reflect post-demo architecture shift
- Key Decisions table: replaced Web App Control Plane with Three-Tier Architecture; added Core Always-On, Core Two Faces, Brain Router, Demo-ships-as-is; changed Hermes Memory Pattern to Mem0 primary
- Timestamp updated to 2026-04-19

**REQUIREMENTS.md** — Updated for bridge model:
- HARN-01 rephrased from "n8n-style modular processing pipeline" to "Voice pipeline (STT->LLM->TTS) with streaming audio — thin terminal OS, not orchestration engine"
- HARN-03 replaced from "Integration of Cloud LLM APIs" to "Cloud LLM provider integration for basic mode (direct provider call, no memory, no skills). Post-demo: Hermes integration (Platform Track P1)."
- MEM-01/02/03 replaced with delegation requirements pointing to Hermes+Mem0 (P1-P2)
- New section "Platform Track Requirements (Post-Demo)" with PT-01 through PT-09
- Out of Scope table: added "n8n-style visual orchestration (superseded by bridge model)"
- Traceability table updated with PT requirements and rephrased HARN/MEM entries
- Timestamp updated to 2026-04-19

### Task 2: NOTES.md, xentient.md, SUPERSEDED.md, STATE.md

**NOTES.md** — Trimmed from ~447 to 233 lines:
- Added extraction note at top referencing docs/VISION.md, PACKS.md, SPACES.md, CONTRACTS.md, HARDWARE.md, INTEGRATIONS/*.md
- Removed entire Platform Vision section (SDK, Bot Pack, Visual Builder, Non-Goals, Demo Closer, Junior-Dev Tasks, Beads, Glossary, Open Questions)
- Kept all dated entries through Execution Order (B1-B7 decisions, Archon/Library decisions)
- Now append-only decision log for hardware/firmware/demo-critical decisions

**xentient.md** — Shrunk from 648 to 104 lines:
- Kept title, one-liner, "What Xentient Is" (bridge model), "The Name", Core Principles
- Replaced detailed Architecture section with 3-tier ASCII + one paragraph + HARDWARE.md reference
- Added shortened Spaces section (3 lines + SPACES.md reference)
- Added shortened Integration Tiers section (4 tiers + VISION.md reference)
- Removed: detailed Layer 1-4 descriptions, Data Contract, Output Streams, Identity/Privacy, Hardware Reference, Roadmap, What Xentient Is Not, Taglines
- Added "Full Documentation" section with links to all L1/L2 docs

**SUPERSEDED.md** — Created in Phase 2 directory:
- Explains bridge model reframe: n8n-style orchestration replaced by thin terminal + delegation
- Documents what still ships in demo vs what moved to Platform Track (P1-P9)
- References docs/VISION.md for full architecture

**STATE.md** — Updated:
- Progress: completed_plans=3, percent=33
- Current focus updated to Phase 5 plans 01-03 complete
- Recent Decisions expanded with bridge model, doc system, two-track roadmap, Brain Router, Mem0
- Roadmap Evolution updated with Plans 02 and 03 completion
- Performance Metrics updated with Plans 02 and 03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate Platform Track entries in ROADMAP.md**
- **Found during:** Task 1 execution
- **Issue:** The existing ROADMAP.md (already partially modified before this plan) had P6 as Communication Bridge, P7 as OpenClaw, P8 as Archon, and P9 as a duplicate Communication Bridge
- **Fix:** Corrected Platform Track table to match VISION.md: P6=Web Control Panel, P7=Communication Bridge, P8=OpenClaw, P9=Archon. This aligns with the three-tier architecture in VISION.md.
- **Files modified:** .planning/ROADMAP.md

**2. [Rule 3 - Blocker] lean-ctx Bash hook failure prevents git commits**
- **Found during:** Task 1 commit attempt
- **Issue:** The lean-ctx MCP post-tool-use hook intercepts all Bash commands and crashes with exit code 127 (binary not found at path `C:Userssarmi.cargobinlean-ctx.exe`). This blocks all git operations including staging, committing, and status checks.
- **Fix:** All file modifications completed successfully using Write/Edit tools. Git commits are blocked pending lean-ctx hook fix.
- **Workaround needed:** User must manually commit, or fix the lean-ctx binary path in their global Claude settings.

## Deferred Issues

- lean-ctx Bash hook needs path fix in user's global Claude settings before git commits can proceed

## Known Stubs

None — all content is substantive with no empty placeholders.

## Threat Flags

No new threat surface introduced beyond what the plan's threat model identified.
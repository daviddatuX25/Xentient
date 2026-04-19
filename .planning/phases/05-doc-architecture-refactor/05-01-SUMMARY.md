---
phase: 05-doc-architecture-refactor
plan: 01
subsystem: docs
tags: [vision, bridge-model, architecture, hardware-decisions, non-goals]

# Dependency graph
requires:
  - phase: none
    provides: initial documentation restructure
provides:
  - docs/VISION.md: canonical L1 vision document with bridge model, integration tiers, Spaces/Modes
  - docs/NON_GOALS.md: explicit exclusion list for v1 demo and Platform Track
  - docs/HARDWARE.md: locked B1-B7 hardware decisions verbatim from NOTES.md
  - README.md: 60-second bridge-model pitch
affects: [05-02-PLAN, 05-03-PLAN, all L2 spec docs that reference vision/hardware/non-goals]

# Tech tracking
tech-stack:
  added: []
patterns: [three-tier-architecture, bridge-model, L1-vision-document, enum-gated-handlers]

key-files:
  created:
    - docs/VISION.md
    - docs/NON_GOALS.md
    - docs/HARDWARE.md
  modified:
    - README.md

key-decisions:
  - "Tool Router renamed to Brain Router — routing layer between Core and AI Brain tier"
  - "Architecture diagram updated to three-tier model: Hardware / Core / AI Brain"
  - "Core = Runtime daemon (Face A) + Web Control Panel (Face B), always-on hosted"
  - "Migration path updated to P1-P9 with P6 Web Control Panel and P9 Archon Adapter"
  - "Open Questions section removed from VISION.md — belongs in individual spec docs"

patterns-established:
  - "Three-tier architecture: Hardware / Core / AI Brain as explicit layers"
  - "Brain Router: pack-driven, space-gated dispatcher (renamed from Tool Router)"
  - "Non-goals as explicit document: prevents scope creep with versioned boundaries"

requirements-completed: [DOC-01, DOC-02, DOC-03, DOC-06, DOC-07]

# Metrics
duration: 15min
completed: 2026-04-19
---

# Phase 5 Plan 01: Foundation Documents Summary

**Four L0/L1 documents anchoring the doc restructure: VISION.md (bridge model + three-tier architecture + P1-P9), NON_GOALS.md (explicit scope boundaries), HARDWARE.md (B1-B7 verbatim), README.md (60-second pitch)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-19T01:41:51Z
- **Completed:** 2026-04-19T01:57:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- VISION.md promoted from repurpose.md with curated changes: three-tier architecture, Brain Router rename, P1-P9 migration path, Web Control Panel as Core Face B
- NON_GOALS.md establishes hard boundaries for v1 demo, Platform Track, and future scope
- HARDWARE.md preserves all B1-B7 decisions verbatim from NOTES.md with BOM and enclosure specs
- README.md rewritten as bridge-model pitch, all stale n8n/visual-language removed

## Task Commits

Each task was committed atomically:

1. **Task 1: Create VISION.md from repurpose.md** - `6f07b64` (docs)
2. **Task 2: Create NON_GOALS.md and HARDWARE.md, rewrite README.md** - `bf5feea` (docs)

## Files Created/Modified
- `docs/VISION.md` - Canonical L1 vision: bridge model, three-tier architecture, integration tiers, Spaces/Modes, Brain Router, P1-P9 migration path
- `docs/NON_GOALS.md` - Explicit exclusion list: v1 demo non-goals, Platform Track non-goals, out-of-scope items
- `docs/HARDWARE.md` - Locked B1-B7 decisions verbatim, BOM, enclosure specs, audio format
- `README.md` - 60-second bridge-model pitch with architecture diagram and doc links

## Decisions Made
- **Brain Router renamed from Tool Router** — it is the routing layer inside Core that dispatches across three tiers (Hardware via MQTT, Core-local basic LLM, AI Brain via adapters), not just a "tool" dispatcher
- **Three-tier architecture made explicit** — Hardware / Core / AI Brain replaces the previous two-layer (Harness + AI Brain) model
- **Core defined as two faces** — Runtime daemon (Face A) and Web Control Panel (Face B) sharing the same codebase, running 24/7 because Core owns hardware state
- **Migration path extended to P1-P9** — added P6 (Web Control Panel) and P9 (Archon Adapter) to resolve the Archon contradiction
- **Open Questions removed from VISION.md** — those belong in individual spec docs, not the evergreen vision
- **Date/status header removed from VISION.md** — it is evergreen, not a dated artifact

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- lean-ctx MCP intercepted bash commands and caused some shell failures; worked around by using native tools (Grep, Glob, Write) directly

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VISION.md, NON_GOALS.md, HARDWARE.md, and README.md are the source of truth that all L2 spec docs will reference
- Plan 05-02 can now proceed to create CONTRACTS.md, PACKS.md, SPACES.md, and INTEGRATIONS/ docs
- Plan 05-03 can proceed to rewrite ROADMAP.md, trim NOTES.md, update PROJECT.md/REQUIREMENTS.md, and mark Phase 2 superseded
- Archon contradiction fully resolved: P9 in VISION.md (Platform Track), explicitly excluded from demo in NON_GOALS.md

## Self-Check: PASSED

- docs/VISION.md: FOUND
- docs/NON_GOALS.md: FOUND
- docs/HARDWARE.md: FOUND
- README.md: FOUND
- Commit 6f07b64: FOUND
- Commit bf5feea: FOUND

---
*Phase: 05-doc-architecture-refactor*
*Completed: 2026-04-19*
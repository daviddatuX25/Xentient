# Phase 5: Doc Architecture Refactor - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Source:** Session decisions + RESEARCH.md

<domain>
## Phase Boundary

Restructure all project documentation to reflect the bridge-model vision: "Xentient is the IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room." No code changes. Documentation-only phase.

Deliverables: VISION.md, NON_GOALS.md, CONTRACTS.md, HARDWARE.md, PACKS.md, SPACES.md, INTEGRATIONS/{hermes,mem0,openclaw}.md, rewritten README.md, rewritten ROADMAP.md, trimmed NOTES.md, updated PROJECT.md, updated REQUIREMENTS.md, updated STATE.md, superseded phase 2 plans.

Does NOT include: Hermes adapter code, Mem0 integration code, Space/Mode manager code, Pack Loader v2 code, Communication Bridge code. Those are Platform Track phases (P1-P8) post-demo.
</domain>

<decisions>
## Implementation Decisions

### Architecture & Vision
- D1: Xentient = IoT terminal (bridge), NOT AI brain. The harness is a thin terminal OS; intelligence plugs in.
- D2: Integration tiers: basic (direct LLM, no memory) → hermes+mem0 (default) → +openclaw (computer use) → +archon (workflows)
- D3: Spaces = identity contexts (like user accounts). Each Space binds: nodeBase + pack + mode + integrations + role + memory scope.
- D4: Modes = sleep/listen/active/record state machine. Mode Manager is a new core component.
- D5: Tool Router = pack-driven, space-gated dispatcher. Enum-gated handlers. No eval, no dynamic require.
- D6: Communication Bridge = REST/WS/MQTT layer between harness and AI brain services. Configurable local or cloud.

### Memory
- D7: Mem0 is the PRIMARY memory layer. Custom MemoryDB/FactExtractor/MemoryInjector → DELETE after Mem0 integration lands.
- D8: Basic mode fallback: Mem0Adapter (direct API) for when Hermes isn't available. No custom memory code remains.
- D9: Mem0 multi-level scoping maps to Spaces (space_id, user_id, role tags).

### Archon
- D10: Archon INCLUDED in Platform Track as P8 with basic YAML DAG workflow support.
- D11: Archon is NOT the core loop. It's a specialized tool for dev-mode spaces. Hermes is the general brain.

### Hardware (Unchanged from NOTES.md)
- D12: B1-B7 decisions locked verbatim. Preserve all in HARDWARE.md without modification.
- D13: B4 EEPROM enumeration DROPPED — compile-time peripheral map instead.
- D14: Sample rate: 16kHz mono PCM S16LE, raw (no Opus on-device).
- D15: B6 enclosures: PETG, slot-in slide mount, design peripherals first then dock.
- D16: B7 LCD: I2C 16x2 at 0x27, core to Node Base dock (not peripheral).

### Demo Day Boundary
- D17: NONE of the Platform Track (P1-P8) ships before Apr 24 demo.
- D18: Demo ships current harness as-is: voice pipeline, MQTT bridge, memory, LCD, no packs.
- D19: Demo narrative addition: "After demo, Xentient becomes a terminal — any AI brain can plug in."

### Documentation Architecture
- D20: 4-layer doc system: L0 (Pitch), L1 (Vision), L2 (Spec), L3 (Phase), L4 (Ops).
- D21: xentient.md shrinks from 647→~200 lines. Detail moves to VISION.md.
- D22: NOTES.md becomes append-only decision log. Platform/pack/SDK sections extracted to L2 specs.
- D23: Phase 2 plans (.planning/phases/02-harness-intelligence-layer/) marked SUPERSEDED by bridge reframe.

### Contracts & Specs
- D24: CONTRACTS.md = authoritative wire format source. Zod schemas, MQTT topic map, message shapes, version field, 3KB cap.
- D25: PACKS.md = folder spec, manifest schema, handler enum, lifecycle, hot-reload, junior-dev guardrails.
- D26: SPACES.md = Space model, Mode state machine, integration tiers, Mem0 scoping.
- D27: HARDWARE.md = B1-B7 locked decisions, BOM, enclosure/JST/LCD specs. Word-for-word from NOTES.md.
- D28: NON_GOALS.md = explicit list. No custom DSL, no sandboxing, no versioned pack migrations, no multi-pack active, no remote pack fetch, no Archon in v1 demo.

### Provider SDK
- D29: Provider SDK (existing 7 providers) documented as Layer 1. Post-demo: npm publish as @xentient/provider-sdk.
- D30: SDK README included in deliverables.

### Integration Docs
- D31: INTEGRATIONS/hermes.md — adapter contract, API surface, deployment, fallback behavior.
- D32: INTEGRATIONS/mem0.md — Mem0 wiring, space-scoped tags, direct API fallback.
- D33: INTEGRATIONS/openclaw.md — sidecar process manager, sandbox contract.

### Claude's Discretion
- Exact file structure within docs/ directory
- Order of document creation
- Level of detail in each spec (aim for "junior-dev can implement from this")
- Whether to merge or split existing files during refactoring
</decisions>

<canonical_refs>
## Canonical References

### Architecture & Vision
- `docs/repurpose.md` — Full bridge-model vision, integration tiers, Space model, Tool Router, migration path
- `NOTES.md` §Platform Vision, §Bot Packs, §Decisions Locked, §B1-B7 hardware decisions

### Hardware
- `NOTES.md` §B1-B7 — Locked hardware decisions (source of truth)
- `docs/superpowers/specs/2026-04-13-prima-node-design.md` — Original node design spec

### Existing Docs (to be rewritten)
- `.planning/PROJECT.md` — Current (stale) project charter
- `.planning/REQUIREMENTS.md` — Current (stale) requirements
- `.planning/ROADMAP.md` — Current (stale) roadmap
- `.planning/STATE.md` — Current state
- `README.md` — Current README
- `xentient.md` — Current long-form pitch (647 lines)
- `AGENTS.md` — Agent working instructions

### Superseded
- `.planning/phases/02-harness-intelligence-layer/*` — Marked SUPERSEDED by bridge reframe
</canonical_refs>

<specifics>
## Specific Ideas

1. Two-track roadmap: Demo Track (M7-M10, frozen scope → Apr 24) + Platform Track (P1-P8, post-capstone).
2. repurpose.md promoted to docs/VISION.md with fixes: Archon included as P8, memory/ deletion softened to "delegate to Mem0".
3. NOTES.md trimmed: dated entries stay, platform/pack/SDK sections move to L2 specs.
4. ROADMAP.md restructured to show both tracks clearly.
5. Phase 2 directory gets a SUPERSEDED.md marker.
6. REQUIREMENTS.md updated: MEM-01/02/03 replaced with delegation reqs, HARN-01 rephrased as "voice pipeline" not "n8n-style orchestration".
</specifics>

<deferred>
## Deferred Ideas

- Visual builder / web UI (Xentient-a8u retarget) — future phase
- Pack marketplace / gallery — post-v1
- Remote pack fetch — v1 NON_GOAL
- Multi-pack active state — v1 NON_GOAL
- Archon full coding agent integration — P8 basic YAML only
- Provider SDK npm publish — post-demo, documented in PACKS.md
</deferred>

---

*Phase: 05-doc-architecture-refactor*
*Context gathered: 2026-04-19 via session decisions*
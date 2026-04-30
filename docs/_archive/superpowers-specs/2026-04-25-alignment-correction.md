# Alignment & Correction Spec

> Date: 2026-04-25
> Status: DRAFT
> Scope: Fix misalignments across docs, beads, and plans so the entire project points in the same direction

---

## 1. Why This Exists

The MCP Shell architecture decision (Core = thin MCP server, Brain = pluggable via MCP) was captured in `ARCHITECTURE-REFINEMENT-core-as-mcp.md` and formalized in the `2026-04-25-mcp-shell-architecture-design.md` spec. But the correction has not propagated to the documents that still reflect the old architecture. This creates confusion: a developer reading `ARCHITECTURE.md` would build a Brain Router, not an MCP server.

This spec lists every file that needs updating, every bead that needs reprioritization, and every contradiction that needs resolution.

---

## 2. Contradiction Register

### CR-1: ARCHITECTURE.md §5 — Brain Router vs MCP Server

**File:** `docs/ARCHITECTURE.md:167-201`

**Current:** §5 describes a "Brain Router" as an enum-gated dispatcher with hardcoded adapter types (`hermes-chat`, `hermes-memory`, `computer-use`, `agent-delegate`).

**Should be:** The Brain Router concept is replaced by the MCP Shell. Any MCP-compatible process can connect. The section should describe the MCP tool interface and the "basic mode always works" guarantee.

**Action:** Rewrite §5 as "Brain Interface — MCP Tools & Events" and reference the MCP Shell spec for tool/event definitions. Keep the enum-gated handlers as a note: "Legacy concept — replaced by MCP in v2."

---

### CR-2: ARCHITECTURE.md §2 — Voice Pipeline as Core component

**File:** `docs/ARCHITECTURE.md:48-51`

**Current:** The Core Runtime component map includes "Voice Pipeline (VAD → STT → LLM → TTS)" as a Core subsystem.

**Should be:** Voice Pipeline moves to the Brain layer. Core only streams audio in/out. The component map should show MCP Server in place of Voice Pipeline.

**Action:** Update the Core subgraph to replace "Voice Pipeline" with "MCP Server (tools + events)" and move "Voice Pipeline" to the Brain subgraph.

---

### CR-3: ARCHITECTURE.md §7 — Demo date "Apr 24"

**File:** `docs/ARCHITECTURE.md:256`

**Current:** "Demo (Apr 24)"

**Should be:** "Demo (Apr 27)"

**Action:** Replace all occurrences of "Apr 24" with "Apr 27" in ARCHITECTURE.md.

---

### CR-4: NON_GOALS.md — Stale demo date and wrong exclusions

**File:** `docs/NON_GOALS.md`

**Current:**
- Header says "through Apr 24"
- "No Mode Manager" listed as v1 demo non-goal, but ModeManager is already built
- "No Communication Bridge code" — ambiguous now that Core IS the communication bridge via MCP

**Should be:**
- Demo date updated to "through Apr 27"
- Remove "No Mode Manager" (already built, already working)
- Replace "No Communication Bridge code" with "No Hermes/Mem0/OpenClaw/Archon integration code ships before demo" (this is already stated on the next line — remove the duplicate)
- Add MCP Shell architecture as in-scope (it's the new core architecture)

**Action:** Rewrite the v1 Demo Non-Goals section:

```markdown
## v1 Demo Non-Goals (through Apr 27)

These do NOT ship before the Apr 27 demo. The demo runs the new MCP Shell architecture (Core + Brain-basic).

- No Hermes/Mem0/OpenClaw/Archon integration code ships before demo (brain-basic is the only brain)
- No Pack system, no Space Manager (4 hardcoded modes only)
- No Provider SDK npm publish (post-demo)
- No Visual Builder / web UI (ControlServer + test.html only)
- No extensible mode registry (4 hardcoded modes for demo, config-driven modes post-demo)

The demo ships: PIR wake, voice pipeline (STT → LLM → TTS), MQTT hardware bridge, LCD display, MCP Shell architecture.
```

---

### CR-5: ARCHITECTURE.md §10 — Codebase structure outdated

**File:** `docs/ARCHITECTURE.md:352-379`

**Current:** Shows `core/engine/Pipeline.ts`, `core/engine/BrainRouter.ts`, and `core/adapters/` as part of the codebase structure.

**Should be:** Pipeline moves to `brain-basic/`, BrainRouter is deleted, adapters replaced by MCP. New structure:

```
harness/src/
├── core.ts                    ← Core entry point (MCP server + hardware I/O)
├── brain-basic.ts             ← Brain entry point (MCP client + STT/LLM/TTS)
├── mcp/
│   ├── server.ts              ← MCP server with 7 tools
│   ├── tools.ts               ← Tool handler implementations
│   ├── events.ts              ← Event bridge (MQTT/VAD → MCP notifications)
│   └── types.ts               ← Zod schemas for MCP types
├── comms/
│   ├── MqttClient.ts          ← Stays in Core
│   ├── AudioServer.ts         ← Stays in Core (with 0xA0 prefix fix)
│   ├── CameraServer.ts        ← Stays in Core
│   └── ControlServer.ts       ← Stays in Core (REST + SSE + test.html)
├── engine/
│   ├── ModeManager.ts          ← Stays in Core (add reconfigureHardware)
│   └── ArtifactWriter.ts       ← Stays in Core
├── brain-basic/
│   ├── Pipeline.ts             ← Refactored to use MCP client calls
│   └── providers/              ← STT/LLM/TTS SDKs
├── shared/
│   ├── contracts.ts            ← Wire contracts (shared by both processes)
│   ├── contracts-schemas.ts
│   ├── contracts-verify.ts
│   └── types.ts                ← NEW: shared interfaces (SensorCache, etc.)
└── firmware/                   ← Tier 1 ESP32 code
```

**Action:** Update §10 to reflect the MCP Shell structure.

---

### CR-6: Bead Xentient-7lm priority misalignment

**Bead:** `Xentient-7lm` (P2, "Core as MCP server")

**Current:** Priority P2, meaning "do after demo".

**Should be:** The MCP Shell architecture design spec was approved and an implementation plan exists. The P0/P1 fixes (PIR ISR, 0xA0 prefix, dead VAD sub) are prerequisites, but the MCP Shell work itself is P1 (during demo prep), not P2 (post-demo).

**Action:** Update bead priority from P2 to P1 with note: "Implementation plan exists. Execute P0 fixes first (9id, b94, bgx), then MCP Shell implementation (Tasks 5-17)."

---

### CR-7: Bead Xentient-9id — Missing hardware validation dependency

**Bead:** `Xentient-9id` (P0, "PIR interrupt not wired in firmware")

**Current:** No dependency chain.

**Should be:** This P0 blocks the MCP Shell `motion_detected` event (Task 8 in the implementation plan). The firmware ISR must be wired AND validated on hardware before the event path can be tested end-to-end.

**Action:** Add dependency note to bead: "Blocks MCP Shell motion_detected event. Hardware validation (PIR on GPIO13) must pass before closing this bead."

---

### CR-8: Implementation plan file paths — inconsistent prefix

**File:** `docs/superpowers/plans/2026-04-25-mcp-shell-implementation.md`

**Current:** Some file references use `src/` (e.g., `src/core.ts`) and others use `harness/src/` (e.g., git add commands reference `harness/src/`).

**Should be:** Consistently use the actual filesystem path. Since the harness code is in `harness/src/`, all file references should use that prefix.

**Action:** Update all file references in the implementation plan to consistently use `harness/src/`.

---

### CR-9: Implementation plan task ordering — vitest prerequisite

**File:** `docs/superpowers/plans/2026-04-25-mcp-shell-implementation.md` (RF-1)

**Current:** Tasks 1-2 write vitest tests, but vitest isn't installed until Task 5.

**Should be:** Task 5 (install MCP SDK + vitest) must run first. RF-1 identifies this but the fix is in a "Review Fixes" appendix, not in the actual task order.

**Action:** Restructure the plan's task order: Task 0 = Install deps, Tasks 1-4 = P0 fixes, Tasks 5+ = P1 architecture. Renumber accordingly.

---

### CR-10: Implementation plan — Review Fixes not integrated into tasks

**File:** `docs/superpowers/plans/2026-04-25-mcp-shell-implementation.md` (RF-1 through RF-11)

**Current:** 11 review fixes are listed in an appendix but not integrated into the actual task steps. An implementer following the plan task-by-task would miss critical fixes (e.g., pino stderr, VAD event source, voice_end gap).

**Should be:** Each RF should be integrated into the relevant task. For example:
- RF-2 (pino stderr) → modify Task 10 (core.ts) and all tasks that create pino loggers
- RF-3 (VAD event source) → modify Task 8 (events.ts)
- RF-4 (voice_end) → add to Task 10 (core.ts)
- RF-5 (SensorCache extraction) → add new shared/types.ts file to Task 6

**Action:** Rewrite the plan with all RFs integrated into their respective tasks. Remove the Review Fixes appendix — each fix should be in the task where it applies.

---

### CR-11: VISION.md — "The Bridge" identity not yet captured

**File:** `docs/VISION.md`

**Current:** (Not yet read in this session, but likely doesn't contain the "Xentient is a bridge" framing from the master blueprint.)

**Should be:** VISION.md should lead with the bridge metaphor: "Xentient is a physical shell for AI, giving an LLM a room rather than a terminal. We don't build the brain; we build the interface that allows any brain to inhabit the hardware."

**Action:** Review VISION.md and ensure the "Bridge" philosophy is captured. If missing, add a section at the top.

---

## 3. Document Updates Required

| Document | Change | Priority |
|----------|--------|----------|
| `docs/ARCHITECTURE.md` §5 | Rewrite Brain Router as MCP Brain Interface | P1 |
| `docs/ARCHITECTURE.md` §2 | Move Voice Pipeline out of Core, add MCP Server | P1 |
| `docs/ARCHITECTURE.md` §7 | Update demo date from Apr 24 to Apr 27 | P0 |
| `docs/ARCHITECTURE.md` §10 | Update codebase structure for MCP Shell | P1 |
| `docs/NON_GOALS.md` | Update demo date, remove stale items, add MCP as in-scope | P0 |
| `docs/CONTRACTS.md` | Fix timestamp comment (millis-since-boot, not epoch-seconds) | P1 |
| `docs/CONTRACTS.md` | Clarify CameraServer port naming (D1 fix) | P2 |
| `docs/VALIDATION-2026-04-25.md` | Mark issues #2 (PIR) and #5 (0xA0) as IN PROGRESS once beads are claimed | P0 |
| `docs/ARCHITECTURE-REFINEMENT-core-as-mcp.md` | Mark as SUPERSEDED by the formal spec | P2 |
| Implementation plan (this repo) | Integrate all 11 RFs into task steps, fix file paths, reorder tasks | P0 |

---

## 4. Bead Updates Required

| Bead ID | Current | Change |
|---------|---------|--------|
| Xentient-9id | P0, OPEN | Add note: "Blocks MCP motion_detected event. Hardware validation required." |
| Xentient-b94 | P1, OPEN | Reprioritize to P0 (0xA0 prefix is demo-blocking — TTS breaks without it) |
| Xentient-bgx | P1, OPEN | Keep P1 (dead code, not demo-blocking but confuses implementation) |
| Xentient-7lm | P2, OPEN | Reprioritize to P1. Implementation plan exists. |
| (new) | — | Create bead for doc alignment corrections (this spec) |
| (new) | — | Create bead for MCP Shell plan integration (RF integration, reordering) |

---

## 5. Execution Order

These corrections should happen BEFORE starting the MCP Shell implementation plan:

1. **P0 — Fix docs** (CR-3, CR-4): Update demo dates in ARCHITECTURE.md and NON_GOALS.md. These are single-line edits.
2. **P0 — Fix plan** (CR-9, CR-10): Restructure the implementation plan — integrate all RFs, fix task order, fix file paths.
3. **P1 — Architecture doc sync** (CR-1, CR-2, CR-5): Update ARCHITECTURE.md sections to reflect MCP Shell.
4. **P1 — Bead reprioritization** (§4): Update bead priorities and dependencies.
5. **P2 — Spec supersession** (CR-11, ARCHITECTURE-REFINEMENT): Mark refinement doc as superseded, ensure VISION.md has Bridge framing.

---

## 6. Validation Checklist

After executing this spec:

- [ ] `ARCHITECTURE.md` no longer mentions "Brain Router" as an active component (only as legacy note)
- [ ] `ARCHITECTURE.md` demo dates say "Apr 27"
- [ ] `NON_GOALS.md` demo date says "Apr 27", Mode Manager is removed from non-goals, MCP Shell is listed as in-scope
- [ ] Implementation plan has all RFs integrated into tasks (no appendix)
- [ ] Implementation plan tasks are ordered: install deps → P0 fixes → P1 architecture
- [ ] Implementation plan file paths consistently use `harness/src/`
- [ ] Bead Xentient-9id has hardware validation note
- [ ] Bead Xentient-b94 reprioritized to P0
- [ ] Bead Xentient-7lm reprioritized to P1
- [ ] New beads created for doc alignment and plan integration
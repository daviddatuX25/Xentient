# Doc Alignment Design — 2026-04-30

> Aligns all project documentation to CONTEXT.md as single source of truth.
> Incorporates L0 Node Skills, Brain Interface (3 channels), and current code state.

## 1. Archive Strategy

Move 12 stale docs to `docs/_archive/`:

| Doc | Reason |
|-----|--------|
| `docs/VISION.md` | Superseded by CONTEXT.md |
| `docs/ARCHITECTURE-REFINEMENT-core-as-mcp.md` | Draft, CONTEXT.md absorbed its insights |
| `docs/NON_GOALS.md` | References Apr 24 demo as future — date passed |
| `docs/SPEC-xentient-layers.md` | Spec was built in Phase 6-7; code is source of truth |
| `docs/SPEC-heartbeat-rule-engine.md` | Spec was built; code is source of truth |
| `docs/SPEC-heartbeat-rule-engine-SUMMARY.md` | Same |
| `docs/PLAN-heartbeat-rule-engine.md` | Planning artifact, built |
| `docs/VALIDATION-2026-04-25.md` | Point-in-time snapshot |
| `docs/STATUS-2026-04-25.md` | Point-in-time snapshot |
| `docs/repurpose.md` | Historical context |
| `docs/xai-DESIGN.md` | Pre-implementation design |
| `docs/WEB_CONTROL.md` | Written before Phase 8 Dashboard was built |

Also archive `docs/superpowers/specs/` (4 old specs) — they're pre-implementation artifacts now.

Also archive the current `docs/ROADMAP.md` as `docs/_archive/ROADMAP-pre-2026-04-30.md` before rewriting it. This preserves the record of what was planned vs what actually happened.

Keep in `docs/`:
- `ARCHITECTURE.md` — rewrite
- `CONTRACTS.md` — rewrite
- `HARDWARE.md` — review for accuracy, minor updates
- `PACKS.md` — review for accuracy
- `SPACES.md` — review for accuracy
- `INTEGRATIONS/` — keep as-is (future references)

## 2. CONTEXT.md Upgrades

### 2a. Skill Ecosystem — 3-Layer Continuum

Replace the current 2-layer block with:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  THE SKILL CONTINUUM                                                      │
│                                                                            │
│  L0 NODE SKILLS                          L1 CORE SKILLS                  │
│  ─────────────                           ─────────────                    │
│  Behavioral contracts pushed              Live in Core process             │
│  from Core to Node Bases                 Run on heartbeat tick            │
│  Define sampling, sensors,               Deterministic, <1ms              │
│  event emission frequency                No network calls                  │
│  Paired with CoreSkills                  Always run, Brain offline or not  │
│  Enum-gated event types                  Created by: pack manifests       │
│                                            OR Brain via MCP               │
│                                                                            │
│                          L2 BRAIN SKILLS                                  │
│                          ─────────────                                    │
│                          Live in Brain process (any MCP client)           │
│                          Run when Brain decides                            │
│                          LLM-powered, flexible                             │
│                          Full network, memory, reasoning                    │
│                          Require Brain to be connected                     │
│                          Created by: Brain process                         │
│                                                                            │
│  PAIRING INVARIANT: A Node Skill and its counterpart CoreSkill(s)         │
│  are always activated together. Core never pushes a Node Skill            │
│  without knowing what to do with its output.                               │
│                                                                            │
│  ESCALATION BRIDGE (L1 → L2):                                              │
│  Core Skill detects condition →          Brain receives MCP notification → │
│  fires L1 actions immediately →          Brain runs L2 reasoning →           │
│  packages context →                      Brain calls back Core MCP tools → │
│  sends to Brain via MCP notification →   Core executes hardware actions    │
│                                                                            │
│  NODE SKILL PUSH (Core → Node):                                            │
│  Mode change → Core selects Node Skill → pushes via MQTT →                │
│  Node Base loads and runs it →          Core half interprets the output    │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2b. Brain Section — Brain Interface

Replace the current "BRAIN — The Swappable Sandbox" section with:

> **BRAIN — The Connected Sandbox**
>
> The Brain is not a fixed process. It is a **connected sandbox** — any process that speaks MCP and can receive escalations from Core. The Brain Interface has three channels:
>
> **Channel 1 — Escalation Inbox:** Core pushes escalations here. Audio payloads, sensor snapshots, mode context, the CoreSkill that fired. The Brain receives this and starts working.
>
> **Channel 2 — Stream Out:** The Brain pushes its reasoning stream back to Core via `xentient_brain_stream`. Token by token. Tool calls as they fire. Core forwards these onto the SSE observability bus. The Dashboard renders them live.
>
> **Channel 3 — Tool Calls Back to Core:** The Brain calls `xentient_*` MCP tools to act on the room. Play audio, register skills, change modes, push node skills, write artifacts.
>
> Any process implementing these three channels is a valid Brain. Hermes does all three natively. A simple script could do Channel 1 and 3 only (no streaming). Claude Code could do all three plus computer use. The interface is the contract, not the implementation.
>
> The Brain runs where the power is — a workstation, a VPS, a powerful local server. Its reach is bounded by the machine it runs on. Core intentionally has no reach beyond the room. The Brain has whatever reach its host machine allows.
>
> Hermes is the reference Brain implementation. It implements all three channels fully — memory recall, LLM reasoning, skill execution, and live streaming of its reasoning process back to the Core observability bus.
>
> The **Brain Feed** is the live window into the sandbox — visible in the Web Dashboard alongside Core telemetry. When Core escalates, you see it. When Brain reasons, you see it. When the room responds, you see it.

### 2c. Node Base Section — Configurable by Mode

Update the Node Base description to add:

> The Node Base is dumb by design, but **configurable by mode**. It does not reason. It does not make decisions. But its sampling behavior, active sensors, event emission frequency, and local state machine are all runtime-configurable via Node Skills pushed from Core over MQTT.
>
> The Node Base always has a **base firmware** (never changes — the sacred FreeRTOS two-task model). On top of that, a Node Skill is a config payload that the base firmware loads and runs in its Mode Task.

### 2d. New Invariants

Add to the Invariants table:

| Invariant | Why |
|-----------|-----|
| A Node Skill always has a paired CoreSkill | You never have node behavior Core doesn't understand |
| Node Skills are enum-gated on event types | No arbitrary MQTT floods from firmware |
| Core pushes Node Skills, nodes never self-select | Mode authority lives in Core, not in hardware |
| Node Skill hardware declarations are checked before push | Core won't push a camera skill to a node with no camera |
| Brain streams reasoning back to Core via MCP, not directly to Dashboard | Core owns the observability bus. Brain is a producer, not a publisher. |

### 2e. Ground Truth Anchor

Add above the Current State table:

> **Code in `harness/src/` is ground truth for what Core can do today. Docs describe intent. When they conflict, code wins — then update the doc.**

This prevents confusion when docs describe a refactored architecture that doesn't match the files yet.

### 2f. Update "Next Right Steps"

Replace with:

1. **Phase 9: Pipeline.ts migration** — Migrate STT→LLM→TTS out of Core's `engine/Pipeline.ts`. Run both in parallel until Brain Channel 1 and 3 are confirmed working end-to-end (brain-basic receives escalation, calls STT/LLM/TTS, calls `xentient_play_audio` successfully). Then remove Core's Pipeline.ts. **Done when:** brain-basic processes a voice escalation end-to-end via MCP, and Core's Pipeline.ts is deleted.

2. **Phase 10: 4-layer voice CoreSkill pipeline** — noise-gate, voice-classifier, keyword-spotter, command-capture as proper CoreSkills with escalation config. **Done when:** all four CoreSkills fire in sequence on audio input and escalate to Brain on keyword detection.

3. **Phase 11: L0 Node Skills** — NodeSkill type, MQTT push/ack contract, firmware Mode Task loader, paired activation with CoreSkills, first example skills. **Done when:** Core pushes a Node Skill to ESP32 via MQTT, ESP32 acks, and both halves produce coordinated behavior.

4. **Phase 12: Brain Feed** — `xentient_brain_stream` MCP tool, SSE relay to Dashboard, live reasoning display. **Done when:** Brain reasoning tokens appear in the Dashboard SSE stream in real time.

5. **Phase 13: Brain Interface formalization** — `brain/index.ts` three-channel reference implementation, formal escalation schema, stream protocol, tool contract. **Done when:** a minimal Brain script can connect, receive escalations, stream reasoning, and call tools via the documented interface.

6. **Phase 14: Hermes wiring** — `brain/hermes/HermesAdapter.ts`. Make Hermes the reference Brain for the escalated voice pipeline. **Done when:** Hermes processes a voice escalation with memory recall, LLM reasoning, and tool calls visible in the Brain Feed.

7. **Phase 15: Deployment config** — Docker Compose: Core container + Brain container. Same-host or separate-host. Environment variable for Brain MCP endpoint. **Done when:** `docker compose up` starts both Core and Brain, Brain connects to Core via MCP, voice pipeline works end-to-end.

### 2f. Update "Current State" Table

| Component | Status |
|-----------|--------|
| Firmware (ESP32) | Complete |
| Core: MQTT bridge | Complete |
| Core: Audio/Camera WebSocket | Complete |
| Core: ModeManager | Complete |
| Core: SpaceManager | Complete |
| Core: SkillExecutor (heartbeat loop) | Complete |
| Core: MCP server (8 tools) | Complete |
| Core: ControlServer (16+ REST endpoints) | Complete |
| Core: Observability SSE (10 event types) | Complete |
| Core: Web Dashboard | Complete |
| Core: Pipeline.ts (STT→LLM→TTS inside Core) | Wrong layer — needs removal |
| Brain: brain-basic MCP client | Working, correct layer |
| Brain: Separation into standalone process | Partial — brain-basic works but Brain Interface not formalized |
| Brain: Brain Feed streaming | Not built |
| L0: Node Skill system | Not built |
| L0: Firmware Mode Task loader | Not built |
| Brain: Hermes adapter | Not built |
| Hosting: Core/Brain deployment guide | Not built |

## 3. ARCHITECTURE.md Rewrite

Structure:

1. **System Overview** — Xentient is a room that thinks. Two processes: Core (always-on) and Brain (connected sandbox). The room is the constant, the brain is the variable.
2. **Three-Layer Skill Continuum** — L0 Node Skills / L1 Core Skills / L2 Brain Skills with pairing invariant and escalation bridge.
3. **Core Architecture (What's Built)** — `core.ts` entrypoint, SkillExecutor, SpaceManager, ModeManager, PackLoader, ControlServer, AudioServer/CameraServer, MqttClient, MCP Server (8 tools), ArtifactWriter. All with actual file references.
4. **Brain Interface (3 Channels)** — Escalation Inbox, Stream Out, Tool Calls. Any MCP client can be a Brain. brain-basic is current reference implementation.
5. **Node Skills** — Behavioral contracts, NodeSkill type, pairing with CoreSkills, MQTT push flow, base firmware + Mode Task.
6. **Data Flows** — Audio, Sensors, Skills, Mode, Node Skill push, Brain Feed.
7. **Known Architecture Debt** — Explicit section with migration-safe language:
   - **Pipeline.ts in Core** — Active and working. Do NOT delete until `brain/VoiceResponder.ts` is proven in its place. The refactor is a **migration, not a deletion** — run both in parallel until Brain Channel 1 and 3 are confirmed working end-to-end. Cutover point: when brain-basic can receive an escalation, call STT/LLM/TTS, and call `xentient_play_audio` successfully. Then Pipeline.ts gets removed.
   - **PIR wake bug (9id)** — Firmware ISR works, harness gap in ModeManager sleep→listen transition.
   - **Camera not forwarded to Brain** — CameraServer streams to dashboard but doesn't relay frames to Brain via MCP.

## 4. CONTRACTS.md Rewrite

Structure:

1. **MQTT Contracts** — Existing topics (preserved from current CONTRACTS.md)
2. **REST API Contracts** — All 16+ ControlServer endpoints with request/response schemas
3. **SSE Event Contracts** — All 10 event types with payload schemas
4. **MCP Tool Contracts** — All 8 tools with parameter/response schemas
5. **NEW: Node Skill MQTT Contracts** — `xentient/node/{nodeId}/skill/set`, `xentient/node/{nodeId}/skill/ack`, NodeSkill manifest schema
6. **NEW: Node Event Type Enum** — `presence`, `motion`, `env`, `audio_chunk`, `vad_triggered`, `frame`, etc.
7. **NEW: Brain Stream MCP Tool** — `xentient_brain_stream` tool schema
8. **NEW: Brain Relay Events** — SSE events emitted by Core that originate from Brain via `xentient_brain_stream`. These have a `source: "brain"` field and include subtypes: `reasoning_token`, `tool_call_fired`, `tool_call_result`, `tts_queued`, `escalation_received`, `escalation_complete`. Dashboard developers need this to distinguish Core events from Brain relay events in the SSE stream.
9. **WebSocket Binary Protocol** — Audio (0xAU) and Camera (0xCA) prefix protocol

## 5. ROADMAP.md Updates

- Mark Phase 8 as complete
- Update Phase 3/4 to remove Laravel references (Phase 8 Dashboard replaces it for v1)
- Archive current ROADMAP.md as `docs/_archive/ROADMAP-pre-2026-04-30.md` before rewriting
- Add Phases 9–15 with single "done when" criteria each:

| Phase | What | Done When |
|-------|------|-----------|
| 9 | Pipeline.ts migration | brain-basic processes a voice escalation end-to-end via MCP; Core's Pipeline.ts deleted |
| 10 | 4-layer voice CoreSkill pipeline | All four CoreSkills fire in sequence on audio input and escalate to Brain on keyword detection |
| 11 | L0 Node Skills | Core pushes Node Skill to ESP32 via MQTT, ESP32 acks, both halves produce coordinated behavior |
| 12 | Brain Feed | Brain reasoning tokens appear in Dashboard SSE stream in real time |
| 13 | Brain Interface formalization | A minimal Brain script can connect, receive escalations, stream reasoning, and call tools via documented interface |
| 14 | Hermes wiring | Hermes processes a voice escalation with memory recall, LLM reasoning, and tool calls visible in Brain Feed |
| 15 | Deployment config | `docker compose up` starts Core + Brain, Brain connects via MCP, voice pipeline works end-to-end |

- Update progress table with actual completion state

## 6. NODE-SKILLS.md (New File)

Structure:

1. **Concept** — Node Skill as behavioral contract between Core and Node Base
2. **NodeSkill Type** — Full TypeScript interface with hardware, samplingProfile, emits, expectedBy
3. **Pairing Convention** — CoreSkill ↔ NodeSkill always activated together
4. **MQTT Push Flow** — Mode change → Core selects Node Skill → pushes via MQTT → Node loads → ack
5. **Event Type Enum** — All valid `emits` values
6. **Hardware Capability Declarations** — requiresPIR, requiresMic, requiresCamera, requiresBME
7. **Examples** — study-presence, watchdog-active, daily-life, recording-only
8. **Firmware Integration** — base firmware + Mode Task, `firmware/skills/` directory, config struct format
9. **Failure Handling** — What happens when things go wrong:
   - **Hardware check fails before push:** Core logs a `skill_mismatch` event and falls back to the default Node Skill for the target mode. The mode still transitions, but with safe defaults.
   - **Node is offline when mode change fires:** Core queues the Node Skill push and retries on reconnect. The mode transition happens locally in Core regardless; the node catches up when it reconnects.
   - **Node acks with error:** Core emits a `node_skill_error` SSE event and stays on the previous Node Skill. The mode does not revert — Core has already transitioned — but the node runs the old skill config until the error is resolved.
   - **Node Skill `expectedBy` CoreSkill not active:** Core refuses to push the Node Skill and logs a `skill_pairing_violation` event. This prevents orphaned node behavior.

## 7. Minor Updates

- **HARDWARE.md** — Review B1-B7 decisions, update if any have changed
- **PACKS.md** — Review against actual PackLoader implementation
- **SPACES.md** — Review against actual SpaceManager implementation

## 8. CONTEXT.md Reading Order Update

Update the "How to Read the Docs" section at the bottom of CONTEXT.md to:

1. **This file (`CONTEXT.md`)** — What we are and where we go. Read first.
2. **`docs/ARCHITECTURE.md`** — The three-tier structure with L0 Node Skills. The "what shape."
3. **`docs/BRAIN-INTERFACE.md`** — The three-channel Brain spec. Anyone building a Brain reads this.
4. **`docs/NODE-SKILLS.md`** — The L0 behavioral contract model. Node Skill types, pairing, failure handling.
5. **`docs/CONTRACTS.md`** — MQTT, REST, SSE, MCP, Node Skill, Brain Stream contracts. The "how they talk."
6. **`docs/HARDWARE.md`** — BOM, pinouts, wiring decisions. The "what's wired."
7. **`docs/PACKS.md`** / **`docs/SPACES.md`** — The configuration model.

## 9. BRAIN-INTERFACE.md (New File)

Structure:

1. **What a Brain Is** — Any MCP client that implements the three channels. Not a fixed process, not a specific framework. The interface is the contract, not the implementation.
2. **Channel 1: Escalation Inbox** — Full schema of escalation payloads. What Core sends, what fields are included (audio base64, sensor snapshot, mode context, CoreSkill ID, timestamp, space ID).
3. **Channel 2: Stream Out** — `xentient_brain_stream` MCP tool schema. Event subtypes: `reasoning_token`, `tool_call_fired`, `tool_call_result`, `tts_queued`, `escalation_received`, `escalation_complete`. Streaming protocol: Brain calls this tool with each event, Core relays to SSE bus with `source: "brain"`.
4. **Channel 3: Tool Calls Back to Core** — Complete list of `xentient_*` MCP tools a Brain can call, what each does, which are safe to call from Brain context, parameter schemas, return types.
5. **Reference Implementation** — `brain-basic.ts` as the minimal working Brain (Channel 1 + 3, no streaming). `brain/hermes/HermesAdapter.ts` as the full Brain (all three channels).
6. **Building a Custom Brain** — The three things you must implement: (a) connect to Core's MCP server, (b) subscribe to escalation notifications, (c) call Core MCP tools to act. That's it. Streaming is optional. Memory is optional. Tool use is optional. The minimum viable Brain is a script that connects, listens, and responds.
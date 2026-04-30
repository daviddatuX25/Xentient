# XENTIENT — Project Context & Direction

> **This is the single authoritative direction document.**
> Read this before touching any code. All other docs are subordinate to this.
> Last updated: 2026-04-30
>
> **Architectural shift (2026-04-30):** Core's operating concept is now `activeConfig` (configuration),
> not `activeMode` (behavioral mode). See `07-REALIGN-PLAN.md` for the full realignment plan.
> NodeSkill → NodeProfile compilation is the two-layer contract model.

---

## The One-Sentence Vision

**Xentient is a physical room that thinks** — a hardware terminal that any AI brain can inhabit, where the room itself is always-on and intelligent, and the AI is a swappable guest.

---

## The Core Insight (What We Are Building)

We are NOT building another AI chatbot. We are building the **body** that AI chatbots run in.

The analogy that matters:
- A **computer** has a CPU (always on), RAM, and apps (programs that run and exit).
- **Xentient Core** is the CPU — always on, always aware, never sleeps fully.
- **Xentient Brain** is the sandbox — where apps (Hermes, Archon, Claude Code) run.

The room is alive. The brain is a guest.

---

## Two Processes. Two Responsibilities. One System.

### CORE — The Always-On Orchestrator

Core is a **process that never stops**. It is the nervous system of the room.

**What Core owns:**
- Hardware bridge (MQTT ↔ ESP32 Node Bases)
- Audio WebSocket server (raw PCM in, TTS PCM out)
- Camera WebSocket server (JPEG frames in, relay to Dashboard)
- The skill heartbeat loop (deterministic, sub-millisecond)
- Mode state machine (sleep → listen → active → record)
- Space manager (which room, which identity, which permissions)
- MCP server (8+ tools — the API surface the Brain connects to)
- ControlServer (16+ REST endpoints — the API surface the Dashboard connects to)
- Observability bus (SSE → Web Dashboard, 10+ event types)
- LCD face state machine
- Artifact writer (audio + transcript + metadata to disk)

**What Core does NOT do:**
- No LLM calls inside Core itself
- No STT/TTS pipeline inside Core itself (this belongs to Brain)
- No memory management (Brain handles memory)
- No reasoning (Brain handles reasoning)

**Core can run anywhere:** A Raspberry Pi, a home server, a VPS. If Core is on a powerful machine, it can ALSO host the Brain sandbox on the same box — but Core and Brain remain separate processes regardless.

---

### BRAIN — The Connected Sandbox

The Brain is not a fixed process. It is a **connected sandbox** — any process that speaks MCP and can receive escalations from Core. The Brain Interface has three channels:

**Channel 1 — Escalation Inbox:** Core pushes escalations here. Audio payloads, sensor snapshots, mode context, the CoreSkill that fired. The Brain receives this and starts working.

**Channel 2 — Stream Out:** The Brain pushes its reasoning stream back to Core via `xentient_brain_stream`. Token by token. Tool calls as they fire. Core forwards these onto the SSE observability bus. The Dashboard renders them live.

**Channel 3 — Tool Calls Back to Core:** The Brain calls `xentient_*` MCP tools to act on the room. Play audio, register skills, change modes, push node skills, write artifacts.

Any process implementing these three channels is a valid Brain. Hermes does all three natively. A simple script could do Channel 1 and 3 only (no streaming). Claude Code could do all three plus computer use. The interface is the contract, not the implementation.

The Brain runs where the power is — a workstation, a VPS, a powerful local server. Its reach is bounded by the machine it runs on. Core intentionally has no reach beyond the room. The Brain has whatever reach its host machine allows.

Hermes is the reference Brain implementation. It implements all three channels fully — memory recall, LLM reasoning, skill execution, and live streaming of its reasoning process back to the Core observability bus.

The **Brain Feed** is the live window into the sandbox — visible in the Web Dashboard alongside Core telemetry. When Core escalates, you see it. When Brain reasons, you see it. When the room responds, you see it.

---

## The Skill Ecosystem — 3-Layer Continuum

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

**The key rule:** A skill is not "Node", "Core", or "Brain" by what it does — it is L0, L1, or L2 by **where it executes** and **what it can call**. All three layers contribute to the same unified skill ecosystem visible in the Web Dashboard.

---

## The Layered Voice Pipeline — The Killer Feature

This is the concrete embodiment of everything above. It is how modern conversational AI works, done right, in the Xentient model.

**The pipeline lives entirely in Core as a set of escalating CoreSkills:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — NOISE GATE (always on, free)                                │
│  CoreSkill: noise-gate                                                  │
│  Trigger: audio chunk from mic WebSocket                                │
│  Action: check RMS energy above threshold                               │
│  If below → discard, stay idle                                          │
│  If above → pass chunk to Layer 2                                       │
│  Cost: negligible (pure math, no model)                                 │
└────────────────────────────────────────────────────────────────────────┘
                           │ audio chunk
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — VOICE CLASSIFICATION (cheap, local)                         │
│  CoreSkill: voice-classifier                                            │
│  Trigger: audio chunk passed from Layer 1                               │
│  Model: tiny local model (ESP-side VAD or lightweight on-device)        │
│  Action: is this human speech? → yes/no                                 │
│  If no (ambient noise, fan, music) → discard                            │
│  If yes → flag audio for recording, pass to Layer 3                     │
│  Cost: small local model, no cloud, no LLM                              │
└────────────────────────────────────────────────────────────────────────┘
                           │ human speech detected
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — KEYWORD DETECTION (local, cheap)                            │
│  CoreSkill: keyword-spotter                                             │
│  Trigger: speech-flagged audio chunk                                    │
│  Model: Porcupine / Picovoice or local wake-word model                  │
│  Action: does audio contain "Hey Xentient"?                             │
│  If no → discard, return to Layer 1 idle                                │
│  If yes → trigger escalation, set mode to recording                     │
│  Cost: tiny local model, <5ms                                           │
└────────────────────────────────────────────────────────────────────────┘
                           │ keyword detected → escalate
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — COMMAND CAPTURE (Core, deterministic)                        │
│  CoreSkill: command-capture                                             │
│  Trigger: keyword detected, mode = recording                            │
│  Action: record raw PCM audio chunks                                    │
│  Termination: 2 consecutive seconds of silence → package audio          │
│  Barge-in: if new voice during Brain TTS playback → stop playback     │
│  Output: audio buffer → escalate to Brain with full audio payload       │
│  Cost: buffering only, no model                                         │
└────────────────────────────────────────────────────────────────────────┘
                           │ packaged audio → MCP notification
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  BRAIN — STT → LLM → TTS (the expensive part, once per utterance)      │
│  Brain Skill: voice-responder (runs in Hermes / any MCP client)         │
│  Receives: audio buffer + context (space, mode, sensor snapshot)        │
│  Step 1: STT (Whisper, Deepgram, etc.) → transcript                    │
│  Step 2: LLM (any provider via Brain router) → response text            │
│  Step 3: TTS (ElevenLabs, Google, etc.) → audio PCM                    │
│  Step 4: calls Core MCP tool: xentient_play_audio → Core streams back  │
│  Step 5: Core streams PCM out to Node Base speaker via WebSocket        │
│  Memory: Mem0 stores interaction automatically                          │
└────────────────────────────────────────────────────────────────────────┘
```

**Why this is the right model:**
- Layers 1-3 are always running, always free. You pay zero for silence.
- Layer 4 (capture) is deterministic. Core owns the timing.
- The Brain only activates once per confirmed intent. You pay once per utterance.
- The pipeline is composable — swap Picovoice for a custom model, it's just a CoreSkill.
- Barge-in is handled at Layer 4 inside Core — Brain doesn't need to manage it.

---

## The Node Base — Configurable by Mode

The Node Base is dumb by design, but **configurable by mode**. It does not reason. It does not make decisions. But its sampling behavior, active sensors, event emission frequency, and local state machine are all runtime-configurable via Node Skills pushed from Core over MQTT.

The Node Base always has a **base firmware** (never changes — the sacred FreeRTOS two-task model). On top of that, a Node Skill is a config payload that the base firmware loads and runs in its Mode Task.

---

## The Correct Architecture (What Needs to Change)

### Current Problem
`harness/src/engine/Pipeline.ts` lives inside Core and runs its own STT → LLM → TTS loop. This is wrong. Core should not own the intelligence pipeline.

### What Should Exist

```
harness/src/
├── core.ts                    ← always-on orchestrator entrypoint
├── engine/
│   ├── SkillExecutor.ts       ← heartbeat loop executing CoreSkills ✅ (built)
│   ├── ModeManager.ts         ← sleep/listen/active/record ✅ (built)
│   ├── SpaceManager.ts        ← identity + permissions ✅ (built)
│   ├── VoicePipeline.ts       ← RENAME / REFACTOR: owns only Layers 1-4
│   │                            (noise gate, VAD, keyword, capture)
│   │                            NO STT/LLM/TTS here
│   └── BrainRouter.ts         ← thin MCP dispatcher (post-demo)
├── skills/
│   ├── builtin/
│   │   ├── _pir-wake.ts       ← PIR → listen mode
│   │   ├── _noise-gate.ts     ← Layer 1 voice pipeline
│   │   ├── _voice-classifier.ts  ← Layer 2
│   │   ├── _keyword-spotter.ts   ← Layer 3
│   │   └── _command-capture.ts   ← Layer 4 (escalates to Brain)
│   └── pack/                  ← pack-defined skills loaded at runtime
├── mcp/
│   ├── server.ts              ← MCP server (Brain connects here) ✅
│   └── tools.ts               ← xentient_* MCP tools ✅
├── comms/
│   ├── MqttClient.ts          ← Node Base bridge ✅
│   └── AudioServer.ts         ← PCM WebSocket ✅
└── providers/                 ← STT/TTS/LLM SDKs (Brain uses these, not Core)

brain/                          ← SEPARATE PROCESS (can be in same repo, separate dir)
├── index.ts                   ← Brain entrypoint (MCP client connecting to Core)
├── hermes/
│   └── HermesAdapter.ts       ← wraps Hermes Agent API
├── pipeline/
│   └── VoiceResponder.ts      ← STT → LLM → TTS (receives escalation, responds)
└── adapters/
    ├── Mem0Adapter.ts
    ├── OpenClawAdapter.ts
    └── ArchonAdapter.ts
```

**The `brain-basic/` directory is the prototype Brain.** It should evolve into the `brain/` structure above. It is NOT Core. It should never be wired into `core.ts` directly — it connects via MCP.

---

## The Skill Improvement Loop (Self-Optimizing)

```
Core runs skills → emits skill_fired events
Brain reads xentient_get_skill_log
Brain detects patterns (too many false positives, wrong cooldown timing)
Brain calls xentient_update_skill with better parameters
Core runs updated skills
→ System gets smarter without developer intervention
```

This is what Hermes's `skill-improver` meta-skill does. Xentient is the platform that enables it.

---

## The Invariants — Lines We Never Cross

| Invariant | Why |
|-----------|-----|
| Core never makes LLM calls | LLM = Brain territory. Core stays deterministic. |
| Brain never talks to hardware directly | All hardware goes through Core MCP tools. |
| Core continues if Brain disconnects | The room never bricks. L1 skills keep running. |
| Basic mode always works | Even without Hermes, Core can do simple LLM chat via providers (fallback). |
| Skills are enum-gated, never eval | No arbitrary code execution. New action type = PR to Core. |
| One pack per space (v1) | Keep it simple. Multi-pack composition is v2. |
| Artifacts are saved by Core, consumed by Brain | Core writes audio/transcript to disk. Brain reads them via artifact path in MCP notification. |
| A Node Skill always has a paired CoreSkill | You never have node behavior Core doesn't understand |
| Node Skills are enum-gated on event types | No arbitrary MQTT floods from firmware |
| Core pushes Node Skills, nodes never self-select | Mode authority lives in Core, not in hardware |
| Node Skill hardware declarations are checked before push | Core won't push a camera skill to a node with no camera |
| Brain streams reasoning back to Core via MCP, not directly to Dashboard | Core owns the observability bus. Brain is a producer, not a publisher. |

---

## Ground Truth

**Code in `harness/src/` is ground truth for what Core can do today. Docs describe intent. When they conflict, code wins — then update the doc.**

---

## Current State (as of 2026-04-30)

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
| Core: Pipeline.ts (STT→LLM→TTS inside Core) | Wrong layer — DEPRECATED, see cutover gate below |
| Core: Configuration system (activeConfig) | Not built — realignment Sprint 1-2 |
| Core: TransitionQueue | Not built — realignment Sprint 2 |
| Core: Capability discovery MCP tools | Not built — realignment Sprint 3 |
| Core: Event subscription manager | Not built — realignment Sprint 4 |
| Core: Brain stream relay | Not built — realignment Sprint 6 |
| Brain: brain-basic MCP client | Working, correct layer |
| Brain: Separation into standalone process | Partial — brain-basic works but Brain Interface not formalized |
| Brain: Brain Feed streaming | Not built — realignment Sprint 6 |
| L0: Node Skill → NodeProfile compilation | Not built — realignment Sprint 1 |
| L0: Firmware two-task model + hot-swap | Not built — realignment Sprint 8 |
| Brain: Hermes adapter | Not built |
| Hosting: Core/Brain deployment guide | Not built |

### Pipeline.ts Cutover Gate

Pipeline.ts will be deleted from Core when ALL of the following are true:

1. Realignment Sprints 1-6 are complete
2. brain-basic successfully processes a voice escalation end-to-end:
   - Receives `xentient/skill_escalated` notification
   - Runs STT on the audio payload
   - Routes to LLM with context
   - Generates TTS audio
   - Calls `xentient_play_audio` via MCP tool
   - Audio plays through the Node Base speaker
3. A second test: Brain streams reasoning via `xentient_brain_stream` and it appears in the Dashboard
4. No regression in existing voice pipeline functionality

Until ALL four conditions are met, Pipeline.ts stays. No exceptions.

---

## The Next Right Steps — Configuration-Centric Realignment

**The architectural shift:** Core's operating concept changes from `activeMode` (behavioral mode) to `activeConfig` (configuration). A configuration bundles a NodeProfile + CoreSkills + BrainSkills + transitions. See `07-REALIGN-PLAN.md` for full details.

1. **Sprint 1: Type Foundation** — Add Configuration, NodeProfile, toNodeProfile() to type system. Remove BehavioralMode/modeFilter, add configFilter. **Done when:** types compile, all tests pass after rename.

2. **Sprint 2: activateConfig + TransitionQueue** — The architectural hinge. Config transitions are queued, not immediate. NodeProfile pushed to node. Skills filter by activeConfig. **Done when:** activateConfig() works end-to-end, queue ordering verified, config-scope filtering works.

3. **Sprint 3: MCP Capability Discovery** — `xentient_get_capabilities` + `xentient_get_skill_schema`. Brain discovers what the room can do without hardcoded knowledge. **Done when:** both tools return correct structured responses.

4. **Sprint 4: Brain Event Subscription** — `xentient_subscribe_events` with `maxRateMs` rate limiting. Brain observes passively. **Done when:** rate limiting verified, event batching works.

5. **Sprint 5: Brain Config Authoring** — `xentient_register_config`. Brain creates new configurations. Room gets permanently smarter. **Done when:** Brain-authored config appears in capabilities and can be activated.

6. **Sprint 6: Brain Stream** — `xentient_brain_stream`. Brain pushes reasoning tokens to SSE bus. Dashboard Brain Feed. **Done when:** reasoning tokens appear in Dashboard SSE stream.

7. **Sprint 7: Pipeline.ts Cutover Gate** — Mark deprecated, write gate, no deletion yet. **Done when:** gate documented in CONTEXT.md.

8. **Sprint 8: Firmware Two-Task Model** — NodeProfile C struct, Config Task, hot-swap protocol. **Done when:** ESP32 receives profile via MQTT, acks, sensor intervals change.

9. **Sprint 9: Documentation Realignment** — Zero references to activeMode/modeFilter/BehavioralMode. All docs use activeConfig/configFilter/Configuration.

**Sprint dependency graph:** 1 → 2 → {3, 4, 5}. Sprints 6, 7, 8 can start after Sprint 1. Sprint 9 is always last.

**After realignment (post-Sprint 9):** The original phase plan resumes — Phase 10 (4-layer voice CoreSkills), Phase 11 (L0 Node Skills, now trivially done by Sprint 8), Phase 12 (Brain Feed, now done by Sprint 6), Phase 14 (Hermes), Phase 15 (Docker deployment).

---

## How to Read the Docs

1. **This file (`CONTEXT.md`)** — What we are and where we go. Read first.
2. **`docs/ARCHITECTURE.md`** — The three-tier structure with L0 Node Skills. The "what shape."
3. **`docs/BRAIN-INTERFACE.md`** — The three-channel Brain spec. Anyone building a Brain reads this.
4. **`docs/NODE-SKILLS.md`** — The L0 behavioral contract model. Node Skill types, pairing, failure handling.
5. **`docs/SKILLS.md`** — Unified reference for what a skill is across all three layers. The one place for skill developers.
6. **`docs/CONTRACTS.md`** — MQTT, REST, SSE, MCP, Node Skill, Brain Stream contracts. The "how they talk."
7. **`docs/HARDWARE.md`** — BOM, pinouts, wiring decisions. The "what's wired."
8. **`docs/PACKS.md`** / **`docs/SPACES.md`** — The configuration model.

---

*"The room is the constant. The brain is the variable. Build the room right and any intelligence can move in."*
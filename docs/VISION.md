# Xentient Vision

> The authoritative vision document. Describes what Xentient is, what it owns, what it delegates, and how it evolves post-demo.

L1 Vision — Defines the bridge model and integration architecture. Referenced by all L2 spec docs.

---

## The Reframe

**Before:** Xentient was building a custom AI chat platform with its own memory system, fact extraction, and context management — reinventing what Hermes, Mem0, and others already solve.

**After:** Xentient is the **IoT terminal** — the physical body that any AI brain can wear. It uniquely owns the bridge between physical hardware and digital intelligence. Everything else delegates to best-in-class tools.

**Analogy:** OpenClaw gave AI the core functions of a computer (terminal, browser, filesystem). Xentient gives AI the core functions of a **room** (voice, sensors, displays, actuators). Same power move, different domain.

**Key shift:** We don't build the AI brain. We build the **bridge** that connects a room to any AI brain. The harness stays minimal. Intelligence comes from integration.

---

## What Xentient Owns vs. What It Delegates

### What Xentient Uniquely Owns (Never Delegate)

| Layer | Why Xentient Must Own It |
|-------|-------------------------|
| Voice streaming pipeline (VAD→STT→LLM→TTS→Audio WS) | Real-time token-to-audio streaming for embedded hardware — nobody else does this |
| MQTT hardware bridge | The ESP32↔harness protocol is domain-specific |
| LCD face state machine | Expressive physical display — no framework does this |
| Pack system (persona folder = bot brain) | The folder-as-config pattern with enum-gated tool handlers |
| Node Base peripheral map | Fixed-role hardware slots with compile-time binding |
| Space/Mode manager | Which physical Node Base, what mode (sleep/listen/active/record), what permissions |
| Brain Router (thin) | Pack-driven dispatcher that routes tool calls to the right adapter |

### What Xentient Delegates (Stop Rebuilding)

| Concern | Delegate To | Why |
|---------|-------------|-----|
| AI brain (LLM + memory + skills + tools + reasoning) | **Hermes Agent** | Full autonomous runtime with 3-layer memory, 118 skills, Home Assistant, voice mode, subagents — we'd rebuild all of this |
| Enhanced memory (semantic extraction, graph, recency) | **Mem0** | Recency weighting, entity resolution, semantic search, session boundaries — built-in, production-grade. Also a Hermes plugin for seamless integration |
| Computer use (terminal, browser, files) | **OpenClaw** | Battle-tested computer-use agent, sandbox execution, screen capture |
| Coding workflows (plan→code→review) | **Archon** | YAML-defined DAG workflows, git worktree isolation, can wrap Claude Code/Hermes |

### The Integration Flexibility Principle

Xentient's core is **mode-agnostic** — it doesn't care which AI brain is connected. Packs and Spaces define which integrations are available:

- **Basic mode:** Simple LLM chat (direct provider call, no memory, no skills). The simplest of all simple. Always works even without any integration.
- **Hermes+Mem0 mode:** Full AI brain with persistent memory, skills, Home Assistant, multi-step reasoning. The default upgrade.
- **Hermes+Mem0+OpenClaw mode:** Everything above plus computer use. Terminal, browser, filesystem control from the room.
- **Hermes+Mem0+Archon mode:** Everything above plus coding workflows. "Fix the MQTT bug" becomes a voice command that spawns a coding agent.

A Space declares which mode it runs in. The same hardware can be a simple room assistant in one space and a full dev workstation in another.

---

## Architecture: The Bridge Model

Xentient is not the brain. Xentient is the **bridge** between a physical room and any AI brain. The harness is a thin terminal OS; the communication layer is a sandbox/server that can run locally or in the cloud.

The architecture is explicitly three-tier:

- **Tier 1 — Hardware:** Node Bases with docked peripherals. Physical sensing and actuation. Dumb by design.
- **Tier 2 — Core:** The always-on hosted layer. Runs the Runtime daemon and Web Control Panel as two faces of the same system. The Core owns hardware state, which is why it runs live 24/7. The Web Control Panel (Face B) provides hardware config, pack/space/permission management, integration toggles, and live telemetry — all sharing the same codebase and state as the Runtime daemon (Face A).
- **Tier 3 — AI Brain:** Remote/sandboxed services — Hermes, Mem0, OpenClaw, Archon. These are external processes, never embedded in Core. Core connects to them via adapters.

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3 — AI Brain (remote/sandboxed)                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Hermes Agent (default brain)                            │    │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐│    │
│  │  │ LLM     │ │ 3-Layer │ │ Skills   │ │ Home         ││    │
│  │  │ (18+    │ │ Memory  │ │ (118    │ │ Assistant    ││    │
│  │  │providers│ │ +Mem0   │ │ bundled)│ │ Integration  ││    │
│  │  │  )      │ │ plugin  │ │         │ │               ││    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └──────┬───────┘│    │
│  │       └──────┬─────┘           │              │         │    │
│  │              │                 │              │         │    │
│  │       ┌──────┴──────┐    ┌────┴─────┐  ┌─────┴──────┐  │    │
│  │       │ Mem0        │    │ OpenClaw │  │ Archon     │  │    │
│  │       │ (enhanced  │    │ (compute │  │ (coding    │  │    │
│  │       │  memory)   │    │  use)    │  │  workflows)│  │    │
│  │       └─────────────┘    └──────────┘  └────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Communication Layer (sandbox — Docker or local process)         │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  REST API / WebSocket / MQTT Bridge                     │    │
│  │  - Receives audio/text from Xentient Core               │    │
│  │  - Routes to active AI brain                            │    │
│  │  - Returns audio/text/actions to Xentient Core          │    │
│  └──────────────────────────┬───────────────────────────────┘    │
└─────────────────────────────┼────────────────────────────────────┘
                              │  WebSocket / MQTT / HTTPS
                              │  (runs on same LAN or remote server)
┌─────────────────────────────┼────────────────────────────────────┐
│  TIER 2 — Core (always-on hosted)                                │
│                                                                  │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐ │
│  │ Face A: Runtime      │  │ Face B: Web Control Panel         │ │
│  │ Daemon               │  │ - Hardware config                 │ │
│  │ - Voice I/O Pipeline │  │ - Sleep state control             │ │
│  │ - MQTT/Sensor Bridge │  │ - Pack/Space/Permission mgmt     │ │
│  │ - LCD Face Machine   │  │ - Integration toggles             │ │
│  │ - Mode/Space Manager │  │ - Live telemetry                  │ │
│  └──────────┬───────────┘  └──────────────┬────────────────────┘ │
│             └──────────┬───────────────────┘                      │
│                        │                                          │
│                 ┌──────┴──────┐                                   │
│                 │ Brain Router │  ← pack-driven, space-gated      │
│                 │ (thin)      │                                   │
│                 └──┬───┬───┬──┘                                   │
│                    │   │   │                                      │
│             ┌──────┘   │   └──────┐                               │
│             ▼          ▼         ▼                               │
│           hermes   computer   agent                              │
│           adapter   use        delegate                           │
│           adapter   adapter    adapter                            │
│             │         │           │                               │
│             ▼         ▼           ▼                              │
│           Hermes   OpenClaw    Archon                            │
│           API      sandbox     workflows                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Basic Mode (fallback — always available)                 │    │
│  │ Direct LLM provider call. No memory, no skills.         │    │
│  │ Simplest of all simple. Works without any integration.   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                         MQTT / WebSocket
                              │
┌─────────────────────────────┼────────────────────────────────────┐
│  TIER 1 — Hardware (Node Bases + peripherals)                    │
│                                                                  │
│   ┌────┴────────────┐                                            │
│   │ Node Base        │                                            │
│   │ + LCD (face)     │                                            │
│   │ + Mic (INMP441)  │                                            │
│   │ + Speaker (amp)  │                                            │
│   │ + PIR (HC-SR501) │                                            │
│   │ + BME280 (env)   │                                            │
│   │ + ESP32-CAM (eye)│                                            │
│   └──────────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

### Why This Architecture

1. **We don't rebuild the brain.** Hermes already has LLM routing, 3-layer memory, skills, Home Assistant, voice mode, subagent delegation, cron scheduling. Building all of that would take months. Integrating takes days.
2. **The bridge is what we master.** Voice pipeline, hardware bridging, LCD face, mode management — these are IoT-specific problems that no AI framework solves. This is our differentiator.
3. **The sandbox is flexible.** Run Hermes+Mem0 locally on a Pi for privacy, or on a cloud server for power. The harness doesn't care where the brain runs — it just needs a connection.
4. **Basic mode always works.** Even without Hermes, Xentient can do simple LLM chat. The terminal never bricks because the brain is offline.

---

## Spaces: Identity, Permissions, Modes

### Concept

A **Space** is like a **user account on a computer** — it defines who Xentient is being, what it can access, and what mode it's in. Spaces are not just rooms; they're identity contexts.

```
Space = Identity (who am I?)
      + Pack (how do I behave?)
      + Mode (what state am I in?)
      + Permissions (what can I access?)
      + Memory scope (what do I remember?)
```

### Space Model

```typescript
interface Space {
  id: string;                // kebab-case: "living-room", "study-desk"
  nodeBaseId: string;        // MQTT node ID of the physical hardware
  activePack: string;        // which pack is loaded
  mode: SpaceMode;           // current operational mode
  integrations: Integration[];// which AI brains are available
  role?: string;             // optional context: "student", "family", "dev"
  sensors: string[];         // available peripherals
}

type SpaceMode =
  | "sleep"      // low power, PIR wake only, no audio processing
  | "listen"     // listening for wake word / sound triggers, passive
  | "active"     // full conversation, all integrations available
  | "record"     // recording mode, audio capture only, no response

type Integration =
  | "basic"          // direct LLM call (always available)
  | "hermes"         // Hermes Agent with full brain capabilities
  | "hermes+mem0"    // Hermes + Mem0 enhanced memory
  | "openclaw"       // computer use (terminal, browser, files)
  | "archon"         // coding workflows
```

### Mode Transitions

```
                    PIR motion
    ┌─────────┐  or wake word   ┌─────────┐  user speaks   ┌────────┐
    │  SLEEP  │───────────────► │  LISTEN  │─────────────► │ ACTIVE │
    │         │                 │         │                 │        │
    └─────────┘                 └─────────┘                 └────────┘
         ▲                           │  ▲                        │
         │                    timeout │  │               idle timeout│
         │                           │  │ record cmd         │
         │                           ▼  │                     │
         │                      ┌────────┐                     │
         └──────────────────────│ RECORD │◄────────────────────┘
          sleep cmd              └────────┘   explicit sleep cmd
```

The **Mode Manager** is a core component. It persists the current mode, manages transitions, and routes audio/processing based on mode:

- **SLEEP:** PIR interrupts only, no STT/TTS processing, LCD shows `(_ _) Zzz`
- **LISTEN:** VAD active, wake word detection, no LLM calls until triggered
- **ACTIVE:** Full pipeline (STT→LLM→TTS), integrations available per Space config
- **RECORD:** Audio capture to file, no response, LCD shows `(_ _) REC`

### Space Examples

| Space | Node Base | Pack | Mode (default) | Integrations | Role |
|-------|-----------|------|-----------------|-------------|------|
| `living-room` | node-01 | `family-companion` | listen | hermes+mem0 | family |
| `study-desk` | node-02 | `study-buddy` | active | hermes+mem0, openclaw | student |
| `workshop` | node-03 | `dev-assistant` | active | hermes+mem0, openclaw, archon | developer |
| `bedroom` | node-04 | `prayer-companion` | listen | hermes+mem0 | personal |

### Space Memory Scoping (via Mem0)

Mem0 supports multi-level memory natively. The Space concept maps directly:

- **Space-scoped facts:** "living-room temperature is usually 24C" — stored with `space_id` tag
- **User-scoped facts:** "my name is David" — stored with `user_id` tag, shared across spaces
- **Role-scoped facts:** "I'm studying for midterms" — stored with `role` tag, activates in study-desk space
- **Global facts:** "Philippines uses 220V outlets" — no tag, available everywhere

This replaces the flat `facts` table in current MemoryDB with a dimensionally richer model.

### Space + MQTT Contract

```json
{ "v":1, "type":"space_status", "spaces": [
  { "id":"living-room", "nodeBaseId":"node-01", "activePack":"family-companion",
    "mode":"listen", "integrations":["hermes+mem0"], "online":true },
  { "id":"study-desk", "nodeBaseId":"node-02", "activePack":"study-buddy",
    "mode":"active", "integrations":["hermes+mem0","openclaw"], "online":false }
]}
```

Control messages:
- `{v:1, type:"space_switch", spaceId:"study-desk"}` — change active space
- `{v:1, type:"mode_set", mode:"sleep"}` — change operational mode
- `{v:1, type:"role_set", role:"student"}` — set role within current space
- `{v:1, type:"integration_enable", name:"openclaw"}` — enable an integration for this space

---

## Integration Details

### Hermes Agent (Default AI Brain)

**What it is:** A full autonomous agent runtime (96K GitHub stars, MIT license, by Nous Research). It's not a library you call — it's a process you connect to.

**What it provides:**
- **LLM routing:** 18+ providers, OpenAI-compatible endpoints, Ollama for local models
- **3-layer memory:** Session context (L1) + SQLite+FTS5 persistent store (L2) + user model (L3)
- **Mem0 as plugin:** First-class integration — `hermes memory setup` → select Mem0 → done
- **118 bundled skills:** Auto-created, self-improving procedural memory
- **Home Assistant integration:** IoT-native — controls devices, reads sensors, triggers automations
- **Voice mode:** Built-in STT/TTS support
- **Subagent delegation:** Up to 3 concurrent isolated subagents
- **Cron scheduling:** Time-based triggers, recurring tasks
- **15+ messaging platforms:** Telegram, Discord, Slack, WhatsApp, Signal, Matrix, etc.
- **MCP integration:** Connect any MCP server

**How Xentient connects:**
- Hermes runs as a process on the server (local computer or cloud)
- Xentient's `HermesAdapter` sends text/audio via Hermes API
- Hermes handles LLM calls, memory, skills, tool dispatch
- Xentient receives responses and routes them through voice pipeline or LCD

**Why Hermes instead of building our own:**
- We'd rebuild: LLM routing → already done
- We'd rebuild: Memory management → already done (3-layer + Mem0)
- We'd rebuild: Tool/skill dispatch → already done (118 skills)
- We'd rebuild: Multi-step reasoning → already done
- We'd rebuild: Home Assistant → already done
- We'd rebuild: Context rot handling → Mem0 plugin handles it

The entire `memory/` directory (MemoryDB, FactExtractor, MemoryInjector, schema.ts) — ~300 LOC of custom code that reinvents what Hermes+Mem0 do better — gets replaced by a ~80 LOC adapter.

### Mem0 (Enhanced Memory)

**What it is:** Production-grade AI memory layer (53K GitHub stars, Apache 2.0). Self-hosted Docker or cloud API.

**What it provides:**
- **Semantic memory:** Automatic fact extraction from conversations
- **Recency weighting:** Recent memories rank higher (solves context rot)
- **Entity resolution:** "David" and "Dave" = same person
- **Multi-level scoping:** User, session, agent, custom tags (maps to Spaces)
- **Graph memory:** Neo4j-based relationship layer
- **Search:** Vector similarity + BM25 + entity fusion
- **Versioning:** Memory history with audit trail

**How Xentient uses it:**
- Primary: As a Hermes plugin (Hermes manages the integration)
- Fallback: Direct API call when Hermes isn't available (basic mode with memory)

**What it replaces:**
- `memory/MemoryDB.ts` → delegate to Mem0
- `memory/FactExtractor.ts` → delegate to Mem0
- `memory/MemoryInjector.ts` → delegate to Mem0
- `memory/schema.ts` → delegate to Mem0

### OpenClaw (Computer Use)

**What it is:** A battle-tested computer-use agent with sandbox execution.

**How Xentient connects:**
- OpenClaw runs as a sidecar process (Docker container)
- Xentient's `OpenClawAdapter` sends instructions via API
- Results come back as text/structured data
- Always sandboxed — Xentient can't bypass OpenClaw's isolation

### Archon (Coding Workflows)

**What it is:** A coding workflow engine (17K GitHub stars). YAML-defined DAGs for plan→code→review cycles.

**How Xentient connects:**
- Archon runs as a service (Python, localhost)
- Xentient's `ArchonAdapter` delegates coding goals via REST API
- Only available in spaces with `archon` integration enabled
- **Not the core loop** — it's one of many integrations, not the orchestrator

**Why Archon is NOT the core:**
- Archon is a coding workflow engine, not a general-purpose agent runtime
- Xentient needs general intelligence (conversation, memory, IoT control) — not just coding
- Hermes provides the general brain; Archon is a specialized tool for dev-mode spaces

---

## The Communication Layer: Server Architecture

The AI Brain Layer and Xentient Core communicate through a **communication layer** that can run anywhere:

### Local Setup (Raspberry Pi or development machine)

```
┌─────────────────────────────────────────┐
│  Server (Raspberry Pi or desktop)       │
│                                         │
│  ┌──────────┐  ┌───────┐  ┌──────────┐ │
│  │ Hermes   │  │ Mem0  │  │ OpenClaw │ │
│  │ Agent    │  │ Docker│  │ Docker   │ │
│  │ (process)│  │       │  │          │ │
│  └─────┬────┘  └───┬───┘  └────┬─────┘ │
│        │           │           │        │
│  ┌─────┴───────────┴───────────┴──────┐ │
│  │  Communication Bridge (Node.js)     │ │
│  │  - REST API for tool calls          │ │
│  │  - WebSocket for streaming audio     │ │
│  │  - MQTT bridge for hardware         │ │
│  └──────────────┬──────────────────────┘ │
└─────────────────┼────────────────────────┘
                  │  LAN / WebSocket
┌─────────────────┼────────────────────────┐
│  ESP32 Node Base │                        │
│  (MQTT + WS)     │                        │
└──────────────────┘                        │
                                             │
┌────────────────────────────────────────────┘
│  Xentient Core (same server or remote)
│  - Voice pipeline
│  - MQTT bridge to Node Base
│  - LCD face state machine
│  - Mode/Space manager
│  - Pack loader
│  - Brain Router → routes to adapters
```

### Cloud Setup (remote server)

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  Local (home network)   │     │  Cloud Server            │
│                         │     │                          │
│  ┌─────────────────┐    │     │  ┌──────────┐           │
│  │ Xentient Core   │◄──┼─────┼──►│ Hermes  │           │
│  │ + Node Base     │    │  WS │  │ + Mem0  │           │
│  │ (voice/hardware)│    │     │  │ + OpenClaw│          │
│  └─────────────────┘    │     │  └──────────┘           │
│                         │     │                          │
└─────────────────────────┘     └──────────────────────────┘
```

**Key principle:** The core doesn't care where the brain runs. It just needs a WebSocket/REST connection. Local for privacy, cloud for power.

---

## Brain Router: Pack-Driven, Space-Gated

The Brain Router is the **routing layer inside Core** that dispatches handler invocations across the three tiers — Hardware via MQTT, Core-local basic LLM, or AI Brain tier via Hermes/OpenClaw/Archon adapters. It is thin — it doesn't do reasoning, it dispatches.

**Handler types:**

| Handler | What It Does | Available When |
|---------|-------------|----------------|
| `mqtt-publish` | Publish payload to MQTT topic | Always |
| `mqtt-request-response` | Publish, await reply with timeout | Always |
| `basic-llm` | Direct provider call (no memory, no skills) | Always (fallback) |
| `hermes-chat` | Send message to Hermes Agent | Space has `hermes` integration |
| `hermes-memory` | Query/store via Hermes memory (Mem0-backed) | Space has `hermes+mem0` integration |
| `hermes-skill` | Invoke a Hermes skill by name | Space has `hermes` integration |
| `computer-use` | Delegate instruction to OpenClaw sidecar | Space has `openclaw` integration |
| `agent-delegate` | Delegate multi-step goal to Archon | Space has `archon` integration |

**Security model:**
- Enum-gated — no `eval`, no dynamic require, no arbitrary code
- Adding a handler type requires a harness PR — intentional friction
- `computer-use` always runs in OpenClaw's sandbox
- `agent-delegate` bounded by `maxSteps` and pack-declared tool whitelist
- Space permissions gate which handlers are available — `study-desk` can't use `computer-use` unless configured

---

## Concrete Demo: Daily Prayer Workflow

**User says:** "Give me my daily prayer."

**Without integrations (basic mode):**
```
User → STT → LLM (no memory) → TTS → "I don't have access to your prayer preferences in basic mode."
```

**With Hermes+Mem0 (default integration):**
```
Step 1: [Hermes+Mem0] Retrieve faith tradition, prayer preferences, recent concerns
Step 2: [Hermes+Mem0] Retrieve this week's emotional context
Step 3: [Hermes Skill] Invoke "daily_verse" skill (web fetch)
Step 4: [Hermes LLM] Compose personalized prayer using Steps 1-3
Step 5: [Xentient TTS] Speak the prayer
Step 6: [Xentient LCD] Display verse reference (e.g., "Psalm 23:1")
Step 7: [Mem0] Store that prayer was delivered today (prevents duplicate)
```

**With Hermes+Mem0+OpenClaw (study-desk space):**
```
Same as above, PLUS:
Step 8: [OpenClaw] Save prayer to local file if user requests
Step 9: [Hermes Skill] Set reminder for tomorrow's prayer via cron
```

This is something no basic chat platform can do — it requires voice + memory + skills + display orchestration. And we don't build any of that. We just bridge to it.

---

## Post-Demo Migration Path

### Phase Order

| Phase | What | LOC Impact | Dependency |
|-------|------|-----------|-------------|
| **P1: Hermes Adapter** | Replace custom LLM+memory loop with Hermes connection. Delegate `memory/` to Mem0. Add `HermesAdapter.ts`. | -300 LOC custom, +80 LOC adapter | Hermes Agent installed on server |
| **P2: Mem0 Integration** | Add Mem0 as Hermes plugin. Add `Mem0Adapter.ts` for fallback (basic mode with memory). | +30 LOC adapter | Mem0 Docker running |
| **P3: Mode Manager** | Add `ModeManager.ts` with sleep/listen/active/record state machine. Wire into Pipeline. | +60 LOC | None |
| **P4: Space Manager** | Add `SpaceManager.ts`, MQTT space contract, space-scoped permissions. | +100 LOC | P3 complete |
| **P5: Pack Loader v2** | Extend pack loader with new handler types, space awareness. | +60 LOC | P1, P4 complete |
| **P6: Web Control Panel** | Core's Face B: hardware config UI, sleep state control, pack/space/permission management, integration toggles, live telemetry. Shares codebase with Runtime daemon. | +200 LOC | P4 complete |
| **P7: Communication Bridge** | REST/WS/MQTT bridge between Core and AI Brain tier. Configurable local/cloud. | +100 LOC | P1 complete |
| **P8: OpenClaw Adapter** | Add `OpenClawAdapter.ts` for computer-use handler. | +60 LOC | P5 complete |
| **P9: Archon Adapter** | Add `ArchonAdapter.ts` for agent-delegate handler. Basic YAML DAG workflows only. | +50 LOC | P5 complete |

### Target Core Size

**Current:** ~600 LOC (Pipeline + Memory + Providers + Comms + Index)
**After P1-P9:** ~930 LOC (Pipeline + Comms + Brain Router + Space/Mode Mgr + Pack Loader + Web Control Panel + thin adapters + Communication Bridge)

The core shrinks dramatically because custom memory code drops out (-300 LOC) and Hermes handles the entire LLM+memory+skills+reasoning loop. It grows for new components. Net: ~330 LOC increase, but infinitely more capable because Hermes provides months of work for free.

### Files That Change

| File | Action |
|------|--------|
| `memory/MemoryDB.ts` | **DELETE** → Hermes manages memory |
| `memory/FactExtractor.ts` | **DELETE** → Mem0 handles fact extraction |
| `memory/MemoryInjector.ts` | **DELETE** → Hermes+Mem0 handle injection |
| `memory/schema.ts` | **DELETE** → Mem0 manages its own storage |
| `engine/Pipeline.ts` | **REFACTOR** — add mode-aware routing, remove memory hooks |
| `comms/MqttClient.ts` | **STAY** — add mode/space control topics |
| `comms/AudioServer.ts` | **STAY** — audio streaming unchanged |
| `providers/*` | **STAY** — basic mode still uses direct providers |
| `index.ts` | **REFACTOR** — wire adapters, add Mode/Space managers |
| NEW: `engine/BrainRouter.ts` | **CREATE** — pack+space-driven handler dispatch |
| NEW: `engine/ModeManager.ts` | **CREATE** — sleep/listen/active/record state machine |
| NEW: `engine/SpaceManager.ts` | **CREATE** — space context + MQTT contract + permissions |
| NEW: `adapters/HermesAdapter.ts` | **CREATE** — thin bridge to Hermes Agent API |
| NEW: `adapters/Mem0Adapter.ts` | **CREATE** — thin wrapper for direct Mem0 calls (fallback) |
| NEW: `adapters/OpenClawAdapter.ts` | **CREATE** — sidecar process manager |
| NEW: `adapters/ArchonAdapter.ts` | **CREATE** — coding workflow bridge |
| NEW: `bridge/CommunicationBridge.ts` | **CREATE** — REST/WS/MQTT bridge to AI Brain tier |
| NEW: `web/ControlPanel.ts` | **CREATE** — Web Control Panel (Face B of Core) |

---

## Demo Day (Apr 24) — What Ships

**None of the above is implemented before demo.** The current harness ships as-is:
- Voice pipeline: STT → LLM → TTS streaming
- MQTT hardware bridge + VAD
- Memory (MemoryDB + FactExtractor + MemoryInjector) — works for 5-minute demo
- LCD display (if B7 is green by demo)
- Pack system: NOT live for demo (post-demo work)

**Demo narrative addition (post-reframe awareness):**
> "Xentient today is a voice-first IoT assistant with basic memory. After demo, it becomes a terminal — any AI brain can plug into this body. Hermes gives it full intelligence. Mem0 gives it persistent memory that doesn't rot. OpenClaw gives it computer use. The core goes from 600 to 930 lines, but the capability jumps from a chatbot to a room-scale intelligence platform."

---

## Preserved Context: Pre-Reframe Decisions

The following hardware/firmware decisions from NOTES.md remain authoritative. The reframe applies to software architecture only.

### Hardware Decisions (UNCHANGED)

- B1-B7 decisions locked (retry bug, data contract, firmware, JST, enclosures, LCD)
- B4 EEPROM enumeration DROPPED — compile-time peripheral map instead
- Sample rate: 16kHz mono PCM S16LE, raw (no Opus on-device)
- B6 enclosures: PETG, slot-in slide mount, design peripherals first then dock
- B7 LCD: I2C 16x2 at 0x27, core to Node Base dock (not peripheral)

### Provider SDK (ALREADY EXISTS)

- 7 providers shipped: Anthropic, Gemini, OpenAI (LLM); Deepgram, Whisper (STT); ElevenLabs, GoogleTTS (TTS)
- Post-demo: publish as npm `@xentient/provider-sdk`

### Pack System (PRIMARY POST-DEMO WORK)

Folder spec, manifest schema, lifecycle, hot-reload, MQTT control — all preserved from NOTES.md. New handler types added (see Brain Router table above).

### Non-Goals (STILL VALID)

- No custom DSL
- No sandboxing / VM isolation (handlers are enum-gated = safe by design)
- No versioned pack migrations (v1)
- No pack dependencies
- No remote pack fetch at boot
- No multi-pack active state (one pack per space)

---

## Glossary

- **Pack:** one folder under `packs/` containing everything that defines a bot's behavior
- **Space:** an identity context — like a user account on a computer. Binds a physical Node Base to a pack, mode, role, and integration set
- **Mode:** operational state of a space: sleep (low power, PIR wake), listen (wake word detection), active (full conversation), record (audio capture only)
- **Brain Router:** pack+space-driven routing layer inside Core that dispatches handler invocations across tiers (Hardware via MQTT, Core-local basic LLM, or AI Brain tier via adapters)
- **Handler (tool):** enum-gated action type — tools cannot execute arbitrary code
- **Adapter:** thin wrapper that translates Xentient's internal interface to an external service's API
- **Integration:** a capability set that a Space can enable (basic, hermes, hermes+mem0, openclaw, archon)
- **Sidecar:** an external process managed by the core, communicating via local API
- **Basic mode:** direct LLM provider call with no memory or skills — always available as fallback
- **Communication Bridge:** the layer between Xentient Core and AI Brain services, configurable for local or cloud deployment
- **Context rot:** stale/irrelevant memory leaking into LLM context — solved by Mem0's recency weighting
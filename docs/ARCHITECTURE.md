# Xentient Architecture

> Visual reference. Source of truth for *structure* — for *intent* see `VISION.md`, for *contracts* see `CONTRACTS.md`, for *hardware* see `HARDWARE.md`.

L1 Architecture — the shape of the system. All diagrams use Mermaid; render in GitHub or any Mermaid viewer.

---

## 1. The One-Sentence Model

> **Xentient is a bridge.** A physical room (Tier 1) talks to a swappable AI brain (Tier 3) through a thin, always-on Core (Tier 2) with a separate web console as its human surface.

```mermaid
flowchart LR
    T1["TIER 1<br/>Hardware<br/>(Node Bases)"]
    T2C["TIER 2 — Core<br/>Runtime daemon<br/>(Node/Python)"]
    T2W["TIER 2 — Web Console<br/>Laravel + Livewire<br/>(separate process)"]
    T3["TIER 3<br/>AI Brain<br/>(Hermes / Mem0 / OpenClaw / Archon)"]
    OP(["Operator<br/>(browser)"])

    T1 <-->|MQTT + WS audio| T2C
    T2C <-->|REST + WS| T2W
    T2W <-->|MQTT control| T1
    T2C <-->|REST / WS / MQTT bridge| T3
    OP <-->|HTTPS + WS| T2W
```

**Key idea:** Core and Web are *different processes*. Either can crash without taking the other down. They share data, never memory.

---

## 2. Three-Tier Component Map

```mermaid
flowchart TB
    subgraph T1["TIER 1 — Hardware (dumb by design)"]
        direction LR
        NB["Node Base<br/>(ESP32)"]
        NB --- LCD["LCD<br/>PCF8574 16x2"]
        NB --- MIC["Mic<br/>INMP441 I2S"]
        NB --- SPK["Speaker<br/>MAX98357A"]
        NB --- PIR["PIR<br/>HC-SR501"]
        NB --- BME["BME280<br/>I2C env"]
        NB --- CAM["ESP32-CAM<br/>(eye, optional)"]
    end

    subgraph T2["TIER 2 — Core Runtime + Web Console"]
        direction TB
        subgraph CORE["Core Runtime (always-on daemon)"]
            direction TB
            VP["Voice Pipeline<br/>VAD → STT → LLM → TTS"]
            MQB["MQTT Bridge"]
            AS["Audio WS Server"]
            FACE["LCD Face<br/>State Machine"]
            MM["Mode Manager<br/>sleep/listen/active/record"]
            SM["Space Manager<br/>identity + permissions"]
            PL["Pack Loader"]
            BR["Brain Router<br/>(thin dispatcher)"]
            ART["Artifact Writer<br/>(audio + transcript + meta)"]
            REST["REST + WS API<br/>(for Web Console)"]
        end
        subgraph WEB["Web Console (Laravel + Livewire 3 + Reverb)"]
            direction TB
            UI["Mode buttons<br/>Session feed<br/>Telemetry charts"]
            MQTC["MQTT client<br/>(php-mqtt/client)"]
            REVERB["Reverb WebSocket"]
        end
        BROKER[("Mosquitto<br/>MQTT broker")]
        DISK[("Local disk<br/>/var/xentient/artifacts")]
    end

    subgraph T3["TIER 3 — AI Brain (remote/sandboxed, post-demo)"]
        direction TB
        HERMES["Hermes Agent<br/>(LLM + skills + HA)"]
        MEM0["Mem0<br/>(semantic memory)"]
        OC["OpenClaw<br/>(computer use)"]
        ARC["Archon<br/>(coding workflows)"]
    end

    NB <-->|MQTT JSON v=1| BROKER
    NB <-->|WS PCM 16k mono| AS
    BROKER <--> MQB
    BROKER <--> MQTC
    CORE -->|writes| DISK
    WEB -->|reads via REST| CORE
    REST <--> WEB
    BR -.adapter.-> HERMES
    BR -.adapter.-> MEM0
    BR -.adapter.-> OC
    BR -.adapter.-> ARC
```

---

## 3. The Event Pipeline (Trigger → Pipeline → Output → Artifact)

The processing model is **not** "voice in, voice out." That is one specialization of a generic pattern.

```mermaid
flowchart LR
    subgraph TRIG["Triggers (interchangeable)"]
        T_WAKE["Wake word<br/>(mic)"]
        T_BTN["Web button"]
        T_PIR["PIR motion"]
        T_CRON["Cron / API"]
    end

    subgraph PIPE["Pipeline (composable)"]
        IN["Inputs<br/>audio • video • sensor • text"]
        PROC["Processor<br/>basic-llm | hermes-chat<br/>| openclaw | archon"]
        OUT["Outputs<br/>TTS • record • md-note<br/>• mqtt-action • web-feed"]
        IN --> PROC --> OUT
    end

    subgraph STORE["Artifact Store"]
        FILES[("audio.wav<br/>video.mp4<br/>transcript.txt<br/>summary.md")]
        META[("metadata row<br/>(SQLite)")]
    end

    T_WAKE --> IN
    T_BTN --> IN
    T_PIR --> IN
    T_CRON --> IN
    OUT --> FILES
    OUT --> META
```

Pipelines are declared per Pack. Triggers, processors, and outputs are all enum-gated handler types — **no arbitrary code**.

---

## 4. Mode State Machine

```mermaid
stateDiagram-v2
    [*] --> SLEEP
    SLEEP --> LISTEN: PIR motion / wake word / web cmd
    LISTEN --> ACTIVE: user speaks / web cmd
    LISTEN --> SLEEP: timeout
    ACTIVE --> LISTEN: idle timeout
    ACTIVE --> RECORD: record cmd
    RECORD --> LISTEN: stop cmd
    LISTEN --> RECORD: record cmd
    ACTIVE --> SLEEP: explicit sleep
    RECORD --> SLEEP: explicit sleep

    note right of SLEEP
        PIR-only wake.
        LCD: (_ _) Zzz
    end note
    note right of LISTEN
        VAD on.
        No LLM until trigger.
    end note
    note right of ACTIVE
        Full STT→LLM→TTS.
        Brain integrations enabled per Space.
    end note
    note right of RECORD
        Capture only.
        LCD: (_ _) REC
    end note
```

---

## 5. Brain Router — Dispatch Table

The Brain Router is a thin, **enum-gated** dispatcher. Adding a new handler type requires a harness PR — that is the security model.

```mermaid
flowchart LR
    PACK["Pack manifest<br/>(declares handlers)"] --> BR["Brain Router"]
    SPACE["Space context<br/>(integrations + permissions)"] --> BR

    BR --> H1["mqtt-publish"]
    BR --> H2["mqtt-request-response"]
    BR --> H3["basic-llm<br/>(always available)"]
    BR --> H4["hermes-chat"]
    BR --> H5["hermes-memory"]
    BR --> H6["hermes-skill"]
    BR --> H7["computer-use<br/>(OpenClaw sandbox)"]
    BR --> H8["agent-delegate<br/>(Archon)"]

    H1 --> BROKER[("MQTT broker")]
    H2 --> BROKER
    H3 --> PROV["Provider SDK<br/>(Anthropic/OpenAI/Gemini)"]
    H4 & H5 & H6 -.-> HERMES["Hermes API"]
    H7 -.-> OC["OpenClaw sidecar"]
    H8 -.-> ARC["Archon REST"]
```

| Handler | Tier | Available when |
|---|---|---|
| `mqtt-publish` / `mqtt-request-response` | T1 via T2 | Always |
| `basic-llm` | T2 local | Always (fallback) |
| `hermes-chat` / `hermes-memory` / `hermes-skill` | T3 | Space has `hermes` integration |
| `computer-use` | T3 sandbox | Space has `openclaw` integration |
| `agent-delegate` | T3 | Space has `archon` integration |

---

## 6. Spaces — Identity, Permissions, Modes

A Space is "a user account, but for a room." It binds *what hardware*, *what pack*, *what mode*, *what brain*.

```mermaid
classDiagram
    class Space {
        +string id
        +string nodeBaseId
        +string activePack
        +SpaceMode mode
        +Integration[] integrations
        +string role
        +string[] sensors
    }
    class SpaceMode {
        <<enum>>
        sleep
        listen
        active
        record
    }
    class Integration {
        <<enum>>
        basic
        hermes
        hermes+mem0
        openclaw
        archon
    }
    class Pack {
        +string id
        +Pipeline[] pipelines
        +Handler[] allowedHandlers
    }
    class NodeBase {
        +string id
        +Peripheral[] slots
    }

    Space --> SpaceMode
    Space --> Integration
    Space --> Pack : activePack
    Space --> NodeBase : nodeBaseId
```

**Mem0 scoping mirrors this:** facts are tagged with `space_id`, `user_id`, `role`, or left untagged (global). Same brain, different recall depending on which Space is talking.

---

## 7. Demo vs Platform Topology

### Demo (Apr 24) — single PC + tunnel

```mermaid
flowchart TB
    subgraph PC["Operator PC (Windows + Laragon)"]
        CORE2["Core Runtime"]
        WEB2["Laravel Web Console"]
        MOSQ["Mosquitto"]
        DISK2[("artifacts/")]
        CORE2 <--> MOSQ
        WEB2 <--> MOSQ
        WEB2 <-->|REST/WS| CORE2
        CORE2 --> DISK2
    end
    TUN["cloudflared tunnel"]
    BROWSER(["Browser<br/>(panel demo)"])
    NB2["Node Base<br/>(LAN)"]

    PC --> TUN --> BROWSER
    NB2 <-->|LAN MQTT + WS| MOSQ
    NB2 <--> CORE2
```

Brain tier = **basic-llm only** (direct provider call). Hermes/Mem0/OpenClaw/Archon are **deferred** to platform.

### Platform (post-demo) — local PC + VPS, two brains

```mermaid
flowchart LR
    subgraph LOCAL["Local PC (workspace)"]
        CORE_L["Core (optional)"]
        BRAIN_L["Local Brain<br/>(workspace access:<br/>files, OpenClaw)"]
    end
    subgraph VPS["VPS (always-on)"]
        CORE_V["Core"]
        WEB_V["Web Console"]
        BRAIN_V["VPS Brain<br/>(cloud tools only)"]
    end

    LOCAL <-->|artifact sync| VPS
    BROWSER2(["Operator<br/>browser"]) <--> WEB_V
    NB3["Node Bases<br/>(home / anywhere)"] <-->|MQTT| VPS
    NB3 <-.optional LAN.-> LOCAL
```

**Principle:** the brain's reach is bounded by where it runs. Don't pretend the VPS brain can read local files — route those tasks to the local brain when it's online.

---

## 8. Voice Pipeline — Realtime Path (Demo Critical Path)

```mermaid
sequenceDiagram
    participant ESP as ESP32 Node Base
    participant WS as Audio WS Server
    participant VP as Voice Pipeline
    participant STT
    participant LLM
    participant TTS
    participant ART as Artifact Writer

    ESP->>WS: PCM frames (16k mono)
    WS->>VP: stream chunks
    VP->>STT: stream audio
    STT-->>VP: partial transcripts
    VP->>LLM: text (on VAD end)
    LLM-->>VP: token stream
    VP->>TTS: token-to-audio
    TTS-->>WS: PCM out
    WS-->>ESP: TTS playback PCM
    par persistence (async)
        VP->>ART: audio.wav + transcript.txt + metadata
    end
    Note over ART: artifact later consumed<br/>by Hermes/Mem0 (post-demo)
```

The artifact saved here is the **bridge** between realtime (room reacts now) and async brain (later, Hermes can re-process it: whisper-large transcription, vision-LLM summary, semantic indexing → push back to operator's web feed).

---

## 9. Process & Port Map

| Process | Tech | Port(s) | Lives where (demo) | Lives where (platform) |
|---|---|---|---|---|
| Mosquitto | broker | 1883 (MQTT), 9001 (WS) | Operator PC | VPS |
| Core Runtime | Node.js or Python | REST 8080, audio WS 8081 | Operator PC | VPS (optionally local too) |
| Web Console | Laravel 12 + Livewire 3 | HTTPS 443 (via tunnel), Reverb 8082 | Operator PC | VPS |
| Hermes Agent | Python process | configured per install | — (deferred) | local PC or VPS |
| Mem0 | Docker | 8888 | — | VPS |
| OpenClaw | Docker sidecar | 8889 | — | local PC |
| Archon | Python | 8890 | — | local PC |

---

## 10. What Lives Where (Codebase)

```
xentient/                         ← this repo
├── core/                         ← Tier 2 Core Runtime (Node or Python)
│   ├── engine/
│   │   ├── Pipeline.ts           ← voice pipeline
│   │   ├── BrainRouter.ts        ← thin dispatcher (post-demo)
│   │   ├── ModeManager.ts        ← state machine
│   │   └── SpaceManager.ts       ← identity/permissions
│   ├── comms/
│   │   ├── MqttClient.ts
│   │   └── AudioServer.ts
│   ├── adapters/                 ← post-demo
│   │   ├── HermesAdapter.ts
│   │   ├── Mem0Adapter.ts
│   │   ├── OpenClawAdapter.ts
│   │   └── ArchonAdapter.ts
│   ├── providers/                ← LLM/STT/TTS SDKs (existing)
│   └── packs/                    ← bot brains (folder = pack)
├── firmware/                     ← Tier 1 ESP32 code
│   ├── config/peripherals.h
│   └── shared/messages.h         ← mirrors core contracts
└── docs/                         ← this folder

xentient-web/                     ← SEPARATE Laravel repo (Tier 2 Web)
├── app/Livewire/
├── app/Mqtt/                     ← php-mqtt/client
├── routes/
└── resources/
```

The Web Console is its **own repo / own deploy** — co-located here in docs only because it's part of the system story.

---

## 11. Decision Boundaries (What We Will Not Cross)

| Line | Why |
|---|---|
| Core never embeds an AI brain | Brains are external processes — keeps Core thin and swappable |
| Web never `fopen()`s artifacts directly | Goes through Core REST + signed URL. Even when co-hosted. |
| Handlers are enum-gated, not dynamic | No `eval`, no plugin loading, no arbitrary code paths. New handler = harness PR. |
| One pack active per space | No multi-pack composition in v1 |
| No firmware hot-swap detection | Compile-time peripheral map (B4 dropped) |
| Basic mode always works | If every brain integration is offline, the room still responds |

---

## 12. Reading Order

1. **`VISION.md`** — *why* (the bridge model, what we own vs delegate)
2. **`ARCHITECTURE.md`** — *what shape* (this document)
3. **`CONTRACTS.md`** — *how they talk* (MQTT schemas, REST endpoints, WS frames)
4. **`HARDWARE.md`** — *what physical* (B1–B7 locked decisions)
5. **`WEB_CONTROL.md`** — *the human surface* (Web Console L2 spec)
6. **`PACKS.md`** / **`SPACES.md`** — *the configuration model*
7. **`WIRING.md`** — *the cable map*

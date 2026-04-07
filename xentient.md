# Xentient
### A programmable nervous system for intelligent spaces

> *"Any space. Any AI. Any body."*

---

## What Xentient Is

Xentient is an open, modular IoT platform that gives any AI model a physical presence in the real world — ears to hear, eyes to see, and a voice to respond — deployed across spaces that are named, owned, and programmable. Whether a node is battery-powered or wall-mounted, traveling or fixed to a ceiling — that is the node's own condition. The space just holds context.

It is not a smart speaker. It is not a home automation hub. It is not tied to any single AI vendor.

It is infrastructure. The layer between raw physical sensing and intelligent response — owned by the user, programmable at every level, and built to outlast any single model or service.

---

## The Name

**Xentient** — from *sentient* (capable of perception and experience) with the prefix *X* marking the unknown, the extensible, the cross-platform nature of the system.

A Xentient space perceives. It remembers. It responds. But what it thinks with — the model, the rules, the personality — is entirely up to whoever builds it.

---

## Core Principles

**1. Hardware is dumb. Intelligence is a choice.**
Nodes sense and actuate. Nothing more. Every decision about what to do with sensed data — when to wake, how to identify, which AI to invoke — lives in software above the hardware layer.

**2. The space is the product.**
Not the device. A space is a named, owned, intelligent environment. Nodes are assigned to spaces. Harnesses run in spaces. Users interact with spaces. The physical world is just the input surface.

**3. Identity is contextual, not global.**
Who you are in one space does not have to match who you are in another. A child in a home space, a professional in an office space, anonymous in a public space. The owner of each space decides the rules.

**4. Memory belongs to the user, not the platform.**
Switching AI models does not erase history. Memory is stored in Xentient — or on your own server — scoped to spaces and identities, and injected into whatever model the harness is currently configured to use. The cloud is a convenience. Local hosting is an equally valid choice at every layer.

**5. Open by design.**
No vendor lock-in at any layer. Nodes are open hardware. The harness is open configuration. Models are swappable. Memory, streams, and harness processing can all be self-hosted. The cloud is required only once: to establish ownership. After that, it is optional infrastructure — not a dependency you are stuck with.

---

## Architecture

Xentient is built in four distinct layers. Each is independently replaceable. The cloud handles ownership and OTA. Everything above the node layer — harness, memory, identity, streams — can run in the cloud, self-hosted, or fully local.

```
┌─────────────────────────────────────────────────────────────┐
│              XENTIENT CLOUD  (ownership + OTA only)         │
│         Account · Node Registry · Space Management · OTA    │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   HARNESS    │   IDENTITY   │    MEMORY    │    STREAMS     │
│  (AI layer)  │   (gate)     │  (context)   │   (output)     │
│              │              │              │                │
│  cloud /     │  cloud /     │  cloud /     │  cloud /       │
│  self-hosted │  local       │  local DB    │  local broker  │
│  / local     │              │              │                │
├─────────────────────────────────────────────────────────────┤
│                      XENTIENT NODES                         │
│       Carrier Module + Snap-on Peripherals + Power          │
└─────────────────────────────────────────────────────────────┘
```

---

### Layer 1 — The Node

A node is not a single monolithic device. It is a **node base module** with one or more **peripheral units** physically docked onto it. The node base is the lean MCU brain and connectivity hub. The peripheral units are the senses and actuators. Neither is independently functional — together, they form a node.

---

#### The Node Base

The node base is the carrier and coordinator. It is intentionally minimal in responsibility: move power, move data, report what is attached, receive instructions. No application logic lives here.

**What the node base contains:**

- **MCU** (ESP32-WROOM-32) — peripheral enumeration, data routing, WiFi upstream, OTA handling
- **W5500 SPI Ethernet** — onboard, not a peripheral slot. Provides stable wired upstream for fixed installations. WiFi and Ethernet coexist: Ethernet is primary for wired nodes, WiFi provides fallback and is primary for portable nodes
- **Typed peripheral docking slots** (v1) — one slot per peripheral category; each slot exposes the correct protocol rails and power voltage for its type
- **Peripheral ID bus** — a shared I2C line across all docking slots. On any dock event (power-on or hot-attach in v2), the node base scans this bus and reads the EEPROM present on each attached peripheral unit. Enumeration is passive — no peripheral MCU required
- **Power management** — accepts USB-C 5V and/or LiPo cell; distributes regulated power to each docked peripheral slot
- **QR code label** — encodes the globally unique hardware ID. Used once at initial claim. Never needed again after that
- **OTA channel** — all behavior (profile, firmware) managed over the air after first claim

**What the node base does NOT contain:**

- No microphone, speaker, camera, or sensor — all sensing and actuation lives in peripheral units
- No AI processing — all intelligence lives in the harness layer above
- No WiFi access point for peripherals — WiFi is used exclusively for upstream communication (cloud or local server). Peripherals connect only through the physical docking interface

The node base is designed to be the last thing that changes. Its job is to transport data and power, not to interpret either.

---

#### Peripheral Units

A peripheral unit is a self-contained, snap-on functional module. It combines both the **driver/controller chip** AND the **transducer** (the thing that physically senses or actuates) into a single physical housing. These two elements are packaged together as the unit — neither is a standalone peripheral in the Xentient model.

**Examples:**

| Peripheral Unit | Contains | Sense / Act |
|---|---|---|
| Microphone unit | INMP441 MEMS I2S mic | Listen |
| Speaker unit | MAX98357A I2S Class D amp + 3W 8Ω driver | Speak |
| Camera unit | OV2640 image sensor + driver interface | See |
| Sentinel unit | PIR motion sensor + environmental sensor IC | Detect |

**Peripheral unit properties:**

- **No onboard MCU** — peripheral units are passive signal devices. All processing of their output happens upstream at the harness layer
- **Passive ID EEPROM** — each unit contains a small I2C EEPROM (e.g. AT24C02) that stores: peripheral type identifier, hardware version, power class. The node base reads this on attach to enumerate what is docked. This is the complete self-identification mechanism — no firmware, no active component required on the peripheral
- **Powered by the node base** — no independent power source. The snap connector delivers the required voltage from the node base's regulated power rail
- **Form factor keyed to slot type** — in v1, peripheral units are mechanically compatible only with their matching slot type on the node base. The physical key enforces correct attachment before any software enumeration occurs

Peripheral units are the correct atomic level of modularity for users and builders. Swapping a unit means replacing both driver and transducer together. There is no mix-and-match below this level in the current architecture.

---

#### The Xentient Snap Interface

The physical connector standard that joins peripheral units to the node base docking slots.

**v1 (prototype):** JST-SH connectors + header pins — reliable fixed attachment, tool-assisted. Suited for stationary deployments and development builds.

**v2 (target standard):** Magnetic pogo-pin connector — tool-free, self-aligning, and designed for hot-swap in future slot architectures. This is the target canonical Xentient hardware standard that third-party peripheral makers will be able to build to.

**What every connector carries:**

| Line | Purpose |
|---|---|
| Power rail | Node base → peripheral power delivery (slot-specific voltage in v1) |
| Data lines | Protocol-specific per slot type (I2S, SPI, I2C/GPIO) |
| I2C ID bus | Shared across all slots — peripheral EEPROM enumeration on attach |
| Ground | Common return |

---

#### Typed Slot Architecture (v1)

In v1, the node base exposes a fixed set of typed peripheral docking slots. Each slot type is hardwired to the correct data protocol and power voltage for its peripheral category. A peripheral unit can only physically mate with its matching slot.

| Slot | Data Protocol | Power | Accepts |
|---|---|---|---|
| Sight | SPI / DVP | 3.3V | Camera unit |
| Listen | I2S | 3.3V | Microphone unit |
| Speak | I2S | 5V | Speaker unit |
| Sense | I2C / GPIO | 3.3V | PIR / Environmental unit |

This gives v1 a maximum of **one peripheral unit per category** on a single node base. A single node base cannot have two cameras or two microphones. For multi-camera or multi-mic deployments in a space, multiple node bases are used — each assigned to the same space in the harness.

Power per slot is static and matched to the peripheral type at design time. No negotiation needed. Simple, predictable, zero overhead for v1.

---

#### Universal Slot Architecture (v2 — Roadmap)

v2 replaces typed slots with a unified multi-protocol bus. Any Xentient-standard peripheral unit can dock in any slot position. Protocol and power negotiation happen at attach time via the EEPROM read — the node base learns what is attached and configures the bus accordingly.

The maximum number of simultaneously active peripheral units becomes dynamically bounded — constrained by the node base's compute budget and available upstream bandwidth, not by physical slot layout. The harness policy declares per-space limits (e.g. max 2 HD camera units, or 4 SD camera units, based on stream budget). An expansion dock module — a device that occupies one slot and exposes additional docking positions — becomes natural in this architecture.

A **minified base module** also becomes viable in v2: the smallest possible node base with a single peripheral slot, stripped of ethernet and with a minimal power footprint. Intended for single-peripheral deployments like a dedicated mic in a tight space.

---

#### Power Architecture

**v1 — Static slot power:**
Each typed slot delivers a fixed voltage matched to its peripheral class. Power requirements are known at slot design time. No negotiation, no overhead.

**v2 — Negotiated power:**
Node base reads the power class field from the peripheral EEPROM on attach. Allocates from a shared dynamic power budget. Enables flexible peripheral combinations and future third-party units with varying requirements.

**Node base power input — both versions:**

The node base accepts two inputs simultaneously, and they are designed to coexist:

- **USB-C 5V** → powers the system directly AND charges the LiPo cell via TP4056 charge controller
- **LiPo cell** → runtime buffer; MT3608 boost converter steps voltage to regulated 5V for the system

When USB-C is connected: the system runs from USB power; the LiPo charges in the background.
When USB-C disconnects: the LiPo seamlessly takes over. There is no gap. The LiPo acts as a built-in UPS buffer, not merely a battery option.

| Deployment mode | Power input | Behavior |
|---|---|---|
| Fixed / wall-mounted | USB-C only | System runs from USB; LiPo optional as outage buffer |
| Portable | LiPo only | Runtime bounded by cell capacity |
| Hybrid / UPS | USB-C + LiPo | USB powers and charges simultaneously; LiPo covers disconnects |

---

#### Firmware vs. Profile — A Critical Separation

Two distinct software layers live on the node base, with fundamentally different update cadences and risk profiles:

**Firmware** (ESP32 flash — updated rarely, OTA-signed):
- Peripheral ID bus scanning and enumeration logic
- Slot power management
- Data transport (WiFi and Ethernet paths)
- Heartbeat and cloud check-in protocol
- OTA handler (for both firmware and profile)

**Profile** (pushed frequently by cloud — lightweight, instantly recoverable):
- Which peripheral slots to activate and in what mode
- Data mode per peripheral (push / stream / fetch / adaptive)
- Wake trigger thresholds
- Upstream endpoint (cloud URL or self-hosted server IP)
- WiFi credentials (written to NVRAM)

Firmware is infrastructure: rare, tested, cryptographically signed, treated with the same caution as a hardware change. Profile is configuration: frequent, zero-risk, instantly corrected by the next push. A user reconfiguring their space never touches firmware. A bad profile can always be overridden by pushing a corrected version — no physical access to the node is ever required.

---

#### Node States

A node moves through a defined set of states across its lifetime:

```
UNCLAIMED
  Brand new. No WiFi credentials. No owner. Hardware ID encoded in QR on chassis.
  Broadcasts local presence only. Waits.
        ↓  user scans QR → cloud links hardware ID to account
CLAIMED / BARE
  WiFi configured. Cloud-connected. No peripherals docked or no profile active.
  Heartbeats to cloud on interval. Reports bare status. Awaits peripheral attachment and profile push.
        ↓  peripheral unit(s) docked + profile pushed by cloud
OPERATIONAL
  Peripherals enumerated. Profile active. Data mode running. Normal runtime state.
        ↓  upstream connection lost (WiFi drops, Ethernet disconnects)
DEGRADED
  Profile active. Peripherals running. No upstream path.
  Buffers events locally within ESP32 memory (best-effort; prioritizes most recent on overflow).
  Auto-retries upstream on interval. On reconnect: flushes buffer with original timestamps before resuming live stream.
        ↓  connection restored → returns to OPERATIONAL
        ↓  all peripheral units removed while connected
BARE (runtime)
  Connected and alive. No peripherals attached.
  Heartbeats and reports bare status. Awaits reattachment or space reassignment.
        ↓  owner revokes node in cloud
UNCLAIMED
  Returns to factory state. WiFi credentials cleared. Ready for new owner to claim.
```

> **Degraded mode note:** ESP32 onboard memory is limited. Local buffering is best-effort for event persistence during a connection outage. For deployments where data loss during outages is unacceptable, the W5500 wired Ethernet connection eliminates the primary failure scenario — it is the recommended configuration for always-on fixed installations.

---

**Node roles (defined by docked peripheral units, not by separate hardware SKUs):**

| Node role | Required peripheral unit(s) | Capabilities |
|---|---|---|
| Ear | Microphone unit | Listens — sends audio upstream |
| Voice | Speaker unit | Speaks — receives TTS audio from harness |
| Eye | Camera unit | Sees — captures frames on trigger or stream |
| Sentinel | Sentinel unit | Detects — PIR events and environmental readings |
| Hybrid | Any combination within slot constraints | Multi-role |

The same node base hardware becomes an Ear, a Voice, or an Eye by changing what peripheral unit is docked on it. Role is not a firmware property — it is a physical configuration that the node base reads and reports.

**Node data modes** (set by harness policy, not by firmware):

- **Push** — sleeps until an event threshold is crossed; wakes and transmits. Best for battery-powered portable nodes.
- **Stream** — continuous transmission to the platform. Used for always-on fixed installations with wall power.
- **Fetch** — waits silently; responds only when polled by the harness. The harness triggers a fetch when context demands it (e.g. audio input causes a camera capture request). Ideal for camera units where continuous streaming is unnecessary.
- **Adaptive** — monitors activity levels and dynamically shifts between push and stream. Returns to low-power state after a configurable inactivity window. Wake triggers are defined in the harness policy.

---

### Layer 2 — The Space

A Space is a named, owner-controlled logical environment. It is not a physical location and it has no intrinsic type. A space called "living room" and a space called "travel kit" are architecturally identical — both are just named contexts with nodes assigned to them and a harness running in them. Whether those nodes are plugged into a wall or running on batteries in a bag is each node's own physical reality. The space does not need to know.

**A Space contains:**

- A set of assigned Nodes
- An attached Harness (the AI configuration)
- A Member list with permission tiers
- An Output Stream registry
- A Memory scope (space-level context)

**Permissions within a Space:**

- **Owner** — full control. Configure nodes, harness, members, streams. Cannot be revoked except by self.
- **Admin** — can manage members and harness config. Cannot reassign nodes.
- **Member** — can interact with the AI in this space. Gets their personal memory thread.
- **Guest** — can interact, anonymous context only. No memory persistence.
- **Observer** — receives output streams only. Cannot interact with the AI.

**Space sharing** is an invitation model. The owner invites users by account. Users accept. No node ownership transfers. Nodes remain the property of whoever claimed them.

**Single-space node assignment:** A node belongs to exactly one space at a time. Reassigning a node to a different space is a cloud action — the cloud updates the registry, pushes a new profile, and the node adapts. The previous space loses access to that node's data immediately. There is no concept of a node shared between two spaces simultaneously.

---

### Cross-Node Coordination

Nodes within a space do not communicate with each other directly. All coordination between nodes is mediated by the harness. This is a deliberate architectural constraint: it keeps node firmware lean, it makes coordination logic programmable, and it prevents nodes from needing awareness of each other.

**The coordination pattern:**

```
Node A (Ear) — VAD threshold crossed → audio chunk sent upstream
        ↓
Harness pipeline: STT → identity → memory → model
        ↓                              ↓
Harness → fetch command → Node B     Harness → TTS audio → Node C
          (Eye — capture frame)                 (Voice — play response)
        ↓
Frame received → harness processes alongside audio context
```

**Speaker assignment in multi-node spaces:**
When a space has multiple Voice-capable nodes, the harness uses a `speaker_priority` list — an ordered list of node IDs defined in the harness config. The harness targets the first responsive node. Future versions may support spatial targeting: routing TTS output to the Voice node in the same physical zone as the identified speaker.

**Audio deduplication:**
Multiple Ear nodes in the same space will inevitably capture the same audio event. The harness deduplicates by correlating timestamps and sequence numbers across all incoming audio packets tagged to the same space. Only one interaction pipeline is opened per detected utterance window.

**Cross-peripheral trigger chains:**
The harness can define trigger chains that cross peripheral types. An audio input can cause a camera fetch. A PIR detection can cause the mic to begin buffering. A camera frame can suppress a voice response. These chains are defined in `pipeline.hooks` within the harness config — not in node firmware. Nodes remain unaware of each other; the harness orchestrates the choreography.

**What this means architecturally:**
Adding a new node to a space never requires changing the firmware or configuration of existing nodes. The harness discovers the new node's peripheral inventory via the cloud (the node reports it on check-in) and adapts behavior accordingly. Nodes are anonymous sensing and actuating endpoints. The harness is where the intelligence lives.

---

### Layer 3 — The Harness

The Harness is the AI programming layer. It is attached to a Space and defines everything about how that space's AI behaves. It is fully open — users can write their own, pick from the marketplace, or import from any compatible format.

**A Harness contains:**

```
harness/
├── model.config        # which AI model + endpoint
├── rules.md            # system prompt, persona, constraints
├── memory.policy       # scope, retention, retrieval strategy
├── identity.gate       # recognition method + fallback behavior
├── pipeline.hooks      # pre/post processing, tool calls, filters
├── skills/             # pluggable capability modules
│   ├── web-search.skill
│   ├── calendar.skill
│   ├── alert.skill
│   └── ...
└── modes.policy        # adaptive sleep, wake triggers, stream modes
```

**Harness hosting options:**

- **Xentient Cloud** — managed, zero setup, pay per use. Default for new users.
- **Self-hosted** — deploy the harness runtime on any VPS or server. Full control, private data. Xentient Cloud still handles ownership and OTA only.
- **Fully local** — run harness, memory store, and stream broker on a home server or NAS. No interaction data leaves the premises. Ollama-compatible for fully offline AI. Xentient Cloud is contacted only for node OTA updates and ownership verification.

This is not a future option — it is a first-class deployment mode. The architecture is designed so that the cloud is the trust anchor, not the data holder.

**Marketplace** (future): Published harnesses by the community and verified builders. Searchable by use case. Forkable. Versioned. Examples:

- `memory-companion` — personal assistant with rich episodic memory
- `home-monitor` — observation mode with anomaly alerts and daily summaries
- `study-buddy` — curriculum-aware tutor with session tracking
- `front-desk` — visitor greeting with face recognition and staff notification
- `caregiver-assist` — elder care monitoring with medication reminders and family stream

---

### Layer 4 — The Platform (Cloud-Anchored, Locally Extensible)

Xentient Cloud serves as the trust anchor and management backbone. Its mandatory role is narrow and deliberate — it does only what must be centralized.

**Cloud-only responsibilities (always Xentient Cloud):**
- **Account management** — Google/Apple OAuth, team accounts, billing
- **Node registry** — global unique ID ownership, claim, transfer, revoke
- **OTA delivery** — firmware updates and profile pushes to nodes

**Default cloud services (replaceable with self-hosted or local equivalents):**
- **Space orchestration** — node routing and harness invocation pipeline
- **Memory store** — per-space and per-identity, model-agnostic, versioned. Replaceable with any local vector DB or key-value store
- **Identity resolution** — voice print matching, face recognition, PIN validation. Can run on local inference server
- **Stream routing** — named, filterable, subscribable data pipes. Replaceable with a local MQTT broker, Node-RED, or any webhook-compatible service

The design commitment: a user who wants zero cloud dependency after initial setup should be able to achieve it. Their nodes check in for OTA updates. Everything else — conversations, memory, identity, streams — runs on their hardware.

---

## The Lifecycle of a Node

```
Manufactured → QR printed → Shipped blank
       ↓
User scans QR with Xentient App (authenticated)
       ↓
Node claimed to account
       ↓
User creates or selects a Space
       ↓
Node assigned to Space via app (cloud action, no physical access needed)
       ↓
OTA pushes behavior profile: mode, endpoint, WiFi creds, wake policy
       ↓
Node boots, connects, checks in to cloud, begins operating
       ↓
[Space owner updates harness] → OTA pushes new policy → Node adapts
       ↓
[Node moved to new Space] → Cloud reassigns → OTA updates → Node continues
```

Physical access to the node after initial claim: never required again.

---

## The Lifecycle of an Interaction

```
Sound detected in space
       ↓
Mic node: VAD threshold crossed → push mode activates
       ↓
Audio chunk sent to Xentient Cloud (tagged: space ID, node ID, timestamp)
       ↓
Platform passes to Harness pipeline
       ↓
Pipeline: STT → transcript
       ↓
Identity Gate: voice print check → identity resolved (or anonymous fallback)
       ↓
Memory: load space context + identity thread
       ↓
Prompt assembled: rules + memory + current input
       ↓
Model called (Claude / GPT-4o / Ollama / custom)
       ↓
Response received
       ↓
TTS → audio generated
       ↓
Audio routed to assigned speaker node in space
       ↓
Interaction written to memory (space scope + identity thread)
       ↓
Output stream updated (if space has active subscribers)
```

Total round-trip on a stable connection: 1.5–4 seconds depending on model and TTS latency.

---

## Data Contract

Every data packet emitted by any node to the upstream (cloud or local server) carries the following mandatory fields. This contract is fixed at the transport layer and is independent of harness logic.

| Field | Type | Purpose |
|---|---|---|
| `space_id` | string | Which logical space this data belongs to |
| `node_id` | string | Which physical node emitted this data |
| `peripheral_type` | enum | Which peripheral unit captured it (mic, camera, pir, env…) |
| `timestamp_utc` | ISO 8601 | NTP-synced capture time — the moment of sensing, not send time |
| `sequence` | uint32 | Monotonic per-node counter — enables ordering and gap detection |
| `mode` | enum | Active data mode at time of capture (push / stream / fetch / adaptive) |
| `payload` | bytes | The actual data: audio chunk, JPEG frame, sensor value, event flag |

The harness receives tagged packets and routes them through its pipeline based on `peripheral_type` and `space_id`. No harness configuration needs to know in advance how many nodes are in a space, or which types they are — the contract makes every packet self-describing.

**Degraded mode integrity:** Timestamps are captured at sensing time, not at send time. This means packets buffered during a DEGRADED state and flushed on reconnect arrive at the harness with accurate temporal context, even if they arrive minutes later.

**Upstream transport by data type:**

| Data type | Protocol | Rationale |
|---|---|---|
| Control commands, events, heartbeats | MQTT | Lightweight, QoS levels, natural pub/sub model for IoT |
| Audio chunks, sensor pushes | MQTT with binary payload | Tolerable at typical event sizes |
| Camera frames, continuous audio streams | WebSocket / chunked HTTP | Higher throughput, streaming semantics |

The node publishes to a data topic consumed by the harness pipeline. The node subscribes to a control topic where the harness sends fetch commands, profile updates, and remote actions. This two-channel model keeps control and data traffic cleanly separated.

---

## Output Streams

A Space can expose named data streams that external accounts or services can subscribe to. The owner controls what is exposed and to whom.

**Stream types:**

| Stream | Content | Example use |
|--------|---------|-------------|
| `transcript` | Full conversation text | Family dashboard, logging |
| `events` | Detected anomalies, triggers | Caregiver alerts, security |
| `observations` | Periodic AI summaries of the space | Daily briefings, monitoring |
| `audio` | Raw or processed audio clips | Archival, secondary analysis |
| `frames` | Camera frames on trigger | Visual monitoring, face log |

**Stream access model:** Owner generates a named stream with a scope filter. Shares a subscription token with another account or webhook. Subscriber receives filtered events. No access to the space's nodes, harness, or configuration.

This is the correct sharing primitive. Not node sharing — which creates firmware conflicts. Not space sharing — which grants interaction access. Output streams share *what the space produces*, not *what controls it*.

---

## Identity and Privacy

Xentient treats identity as a layered, opt-in system. No space requires identification. It is a feature the owner activates.

**Recognition methods (pluggable):**

- Voice print — passive, no hardware beyond the mic node
- Face recognition — requires camera node
- PIN / passphrase — explicit, no biometric
- Account-linked device — phone proximity via BT/WiFi beacon
- Open — no gate, all interactions anonymous

**Privacy by default:**

- Anonymous interactions produce no persistent memory
- Identified interactions store only what the memory policy allows
- Owners can configure full deletion of any identity thread at any time
- Fully local deployment means no interaction data, memory, or streams ever leave the premises
- Even in cloud mode, stream subscribers see only what the owner explicitly exposes — they have no access to nodes, harness config, or raw memory
- The cloud holds proof of ownership. It does not need to hold your conversations.

---

## Hardware Reference (Prototype v1)

### Node Base — Internal Components

One node base per physical node. All of the following live on the carrier board itself.

| Component | Part | Role |
|---|---|---|
| MCU | ESP32-WROOM-32 | Peripheral enumeration, data routing, WiFi upstream, OTA |
| Ethernet | W5500 (SPI) | Onboard wired upstream — not a peripheral slot. Fixed installations use this as primary; WiFi as fallback |
| Charge controller | TP4056 | LiPo charge management (when USB-C present) |
| Boost converter | MT3608 | LiPo → regulated 5V system rail |
| Peripheral ID bus | I2C (shared across slots) | EEPROM read on every dock event — passive enumeration |
| Peripheral connector (v1) | JST-SH + header pins | Typed, fixed attachment per slot category |
| Peripheral connector (v2 target) | Magnetic pogo pins | Tool-free, self-aligning, hot-swap capable — the Xentient Snap standard |
| Identity interface | QR code label | Hardware ID — initial claim only, never needed again |

### Peripheral Units

Each peripheral unit contains both the driver/controller IC and the transducer, packaged as one snap-on module. No onboard MCU. Each includes a passive I2C EEPROM for self-identification.

| Peripheral Unit | Driver IC | Transducer | Slot (v1) | Protocol |
|---|---|---|---|---|
| Microphone unit | — (direct I2S) | INMP441 MEMS mic | Listen | I2S |
| Speaker unit | MAX98357A Class D amp | 3W 8Ω driver | Speak | I2S |
| Camera unit | OV2640 image sensor IC | CMOS image sensor | Sight | SPI / DVP |
| Sentinel unit | PIR signal conditioner + env IC | PIR element + sensor | Sense | I2C / GPIO |

> Each peripheral unit's EEPROM stores: type identifier, hardware version, power class. The node base reads this on attach and reports the full peripheral inventory to cloud automatically.

### Power Configurations

| Input | Component | Notes |
|---|---|---|
| USB-C (5V) | Direct to system rail | Powers system and simultaneously charges LiPo |
| LiPo cell | 18650 + TP4056 + MT3608 | UPS buffer — takes over on USB-C disconnect with no gap |
| USB-C + LiPo | Both simultaneously | Recommended for fixed deployments requiring uptime guarantee |

**Estimated BOM (prototype v1, excluding owned parts): ₱1,200–₱1,800**

> **v1 constraint:** Typed slot architecture limits each node base to one peripheral unit per category (one mic, one camera, one speaker, one sentinel). For multi-peripheral deployments of the same type within a space, use multiple node bases — each assigned to the same space. The universal slot architecture (v2) removes this constraint.

---

## Roadmap

### Phase 0 — Proof of concept
- Node base (ESP32) + Microphone unit + Speaker unit on local WiFi
- Typed slot v1 hardware: JST connectors, one peripheral per slot category
- Basic STT → LLM → TTS loop working end to end
- Manual WiFi config, no app yet
- Peripheral identification via EEPROM read confirmed working

### Phase 1 — Platform foundation
- Xentient Cloud: account, node registry, space management
- Xentient App: Google auth, QR claim, space creation, node assignment
- OTA profile delivery working (firmware separate from profile, profile pushed frequently)
- Node state machine implemented: UNCLAIMED → BARE → OPERATIONAL → DEGRADED
- Basic harness: model config + rules file + memory (JSON store, local or cloud)
- Node peripheral inventory reported to cloud on check-in; harness receives it automatically
- Self-hosted harness runtime documented and supported from day one

### Phase 2 — Harness and identity
- Harness config UI in app
- Voice print identity gate (passive, no extra hardware)
- Per-identity memory threads
- Adaptive mode policy in harness
- Cross-peripheral trigger chains in `pipeline.hooks` (audio → camera fetch)
- Speaker assignment config in harness (speaker_priority list per space)

### Phase 3 — Output streams and sharing
- Named output streams from spaces
- Space member invitations with permission tiers
- Transcript and event stream subscriptions
- Webhook integration for external services
- MQTT stream broker integration (local and cloud)

### Phase 4 — Marketplace and full local sovereignty
- Harness marketplace (submit, fork, version)
- Skill plugin system
- Local memory store (SQLite / vector DB drop-in replacement)
- Local stream broker (MQTT / Node-RED compatible)
- Fully offline mode: Ollama + local memory + local streams + cloud for OTA only
- Camera node full integration (face recognition, visual observation)
- v2 hardware design: universal slot architecture, magnetic pogo-pin connector spec, power negotiation
- Minified base module design (single-slot, minimal footprint)
- Expansion dock module (one slot → many slots)

### Phase 5 — Scale and ecosystem
- Multi-space dashboards
- Developer API for third-party harness builders
- Xentient Snap connector specification published — third-party peripheral unit certification program
- Hardware marketplace: community and verified peripheral units
- Enterprise space management (org accounts, audit logs)

---

## What Xentient Is Not

- Not a closed ecosystem — no vendor lock-in at any layer
- Not a surveillance product — identity is opt-in, streams are owner-controlled, local hosting is fully supported
- Not a replacement for your phone — it is infrastructure, not a personal device
- Not tied to one AI — the model is a tenant, Xentient is the building
- Not cloud-dependent after setup — the cloud owns your node registry and delivers OTA; it does not need to own your conversations, your memory, or your data streams

---

## One-Line Pitch

**Xentient — a programmable nervous system that gives any AI a body in any space.**

---

## Taglines (options)

- *Any space. Any AI. Any body.*
- *The space between hardware and intelligence.*
- *Give your AI somewhere to live.*
- *Sense everything. Remember everything. Be anywhere.*

---

*Xentient — founded on the idea that intelligence should inhabit the world, not just respond to it.*

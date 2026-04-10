# Xentient v1 — Timeline & High-Level Plan

> **Deadline: April 24, 2026** | Today: April 10 | 14 days
> This is **Phase 0: Proof of Concept** from the [Xentient Roadmap](xentient.md#roadmap).
> Sub-sessions branch off this trunk to finalize technology choices and implementation details.

---

## What We're Building

A **single Xentient node** — a node base with all four peripheral unit types attached — running a complete STT → LLM → TTS interaction loop. This proves the core thesis: modular hardware + swappable AI + physical presence.

```
┌──────────────────────────────────────────────────────────────────┐
│                       XENTIENT NODE (v1 Prototype)               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                   NODE BASE                               │    │
│  │   ESP32-WROOM-32 dev board (main MCU)                     │    │
│  │   WiFi upstream · I2C ID bus · Power distribution         │    │
│  │   TP4056 + MT3608 + 18650 power path                      │    │
│  └───────┬──────────┬──────────┬──────────┬──────────────────┘    │
│          │          │          │          │                        │
│    ┌─────┴───┐ ┌────┴────┐ ┌──┴───┐ ┌───┴──────┐                │
│    │ LISTEN  │ │  SPEAK  │ │ SIGHT│ │  SENSE   │                │
│    │ slot    │ │  slot   │ │ slot │ │  slot    │                │
│    │         │ │         │ │      │ │          │                │
│    │ INMP441 │ │MAX98357A│ │ESP32 │ │ HC-SR501 │                │
│    │ mic     │ │+ 3W 8Ω  │ │-CAM  │ │ + BME280 │                │
│    │         │ │ speaker │ │-MB   │ │          │                │
│    │ AT24C02 │ │ AT24C02 │ │OV3660│ │ AT24C02  │                │
│    │ EEPROM  │ │ EEPROM  │ │      │ │ EEPROM   │                │
│    └─────────┘ └─────────┘ └──────┘ └──────────┘                │
│         I2S         I2S       UART*    I2C/GPIO                  │
│        3.3V         5V        3.3V      3.3V                     │
│                                                                  │
│    * Camera unit is a v1 prototype deviation:                    │
│      architecture spec says peripherals are passive (no MCU),    │
│      but ESP32-CAM-MB has its own ESP32 + OV3660 camera.         │
│      It connects to the node base dev board via UART or WiFi.    │
└──────────────────────────────────────────────────────────────────┘
          │
          │ WiFi upstream
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     HARNESS (laptop / local server)              │
│                                                                  │
│      Audio in → STT → LLM → TTS → Audio out                     │
│      + memory context + harness config                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Settled Facts

These are **not** decision points. They are done.

| What | Status | Detail |
|------|--------|--------|
| **Deadline** | Fixed | April 24, 2026 — present working prototype |
| **Scope** | Fixed | Phase 0: single node, all 4 peripheral types, STT→LLM→TTS loop, EEPROM enumeration |
| **Node base MCU** | Ordered | ESP32-WROOM-32 dev board — full GPIO, handles all peripherals except camera |
| **Camera peripheral** | Ordered | ESP32-CAM-MB + OV3660 — separate board, connects to node base (v1 deviation: has its own MCU) |
| **Microphone unit** | Ordered | INMP441 MEMS I2S mic + AT24C02 EEPROM |
| **Speaker unit** | Ordered | MAX98357A I2S amp (QFN variant) + 3W 8Ω speaker + AT24C02 EEPROM |
| **Sentinel unit** | Ordered | HC-SR501 PIR + BME280 (temp/humidity/pressure, I2C) + AT24C02 EEPROM |
| **Peripheral ID bus** | Ordered | AT24C02BN EEPROMs (20pcs) — shared I2C bus, passive enumeration |
| **Snap connectors (v1)** | Ordered | JST XH2.54 4-pin + 6-pin (⚠️ 2.5mm pitch — architecture specifies JST-SH 1.0mm — documented deviation for prototype) |
| **Power path** | Ordered | USB-C → TP4056 → 18650 (2200mAh) + MT3608 → 5V rail |
| **Carrier board** | Ordered | 8×12 cm universal PCB (double-sided) |
| **Parts arrival** | Tracking | Local (ELEXHUB, SAMIORE): Apr 11–18. China (aitexm, BXV, Electrapick): by Apr 16 |
| **Budget** | Spent | ₱1,822 paid of ₱2,222 listed |
| **W5500 Ethernet** | Skipped for v1 | WiFi-only prototype. Architecture supports Ethernet; not in this build. |
| **Enclosure** | Not ordered | 3D print via Shopee (~5 business days) or open-frame presentation |

---

## The Six Workstreams

### ① Node Base Firmware

> **Can start: NOW** | AI agents generate; we flash and debug when parts arrive.

The ESP32 dev board (node base) runs firmware that does exactly what the architecture specifies:

- **Peripheral enumeration** — scan shared I2C bus on boot, read AT24C02 EEPROMs, identify what's docked in each slot (type_id, hw_version, power_class)
- **Data routing** — read from peripheral data interfaces (I2S for mic, I2C for BME280, GPIO for PIR), package into the [data contract](xentient.md#data-contract), and transmit upstream
- **Upstream WiFi** — connect, maintain, reconnect
- **Command reception** — subscribe to control channel, receive TTS audio from harness, route to speaker
- **State machine** — UNCLAIMED → BARE → OPERATIONAL → DEGRADED with RGB LED feedback
- **Power management** — slot-specific voltage delivery (3.3V for Listen/Sight/Sense, 5V for Speak)

**Open decisions (resolve in sub-session):**

| Decision | Options | Notes |
|----------|---------|-------|
| Dev framework | Arduino IDE / PlatformIO+Arduino / ESP-IDF | Affects all driver code. Arduino = fastest start. ESP-IDF = best I2S DMA control. |
| Upstream protocol | MQTT / WebSocket / HTTP chunked | Architecture suggests MQTT for events+audio, WebSocket for camera streams. May use both. |
| Audio format | Raw PCM / WAV framed / Opus | What format does the mic stream upstream? What format does TTS audio arrive in? Must match harness. |
| Camera connection | UART serial / SPI / WiFi+MQTT (both boards on same network) | How does the ESP32-CAM-MB send JPEG frames to the node base or directly to the harness? UART = wired, simple. WiFi = wireless, both boards publish to same broker independently. |

**Sub-session:** *"Node base firmware — framework choice, GPIO pin map, driver code generation, inter-board protocol"*

---

### ② Camera Peripheral Firmware

> **Can start: NOW** | Separate firmware for the ESP32-CAM-MB.

The ESP32-CAM-MB is an architectural deviation: the spec says peripheral units are passive (no MCU), but our camera unit has its own ESP32. This is fine for v1 — the CAM-MB captures frames and forwards them. Its firmware is minimal:

- Capture JPEG frame on command (fetch mode) or on interval (stream mode)
- Forward frame to harness — either via UART to node base, or via its own WiFi connection directly to the harness
- Respond to fetch commands from harness (cross-peripheral trigger: audio event → camera capture)

**Open decisions (depends on ① inter-board choice):**

| Decision | Options | Notes |
|----------|---------|-------|
| Camera data path | Via node base (UART/SPI) / Direct to harness (own WiFi) | If direct WiFi: both boards are independent MQTT publishers. If via node base: frames routed through dev board. |
| Trigger model | Harness-initiated fetch / PIR-triggered / Interval-based | Architecture supports all via `pipeline.hooks`. Fetch is simplest for demo. |

**Sub-session:** *"Camera firmware — settled after inter-board protocol is decided in ① sub-session"*

---

### ③ Harness Pipeline

> **Can start: NOW** | Runs on laptop/server, completely independent of hardware.

The harness is the AI brain. For Phase 0, it's a service running on a laptop that:

1. **Receives** audio/sensor data from the node via the upstream protocol
2. **Processes** through the pipeline: STT → identity (skip for Phase 0) → memory → LLM → TTS
3. **Sends** audio response back to the node's speaker
4. **Optionally receives** camera frames and sensor readings for context enrichment

The harness reads its configuration from the directory structure defined in the architecture:
```
harness/
├── model.config        # which AI model + endpoint
├── rules.md            # system prompt, persona, constraints
├── memory.policy       # scope, retention, retrieval strategy
├── pipeline.hooks      # cross-peripheral triggers (audio → camera fetch)
└── modes.policy        # data modes per peripheral
```

**Open decisions — each has multiple viable options:**

#### STT (Speech-to-Text)

| Option | Local/Cloud | Latency | Offline? | Notes |
|--------|-------------|---------|----------|-------|
| faster-whisper | Local | ~1-3s | ✅ | CTranslate2 Whisper. Best local. |
| whisper.cpp | Local | ~2-5s | ✅ | C++ port. Runs on minimal hardware. |
| Vosk | Local | <1s | ✅ | Lightweight, real-time, lower accuracy. |
| OpenAI Whisper API | Cloud | ~1-2s | ❌ | Simple, reliable. |
| Google Cloud STT | Cloud | <1s | ❌ | Free tier available. |
| Deepgram | Cloud | <0.5s | ❌ | Fastest cloud option. |

#### LLM (Language Model)

| Option | Local/Cloud | Latency | Offline? | Notes |
|--------|-------------|---------|----------|-------|
| Ollama (llama3.1, phi3, gemma2) | Local | 2-5s | ✅ | Best for demo reliability. Pick model by laptop GPU. |
| LM Studio | Local | 2-5s | ✅ | GUI-based, easy model switching. |
| OpenAI API (GPT-4o-mini) | Cloud | 1-2s | ❌ | Fast, cheap. |
| Anthropic API (Claude) | Cloud | 1-3s | ❌ | Strong reasoning. |
| Google Gemini API | Cloud | 1-2s | ❌ | Free tier generous. |

#### TTS (Text-to-Speech)

| Option | Local/Cloud | Latency | Voice Quality | Offline? | Notes |
|--------|-------------|---------|---------------|----------|-------|
| Piper TTS | Local | <1s | Good | ✅ | Fast, lightweight. Best offline. |
| Coqui / XTTS | Local | 1-3s | Great | ✅ | Open-source, voice cloning capable. |
| F5-TTS / MaskGCT | Local | 2-5s | Excellent | ✅ | Cutting edge but heavy. |
| edge-tts | Cloud (free) | <1s | Great | ❌ | Microsoft Edge TTS. Free, no API key. |
| ElevenLabs | Cloud | 1-2s | Excellent | ❌ | Most natural. Free tier limited. |
| OpenAI TTS | Cloud | 1-2s | Excellent | ❌ | Simple API, great voices. |

#### Memory & Context

| Approach | Complexity | Notes |
|----------|-----------|-------|
| Simple context window (last N messages) | Low | Good enough for Phase 0 demo |
| SQLite / JSON file per space+identity | Low | Persistent, debuggable, boring, works |
| Obsidian-style markdown memory | Medium | Human-readable conversation logs, inject relevant ones |
| RAG with vector DB (ChromaDB, FAISS) | Medium | Impressive for demo — "it remembers what you said last week" |
| Mem0 / MemGPT pattern | High | Most aligned with Xentient vision — autonomous memory management |

#### Pipeline Orchestration

| Approach | Notes |
|----------|-------|
| Custom pure Python | Maximum control and debuggability. No framework magic. |
| Agent framework (LangChain, LangGraph, CrewAI) | Faster to build, more abstraction, less control. |
| Node-RED flows | Visual pipeline builder. Great for demos. |
| FastAPI service with modular endpoints | Clean separation, REST-based, easy to extend. |

**Sub-session:** *"Harness pipeline — select STT × LLM × TTS stack, memory approach, pipeline framework, and config format"*

---

### ④ Hardware Assembly

> **Blocked until: April 11 (local parts) / April 16 (all parts)**

Assembly follows the architecture's node structure — node base carrier board with docking slots for each peripheral unit.

**Assembly sequence:**

```
Phase A: Power Path (Apr 11 — local parts)
  USB-C → TP4056 → 18650 holder → MT3608 → 5V system rail
  Gate: Multimeter reads stable 5V at output

Phase B: Node Base MCU (after Phase A)
  ESP32 dev board mounted on headers on carrier PCB
  Connected to 5V rail (VIN + GND)
  Gate: Serial monitor shows ESP32 boot log, WiFi connects

Phase C: Typed Peripheral Slots — Wiring the Snap Interface (after Phase B)
  Build 4 docking slot positions on the carrier board using headers/JST XH2.54
  Each slot carries: Power rail + Data lines + I2C ID bus (shared) + Ground

  Listen slot (I2S, 3.3V):
    → INMP441 mic + AT24C02 EEPROM
    → Lines: VCC(3.3V), GND, WS, SCK, SD, SDA(shared), SCL(shared)

  Speak slot (I2S, 5V):
    → MAX98357A amp + 3W 8Ω speaker + AT24C02 EEPROM
    → Lines: VCC(5V), GND, BCLK, LRC, DIN, SDA(shared), SCL(shared)

  Sense slot (I2C/GPIO, 3.3V):
    → HC-SR501 PIR + BME280 + AT24C02 EEPROM
    → Lines: VCC(3.3V), GND, SDA(shared), SCL(shared), PIR_OUT(GPIO)

  Sight slot (UART*, 3.3V):
    → ESP32-CAM-MB (connects via UART or WiFi — see ① decision)
    → Lines: VCC(3.3V), GND, TX, RX (if UART), or WiFi-based (no wires)

Phase D: EEPROM Programming
  Write peripheral identity bytes to each AT24C02:
    [type_id, hw_version, power_class]
  One EEPROM per peripheral unit (mic, speaker, sentinel — camera TBD)
  Gate: I2C scan from node base detects all EEPROMs, reads correct type IDs

Phase E: Integration Test
  Full firmware on ESP32 dev board
  All peripheral units attached via snap interface
  Gate: Boot → enumerate peripherals → WiFi → upstream heartbeat → audio round-trip
```

**Known issues to plan for:**
- **JST XH2.54 vs JST-SH pitch mismatch** — ordered connectors are 2.5mm, architecture spec is 1.0mm. For v1 prototype, we use the XH2.54 or Dupont wires and document the deviation. The spec connector size is a v2/production concern.
- **Decoupling capacitors** — 100nF ceramic near INMP441 and BME280; 470μF electrolytic at MT3608 output. ESP32 WiFi transmit transients will couple into audio without this.
- **Shared I2C bus** — BME280 and all AT24C02 EEPROMs share the same I2C lines. Address conflicts must be checked (BME280 default: 0x76 or 0x77; AT24C02 configurable via A0-A2 pins: 0x50-0x57).

**Sub-session:** *"Hardware assembly — finalize GPIO pin map, wiring diagram, I2C address scheme"*

---

### ⑤ 3D Enclosure

> **Can start: NOW** | Design with datasheet dimensions. Finalize with real measurements after assembly.

The enclosure houses the full node — carrier board + all four peripheral units docked.

**Design must accommodate:**
- 8×12 cm carrier PCB + mounted components
- 18650 battery holder (underneath or beside PCB)
- Aperture for INMP441 mic
- Speaker grill for 3W driver
- Cutout for ESP32-CAM-MB camera lens (or external mount)
- USB-C port access (TP4056)
- LED window for RGB status indicator
- Ventilation near ESP32 + MAX98357A (heat sources)
- Standoff mounts (M2/M3)
- Snap-fit or screw-mount lid

**Design approach options:**

| Approach | Tool | Notes |
|----------|------|-------|
| Parametric CAD (code-driven) | OpenSCAD | AI-agent can generate entirely. Version-controllable. |
| Traditional CAD | Fusion 360 / FreeCAD | GUI, precise constraints, industry standard. |
| Simple/visual CAD | TinkerCAD | Browser-based, fast, limited precision. |
| AI-assisted | Text-to-CAD (Meshy, Zoo.dev) | Experimental. May need cleanup. |
| Skip enclosure | Open frame / acrylic plate + standoffs | No print needed. "Maker" aesthetic. Functional. |

**Enclosure style options:**

| Style | Notes |
|-------|-------|
| Simple box (rectangular) | Easy print, professional, boring |
| Modular stackable segments | Matches Xentient snap-on philosophy — each peripheral section is a visible segment |
| Semi-open / transparent | Audience sees the hardware during demos — excellent for presentation |
| Organic / rounded shell | Premium feel, needs supports, longer print |

**Printing options:**

| Path | Lead Time | Notes |
|------|-----------|-------|
| Shopee 3D printing service | ~5 business days | Must submit by Apr 17–18 for arrival by Apr 22–24 |
| Local makerspace | 1-2 days | Fastest, if accessible |
| Self-print | Same day | If printer available |
| Skip print entirely | 0 days | Fallback: present on open frame with standoffs |

> ⚠️ **Critical path:** 3D print must be **submitted by April 17–18** for delivery before April 24.
> Physical measurements from assembled hardware needed before final submission.
> Strategy: design with datasheet dimensions now (tolerance margins), revise after assembly.

**Sub-session:** *"3D enclosure — tool choice, style, and rapid design generation"*

---

### ⑥ Presentation & Demo

> **Can partially start now** (update dashboard). **Main push: Apr 20–23.**

**Goal:** Present Xentient Phase 0 — the proof of concept. Show a working node that listens, thinks, speaks, sees, and senses. Explain the architecture vision beyond the prototype.

**What to demonstrate:**
| Element | What the audience sees | Why it matters |
|---------|----------------------|---------------|
| Snap-on modularity | Physically attach/detach peripheral units | Core differentiator — not a monolithic device |
| EEPROM enumeration | Node detects what's plugged in (serial log or UI) | "Self-aware hardware" — no manual config |
| Audio interaction | Speak → pause → response from speaker | The core loop works end-to-end |
| Camera capture | Trigger → frame appears on dashboard | Multi-modal sensing |
| Environmental data | BME280 readings (temp, humidity, pressure) on dashboard | Sentinel unit is active |
| PIR detection | Motion → event logged / trigger chain fires | Cross-peripheral awareness |
| Privacy / local hosting | Show harness running on laptop, not cloud | "Your data stays yours" |
| Harness swappability | Switch LLM or persona mid-demo | "Change the AI, keep the hardware" |
| Interactive dashboard | The existing `xentient_presentation.html` | Already built, already impressive |

**Presentation approach options:**

| Approach | Notes |
|----------|-------|
| Existing interactive dashboard + live demo | Leverage what's built. Update with real data. |
| Slide deck + live demo | Traditional. Easy to control narrative. |
| Hybrid: slides for story → dashboard for architecture → live for hardware | Best of all worlds |
| Pure live demo (no slides) | High risk, high reward |

**Demo contingency:**

| Risk | Fallback |
|------|----------|
| Live demo fails on stage | Switch to pre-recorded backup video |
| WiFi unreliable at venue | Personal hotspot, pre-configured |
| Cloud LLM rate-limited or down | Local Ollama, pre-loaded model |
| Audio quality poor in venue | Pre-recorded video as backup |

**Sub-session:** *"Presentation strategy — narrative arc, demo script, backup plan, dashboard updates"*

---

## Milestones

Technology-agnostic checkpoints. **What** must be true, not **how**.

| # | Milestone | Must Be True | Target |
|---|-----------|-------------|--------|
| **M1** | All code generated | Firmware (both boards) + harness pipeline exist and compile/run | Apr 12 |
| **M2** | Harness works standalone | Audio file in → spoken response audio out, on laptop | Apr 14 |
| **M3** | 3D model ready | Printable STL exported, inspected in slicer | Apr 15 |
| **M4** | Power path verified | 5V rail stable from 18650 via MT3608 | Apr 12* |
| **M5** | All parts received | Full BOM inventoried, nothing missing | Apr 16–18 |
| **M6** | Node base boots | ESP32 dev board: WiFi + MQTT + peripheral enumeration on real hardware | Apr 17 |
| **M7** | Audio round-trip | Speak into mic → hear response from speaker (full loop) | **Apr 18** |
| **M8** | 3D print submitted | Order confirmed on Shopee | **Apr 17–18** |
| **M9** | Camera integrated | ESP32-CAM-MB captures and forwards frames to harness | Apr 19 |
| **M10** | Sentinel active | BME280 reads + PIR triggers reaching harness | Apr 19 |
| **M11** | Enclosed | Node in 3D-printed housing (if print arrives) | Apr 22 |
| **M12** | Rehearsed | Full timed presentation run-through | Apr 23 |

*M4 depends on ELEXHUB arriving Apr 11.

---

## Time Allocation

```
WORKSTREAM             Apr 10──11──12──13──14──15──16──17──18──19──20──21──22──23──24
                                                        ▲                          ▲
                                                   All parts                    PRESENT

① Node Base FW         ████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░
                       gen ├──── flash, debug, iterate on real HW ──┤  stable

② Camera FW            ████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░
                       gen ├──── integrate after inter-board decided ┤  stable

③ Harness Pipeline     ████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░
                       gen ├── test & tune latency ────┤  stable

④ Hardware Assembly    ░░░░░░██████░░░░░░████████████████▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░
                       wait ├pwr─┤ wait  ├─ full build + debug ────┤  stable

⑤ 3D Enclosure         ████████████████████████████████████▓▓▓▓██████████░░░░░░░░░
                       prototype CAD ──────────────────┤revise├ print (5d) ──────┤

⑥ Presentation         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████████
                                                                  ├ script+rehearse┤

█ active   ▓ debug/iterate   ░ idle/blocked
```

> **~30% generation (AI agents, immediate) → ~70% debugging, integration, and refinement**

---

## Sub-Sessions to Spin Up NOW

These can run in parallel, today. Each explores options, makes a recommendation, and reports back to this plan.

| Session | Key Decisions | Depends On |
|---------|--------------|------------|
| **① Node Base Firmware** | Dev framework, GPIO pin map, upstream protocol, audio format, camera inter-board protocol | Nothing — start now |
| **③ Harness Pipeline** | STT × LLM × TTS selection, memory approach, pipeline framework | Nothing — start now |
| **⑤ 3D Enclosure** | CAD tool, style, begin parametric design with datasheet dimensions | Nothing — start now |
| **④ MQTT / Comms Layer** | Broker setup (local Mosquitto vs cloud), topic schema per data contract | Informed by ① protocol decision |
| **② Camera Firmware** | Data path, trigger model | Blocked until ① inter-board protocol is decided |
| **⑥ Presentation** | Demo script, narrative, backup video plan | Mostly blocked until hardware works (Apr 18+) |

---

## Fallback Ladder

If we're running behind, shed scope in this order (bottom items cut first):

| Priority | Feature | If Cut |
|----------|---------|--------|
| 🔴 **P0 — Core** | Mic → STT → LLM → TTS → Speaker (the audio loop) | No demo without this |
| 🔴 **P0 — Core** | WiFi upstream + data contract packets | No demo without this |
| 🟡 **P1 — Important** | EEPROM peripheral enumeration (auto-detect) | Hardcode peripheral config |
| 🟡 **P1 — Important** | Sentinel unit (BME280 temp/humidity/pressure + PIR) | Demo without environmental sensing — voice only |
| 🟡 **P1 — Important** | Camera integration (ESP32-CAM-MB + OV3660) | Demo without vision — voice + sensors only |
| 🟢 **P2 — Polish** | 3D-printed enclosure | Present on open perfboard with standoffs |
| 🟢 **P2 — Polish** | RGB LED state machine | Use serial logs for state display |
| 🟢 **P2 — Polish** | Cross-peripheral triggers (audio → camera fetch) | Each peripheral works independently |
| ⚪ **P3 — Stretch** | Node state machine (UNCLAIMED → OPERATIONAL → DEGRADED) | Manual state for demo |
| ⚪ **P3 — Stretch** | OTA updates | Skip entirely for Phase 0 |
| ⚪ **P3 — Stretch** | Identity gate (voice print, face recognition) | Future phase feature |
| ⚪ **P3 — Stretch** | Multi-node coordination | Single node is the demo |

---

## v1 Prototype Deviations from Architecture

Documented here so we know what's intentional vs. what's compromise.

| Architecture Spec | v1 Prototype Reality | Why |
|-------------------|---------------------|-----|
| ESP32-WROOM-32 as sole MCU | ESP32 dev board (node base) + ESP32-CAM-MB (camera peripheral) — dual board | ESP32-CAM-MB bundles camera + ESP32 together. Architecturally, camera units should be passive (no MCU). This is a procurement pragmatism — the combined board was the most available and affordable camera option. |
| JST-SH 1.0mm Snap Interface | JST XH2.54 2.5mm or Dupont wires | JST-SH not ordered. XH2.54 was available. Functional for prototype; connector spec is a v2/production refinement. |
| W5500 SPI Ethernet onboard | WiFi only | Ethernet not ordered. Not needed for demo. Architecture supports it; this build doesn't include it. |
| Peripheral units are passive (no MCU) | Camera unit has its own ESP32 (ESP32-CAM-MB) | See dual-board explanation above. Mic, speaker, and sentinel units ARE passive as spec'd. |
| OV2640 camera sensor | OV3660 (3MP, higher res) | OV3660 came bundled with ESP32-CAM-MB. Upgrade, not a compromise. |

---

*Master plan v4 — April 10, 2026 | ₱1,822 spent | 14 days to ship*
*This document is the trunk. Sub-sessions grow the branches.*

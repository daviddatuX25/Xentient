# Xentient
### A programmable nervous system for intelligent spaces

> *"Any space. Any AI. Any body."*

---

## What Xentient Is

Xentient is the IoT terminal — a thin voice/hardware bridge that lets any AI brain inhabit a physical room. It gives AI ears to hear, eyes to see, and a voice to respond — deployed across spaces that are named, owned, and programmable. The harness is a terminal OS; intelligence plugs in via integration tiers.

It is not a smart speaker. It is not a home automation hub. It is not tied to any single AI vendor.

It is infrastructure. The bridge between raw physical sensing and intelligent response — owned by the user, programmable at every level, and built to outlast any single model or service.

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
No vendor lock-in at any layer. Nodes are open hardware. The harness is open configuration. Models are swappable. Memory, streams, and harness processing can all be self-hosted.

---

## Architecture

Xentient is built in three tiers. Each is independently replaceable. The Core runs 24/7 and owns hardware state. The AI Brain tier is always external.

```
TIER 3 — AI Brain (remote/sandboxed)
  Hermes Agent (default brain) + Mem0 + OpenClaw + Archon
          |
  Communication Layer (REST/WS/MQTT Bridge)
          |
TIER 2 — Core (always-on hosted)
  Face A: Runtime Daemon (voice, MQTT, LCD, modes)
  Face B: Web Control Panel (config, packs, telemetry)
  Brain Router: pack-driven, space-gated dispatcher
          |
     MQTT / WebSocket
          |
TIER 1 — Hardware (Node Bases + peripherals)
  Node Base + LCD + Mic + Speaker + PIR + BME280 + Camera
```

Xentient is not the brain. It is the **bridge** that connects a physical room to any AI brain. The harness stays minimal. Intelligence comes from integration.

See docs/HARDWARE.md for hardware decisions, BOM, and enclosure specs.

---

## Spaces

A **Space** is an identity context — like a user account on a computer. Each Space binds a Node Base, a Pack, a Mode (sleep/listen/active/record), and a set of integrations. The same hardware can be a simple room assistant in one space and a full dev workstation in another.

See docs/SPACES.md for the full Space model and Mode state machine.

---

## Integration Tiers

Xentient's core is mode-agnostic — it doesn't care which AI brain is connected:

- **Basic mode:** Direct LLM call, no memory, no skills. Always works.
- **Hermes+Mem0 mode:** Full AI brain with persistent memory, skills, Home Assistant. Default upgrade.
- **Hermes+Mem0+OpenClaw mode:** Computer use — terminal, browser, filesystem from the room.
- **Hermes+Mem0+Archon mode:** Coding workflows — "Fix the MQTT bug" as a voice command.

See docs/VISION.md for the full architecture, integration details, and migration path.

---

## Full Documentation

- [docs/VISION.md](docs/VISION.md) — Full architecture and integration tiers
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Wire format specification
- [docs/PACKS.md](docs/PACKS.md) — Pack system specification
- [docs/SPACES.md](docs/SPACES.md) — Space model and Mode state machine
- [docs/HARDWARE.md](docs/HARDWARE.md) — Locked hardware decisions (B1-B7)
- [docs/NON_GOALS.md](docs/NON_GOALS.md) — What Xentient is NOT
- [docs/INTEGRATIONS/](docs/INTEGRATIONS/) — Integration adapter contracts

---

*Xentient — founded on the idea that intelligence should inhabit the world, not just respond to it.*
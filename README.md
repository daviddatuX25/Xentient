# Xentient

The IoT terminal that gives any AI a physical presence in any room.

Voice. Sensors. Display. Any AI brain can plug in.

---

## What It Does

Xentient is the bridge between physical rooms and AI brains. The core is a thin terminal OS — voice pipeline, MQTT bridge, LCD faces, mode management. That is what Xentient uniquely owns. Intelligence plugs in via Hermes, Mem0, OpenClaw, or a basic LLM. The same hardware can be a simple room assistant in one space and a full dev workstation in another.

---

## Demo Status

V1 prototype demo Apr 24, 2026. Voice pipeline + MQTT bridge + LCD + basic memory.

---

## Quick Start

- Full architecture and integration tiers: [docs/VISION.md](docs/VISION.md)
- Locked hardware decisions (B1-B7): [docs/HARDWARE.md](docs/HARDWARE.md)
- Explicit scope boundaries: [docs/NON_GOALS.md](docs/NON_GOALS.md)

---

## Architecture

```
Tier 3  AI Brain (remote/sandboxed)
        Hermes + Mem0 | OpenClaw | Archon
                |              |          |
Tier 2  Core (always-on hosted)            |
        Runtime daemon + Web Control Panel  |
        Brain Router → adapters ───────────┘
                |
Tier 1  Hardware
        Node Base + Mic + Speaker + LCD + Sensors
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [VISION.md](docs/VISION.md) | Bridge model, integration tiers, Spaces/Modes |
| [HARDWARE.md](docs/HARDWARE.md) | Locked B1-B7 decisions, BOM, enclosures |
| [NON_GOALS.md](docs/NON_GOALS.md) | What Xentient explicitly does NOT do |
| [CONTRACTS.md](docs/CONTRACTS.md) | Wire format, MQTT topics, message schemas |
| [PACKS.md](docs/PACKS.md) | Pack folder spec, manifest, handlers, lifecycle |
| [SPACES.md](docs/SPACES.md) | Space model, Mode state machine, integration tiers |
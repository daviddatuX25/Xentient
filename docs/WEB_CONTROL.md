# Xentient Web Control Panel

> L2 Spec — Core's Face B. Browser-based control plane for hardware configuration, state management, pack/space permissions, and integration toggles. Shares the Core codebase with the Runtime daemon. Implemented in Platform Track P6.

---

## Role in the Three-Tier Architecture

Xentient's architecture is explicitly three-tier (see VISION.md):

- **Tier 1 — Hardware:** Node Bases with docked peripherals. Physical sensing and actuation. Dumb by design.
- **Tier 2 — Core:** The always-on hosted layer. Runs the Runtime daemon and Web Control Panel as two faces of the same system.
- **Tier 3 — AI Brain:** Remote/sandboxed services — Hermes, Mem0, OpenClaw, Archon.

The **Web Control Panel is the human-facing surface of Core.** The **Runtime daemon is the machine-facing surface.** Both read/write the same Core state:

- MQTT broker connection and message history
- Space registry (active spaces, modes, permissions)
- Pack registry (installed packs, active pack per space)
- Brain Router configuration (adapter connections, integration status)
- Sensor telemetry buffer (recent readings from all Node Bases)

This shared-state model means the Web Control Panel can show the same real-time state that the Runtime daemon operates on. No sync lag. No eventual consistency. One source of truth.

---

## Hosting Model

Core runs live 24/7 on a server (self-hosted or cloud VPS). The Web Control Panel is served from the same process or a sibling process on the same host.

```
┌─────────────────────────────────────────┐
│  Core Server (always-on)                │
│                                         │
│  ┌─────────────────┐  ┌──────────────┐ │
│  │ Runtime Daemon   │  │ Web Control  │ │
│  │ (Face A)         │  │ Panel (Face B)│ │
│  │ - Voice Pipeline │  │ - HTTPS      │ │
│  │ - MQTT Bridge     │  │ - REST API   │ │
│  │ - LCD Face       │  │ - WebSocket  │ │
│  │ - Brain Router   │  │   telemetry  │ │
│  └────────┬────────┘  └──────┬───────┘ │
│           └────────┬────────┘          │
│                    │                    │
│             ┌──────┴──────┐            │
│             │ Shared Core │            │
│             │ State       │            │
│             │ - Spaces    │            │
│             │ - Packs     │            │
│             │ - Sensors   │            │
│             │ - Router    │            │
│             └─────────────┘            │
└─────────────────────────────────────────┘
         │                    │
    MQTT/WS (to        HTTPS (to admin
    Node Bases)         browser)
```

**Key constraint:** The Web Control Panel must not block the MQTT/voice pipeline event loop. It runs in a separate worker or uses non-blocking I/O. The Runtime daemon's real-time guarantees (audio streaming, MQTT bridging) take priority over any web request.

---

## Core Responsibilities

The Web Control Panel lets the operator manage every aspect of Xentient that isn't a real-time hardware operation:

### Hardware Configuration

- Register Node Bases by MQTT client ID
- Assign peripheral IDs per slot (0x10-0x15 per CONTRACTS.md peripheral registry)
- View live telemetry: sensor readings, audio pipeline status, connection state
- See which peripherals are online/offline per Node Base

### Space Management

- Create, edit, and delete Spaces (id, nodeBaseId, activePack, mode, integrations, role, sensors)
- View all Spaces with current mode and online status
- Force Space switches from the control panel

### Mode Control

- View current mode per Space with state machine visualization
- Force mode transitions: `sleep`, `listen`, `active`, `record`
- Override the state machine (e.g., force `active` mode even without PIR trigger)
- Configure mode timeouts (idle timeout, listen timeout)

### Pack Management

- List installed packs with manifest details
- Switch active pack per Space
- Trigger hot-reload of active pack
- Upload new pack folder (zip upload, auto-extract into `packs/`)
- Delete packs (except `default` — always reserved)

### Permissions

- Configure which Spaces can call which integration tiers
- `basic` is always available (cannot be disabled)
- `hermes`, `hermes+mem0`, `openclaw`, `archon` are per-Space opt-in
- Permission changes take effect immediately via MQTT

### Integration Toggles

- Enable/disable Hermes, Mem0, OpenClaw, Archon per Space
- View connection status: connected, disconnected, degraded
- Configure adapter endpoints (REST URL, WebSocket URL, API keys)
- Restart adapter connections

### Live Telemetry

- Current mode and active pack per Space
- Last utterance (user and assistant) per Space
- Sensor readings: temperature, humidity, pressure, motion events
- Brain tier in use: basic, hermes, hermes+mem0, openclaw, archon
- Audio pipeline state: idle, listening, thinking, speaking
- MQTT message rate and connection status

### Audit Log

- Who changed what and when
- Pack switches, mode changes, permission updates, integration toggles
- Searchable by Space, action type, timestamp
- Stored in Core state, queryable via REST API

---

## API Surface

The Web Control Panel exposes two interfaces:

### REST API (configuration reads/writes)

All endpoints authenticated (session-based). API calls translate to MQTT control messages — the Web Control Panel is a client of the same contracts documented in CONTRACTS.md.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/spaces` | GET | List all Spaces with status |
| `POST /api/spaces` | POST | Create a new Space |
| `PATCH /api/spaces/:id` | PATCH | Update Space configuration |
| `DELETE /api/spaces/:id` | DELETE | Delete a Space |
| `POST /api/spaces/:id/mode` | POST | Set mode (translates to MQTT `mode_set`) |
| `POST /api/spaces/:id/pack` | POST | Switch pack (translates to MQTT `pack_switch`) |
| `GET /api/packs` | GET | List installed packs |
| `POST /api/packs/upload` | POST | Upload pack zip |
| `POST /api/packs/:name/reload` | POST | Hot-reload pack (translates to MQTT `pack_reload`) |
| `GET /api/telemetry` | GET | Current telemetry snapshot |
| `GET /api/audit-log` | GET | Audit log entries |
| `GET /api/integrations/:spaceId` | GET | Integration status for a Space |
| `PATCH /api/integrations/:spaceId` | PATCH | Toggle integrations (translates to MQTT `integration_enable`) |
| `GET /api/hardware` | GET | Node Base registry + peripheral status |

### WebSocket (live telemetry streaming)

```
ws://<core-host>/api/telemetry/stream
```

Pushes real-time telemetry events:
- Mode transitions
- Pipeline state changes
- Sensor readings (throttled to 1/second)
- Integration status changes
- Pack switch events

---

## Tech Stack Note

No framework is locked in yet. The decision is deferred to P6 planning. The constraint:

> Must run alongside the Runtime daemon on the same host **without blocking MQTT/voice pipeline event loop.**

Candidates: Fastify (Node.js), Hono (lightweight), or a separate process with shared state via IPC. The key requirement is that the web server's event loop must never starve the Runtime daemon's real-time tasks.

---

## Demo Scope

The Web Control Panel does **NOT** ship in the Apr 24 demo (per D17 in CONTEXT.md). The demo is controlled via MQTT commands (`mosquitto_pub`) and direct configuration file edits. This spec documents the post-demo target.

After demo, the Web Control Panel becomes the primary human interface for managing Xentient — replacing manual MQTT commands and JSON file edits with a browser-based UI.

---

## Platform Track Mapping

**P6 (Web Control Panel)** is the implementation phase. It depends on P3 (Mode Manager) and P4 (Space Manager) — the Web Control Panel needs their state to display and control.

| Phase | What | Dependency | Notes |
|-------|------|------------|-------|
| P3: Mode Manager | None | Must exist before Web Control Panel can control modes |
| P4: Space Manager | P3 | Must exist before Web Control Panel can manage spaces |
| **P6: Web Control Panel** | **P4** | **This phase.** Builds on P3/P4 state to provide browser UI |

---

*Cross-references: VISION.md (three-tier architecture, Core = Face A + Face B), CONTRACTS.md (MQTT control topics, message schemas), SPACES.md (Space model, Mode state machine), PACKS.md (pack management, MQTT pack control)*
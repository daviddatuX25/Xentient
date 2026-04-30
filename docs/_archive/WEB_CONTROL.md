# Xentient Web Console

> L2 Spec — Operator's browser-based console for Xentient. **Separate Laravel + Livewire 3 application** that is a *client* of Core (talks to Core via REST/WebSocket and to the MQTT broker directly). Not part of the Core codebase. Hostable alongside Core on the same machine (local PC + tunnel for demo) or as a separate VPS deployment (platform). Implemented in Demo Phase 3 (minimum cut) and Platform Track P6 (full feature set).

---

## Role in the Three-Tier Architecture

Xentient's architecture is explicitly three-tier (see VISION.md):

- **Tier 1 — Hardware:** Node Bases with docked peripherals. Physical sensing and actuation. Dumb by design.
- **Tier 2 — Core (runtime + console):** The always-on Core runtime (Node.js or Python) and a *separate* Laravel Web Console. Both reside in Tier 2 but are independent processes with independent codebases. They communicate over documented contracts (REST + WebSocket + MQTT).
- **Tier 3 — AI Brain:** Remote/sandboxed services — Hermes, Mem0, OpenClaw, Archon.

The **Web Console is the human surface.** The **Core runtime is the machine surface.** They share *data* (state, artifacts, telemetry) via REST/WS/MQTT — they do **not** share a process or codebase. Either can crash and restart without taking down the other.

What the Web Console reads/writes (via Core APIs and MQTT):
- MQTT broker connection (subscribes for telemetry; publishes control messages)
- Space registry (read via Core REST; mutations via Core REST → MQTT)
- Pack registry (post-demo)
- Brain Router configuration (post-demo)
- Sensor telemetry buffer (live via WebSocket from Core)
- **Recording artifacts** (filesystem path resolved via Core REST; playback via signed URL)

---

## Hosting Model

Core and Web are **independent processes** that can be co-hosted or split. There is no requirement that they share a host.

### Demo (Apr 24): Local PC + Tunnel

```
┌────────────────────────────────────────────────┐
│  Operator PC (Windows + Laragon)               │
│                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────┐│
│  │ Core Runtime │  │ Web Console  │  │Mosq- ││
│  │ (Node/Python)│  │ (Laravel +   │  │uitto ││
│  │              │  │  Livewire +  │  │broker││
│  │  - Voice     │  │  Reverb)     │  │      ││
│  │  - MQTT sub  │  │              │  │      ││
│  │  - Artifact  │  │  - HTTPS     │  │      ││
│  │    writer    │  │  - Reverb WS │  │      ││
│  └──────┬───────┘  └──────┬───────┘  └──┬───┘│
│         │   REST/WS       │              │    │
│         └─────────────────┴──────────────┘    │
│                          │                     │
│              /var/xentient/artifacts/          │
└──────────────────────────┬─────────────────────┘
                           │ cloudflared tunnel
                           ▼
                    https://xentient.example.app
                           │
                           ▼
                  Browser  /  ESP32 (LAN MQTT)
```

### Platform (post-demo): VPS + Local Sync

```
┌──────────────────┐ artifact sync ┌──────────────────┐
│  Local PC        │◄────────────►│  VPS              │
│  (workspace)     │               │                  │
│  Core (optional) │               │  Core (always-on)│
│  Local Brain     │               │  Web Console     │
│                  │               │  VPS Brain       │
└──────────────────┘               └──────────────────┘
```

### Key Constraints

- **Process isolation:** Core's voice/MQTT event loop must never be blocked by web requests. Since Web is a *separate process*, this is naturally enforced.
- **Auth boundary:** Web speaks a **public** REST/WS to Core. Even when co-hosted, treat the contract as if it crossed a network. Auth tokens, not shared memory.
- **Artifact access:** Web should never `fopen()` artifact files directly. It always asks Core via REST for a signed URL or streamed read.

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

## Tech Stack (LOCKED)

| Layer | Choice | Why |
|---|---|---|
| Backend framework | **Laravel 12** (PHP 8.2) | Operator already deeply fluent (Flexiqueue); native auth/RBAC/Eloquent/queues/migrations |
| UI / interactivity | **Livewire 3** | Server-render reactive components — right fit for control-panel CRUD |
| Real-time | **Laravel Reverb** + **Echo** | First-party WebSocket server; pairs natively with Livewire/Echo for live telemetry |
| MQTT client (PHP) | **php-mqtt/client** | For demo, Web publishes `mode_set` / control messages directly to Mosquitto |
| Frontend bundling | **Vite** (Laravel default) | Standard |
| Charts (T2 telemetry) | **ApexCharts** or **Chart.js** (CDN) | Avoid heavy JS framework — these render fine in Livewire/Alpine |
| DB | **SQLite** (demo) → **MySQL/Postgres** (platform) | SQLite is zero-config for demo and Laragon-friendly |
| Tunnel | **cloudflared** (or ngrok) | Expose local Laravel + Reverb URL during demo |

The Core process is a separate, language-free decision (Node.js or Python — see VISION.md Storage Model section). The Web stack does not constrain Core's stack because they only share **wire protocols**, not code.

**Why not Fastify/Hono/SvelteKit:** they were the assumption when Web was "Face B of Core." Now that Web is a separate process and the operator's strongest stack is Laravel, the Laravel/Livewire choice gives us auth/CRUD/migrations/queues for free and matches academic-rubric expectations.

---

## Demo Cut (Apr 24 — minimum viable Web Console)

The Web Console **does ship in the Apr 24 demo**, but in a deliberately minimum form. (This supersedes the prior "no web in demo" stance.)

### In Scope

- Single-operator Laravel app, no auth (or hardcoded `.env` password)
- Pages:
  - `/` — Dashboard: per-Node-Base card showing current mode, online/offline, last sensor reading, last interaction summary
  - `/sessions` — Session feed: chronological list of recorded interactions, each with timestamp / transcript / response / ▶ playback
  - `/telemetry` — Live charts (T2): RMS sparkline, BME280 temp/humidity sparklines, PIR event ticker — fed by Reverb WebSocket
- Controls:
  - Mode switch buttons per Node Base (`sleep` / `listen` / `active` / `record`) — published as MQTT `mode_set` directly via php-mqtt/client
  - "Run pipeline now" web-button trigger (publishes a synthetic `trigger_pipeline` MQTT message — fallback if mic unreliable)
- Artifact storage: read from local disk path resolved by Core (or directly from agreed shared path for demo simplification)
- Hosted on operator PC (Laragon), exposed via cloudflared tunnel

### Out of Scope (deferred to Platform Track P6)

- Pack management, pack upload, hot-reload UI
- Space CRUD (spaces pre-seeded in `config/spaces.php`)
- Permission/integration toggles (no Hermes/OpenClaw/Archon integrations exist yet)
- Audit log
- Multi-user auth, RBAC
- Brain-adapter UIs (Hermes chat, Archon workflows, OpenClaw viewer)
- True interactive chat with brain (the Sessions page is a *feed* that *looks* chat-shaped, not a live chat surface)
- VPS deployment, artifact sync between local and VPS

### Post-Demo Direction

After demo, the Web Console becomes the primary human interface:
- Replace direct MQTT publishing from Laravel with Core REST API calls (so Core can validate, audit, gate by Space permissions)
- Add brain-adapter panels as integrations come online (P1 Hermes → P2 Mem0 → P5 packs UI → P8 OpenClaw → P9 Archon)
- Migrate from SQLite to MySQL/Postgres
- Add multi-user auth + RBAC
- Deploy to VPS with bidirectional artifact sync to local PC

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
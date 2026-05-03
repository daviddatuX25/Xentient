# MCP Shell Architecture Design

> Date: 2026-04-25
> Status: APPROVED
> Replaces: ARCHITECTURE-REFINEMENT-core-as-mcp.md (formalizes and extends it)
> Transport: stdio for demo (local brain on same machine); SSE for post-demo (remote brain over HTTP)

## 1. Core Principle

**Xentient Core is a thin shell that streams data in/out and delegates all intelligence to the Brain.**

The Core owns: triggers, streaming, mode, LCD, MQTT, camera relay.
The Brain owns: reasoning, memory, tool use, scheduling, decisions.

The Core exposes its capabilities as an **MCP (Model Context Protocol) server**. Any MCP-compatible brain (basic-llm, Hermes, Claude Code, custom agent) can connect and drive Xentient.

## 2. Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Core Process (core.ts)                                  │
│                                                          │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐  │
│  │ MqttClient│ │AudioServer│ │CameraServr│ │CtrlServer│  │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └────┬─────┘  │
│        │              │             │             │         │
│        └──────────────┴──────┬──────┴─────────────┘         │
│                             │                              │
│                    ┌────────┴─────────┐                    │
│                    │   Mode Manager    │                    │
│                    └────────┬──────────┘                    │
│                             │                              │
│                    ┌────────┴──────────┐                   │
│                    │   MCP Server       │                   │
│                    │  (tools + events)  │                   │
│                    └────────┬──────────┘                   │
└─────────────────────────────┼──────────────────────────────┘
                              │ stdio/SSE
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────┴───┐   ┌──────┴──────┐   ┌────┴─────┐
    │  basic-llm   │   │   Hermes    │   │ Claude   │
    │  (fallback)  │   │  (primary)  │   │ Code etc │
    └──────────────┘   └─────────────┘   └──────────┘
```

**Core process** owns all hardware I/O. It never "thinks" — it only streams, triggers, and feeds back.

**Brain processes** connect via MCP. They call tools and subscribe to events. Only one brain is "active" at a time (the most recently connected).

**"Basic mode always works"**: The `basic-llm` brain process is the fallback — it connects via MCP and handles STT→LLM→TTS without memory or skills. `Hermes` is the primary brain, providing memory, messaging, scheduling, and tool use. When Hermes connects, it takes over. When it disconnects, basic-llm resumes. Basic-llm auto-restarts on crash.

## 3. MCP Tool Definitions

### Tools (Brain → Core)

| Tool | Parameters | Returns | Maps to |
|---|---|---|---|
| `xentient_read_sensors` | — | `{ temperature, humidity, pressure, motion }` | MqttClient sensor cache |
| `xentient_read_mode` | — | `"sleep" \| "listen" \| "active" \| "record"` | ModeManager.getMode() |
| `xentient_set_mode` | `mode: string` | `success: boolean` | ModeManager.transition() |
| `xentient_play_audio` | `data: base64, format: "pcm_s16le"` | `success: boolean` | AudioServer.sendAudio() |
| `xentient_set_lcd` | `line1: string, line2: string` | `success: boolean` | MQTT → firmware LCD command |
| `xentient_capture_frame` | — | `{ frameId: number, jpeg: base64 }` | CameraServer last frame |
| `xentient_mqtt_publish` | `topic: string, payload: object` | `success: boolean` | MqttClient.publish() |

### Events (Core → Brain, via MCP notifications)

| Event | Payload | Triggered by |
|---|---|---|
| `motion_detected` | `{ timestamp, nodeBaseId }` | PIR ISR → MQTT → Core |
| `voice_start` | `{ timestamp }` | VAD start → MQTT trigger |
| `voice_end` | `{ timestamp, duration_ms, audio: base64 }` | VAD end + audio buffer |
| `mode_changed` | `{ from, to, timestamp }` | ModeManager transition |
| `sensor_update` | `{ temperature, humidity, pressure }` | BME280 periodic (5s) |

Events are push-based (Core pushes to Brain), not pull-based. The Brain subscribes to events it cares about. `voice_end` includes the audio buffer so the Brain can do STT without a separate call.

## 4. Deployment Topology

```
┌──────────────────────────────────────────────────┐
│  SERVER (Raspberry Pi / PC / VPS)                 │
│                                                    │
│  ┌──────────────┐       ┌───────────────────┐     │
│  │  Core Process │◄─MCP──┤  Brain Process    │     │
│  │  (always on)  │ stdio  │  (basic-llm now) │     │
│  │               │       │  (Hermes later)   │     │
│  │  MCP Server ──┤       └───────────────────┘     │
│  │  REST/SSE ────┤       ┌───────────────────┐     │
│  │  MQTT Bridge ──┤  HTTP  │  Web Dashboard    │     │
│  │               │  ──────┤  (test.html now)  │     │
│  └───────┬───────┘       │  (Laravel later)  │     │
│          │                └───────────────────┘     │
│          │ MQTT/WS        ┌───────────────────┐     │
│          │                │  Mobile App       │     │
│          │                │  (future)         │     │
│          │                └───────────────────┘     │
└──────────┼────────────────────────────────────────┘
           │
     ┌─────┴──────────┐
     │  ESP32 Node Base│
     │  (mic, speaker, │
     │   LCD, BME280,  │
     │   PIR, camera)  │
     └─────────────────┘
```

**Two interfaces from Core:**
1. **MCP** (stdio or SSE) — for Brain processes. Tools + events.
2. **REST/SSE** (HTTP) — for Dashboard, mobile, monitoring. Proxies Core state without needing MCP.

The dashboard doesn't need to understand MCP. It hits REST endpoints: `GET /api/sensors`, `GET /api/mode`, `POST /api/mode`, `GET /api/camera`. These are thin wrappers over the same Core logic.

## 5. ModeManager as Orchestration Foundation

The Brain decides **when** to transition modes. The Core decides **what happens** in each mode.

Each mode defines hardware subsystem behavior:

| Mode | Audio In | Audio Out | Camera | Sensors | PIR | LCD Face |
|---|---|---|---|---|---|---|
| **SLEEP** | Off | Off | Off | Off | Wake-only | `(– –) sleep` |
| **LISTEN** | VAD active | Off | Standby (on demand) | 5s poll | Active | `(O_O) listening` |
| **ACTIVE** | Streaming | Streaming | Capture on demand | 5s poll | Active | `(^_^) Xentient` |
| **RECORD** | Capture to disk | Off | Interval capture | Log to disk | Active | `(_ _) REC` |

When the brain calls `xentient_set_mode("active")`, ModeManager:
1. Validates the transition (e.g., can't go SLEEP→ACTIVE directly, must go through LISTEN)
2. Reconfigures hardware via MQTT commands
3. Updates LCD face
4. Publishes mode status to MQTT
5. Emits `mode_changed` event via MCP

**Mode transition rules:**
```
SLEEP ──PIR──► LISTEN ──voice──► ACTIVE
LISTEN ◄────── ACTIVE ◄────── RECORD
```

**Extensible modes**: The 4 built-in modes (sleep/listen/active/record) are the defaults. Modes are defined in a registry (`modes.json` or similar), not hardcoded. This means:
- New modes can be added via config without code changes (e.g., `safety_lookout`, `night_mode`, `meeting_mode`)
- Each mode defines which subsystems are active and what the LCD face shows
- The Brain can call `xentient_set_mode("safety_lookout")` if that mode is registered
- Modes are publishable: a workflow pack can include a mode definition

Example extensible mode:
```json
{
  "safety_lookout": {
    "audio_in": "vad",
    "audio_out": "alert_only",
    "camera": "interval_30s",
    "sensors": "5s",
    "pir": "active",
    "lcd": { "line1": "(O_O)", "line2": "watching" }
  }
}
```

The Brain drives transitions via `xentient_set_mode()`. Human can override via Dashboard REST endpoint, but Brain is the primary driver.

### Demo Scenarios

1. **Wake on motion**: SLEEP → PIR fires → brain gets `motion_detected` → brain calls `set_mode("listen")` → hardware reconfigures → LCD shows `(O_O) listening`

2. **Voice conversation**: LISTEN → `voice_end` → brain calls `set_mode("active")` → STT→LLM→TTS via MCP tools → brain calls `play_audio()` → conversation flows

3. **Camera on demand**: ACTIVE → brain calls `capture_frame()` → gets JPEG → brain describes scene → brain calls `set_lcd()` to show status

## 6. Contradiction Resolutions

### 6.1 Brain Router vs MCP Server

**Decision:** MCP replaces the enum-gated Brain Router. Instead of `hermes-chat`, `hermes-memory`, `computer-use`, `agent-delegate` as hardcoded adapter types, any MCP-compatible brain connects and calls tools. The Brain Router concept becomes a thin "which brain is connected?" check.

### 6.2 "Basic mode always works" vs MCP dependency

**Resolution:** The `basic-llm` brain process is the fallback MCP client. It auto-restarts on crash. If no external brain (Hermes, etc.) connects, basic-llm handles everything. `Hermes` is the primary brain for production use. MCP is always available; basic-llm ensures Xentient never goes completely dark.

### 6.3 Dashboard: Laravel vs Node ControlServer

**Decision:** ControlServer stays for demo. Its REST endpoints become the dashboard API. Laravel (P6) is the production web console, built later as a separate repo.

### 6.4 Timestamp: millis() vs epoch-millis

**Resolution:** For demo, `millis()` is acceptable (relative ordering works). Post-demo, implement NTP on ESP32 for real epoch-millis. Update `contracts.ts` comment to say "millis-since-boot on ESP32, epoch-millis on harness side."

### 6.5 CameraServer port naming

**Resolution:** Update CONTRACTS.md D1 to clarify that "one port" refers to the ESP32→Harness WS link only. The Harness→Dashboard camera relay uses a separate port.

### 6.6 NON_GOALS.md stale

**Resolution:** Update NON_GOALS.md to remove ModeManager (already built). Add MCP Shell architecture as in-scope. Demo date revised from Apr 24 to Apr 27.

## 7. Implementation Plan (Apr 25–27)

### P0 — Must Have (Demo Blockers)

| # | Task | Effort | Why |
|---|---|---|---|
| P0-1 | Wire PIR ISR in firmware `main.cpp` | 1h | Wake-on-motion broken |
| P0-2 | Fix audio `0xA0` prefix in `AudioServer.sendAudio()` | 15min | TTS breaks when firmware enforces prefix |
| P0-3 | Remove dead `xentient/sensors/vad` subscription | 15min | Misleading dead code |
| P0-4 | Hardware assembly (3D print, JST, power path) | physical | Can't demo without hardware |

### P1 — Architecture (MCP Shell Lite)

| # | Task | Effort | Why |
|---|---|---|---|
| P1-1 | Add `@modelcontextprotocol/sdk` to harness | 30min | MCP server foundation |
| P1-2 | Create `core.ts` entry point (Core process) | 1h | Core = hardware I/O + MCP only |
| P1-3 | Create `brain-basic.ts` entry point (Brain process) | 1h | Brain = connects via MCP, runs STT→LLM→TTS |
| P1-4 | Implement 7 MCP tools in Core | 2h | Tool definitions |
| P1-5 | Implement 5 MCP events in Core | 1h | Push-based notifications |
| P1-6 | Wire brain-basic to call MCP tools instead of direct imports | 1h | Pipeline uses MCP client |
| P1-7 | Add REST endpoints to ControlServer for dashboard | 1h | Dashboard works without MCP |

### P2 — Near-Term Post-Demo (Week of Apr 28)

| # | Task | When | Why |
|---|---|---|---|
| P2-1 | Hermes adapter (`brain-hermes.ts`) | Week of Apr 28 | Primary brain — memory, Telegram, skills, scheduling. Replaces basic-llm as default. |
| P2-2 | NTP on ESP32 for real epoch-millis | Week of Apr 28 | Cross-session timestamps |
| P2-3 | CameraServer port documentation fix | Week of Apr 28 | CONTRACTS.md clarity |
| P2-4 | Extensible mode registry | Week of Apr 28 | Modes defined in config, not hardcoded — enables custom workflows |

### P3 — Deferred (Brain/Cloud Layer)

| # | Task | When | Why |
|---|---|---|---|
| P3-1 | Space/Config system | Deferred | Data complexity. Brain handles identity; spaces add structure later. |
| P3-2 | Artifact store | Deferred | Not needed until async brain re-processing |
| P3-3 | Laravel web console | P6 from roadmap | Production dashboard, separate repo |
| P3-4 | Vision-LLM integration | P4+ | Post-demo camera intelligence |
| P3-5 | Computer use / OpenClaw | P8 | Post-demo computer control |

### File Movement Map

| Current File | Destination | Change |
|---|---|---|
| `MqttClient.ts` | Stays in Core | Unchanged |
| `AudioServer.ts` | Stays in Core | Add `0xA0` prefix fix |
| `CameraServer.ts` | Stays in Core | Unchanged |
| `ModeManager.ts` | Stays in Core | Add hardware reconfiguration on mode transitions |
| `ControlServer.ts` | Stays in Core | Add REST endpoints for sensor/mode/camera |
| `Pipeline.ts` | Moves to `brain-basic/` | Refactored to use MCP client instead of direct imports |
| `contracts.ts` | Shared (both processes) | Fix timestamp comment |
| `providers/*` | Moves to `brain-basic/` | Only the Brain calls STT/LLM/TTS directly |
| `index.ts` | Replaced by `core.ts` + `brain-basic.ts` | Split into two entry points |

## 8. ModeManager Enhancement

Current ModeManager only transitions state and publishes. For MCP Shell, it needs to **reconfigure hardware** on mode transitions:

### New behavior per transition

- **SLEEP → LISTEN**: Enable VAD, enable sensor polling, enable PIR, update LCD
- **LISTEN → ACTIVE**: Enable audio streaming (both directions), enable camera on-demand, update LCD
- **ACTIVE → LISTEN**: Disable audio streaming, keep VAD, keep sensor polling, update LCD
- **Any → SLEEP**: Disable all streaming, disable sensor polling, keep only PIR wake, update LCD
- **Any → RECORD**: Enable audio capture to disk, keep sensor logging, update LCD

### Implementation approach

ModeManager gains a `reconfigureHardware(mode: Mode)` method that publishes MQTT control messages for each subsystem. The firmware handles the actual hardware changes based on these commands.

## 9. Hermes Adapter (Near-Term Priority)

Hermes is the **primary brain** for Xentient post-demo. It replaces basic-llm as the default because it provides:

- **3-layer memory** (session, persistent, user model) — no custom memory code needed
- **Telegram + 15 messaging platforms** — Xentient becomes reachable from anywhere
- **118 bundled skills** — procedural memory for tool use
- **Home Assistant integration** — IoT device control
- **Cron scheduling** — time-based triggers (e.g., morning briefings)
- **LLM routing** — 18+ providers, Ollama for local models

The `brain-hermes.ts` process connects to Core's MCP server the same way `brain-basic.ts` does. The difference is what it does with the tools:
- basic-llm: `voice_end` → STT → LLM (no memory) → TTS → `play_audio`
- Hermes: `voice_end` → STT → memory lookup → LLM (with context + skills) → TTS → `play_audio` → store to memory → optionally trigger Telegram notification

For the demo, basic-llm is sufficient. Week of Apr 28, we add Hermes and swap the default brain.

## 10. What This Is NOT

This spec does NOT cover:
- Space/Config system (deferred — brain handles identity; spaces add data complexity later)
- Artifact store (deferred — not needed until async brain re-processing)
- Laravel web console (P6 — production dashboard, separate repo)
- Mobile app (future)
- Vision-LLM integration (P4+)
- Computer use / OpenClaw (P8)

These are all valid future work. The MCP Shell architecture is designed to accommodate all of them as brain processes.
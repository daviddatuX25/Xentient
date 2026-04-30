# Architecture Refinement: Core as Thin Shell + MCP Interface

> Session: 2026-04-25
> Status: DRAFT — captured from user discussion, needs formal review

---

## The Insight

The current architecture docs describe the Core as owning the voice pipeline, MQTT bridge, LCD face, mode manager, etc. But there's a deeper design principle emerging:

**The Core should be a thin shell that streams data in/out and delegates all intelligence to the Brain.**

The Core's job is NOT to think. The Core's job is to:
1. **Receive** sensor data (audio, video, motion, environment)
2. **Stream** that data to wherever it needs to go (Brain, disk, dashboard)
3. **Trigger** state transitions (sleep/listen/active/record)
4. **Feed back** Brain responses (TTS audio, LCD commands, MQTT actions)

Everything else — reasoning, memory, tool use, scheduling — lives in the Brain.

---

## The MCP Server Idea

If the Core exposes its capabilities as an **MCP (Model Context Protocol) server**, then any Brain (Hermes, Archon, Claude Code, a custom agent) can:
- Query sensor state ("what's the temperature?")
- Control modes ("go to sleep", "start recording")
- Receive triggers ("PIR detected motion", "VAD start/end")
- Send display commands ("show this on LCD")
- Stream audio/video ("play this TTS", "capture a frame")

This means **the Brain doesn't need to know Xentient's internals**. It just calls MCP tools.

### Example Workflow

User: *"Hey Xentient, every morning when you see me wake up, search the internet for a Bible verse and let's talk about it."*

```
[PIR detects motion at 6:30 AM]
  └─ Core: MCP notification → "motion_detected" event
      └─ Hermes receives event, recalls stored workflow
          └─ Hermes calls MCP tool: xentient_search_internet("daily bible verse")
          └─ Hermes calls MCP tool: xentient_set_mode("active")
          └─ Hermes composes response → TTS → speaker
              └─ Hermes stores: "delivered morning verse on 2026-04-25" via Mem0
```

The Brain (Hermes) owns:
- The workflow logic (when, what, how)
- Memory of past interactions
- Tool orchestration (search, reminders, etc.)
- Personality/pack configuration

The Core (via MCP) owns:
- Streaming audio/video to the Brain
- Physical state management (modes, LCD, sensors)
- Recording artifacts to disk
- Being the hardware bridge

---

## Data Flow Clarification

### ESP32-CAM → Node Base → Harness → Brain

The camera data path as currently implemented:
1. ESP32-CAM captures QQVGA frame every 3s
2. Sends via UART2 (chunked) to Node Base
3. Node Base reassembles and forwards via WS binary (`0xCA` prefix) to Harness
4. Harness `AudioServer` discriminates camera frames
5. Harness `CameraServer` forwards to dashboard clients

**NEW understanding:** The Brain should also receive camera frames when it needs them:
- Vision-LLM analysis ("describe what you see")
- Face detection triggers
- Recording/snapshot for memory

This means the Core needs a **feed mechanism** — not just streaming to dashboard, but also offering frames to the Brain via MCP or adapter API.

### Trigger Distinction

The current `trigger_pipeline` message has `source: "voice" | "pir" | "web"`. This is the right abstraction but it's under-extended:

| Trigger | Current | Should Also Be |
|---------|---------|----------------|
| Voice (VAD) | ✅ triggers STT→LLM→TTS | ✅ same |
| PIR motion | ⚠️ not wired in firmware | ✅ wakes from sleep → notifies Brain |
| Web button | ✅ triggers pipeline | ✅ same |
| Camera frame | ❌ not a trigger | ✅ vision-LLM pipeline trigger |
| Cron/schedule | ❌ not implemented | ✅ Brain-initiated timer |
| Brain-initiated | ❌ not possible | ✅ Brain calls MCP tool to start conversation |

The key shift: **triggers aren't just "start the voice pipeline."** A trigger is any event that wakes the Brain and gives it context about WHY it was woken.

---

## Core Responsibilities (What Stays Thin)

The Core should focus on:

### 1. Trigger Mechanisms
- PIR interrupt → wake from sleep
- VAD start/end → voice utterance boundary
- Camera frame arrival → vision trigger
- Web button → manual trigger
- Cron/schedule → time-based trigger
- Brain-initiated → MCP tool call

### 2. Feedback Mechanisms
- TTS audio → speaker playback
- LCD face updates → display state
- MQTT actions → control peripherals

### 3. Mode/State Mechanisms
- Sleep/Listen/Active/Record state machine
- Mode transitions (with LCD + MQTT publication)
- Idle timeouts per mode

### 4. Data Streaming
- Audio in/out via WebSocket
- Camera frames via WebSocket (0xCA prefix)
- Sensor telemetry via MQTT
- Artifact persistence (audio.wav, transcript.txt, metadata)

### What the Core Does NOT Do
- LLM reasoning → delegated to Brain
- Memory/context → delegated to Brain (Mem0)
- Tool/skill execution → delegated to Brain
- Scheduling/workflow logic → delegated to Brain
- Internet searches → delegated to Brain

---

## MCP Tool Interface (Draft)

```json
{
  "tools": [
    {
      "name": "xentient_get_mode",
      "description": "Get current operational mode (sleep/listen/active/record)"
    },
    {
      "name": "xentient_set_mode",
      "description": "Set operational mode",
      "parameters": { "mode": "sleep|listen|active|record" }
    },
    {
      "name": "xentient_get_sensors",
      "description": "Get latest sensor readings (temperature, humidity, pressure, motion)"
    },
    {
      "name": "xentient_send_display",
      "description": "Send text/expression to LCD display",
      "parameters": { "mode": "expression|text|status", "line1": "...", "line2": "..." }
    },
    {
      "name": "xentient_capture_frame",
      "description": "Request a camera frame capture"
    },
    {
      "name": "xentient_speak",
      "description": "Send TTS audio to speaker",
      "parameters": { "text": "..." }
    },
    {
      "name": "xentient_trigger_pipeline",
      "description": "Trigger a voice pipeline run",
      "parameters": { "source": "web|pir|voice|schedule|brain" }
    }
  ],
  "events": [
    { "name": "motion_detected", "description": "PIR sensor triggered" },
    { "name": "vad_start", "description": "Voice activity detected" },
    { "name": "vad_end", "description": "Voice activity ended" },
    { "name": "camera_frame", "description": "New camera frame available" },
    { "name": "sensor_update", "description": "Periodic sensor telemetry" }
  ]
}
```

This means **Claude Code itself** could connect to Xentient as an MCP server and say: "I see motion was detected, let me check the camera, ask the user what they need, and play a response."

---

## Relationship to Existing Architecture Docs

This refinement doesn't contradict VISION.md, ARCHITECTURE.md, or CONTRACTS.md. It clarifies:

1. **The Core is even thinner than described.** It's a shell + MCP server, not a "runtime daemon" with embedded intelligence.
2. **The Brain is even more sovereign.** Any MCP-compatible agent can drive Xentient, not just Hermes.
3. **The dashboard is the control surface.** It configures which Brain connects, what Space/Mode/Pack is active, and monitors state.
4. **The data feeds (audio, video, sensors) all flow through the Core to the Brain.** The Core is the multiplexer/demultiplexer for physical I/O.

### What changes in existing docs

| Doc | Change Needed |
|-----|---------------|
| ARCHITECTURE.md §5 Brain Router | Evolve toward MCP tool interface instead of hardcoded adapters |
| ARCHITECTURE.md §3 Event Pipeline | Add camera/vision as trigger source, add Brain-initiated trigger |
| CONTRACTS.md | Add MCP-related message types (or keep MCP as a transport layer on top of existing contracts) |
| VISION.md §Integration | MCP server concept makes Xentient a tool provider for ANY compatible agent |

### What stays the same

- All wire contracts (MQTT topics, WS binary format, UART framing)
- All hardware decisions (B1-B7)
- Mode state machine
- Pack/Space concepts
- Three-tier architecture (Hardware → Core → Brain)
- Basic mode as fallback
# Xentient Node Skills — L0 Behavioral Contracts

> The L0 behavioral contract model. How Core configures Node Base behavior at runtime.
> See `docs/SKILLS.md` for the unified skill reference across all three layers.

---

## Concept

A **Node Skill** is a behavioral contract between Core and a Node Base. It is NOT executable code on the ESP32. It is a **config payload** that the Node Base's base firmware loads and runs in its Mode Task.

The Node Base is dumb by design, but **configurable by mode**. It does not reason. It does not make decisions. But its sampling behavior, active sensors, event emission frequency, and local state machine are all runtime-configurable via Node Skills pushed from Core over MQTT.

The Node Base always has a **base firmware** (never changes — the sacred FreeRTOS two-task model). On top of that, a Node Skill is a config payload that the base firmware loads and runs in its Mode Task.

---

## NodeSkill Type

```typescript
interface NodeSkill {
  id: string                         // unique skill identifier
  name: string                        // human-readable name
  version: string                     // semver

  // Hardware declarations — checked before push
  requires: {
    pir?: boolean                     // needs PIR sensor
    mic?: boolean                     // needs INMP441 microphone
    camera?: boolean                  // needs ESP32-CAM
    bme?: boolean                    // needs BME280 environmental sensor
    lcd?: boolean                     // needs LCD display
  }

  // Sampling behavior
  sampling: {
    audioRate?: number                // Hz, default 16000
    audioChunkMs?: number             // chunk duration in ms, default 100
    bmeIntervalMs?: number            // sensor read interval, default 5000
    pirDebounceMs?: number            // PIR event debounce, default 1000
    cameraIntervalMs?: number         // frame interval, default 3000
    vadThreshold?: number             // RMS threshold for voice activity
  }

  // Event emission — what this Node Skill sends to Core
  emits: NodeEventType[]              // enum-gated, no arbitrary types

  // Pairing — which CoreSkill handles this Node Skill's output
  expectedBy: string                  // CoreSkill ID that interprets the events

  // Mode task configuration
  modeTask: {
    onEntry?: string                  // action when skill activates
    onExit?: string                   // action when skill deactivates
    stateMachine?: NodeStateMachine   // optional local state machine
  }
}

type NodeEventType =
  | "presence"          // PIR motion detected
  | "motion"            // PIR motion (alias for presence)
  | "env"               // BME280 environmental reading
  | "audio_chunk"       // raw PCM audio chunk
  | "vad_triggered"     // voice activity detected
  | "frame"             // camera JPEG frame
  | "button_press"      // physical button press
  | "connection_lost"   // Node Base lost connectivity
  | "connection_restored" // Node Base regained connectivity

interface NodeStateMachine {
  initial: string
  states: Record<string, NodeStateConfig>
  transitions: NodeTransition[]
}

interface NodeStateConfig {
  lcd?: [string, string]              // LCD face: line1, line2
  sampling?: Partial<NodeSkill['sampling']>
}

interface NodeTransition {
  from: string
  to: string
  event: string                       // event type that triggers transition
}
```

---

## Pairing Convention

**A Node Skill always has a paired CoreSkill.** You never have node behavior Core doesn't understand.

When Core pushes a Node Skill to a Node Base, it simultaneously activates the paired CoreSkill in the SkillExecutor heartbeat loop. The CoreSkill knows how to interpret the events the Node Skill emits.

Example:
- Node Skill `study-presence` (emits `presence`, `env`) is paired with CoreSkill `_pir-wake` (interprets presence → mode change).
- Node Skill `watchdog-active` (emits `audio_chunk`, `vad_triggered`) is paired with CoreSkill `noise-gate` (interprets audio chunks → escalation).

If a Node Skill's `expectedBy` CoreSkill is not active, Core refuses to push the Node Skill and logs a `skill_pairing_violation` event.

---

## MQTT Push Flow

### Core → Node: Skill Assignment

Topic: `xentient/node/{nodeId}/skill/set`

```json
{
  "v": 1,
  "type": "node_skill_set",
  "skillId": "study-presence",
  "skill": {
    "id": "study-presence",
    "name": "Study Presence Monitor",
    "version": "1.0.0",
    "requires": { "pir": true, "bme": true },
    "sampling": { "pirDebounceMs": 500, "bmeIntervalMs": 10000 },
    "emits": ["presence", "env"],
    "expectedBy": "_pir-wake",
    "modeTask": {
      "onEntry": "LCD:(^_^) Study",
      "stateMachine": {
        "initial": "monitoring",
        "states": {
          "monitoring": { "lcd": ["(^_^) Study", "  ready..."] },
          "alert": { "lcd": ["(O_O) active", "  motion!"] }
        },
        "transitions": [
          { "from": "monitoring", "to": "alert", "event": "presence" },
          { "from": "alert", "to": "monitoring", "event": "env" }
        ]
      }
    }
  }
}
```

### Node → Core: Skill Acknowledgment

Topic: `xentient/node/{nodeId}/skill/ack`

```json
{
  "v": 1,
  "type": "node_skill_ack",
  "skillId": "study-presence",
  "status": "loaded" | "error",
  "error?:": "string describing what went wrong"
}
```

---

## Event Type Enum

All event types that a Node Skill can emit are enum-gated. No arbitrary MQTT floods from firmware.

| Event Type | Direction | Payload | Description |
|------------|-----------|---------|-------------|
| `presence` | Node → Core | `{ nodeId, timestamp }` | PIR motion detected |
| `motion` | Node → Core | `{ nodeId, timestamp }` | Alias for presence |
| `env` | Node → Core | `{ nodeId, temp, humidity, pressure, timestamp }` | BME280 reading |
| `audio_chunk` | Node → Core | Binary WS | Raw PCM audio chunk |
| `vad_triggered` | Node → Core | `{ nodeId, rms, timestamp }` | Voice activity detected |
| `frame` | Node → Core | Binary WS (0xCA prefix) | Camera JPEG frame |
| `button_press` | Node → Core | `{ nodeId, button, timestamp }` | Physical button |
| `connection_lost` | Node → Core | `{ nodeId, timestamp }` | Node lost connectivity |
| `connection_restored` | Node → Core | `{ nodeId, timestamp }` | Node regained connectivity |

---

## Hardware Capability Declarations

The `requires` field in a NodeSkill tells Core what hardware the Node Base must have before this skill can be pushed.

| Field | Sensor | Notes |
|-------|--------|-------|
| `requires.pir` | HC-SR501 PIR | GPIO interrupt-based motion |
| `requires.mic` | INMP441 I2S | Audio capture + VAD |
| `requires.camera` | OV2640 (ESP32-CAM) | JPEG frames via UART2 |
| `requires.bme` | BME280 | Temperature, humidity, pressure |
| `requires.lcd` | I2C 16x2 (PCF8574) | Text/face display |

Core checks `requires` against the Node Base's known hardware before pushing. If the check fails, Core logs a `skill_mismatch` event and falls back to the default Node Skill for the target mode.

---

## Example Node Skills

### study-presence

```json
{
  "id": "study-presence",
  "name": "Study Presence Monitor",
  "version": "1.0.0",
  "requires": { "pir": true, "bme": true, "lcd": true },
  "sampling": { "pirDebounceMs": 500, "bmeIntervalMs": 10000 },
  "emits": ["presence", "env"],
  "expectedBy": "_pir-wake",
  "modeTask": {
    "onEntry": "LCD:(^_^) Study",
    "stateMachine": {
      "initial": "monitoring",
      "states": {
        "monitoring": { "lcd": ["(^_^) Study", "  ready..."] },
        "alert": { "lcd": ["(O_O) active", "  motion!"] }
      },
      "transitions": [
        { "from": "monitoring", "to": "alert", "event": "presence" },
        { "from": "alert", "to": "monitoring", "event": "env" }
      ]
    }
  }
}
```

### watchdog-active

```json
{
  "id": "watchdog-active",
  "name": "Active Watchdog",
  "version": "1.0.0",
  "requires": { "mic": true, "pir": true },
  "sampling": { "audioRate": 16000, "audioChunkMs": 100, "vadThreshold": 1000 },
  "emits": ["audio_chunk", "vad_triggered", "presence"],
  "expectedBy": "noise-gate",
  "modeTask": {
    "onEntry": "LCD:(O_O) listening",
    "onExit": "LCD:(_ _) Zzz"
  }
}
```

### daily-life

```json
{
  "id": "daily-life",
  "name": "Daily Life Ambient",
  "version": "1.0.0",
  "requires": { "bme": true, "lcd": true },
  "sampling": { "bmeIntervalMs": 30000 },
  "emits": ["env"],
  "expectedBy": "_env-monitor",
  "modeTask": {
    "onEntry": "LCD:(^_^) Xentient",
    "stateMachine": {
      "initial": "ambient",
      "states": {
        "ambient": { "lcd": ["(^_^) Xentient", "  ready..."] }
      },
      "transitions": []
    }
  }
}
```

---

## Firmware Integration

The Node Base base firmware (never changes) consists of:

1. **CommTask** (Core 0): WiFi, MQTT, WebSocket — always running, always connected.
2. **ModeTask** (Core 1): Runs the currently loaded Node Skill config. Swapped by MQTT push.

When Core pushes a Node Skill:

1. CommTask receives `xentient/node/{nodeId}/skill/set`.
2. CommTask parses the config and updates ModeTask's runtime parameters.
3. ModeTask reconfigures sampling rates, active sensors, event emission frequency.
4. CommTask sends `xentient/node/{nodeId}/skill/ack` with status `loaded` or `error`.

The firmware `firmware/skills/` directory will contain headers defining the NodeSkill config struct layout (mirroring the TypeScript type above). No codegen — hand-sync the `.h` file, same as `messages.h`.

---

## Failure Handling

| Scenario | What Happens |
|----------|-------------|
| **Hardware check fails before push** | Core logs `skill_mismatch` event, falls back to default Node Skill for the target mode. Mode still transitions, but with safe defaults. |
| **Node is offline when mode change fires** | Core queues the Node Skill push and retries on reconnect. Mode transition happens locally in Core regardless; the node catches up when it reconnects. |
| **Node acks with error** | Core emits `node_skill_error` SSE event and stays on previous Node Skill. Mode does not revert — Core has already transitioned — but node runs old config until error is resolved. |
| **Node Skill `expectedBy` CoreSkill not active** | Core refuses to push the Node Skill and logs `skill_pairing_violation` event. This prevents orphaned node behavior. |
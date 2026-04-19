# Xentient Wire Contracts

> L2 Spec — Authoritative source for all message formats, MQTT topics, and data contracts between Node Base, Harness, and integrations. If contracts.ts and this doc disagree, this doc wins until contracts.ts is updated.

---

## Versioning

Every packet has `v: 1` at root level. The version field enables forward-compatible protocol evolution. Harness rejects mismatched versions with:

```json
{ "error": "version_mismatch" }
```

All new message types must include the version field. When the protocol version increments, both harness and firmware must be updated simultaneously — there is no partial upgrade path.

---

## Payload Cap

- **MQTT packets:** 3KB hard limit (ESP32 default 4KB minus headroom). Messages exceeding 3KB are rejected by the firmware MQTT client.
- **WebSocket audio frames:** No cap. Binary PCM audio streams over WebSocket are unbounded by design — the ESP32 handles backpressure via DMA ring buffer drop.

---

## Key Naming Convention

**camelCase everywhere.** Both the TypeScript harness and the ESP32 C++ firmware (via ArduinoJson) use camelCase keys. No snake_case, no SCREAMING_CASE, no mixed conventions.

```json
{ "v": 1, "type": "audio_chunk", "sessionId": "abc", "peripheralType": 16 }
```

Not:

```json
{ "V": 1, "type": "audio_chunk", "session_id": "abc", "peripheral_type": 16 }
```

---

## Timestamps

**`epoch-millis uint32`** everywhere. Half the bytes of ISO8601, demo-safe, ArduinoJson-native.

- TypeScript: `z.number().int().min(0).max(4294967295)` (uint32 max)
- C++ firmware: `uint32_t` from `millis()` or `ntpEpochMillis()`
- No ISO8601 strings on the wire. If human-readable timestamps are needed, convert at the display layer only.

---

## Enum Widths

All opcodes pinned to **`uint8_t`** (0-255). This matches the ESP32 peripheral ID space and keeps MQTT payloads compact.

- TypeScript: `z.number().int().min(0).max(255)`
- C++ firmware: `uint8_t` constants in `messages.h`
- No 16-bit or 32-bit enums on the wire. If 256 opcodes aren't enough, the protocol needs redesign.

---

## Peripheral ID Registry

Each peripheral type has a fixed ID byte. This registry is the single source of truth for both `contracts.ts` and `firmware/config/peripherals.h`.

| ID    | Peripheral  | Direction         | Transport     |
|-------|-------------|-------------------|---------------|
| 0x10  | Speaker     | Harness → Node    | WebSocket PCM |
| 0x11  | PIR         | Node → Harness    | MQTT event    |
| 0x12  | BME280      | Node → Harness    | MQTT telemetry|
| 0x13  | INMP441     | Node → Harness    | WebSocket PCM |
| 0x14  | ESP32-CAM   | Node → Harness    | MQTT event    |
| 0x15  | LCD         | Harness → Node    | MQTT command  |

Adding a peripheral requires updating this table, `contracts.ts`, and `peripherals.h` simultaneously. No auto-discovery (see HARDWARE.md B4 — compile-time binding).

---

## MQTT Topic Map

All topics use the `xentient/` prefix. The broker runs on the same LAN as the harness.

### Audio Topics

| Topic                    | Direction         | Format     | Description                          |
|--------------------------|-------------------|------------|--------------------------------------|
| `xentient/audio/in`     | Node → Harness    | Binary WS  | Audio chunks from INMP441 mic       |
| `xentient/audio/out`    | Harness → Node   | Binary WS  | TTS audio to MAX98357 speaker       |

### Sensor Topics

| Topic                     | Direction         | Format     | Description                          |
|---------------------------|-------------------|------------|--------------------------------------|
| `xentient/sensors/env`   | Node → Harness    | JSON MQTT  | BME280 temperature/humidity/pressure |
| `xentient/sensors/motion`| Node → Harness    | JSON MQTT  | PIR motion detection events          |

### Display Topics

| Topic                      | Direction         | Format     | Description                          |
|----------------------------|-------------------|------------|--------------------------------------|
| `xentient/display`        | Harness → Node    | JSON MQTT  | LCD display commands (faces, text)   |
| `xentient/display/faces`  | Harness → Node    | JSON MQTT  | LCD face table for active pack       |

### Pack Control Topics

| Topic                        | Direction         | Format     | Description                          |
|------------------------------|-------------------|------------|--------------------------------------|
| `xentient/control/pack`     | Any → Harness     | JSON MQTT  | Pack switch/reload commands          |
| `xentient/status/packs`     | Harness → Any     | JSON MQTT  | Pack status responses                |

### Space & Mode Topics

| Topic                        | Direction         | Format     | Description                          |
|------------------------------|-------------------|------------|--------------------------------------|
| `xentient/control/space`    | Any → Harness     | JSON MQTT  | Space switch commands                |
| `xentient/status/space`     | Harness → Any     | JSON MQTT  | Space status responses               |
| `xentient/control/mode`     | Any → Harness     | JSON MQTT  | Mode set commands                    |
| `xentient/status/mode`      | Harness → Any     | JSON MQTT  | Mode status responses                |

### Pipeline & Session Topics

| Topic                         | Direction         | Format     | Description                          |
|-------------------------------|-------------------|------------|--------------------------------------|
| `xentient/pipeline/state`    | Harness → Any     | JSON MQTT  | Pipeline state transitions           |
| `xentient/session/error`     | Harness → Any     | JSON MQTT  | Session errors (recoverable vs fatal)|

---

## Message Schemas

All messages follow the base envelope:

```json
{ "v": 1, "type": "<message_type>", ... }
```

### Audio Chunk

Binary PCM over WebSocket. Not JSON — raw S16LE frames with a lightweight header.

```
[sessionId: uint8][sequence: uint32][pcm samples...]
```

The harness tracks `sessionId` to discard stale frames on reconnect (see HARDWARE.md B3).

### Display Update

```json
{
  "v": 1,
  "type": "display_update",
  "mode": "expression" | "text" | "status",
  "line1": "string (max 16 chars)",
  "line2": "string (max 16 chars)",
  "duration": 2000
}
```

- `mode`: `expression` = pipeline face, `text` = arbitrary text, `status` = boot/system info
- `duration`: Optional. Milliseconds to hold this display state (min 2000ms to prevent flicker)
- See HARDWARE.md B7 for the full LCD face table and expressive/functional modes

### Space Status

```json
{
  "v": 1,
  "type": "space_status",
  "spaces": [
    {
      "id": "living-room",
      "nodeBaseId": "node-01",
      "activePack": "family-companion",
      "mode": "listen",
      "integrations": ["hermes+mem0"],
      "online": true
    }
  ]
}
```

See SPACES.md for the full Space model and Mode definitions.

### Mode Command

```json
{
  "v": 1,
  "type": "mode_set",
  "mode": "sleep" | "listen" | "active" | "record"
}
```

Mode transitions follow the state machine defined in SPACES.md. Invalid transitions are rejected with `{error: "invalid_transition"}`.

### Pack Switch

```json
{
  "v": 1,
  "type": "pack_switch",
  "name": "pack-name"
}
```

Pack names must match `[a-z0-9-]{1,32}`. See PACKS.md for the full pack system spec.

### Pack List

```json
{
  "v": 1,
  "type": "pack_list"
}
```

Response published on `xentient/status/packs`:

```json
{
  "v": 1,
  "type": "pack_list_response",
  "packs": ["default", "angry-dad-mode"],
  "active": "default"
}
```

### Pack Reload

```json
{
  "v": 1,
  "type": "pack_reload"
}
```

Forces hot-reload of the active pack from disk (see PACKS.md lifecycle).

### Session Error

```json
{
  "v": 1,
  "type": "session_error",
  "recoverable": true,
  "message": "Network timeout — retrying 1/3"
}
```

- `recoverable: true` → harness will auto-retry (max 3, exponential backoff 1s/2s/4s)
- `recoverable: false` → fatal error (auth, quota, bad request). UI shows "Reset Conversation"
- See HARDWARE.md B1 for the full retry and state machine behavior

### Sensor Data

```json
{
  "v": 1,
  "type": "sensor_data",
  "peripheralType": 18,
  "payload": {
    "temperature": 24.5,
    "humidity": 65.2,
    "pressure": 1013.25
  },
  "timestamp": 1713400000
}
```

- `peripheralType` uses the Peripheral ID Registry enum (0x12 for BME280, 0x11 for PIR)
- `payload` shape varies by peripheral type
- `timestamp` is epoch-millis uint32

### Space Control Messages

```json
{ "v": 1, "type": "space_switch", "spaceId": "study-desk" }
```

```json
{ "v": 1, "type": "role_set", "role": "student" }
```

```json
{ "v": 1, "type": "integration_enable", "name": "openclaw" }
```

See SPACES.md for the full Space + MQTT contract.

---

## Zod Schema Convention

All schemas are defined in `harness/src/shared/contracts.ts` using Zod. This document is the design reference; `contracts.ts` is the runtime enforcement.

```typescript
// contracts.ts — every message schema derives from this base
import { z } from "zod";

const VersionedMessage = z.object({
  v: z.literal(1),
  type: z.string(),
});

const DisplayUpdate = VersionedMessage.extend({
  type: z.literal("display_update"),
  mode: z.enum(["expression", "text", "status"]),
  line1: z.string().max(16),
  line2: z.string().max(16),
  duration: z.number().int().min(0).optional(),
});
```

The C++ firmware hand-mirrors these schemas in `firmware/shared/messages.h`. No codegen — hand-sync the `.h` file. If `contracts.ts` and this doc disagree, this doc wins until `contracts.ts` is updated.

---

*Cross-references: HARDWARE.md (B1 retry, B2 contract, B7 LCD), PACKS.md (pack control topics), SPACES.md (space/mode topics), VISION.md (three-tier architecture)*
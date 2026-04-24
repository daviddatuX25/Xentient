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
- **Camera JPEG frames:** Cannot use MQTT (exceeds 3KB cap). Transported via UART2 chunked → Node Base reassemble → WS binary (prefix `0xCA`). See Camera Frame Binary Formats below.

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
| 0x14  | ESP32-CAM   | Node → Harness    | UART2 + WS binary |
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

### Camera Topics

| Topic                        | Direction         | Format     | Description                          |
|------------------------------|-------------------|------------|--------------------------------------|
| `xentient/camera/request`  | Node ↔ Harness    | JSON MQTT  | Camera frame request / acknowledgment|
| `xentient/camera/status`    | Node → Harness    | JSON MQTT  | Camera readiness / error status      |

---

## Camera Frame Transport — Design Decisions (LOCKED)

> These decisions are **LOCKED** — they were evaluated against alternatives and committed. Do not revisit without a formal ADR.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Frame transport: EXTEND AudioServer WS (one port)** — message type discriminator byte (`0xCA` camera, `0xA0` audio) | Avoids opening a second WS port on the ESP32; single TCP connection simplifies firewall/NAT and reuses existing AudioServer connection management. |
| D2 | **UART framing: TIMER PUSH every 3s** — CAM sends on timer, Node Base listens | Event-driven push avoids request/response complexity over UART; 3s interval balances latency vs UART bandwidth for QQVGA frames. |
| D3 | **Frame size: QQVGA 160x120 quality 10** — fits UART budget with headroom | At quality 10, QQVGA JPEG is ~2-4KB, well within UART chunked transport budget. Higher resolutions would exceed 3s cadence. |
| D4 | **Dashboard display: WebSocket push to img element** | Harness pushes reassembled JPEG to dashboard via WS binary; browser renders directly to `<img>` using blob URL. No polling, no REST fetch. |
| D5 | **CRC8 polynomial: 0x07 (CRC-8/ITU)** | Standard polynomial used in ITU-T recommendations; well-tested, simple lookup-table implementation fits ESP32 ROM. |
| D6 | **frame_id: uint16 everywhere** — unified across UART and WS | uint16 gives 65536 unique frame IDs before wrap; sufficient for 3s cadence (~55 hours before wrap). No inconsistency between transport layers. |

---

## Camera Frame Binary Formats

### UART Frame Format (ESP32-CAM → Node Base)

JPEG frames are chunked for UART transport. Each chunk is a discrete UART packet:

```
[0xAA 0x55][frame_id:uint16 LE][chunk_idx:uint8][chunk_total:uint8][chunk_len:uint16 LE][data...][crc8]
```

Header breakdown:

| Offset | Size | Field         | Description                                    |
|--------|------|---------------|------------------------------------------------|
| 0      | 2    | sync          | `0xAA 0x55` — fixed sync bytes                |
| 2      | 2    | frame_id      | uint16 LE — unique per captured frame          |
| 4      | 1    | chunk_idx     | uint8 — 0-indexed chunk number                |
| 5      | 1    | chunk_total   | uint8 — total chunks in this frame             |
| 6      | 2    | chunk_len     | uint16 LE — length of data payload in chunk    |
| 8      | N    | data          | JPEG chunk bytes (N = chunk_len)                |
| 8+N    | 1    | crc8          | CRC-8 with polynomial 0x07, over bytes 0..8+N-1|

- **Sync bytes** (`0xAA 0x55`): Node Base scans for these to re-sync after errors.
- **frame_id**: Monotonically increasing, wraps at 65535. Same ID across all chunks of one frame.
- **chunk_idx**: 0-indexed. Chunk 0 is the first N bytes of the JPEG, chunk 1 is the next, etc.
- **chunk_total**: Must be identical across all chunks of the same frame_id. Receiver uses this to know when reassembly is complete.
- **chunk_len**: Payload size per chunk. Maximum chunk payload = 200 bytes (fits UART buffer with header overhead).
- **crc8**: CRC-8/ITU (polynomial 0x07, init 0x00, no final XOR). Computed over all preceding bytes (sync through data). Receiver recalculates and compares; mismatched chunks are dropped.

#### Reassembly Rules

1. On receiving chunk with `chunk_idx == 0`, start a new reassembly buffer for that `frame_id`.
2. Append `data` to the reassembly buffer.
3. When `chunk_idx == chunk_total - 1`, reassembly is complete. Emit the full JPEG.
4. If a chunk for a different `frame_id` arrives mid-reassembly, **discard the incomplete frame** and start reassembly for the new `frame_id`.
5. If `crc8` mismatch, **drop that chunk**. Do not NACK — CAM pushes on timer, next frame will arrive in 3s.
6. Timeout: if reassembly is not complete within 5s of the first chunk, discard the partial frame.

### WS Binary Message Format (Node Base → Harness)

After Node Base reassembles the full JPEG, it sends it over the shared WebSocket:

```
[0xCA][frame_id:uint16 LE][total_size:uint32 LE][data...]
```

| Offset | Size | Field      | Description                                |
|--------|------|------------|--------------------------------------------|
| 0      | 1    | prefix     | `0xCA` — camera message discriminator      |
| 1      | 2    | frame_id   | uint16 LE — matches UART frame_id          |
| 3      | 4    | total_size | uint32 LE — total JPEG size in bytes       |
| 7      | N    | data       | Complete JPEG frame (N = total_size)       |

- **prefix byte** (`0xCA`): Discriminator so camera and audio share one WS connection. Harness reads the first byte to route: `0xCA` → camera handler, `0xAU` → audio handler.
- **frame_id**: uint16 LE — same value as in the UART frame. Harness uses this to deduplicate on reconnect.
- **total_size**: uint32 LE — total JPEG byte count. Enables pre-allocation and validation before reading the rest of the message.
- **data**: The complete reassembled JPEG frame (starts with `0xFF 0xD8`, ends with `0xFF 0xD9`).

### Audio Prefix Migration (0xA0)

Existing audio binary messages on the shared WebSocket **must** be prefixed with `0xA0`:

```
[0xA0][data...]
```

| Offset | Size | Field  | Description                           |
|--------|------|--------|---------------------------------------|
| 0      | 1    | prefix | `0xA0` — audio message discriminator |
| 1      | N    | data   | PCM audio chunk (S16LE, 16kHz)       |

> **Note:** The spec notation `0xAU` uses `U` as a mnemonic for "audio". The actual wire value is `0xA0` (160 decimal). This keeps the high nibble `0xA` as a shared namespace for non-camera binary messages.

This prefix is added to the **existing** audio binary format. The audio payload structure (`[sessionId:uint8][sequence:uint32][pcm...]`) remains unchanged — it just gains a leading `0xA0` byte.

**Migration:** When camera support is added to the AudioServer, all existing binary audio messages must include the `0xA0` prefix. The harness must reject any binary message that lacks a recognized prefix byte.

### Prefix Byte Registry

| Byte   | Type   | Description              |
|--------|--------|--------------------------|
| `0xA0` | Audio  | PCM audio chunk prefix   |
| `0xCA` | Camera | JPEG frame prefix        |

Future peripheral types that need binary WS transport must register a prefix byte here.

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

### Camera Request (Harness ↔ Node)

```json
{
  "v": 1,
  "type": "camera_request",
  "frameId": 42
}
```

- `frameId`: uint16 — the frame being requested or acknowledged. Harness sends this to request a specific frame; Node Base sends it to confirm frame capture.
- Published on `xentient/camera/request`.

### Camera Ready (Node → Harness)

```json
{
  "v": 1,
  "type": "camera_ready",
  "frameId": 42,
  "size": 3245
}
```

- `frameId`: uint16 — matches the UART frame_id and WS binary frame_id.
- `size`: uint32 — total JPEG size in bytes. Harness uses this to validate the WS binary payload matches.
- Published on `xentient/camera/status`.

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
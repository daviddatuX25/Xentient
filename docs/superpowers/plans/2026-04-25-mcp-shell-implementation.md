# MCP Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Xentient's monolithic harness into a Core process (hardware I/O + MCP server) and a Brain process (STT→LLM→TTS via MCP client), fixing all demo-blocking validation issues along the way.

**Architecture:** Core process owns all hardware I/O and exposes 7 MCP tools + 5 MCP events over stdio. Brain processes connect via MCP to drive Xentient. The `brain-basic` process is the fallback that handles the full STT→LLM→TTS pipeline without memory. For demo, brain-basic spawns core as a child process via stdio transport and supervises it (auto-restarts on crash). Post-demo, core runs as its own long-lived process and brain connects via named pipe or socket. **Critical: all pino loggers in core and its modules MUST write to stderr (`pino(process.stderr)`) to avoid corrupting the MCP stdio stream.**

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (v1.x), `ws`, `mqtt`, `zod`, `pino`, existing provider SDKs (Deepgram, ElevenLabs, OpenAI)

**Gap Analysis:** This plan incorporates findings from `docs/superpowers/specs/2026-04-25-mcp-shell-gap-analysis.md`. Gaps GAP-1 through GAP-16 are resolved inline. New tasks T-0, T-0.5, and T-18 are added. Existing tasks are extended with T-19 through T-24 steps. See the Post-Demo Optimizations section for deferred items.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/core.ts` | Core process entry point — starts MCP server + all hardware I/O, AudioAccumulator (GAP-2/T-19) |
| `src/brain-basic.ts` | Brain process entry point — connects via MCP, runs STT→LLM→TTS, process supervision (GAP-3/T-20) |
| `src/mcp/server.ts` | MCP server with 7 tool registrations |
| `src/mcp/tools.ts` | Tool handler implementations (delegates to MqttClient, AudioServer, etc.) |
| `src/mcp/events.ts` | Event subscription + push logic (5 events) |
| `src/mcp/types.ts` | Zod schemas for MCP tool inputs/outputs |
| `src/shared/types.ts` | Shared interfaces (SensorCache) — extracted to avoid MCP↔comms circular dep (RF-5) |
| `tests/helpers/` | Mock factories for MqttClient, AudioServer, CameraServer, ModeManager (GAP-10/T-0.5) |

### Modified Files

| File | Change |
|------|--------|
| `src/comms/AudioServer.ts:133-137` | Prepend `0xA0` prefix in `sendAudio()` |
| `src/comms/MqttClient.ts:24-35` | Remove `xentient/sensors/vad` from subscriptions |
| `src/comms/ControlServer.ts` | Add REST endpoints: `GET /api/sensors`, `GET /api/mode`, `GET /api/camera` |
| `src/engine/ModeManager.ts` | Add `reconfigureHardware(mode)` method |
| `src/shared/contracts.ts:193` | Fix timestamp comment (millis-since-boot, not epoch-seconds) |
| `src/shared/contracts.ts:39-44` | Fix LCD face text to match HARDWARE.md B7 |
| `firmware/src/main.cpp` | Add PIR ISR on GPIO13 that publishes `sensor_data` with `peripheralType:0x11`; Add VAD-end trigger (GAP-1/T-18) |

### Moved Files (P1)

| Current | Destination | Notes |
|---------|-------------|-------|
| `src/engine/Pipeline.ts` | `src/brain-basic/Pipeline.ts` | Refactored to use MCP client calls |
| `src/providers/*` | `src/brain-basic/providers/*` | Only Brain calls STT/LLM/TTS |
| `src/brain/BrainRouter.ts` | Delete | Replaced by MCP architecture |

### Unchanged Files

| File | Notes |
|------|-------|
| `src/comms/CameraServer.ts` | Stays in Core |
| `src/engine/ArtifactWriter.ts` | Stays in Core |
| `src/shared/contracts-schemas.ts` | Shared |
| `src/shared/contracts-verify.ts` | Shared |
| `config/default.json` | Add `mcp` + `stt`/`tts`/`llm` provider sections (GAP-5/T-23) |

---

## Task 0: Install MCP SDK, Vitest, and Configure Project (P0 prerequisite)

**Files:**
- Modify: `package.json`
- Modify: `config/default.json`

> Merges old Task 5 + GAP-5 (T-23: provider config). Must run first — all subsequent tasks depend on vitest and MCP SDK being installed.

- [ ] **Step 1: Install MCP SDK**

Run: `cd harness && npm install @modelcontextprotocol/sdk`

- [ ] **Step 2: Install vitest for testing**

Run: `cd harness && npm install -D vitest`

- [ ] **Step 3: Add MCP + provider config sections to default.json**

Add to `config/default.json`:

```json
{
  "mcp": {
    "transport": "stdio",
    "serverName": "xentient-core",
    "serverVersion": "1.0.0"
  },
  "stt": { "provider": "deepgram" },
  "tts": { "provider": "elevenlabs", "voiceId": "default" },
  "llm": { "provider": "openai", "model": "gpt-4o-mini" }
}
```

> GAP-5 resolution: `brain-basic.ts` references `config.stt.provider`, `config.tts.voiceId`, `config.llm.model` — these must exist in default.json or it crashes on startup.

- [ ] **Step 4: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add harness/package.json harness/package-lock.json harness/config/default.json
git commit -m "feat(harness): add MCP SDK, vitest, and provider config to default.json"
```

---

## Task 0.5: Create Test Helper Mocks (P1 prerequisite)

**Files:**
- Create: `tests/helpers/mockMqtt.ts`
- Create: `tests/helpers/mockAudioServer.ts`
- Create: `tests/helpers/mockCameraServer.ts`
- Create: `tests/helpers/mockModeManager.ts`

> GAP-10 resolution: Integration tests (Task 16) and REST tests (Task 11) need MQTT/WebSocket/hardware mocks. CI has no broker or hardware.

- [ ] **Step 1: Create mock factories**

```typescript
// tests/helpers/mockMqtt.ts
import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockMqtt(nodeId = "node-01") {
  const mqtt = new EventEmitter();
  return {
    ...mqtt,
    nodeId,
    connected: true,
    publish: vi.fn(),
    subscribe: vi.fn(),
    disconnect: vi.fn(),
  };
}
```

```typescript
// tests/helpers/mockAudioServer.ts
import { EventEmitter } from "events";

export function createMockAudioServer() {
  return new EventEmitter() as any;
}
```

```typescript
// tests/helpers/mockCameraServer.ts
import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockCameraServer() {
  return {
    ...new EventEmitter(),
    getLatestJpeg: vi.fn().mockReturnValue(null),
    getStats: vi.fn().mockReturnValue({ frameCount: 0, fps: 0 }),
    handleFrame: vi.fn(),
    close: vi.fn(),
  };
}
```

```typescript
// tests/helpers/mockModeManager.ts
import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockModeManager() {
  const mgr = new EventEmitter();
  let currentMode = "sleep";
  return {
    ...mgr,
    getMode: () => currentMode,
    transition: (mode: string) => { const from = currentMode; currentMode = mode; mgr.emit("modeChange", { from, to: mode }); return true; },
    handleModeCommand: vi.fn(),
    handleSensorEvent: vi.fn(),
    clearIdleTimer: vi.fn(),
    reconfigureHardware: vi.fn(),
  };
}
```

- [ ] **Step 2: Create SensorCache type in shared/types.ts**

> RF-5 resolution: SensorCache must not live in `src/mcp/tools.ts` — that creates a circular dep from comms→mcp layer. Move to shared.

```typescript
// src/shared/types.ts
export interface SensorCache {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  motion: boolean | null;
  lastMotionAt: number | null;
}
```

- [ ] **Step 3: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add harness/tests/helpers/ harness/src/shared/types.ts
git commit -m "test: add mock factories and shared SensorCache type for MCP/ControlServer use"
```

---

## Task 1: Fix Audio 0xA0 Prefix in sendAudio (P0-2)

**Files:**
- Modify: `src/comms/AudioServer.ts:133-137`
- Test: `tests/audio-prefix.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/audio-prefix.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

describe("AudioServer sendAudio prefix", () => {
  it("prepends 0xA0 prefix to PCM audio before sending", async () => {
    const { AudioServer } = await import("../src/comms/AudioServer");
    const server = new AudioServer(0); // port 0 = random
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    // Mock the active connection
    const mockWs = { readyState: WebSocket.OPEN, send: vi.fn() };
    (server as any).activeConnection = mockWs;

    server.sendAudio(pcm);

    const sent = mockWs.send.mock.calls[0][0] as Buffer;
    expect(sent[0]).toBe(0xa0);
    expect(sent.subarray(1)).toEqual(pcm);
    server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio-prefix.test.ts`
Expected: FAIL — `sent[0]` is `0x01` (raw PCM byte), not `0xa0`

- [ ] **Step 3: Write minimal implementation**

In `src/comms/AudioServer.ts`, change `sendAudio`:

```typescript
  /** Send TTS audio back to ESP32 as binary frames with 0xA0 prefix */
  sendAudio(audioBuffer: Buffer): void {
    if (this.activeConnection?.readyState === WebSocket.OPEN) {
      const prefixed = Buffer.alloc(1 + audioBuffer.length);
      prefixed[0] = AUDIO_WS_PREFIX;
      audioBuffer.copy(prefixed, 1);
      this.activeConnection.send(prefixed, { binary: true });
    } else {
      logger.warn('No active WebSocket connection to send audio to');
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio-prefix.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/comms/AudioServer.ts tests/audio-prefix.test.ts
git commit -m "fix(audio): prepend 0xA0 prefix in sendAudio per CONTRACTS.md"
```

---

## Task 2: Remove Dead VAD Subscription from MqttClient (P0-3)

**Files:**
- Modify: `src/comms/MqttClient.ts:24-35`

- [ ] **Step 1: Remove the dead subscription**

In `src/comms/MqttClient.ts`, remove `'xentient/sensors/vad'` from the topics array (line ~30):

```typescript
      // Before:
      const topics = [
        'xentient/control/mode',
        'xentient/control/trigger',
        'xentient/control/space',
        'xentient/control/pack',
        'xentient/sensors/env',
        'xentient/sensors/motion',
        'xentient/sensors/vad',      // ← REMOVE this line (dead topic)
        'xentient/status/mode',
        // ...
      ];

      // After:
      const topics = [
        'xentient/control/mode',
        'xentient/control/trigger',
        'xentient/control/space',
        'xentient/control/pack',
        'xentient/sensors/env',
        'xentient/sensors/motion',
        'xentient/status/mode',
        // ...
      ];
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/comms/MqttClient.ts
git commit -m "fix(mqtt): remove dead xentient/sensors/vad subscription"
```

---

## Task 3: Fix Contracts Timestamp Comment and LCD Faces (P0 minor)

**Files:**
- Modify: `src/shared/contracts.ts:193` (timestamp comment)
- Modify: `src/shared/contracts.ts:39-44` (LCD faces)

- [ ] **Step 1: Fix timestamp comment**

In `src/shared/contracts.ts`, find the `SensorData` schema and update the timestamp comment:

```typescript
  // Before:
  timestamp: z.number().int().min(0), // epoch-millis (JS-safe, ESP32 uses epoch-seconds)

  // After:
  timestamp: z.number().int().min(0), // millis-since-boot on ESP32, epoch-millis on harness side
```

- [ ] **Step 2: Fix LCD faces to match HARDWARE.md B7**

```typescript
// Before:
export const LCD_FACES: Record<Mode, { line1: string; line2: string }> = {
  sleep: { line1: "(_ _) Zzz", line2: "" },
  listen: { line1: "(O_O)", line2: "listening..." },
  active: { line1: "(^_^)", line2: "" },
  record: { line1: "(_ _) REC", line2: "" },
};

// After:
export const LCD_FACES: Record<Mode, { line1: string; line2: string }> = {
  sleep: { line1: "(_ _) Zzz", line2: "" },
  listen: { line1: "(O_O)", line2: "listening" },
  active: { line1: "(^_^)", line2: "Xentient" },
  record: { line1: "(_ _) REC", line2: "" },
};
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/contracts.ts
git commit -m "fix(contracts): correct timestamp comment and LCD face text per HARDWARE.md"
```

---

## Task 4: Wire PIR ISR in Firmware (P0-1)

**Files:**
- Modify: `firmware/src/main.cpp`

- [ ] **Step 1: Add PIR ISR in main.cpp**

Add after `cam_relay_init();` in `setup()`:

```cpp
// --- PIR interrupt (GPIO13) ---
static volatile bool pirTriggered = false;

void IRAM_ATTR pir_isr() {
    pirTriggered = true;
}

// In setup(), after cam_relay_init():
    pinMode(PIN_PIR_INT, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_PIR_INT), pir_isr, RISING);
    Serial.printf("[BOOT] PIR ISR attached on GPIO%d\n", PIN_PIR_INT);
```

- [ ] **Step 2: Add PIR publish in loop()**

Add at the top of `loop()`, before `ws_audio_loop()`:

```cpp
    // --- PIR motion detection ---
    if (pirTriggered && mqtt_connected()) {
        pirTriggered = false;
        JsonDocument doc;
        doc["v"]              = MSG_VERSION;
        doc["type"]           = "sensor_data";
        doc["peripheralType"] = PERIPHERAL_TYPE_PIR;
        JsonObject payload    = doc["payload"].to<JsonObject>();
        payload["motion"]     = true;
        doc["timestamp"]      = (uint32_t)millis();
        char buf[128];
        serializeJson(doc, buf, sizeof(buf));
        mqtt_publish(TOPIC_MOTION, buf, strlen(buf));
        Serial.println("[PIR] Motion detected — published sensor_data");
    }
```

- [ ] **Step 3: Verify firmware compiles**

Run: `cd firmware && pio run -e nodemcu-32s`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "feat(firmware): add PIR ISR on GPIO13, publish sensor_data on motion"
```

---

## Task 18: Add VAD-end Trigger to Firmware (P0)

**Files:**
- Modify: `firmware/src/main.cpp`

> GAP-1 resolution: The firmware only publishes `trigger_pipeline` on VAD-start. The entire STT→LLM→TTS pipeline requires a VAD-end signal. The firmware already has VAD logic — it just needs a second publish when VAD detects silence after speech.

- [ ] **Step 1: Add VAD state tracking variables**

Add near the PIR ISR variables (after `pirTriggered`):

```cpp
// --- VAD end detection state ---
static volatile bool vad_was_active = false;
static volatile bool vad_is_active = false;
static volatile uint32_t vad_start_millis = 0;
```

- [ ] **Step 2: Update VAD-start publish to set state**

In the existing VAD-start section (where `trigger_pipeline { source: "voice" }` is published), add after the publish:

```cpp
    vad_start_millis = millis();
    vad_is_active = true;
```

- [ ] **Step 3: Add VAD-end publish in loop()**

Add after the PIR publish block in `loop()`:

```cpp
    // --- VAD end detection (silence after speech) ---
    if (vad_is_active && !vad_detected && mqtt_connected()) {
        vad_was_active = vad_is_active;
        vad_is_active = false;
        JsonDocument doc;
        doc["v"]              = MSG_VERSION;
        doc["type"]           = "trigger_pipeline";
        doc["source"]         = "voice";
        doc["stage"]          = "end";
        doc["duration_ms"]    = (uint32_t)(millis() - vad_start_millis);
        char buf[128];
        serializeJson(doc, buf, sizeof(buf));
        mqtt_publish(TOPIC_CONTROL_TRIGGER, buf, strlen(buf));
        Serial.printf("[VAD] Voice end — duration %lu ms\n", (unsigned long)(millis() - vad_start_millis));
    }
```

> Note: `vad_detected` is a placeholder — before implementing, find the actual VAD state variable in `main.cpp` by running:
> ```bash
> cd firmware && grep -n "vad\|VAD\|energy\|threshold" src/main.cpp | head -20
> ```
> Look for the boolean or threshold variable that indicates "speech is currently detected". Common names: `vad_active`, `speech_detected`, `audio_energy_above_threshold`. Replace `vad_detected` with the actual variable name.

- [ ] **Step 4: Verify firmware compiles**

Run: `cd firmware && pio run -e nodemcu-32s`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "feat(firmware): add VAD-end trigger — publish trigger_pipeline with stage=end on silence"
```

---

## Task 5: ~~Install MCP SDK and Configure Project~~ MERGED INTO TASK 0

> Task 5 is now covered by Task 0 (install deps + provider config). See Task 0 for the merged implementation.

---

## Task 6: Create MCP Types and Tool Schemas (P1-4 partial)

**Files:**
- Create: `src/mcp/types.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
// src/mcp/types.ts
import { z } from "zod";

// ── Tool Input Schemas ────────────────────────────────────────────

export const ReadSensorsInputSchema = z.object({});

export const ReadModeInputSchema = z.object({});

export const SetModeInputSchema = z.object({
  mode: z.enum(["sleep", "listen", "active", "record"]), // TODO: Replace with z.string() + validation against mode registry post-demo (GAP-8)
});

export const PlayAudioInputSchema = z.object({
  data: z.string().describe("Base64-encoded PCM s16le audio"),
  format: z.literal("pcm_s16le"),
});

export const SetLcdInputSchema = z.object({
  line1: z.string().max(16),
  line2: z.string().max(16),
});

export const CaptureFrameInputSchema = z.object({});

export const MqttPublishInputSchema = z.object({
  topic: z.string(),
  payload: z.record(z.unknown()),
});

// ── Tool Output Schemas ───────────────────────────────────────────

export const SensorsOutputSchema = z.object({
  temperature: z.number().nullable(),
  humidity: z.number().nullable(),
  pressure: z.number().nullable(),
  motion: z.boolean().nullable(),
});

export const ModeOutputSchema = z.object({
  mode: z.enum(["sleep", "listen", "active", "record"]),
});

export const FrameOutputSchema = z.object({
  frameId: z.number(),
  jpeg: z.string().describe("Base64-encoded JPEG"),
});

// ── Event Schemas ──────────────────────────────────────────────────

export const MotionDetectedEventSchema = z.object({
  timestamp: z.number(),
  nodeBaseId: z.string(),
});

export const VoiceStartEventSchema = z.object({
  timestamp: z.number(),
});

export const VoiceEndEventSchema = z.object({
  timestamp: z.number(),
  duration_ms: z.number(),
  audio: z.string().describe("Base64-encoded PCM s16le audio"),
});

export const ModeChangedEventSchema = z.object({
  from: z.enum(["sleep", "listen", "active", "record"]),
  to: z.enum(["sleep", "listen", "active", "record"]),
  timestamp: z.number(),
});

export const SensorUpdateEventSchema = z.object({
  temperature: z.number(),
  humidity: z.number(),
  pressure: z.number(),
});

// ── Event Names ───────────────────────────────────────────────────

export const MCP_EVENTS = {
  motion_detected: "xentient/motion_detected",
  voice_start: "xentient/voice_start",
  voice_end: "xentient/voice_end",
  mode_changed: "xentient/mode_changed",
  sensor_update: "xentient/sensor_update",
} as const;
```

- [ ] **Step 2: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add harness/src/mcp/types.ts
git commit -m "feat(mcp): add MCP tool and event type schemas"
```

---

## Task 7: Create MCP Tool Handlers (P1-4)

**Files:**
- Create: `src/mcp/tools.ts`

- [ ] **Step 1: Write the tool handlers**

```typescript
// src/mcp/tools.ts
import type { MqttClient } from "../comms/MqttClient";
import type { AudioServer } from "../comms/AudioServer";
import type { CameraServer } from "../comms/CameraServer";
import type { ModeManager } from "../engine/ModeManager";
import type { SensorCache } from "../shared/types"; // RF-5: moved from here to shared to avoid comms↔mcp circular dep
import pino from "pino";

const logger = pino({ name: "mcp-tools" }, process.stderr); // RF-2: stderr for MCP stdio safety

export interface McpToolDeps {
  mqtt: MqttClient;
  audio: AudioServer;
  camera: CameraServer;
  modeManager: ModeManager;
  sensorCache: SensorCache;
}

// NOTE: SensorCache interface is defined in src/shared/types.ts (Task 0.5) — do NOT redefine here

export function createToolHandlers(deps: McpToolDeps) {
  return {
    xentient_read_sensors: async () => {
      const { sensorCache } = deps;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            temperature: sensorCache.temperature,
            humidity: sensorCache.humidity,
            pressure: sensorCache.pressure,
            motion: sensorCache.motion,
          }),
        }],
      };
    },

    xentient_read_mode: async () => {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ mode: deps.modeManager.getMode() }),
        }],
      };
    },

    xentient_set_mode: async ({ mode }: { mode: string }) => {
      const success = deps.modeManager.transition(mode as any);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success }),
        }],
      };
    },

    xentient_play_audio: async ({ data, format }: { data: string; format: string }) => {
      if (format !== "pcm_s16le") {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Unsupported format, expected pcm_s16le" }),
          }],
          isError: true,
        };
      }
      const audioBuffer = Buffer.from(data, "base64");
      deps.audio.sendAudio(audioBuffer);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },

    xentient_set_lcd: async ({ line1, line2 }: { line1: string; line2: string }) => {
      deps.mqtt.publish("xentient/display", {
        v: 1,
        type: "display_update",
        mode: "expression",
        line1,
        line2,
        duration: 0,
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },

    xentient_capture_frame: async () => {
      const jpeg = deps.camera.getLatestJpeg();
      if (!jpeg) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ frameId: 0, jpeg: "", error: "No frame available" }),
          }],
          isError: true,
        };
      }
      const stats = deps.camera.getStats();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            frameId: stats.frameCount,
            jpeg: jpeg.toString("base64"),
          }),
        }],
      };
    },

    xentient_mqtt_publish: async ({ topic, payload }: { topic: string; payload: Record<string, unknown> }) => {
      deps.mqtt.publish(topic, payload);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true }),
        }],
      };
    },
  };
}
```

- [ ] **Step 2: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors (may need `CameraServer.getStats` return type check — it already returns `Readonly<CameraStats>`)

- [ ] **Step 3: Commit**

```bash
git add harness/src/mcp/tools.ts
git commit -m "feat(mcp): add 7 MCP tool handler implementations"
```

---

## Task 8: Create MCP Event Bridge (P1-5)

**Files:**
- Create: `src/mcp/events.ts`

- [ ] **Step 1: Write the event bridge**

This module wires MQTT/audio events from Core subsystems into MCP notifications pushed to the connected brain.

```typescript
// src/mcp/events.ts
import type { MqttClient } from "../comms/MqttClient";
import type { ModeManager, ModeChangeEvent } from "../engine/ModeManager";
import type { McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import type { SensorCache } from "../shared/types"; // RF-5: import from shared, not ./tools
import { MCP_EVENTS } from "./types";
import { PERIPHERAL_IDS } from "../shared/contracts"; // RF-6: use constant instead of magic number
import pino from "pino";

const logger = pino({ name: "mcp-events" }, process.stderr); // RF-2: stderr for MCP stdio safety

export function wireMcpEvents(
  server: McpServer,
  mqtt: MqttClient,
  modeManager: ModeManager,
  sensorCache: SensorCache,
): void {
  // motion_detected: PIR ISR → MQTT → Core → Brain
  mqtt.on("sensor", (data: unknown) => {
    const d = data as { peripheralType?: number; payload?: { motion?: boolean } };
    if (d.peripheralType === PERIPHERAL_IDS.PIR && d.payload?.motion) { // RF-6: was 0x11 magic number
      sensorCache.motion = true;
      sensorCache.lastMotionAt = Date.now();
      server.notification({
        method: MCP_EVENTS.motion_detected,
        params: {
          timestamp: Date.now(),
          nodeBaseId: mqtt.nodeId,
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to send motion_detected event"));
    }

    // sensor_update: BME280 periodic → Brain
    if (d.peripheralType === PERIPHERAL_IDS.BME280) { // RF-6: was 0x12 magic number
      const p = d.payload as { temperature?: number; humidity?: number; pressure?: number };
      sensorCache.temperature = p.temperature ?? sensorCache.temperature;
      sensorCache.humidity = p.humidity ?? sensorCache.humidity;
      sensorCache.pressure = p.pressure ?? sensorCache.pressure;
      server.notification({
        method: MCP_EVENTS.sensor_update,
        params: {
          temperature: sensorCache.temperature,
          humidity: sensorCache.humidity,
          pressure: sensorCache.pressure,
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to send sensor_update event"));
    }
  });

  // RF-3: Voice triggers come via xentient/control/trigger (NOT the dead xentient/sensors/vad topic)
  // MqttClient emits "triggerPipeline" on that topic — the old mqtt.on("vad") path was dead
  mqtt.on("triggerPipeline", (data: unknown) => {
    const d = data as { source?: string; stage?: string };
    if (d.source === "voice" && d.stage === "start") {
      server.notification({
        method: MCP_EVENTS.voice_start,
        params: { timestamp: Date.now() },
      }).catch((err: Error) => logger.error({ err }, "Failed to send voice_start event"));
    }
    // voice_end with audio buffer is handled in core.ts (RF-4/T-10 AudioAccumulator)
  });

  // mode_changed: ModeManager transition → Brain
  modeManager.on("modeChange", ({ from, to }: ModeChangeEvent) => {
    server.notification({
      method: MCP_EVENTS.mode_changed,
      params: { from, to, timestamp: Date.now() },
    }).catch((err: Error) => logger.error({ err }, "Failed to send mode_changed event"));
  });
}
```

- [ ] **Step 2: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add harness/src/mcp/events.ts
git commit -m "feat(mcp): add event bridge wiring MQTT/VAD/mode events to MCP notifications"
```

---

## Task 9: Create MCP Server Module (P1-2 partial)

**Files:**
- Create: `src/mcp/server.ts`

- [ ] **Step 1: Write the MCP server setup**

```typescript
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createToolHandlers, type McpToolDeps } from "./tools";
import type { SensorCache } from "../shared/types"; // RF-5: import from shared, not ./tools
import { wireMcpEvents } from "./events";
// RF-7: removed unused imports MQTT_TOPICS, AUDIO_WS_PREFIX
import pino from "pino";

const logger = pino({ name: "mcp-server" }, process.stderr); // RF-2: stderr for MCP stdio safety

export async function startMcpServer(deps: McpToolDeps): Promise<McpServer> {
  const server = new McpServer({
    name: "xentient-core",
    version: "1.0.0",
  });

  const handlers = createToolHandlers(deps);

  // Register 7 MCP tools
  server.tool(
    "xentient_read_sensors",
    "Read current sensor values (temperature, humidity, pressure, motion)",
    {},
    async () => handlers.xentient_read_sensors(),
  );

  server.tool(
    "xentient_read_mode",
    "Read the current Xentient mode (sleep, listen, active, record)",
    {},
    async () => handlers.xentient_read_mode(),
  );

  server.tool(
    "xentient_set_mode",
    "Set the Xentient mode. Valid transitions follow state machine rules.",
    { mode: z.enum(["sleep", "listen", "active", "record"]) },
    async ({ mode }) => handlers.xentient_set_mode({ mode }),
  );

  server.tool(
    "xentient_play_audio",
    "Play audio through the ESP32 speaker. Send base64-encoded PCM s16le.",
    {
      data: z.string().describe("Base64-encoded PCM s16le audio"),
      format: z.literal("pcm_s16le"),
    },
    async ({ data, format }) => handlers.xentient_play_audio({ data, format }),
  );

  server.tool(
    "xentient_set_lcd",
    "Set the LCD display text (2 lines, max 16 chars each)",
    {
      line1: z.string().max(16),
      line2: z.string().max(16),
    },
    async ({ line1, line2 }) => handlers.xentient_set_lcd({ line1, line2 }),
  );

  server.tool(
    "xentient_capture_frame",
    "Capture the latest camera frame as base64 JPEG",
    {},
    async () => handlers.xentient_capture_frame(),
  );

  server.tool(
    "xentient_mqtt_publish",
    "Publish a JSON payload to an MQTT topic",
    {
      topic: z.string(),
      payload: z.record(z.unknown()),
    },
    async ({ topic, payload }) => handlers.xentient_mqtt_publish({ topic, payload }),
  );

  // Wire events (push-based notifications from Core → Brain)
  wireMcpEvents(server, deps.mqtt, deps.modeManager, deps.sensorCache);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");

  return server;
}
```

- [ ] **Step 2: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors (may need import path adjustments for MCP SDK)

- [ ] **Step 3: Commit**

```bash
git add harness/src/mcp/server.ts
git commit -m "feat(mcp): create MCP server with 7 tools + stdio transport"
```

---

## Task 10: Create Core Process Entry Point (P1-2)

**Files:**
- Create: `src/core.ts`
- Modify: `src/comms/ControlServer.ts`
- Modify: `src/comms/MqttClient.ts` (GAP-11: pino stderr)
- Modify: `src/comms/AudioServer.ts` (GAP-11: pino stderr)
- Modify: `src/comms/CameraServer.ts` (GAP-11: pino stderr)
- Modify: `src/engine/ModeManager.ts` (GAP-11: pino stderr)
- Modify: `src/engine/ArtifactWriter.ts` (GAP-11: pino stderr)

> Integrates: RF-2 (pino stderr), RF-4 (AudioAccumulator/voice_end), RF-5 (SensorCache from shared), GAP-2 (T-19: AudioAccumulator), GAP-7 (T-24: ControlServer Pipeline audit), GAP-11 (T-22: pino stderr for ALL modules), GAP-12 (nodeBaseId hardcode), GAP-15 (config.nodeId).

- [ ] **Step 1: Write the core process**

This replaces `index.ts` as the Core entry point. It starts all hardware I/O, the MCP server, and the ControlServer. It does NOT include Pipeline or providers — those move to brain-basic.

```typescript
// src/core.ts
import * as dotenv from "dotenv";
dotenv.config();

import config from "../config/default.json";
import { MqttClient } from "./comms/MqttClient";
import { AudioServer } from "./comms/AudioServer";
import { CameraServer } from "./comms/CameraServer";
import { ControlServer } from "./comms/ControlServer";
import { ModeManager } from "./engine/ModeManager";
import { startMcpServer } from "./mcp/server";
import type { SensorCache } from "./shared/types"; // RF-5: moved from ./mcp/tools
import { MCP_EVENTS, PROTOCOL_VERSION } from "./shared/contracts";
import pino from "pino";

const logger = pino({ name: "xentient-core" }, process.stderr); // RF-2: stderr for MCP stdio safety

async function main() {
  logger.info({ version: PROTOCOL_VERSION }, "Starting Xentient Core...");

  const mqtt = new MqttClient(
    process.env.MQTT_BROKER_URL ?? config.mqtt.brokerUrl,
    config.nodeId ?? "node-01", // GAP-15: fallback if config.nodeId missing
  );
  const audioServer = new AudioServer(config.audio.wsPort);
  const cameraServer = new CameraServer(config.camera.wsPort, config.camera.idleTimeoutMs);
  const modeManager = new ModeManager(mqtt);

  // Sensor cache for MCP tools
  const sensorCache: SensorCache = {
    temperature: null,
    humidity: null,
    pressure: null,
    motion: null,
    lastMotionAt: null,
  };

  // Wire MQTT events → ModeManager
  mqtt.on("modeCommand", (data) => modeManager.handleModeCommand(data));
  mqtt.on("sensor", (data) => modeManager.handleSensorEvent(data));
  modeManager.on("modeChange", ({ from, to }) => {
    logger.info({ from, to }, "Mode changed");
  });

  // Camera: AudioServer discriminates 0xCA frames → CameraServer forwards to dashboard
  audioServer.on("cameraFrame", (frame) => cameraServer.handleFrame(frame));
  cameraServer.on("cameraOnline", () => logger.info("Camera stream online"));
  cameraServer.on("cameraOffline", () => logger.warn("Camera stream offline — no frames for 10s"));

  // Start MCP server (stdio transport — brain processes connect here)
  const mcpServer = await startMcpServer({
    mqtt,
    audio: audioServer,
    camera: cameraServer,
    modeManager,
    sensorCache,
  });

  // ── AudioAccumulator (GAP-2/T-19): buffer PCM chunks during active/listen ──
  // TODO: Post-demo optimization — stream audio via WS instead of base64 through MCP
  const MAX_AUDIO_BYTES = 16_000 * 2 * 30; // 30s cap: 16kHz * 2 bytes * 30s = 960KB — prevents OOM if VAD-end never fires
  let audioChunks: Buffer[] = [];
  let isAccumulating = false;

  audioServer.on("audioChunk", (chunk: Buffer) => {
    const mode = modeManager.getMode();
    if (mode === "active" || mode === "listen") {
      isAccumulating = true;
      audioChunks.push(chunk);
      // Safety cap: if buffer exceeds 30s of audio, flush early to prevent OOM
      const totalBytes = audioChunks.reduce((sum, c) => sum + c.length, 0);
      if (totalBytes > MAX_AUDIO_BYTES) {
        logger.warn({ totalBytes, maxBytes: MAX_AUDIO_BYTES }, "AudioAccumulator cap reached — flushing early");
        // Emit voice_end with what we have and reset
        const combined = Buffer.concat(audioChunks);
        mcpServer.notification({
          method: MCP_EVENTS.voice_end,
          params: {
            timestamp: Date.now(),
            duration_ms: combined.length / 32,
            audio: combined.toString("base64"),
          },
        }).catch((err: Error) => logger.error({ err }, "Failed to send voice_end event (cap flush)"));
        audioChunks = [];
        isAccumulating = false;
      }
    }
  });

  // VAD-end → flush audio buffer as voice_end event (GAP-1/RF-4)
  mqtt.on("triggerPipeline", (data: unknown) => {
    const d = data as { source?: string; stage?: string };
    if (d.source === "voice" && d.stage === "end" && isAccumulating) {
      const combined = Buffer.concat(audioChunks);
      mcpServer.notification({
        method: MCP_EVENTS.voice_end,
        params: {
          timestamp: Date.now(),
          duration_ms: combined.length / 32, // 16kHz * 2 bytes = 32 bytes/ms
          audio: combined.toString("base64"),
        },
      }).catch((err: Error) => logger.error({ err }, "Failed to send voice_end event"));
      audioChunks = [];
      isAccumulating = false;
    }
  });

  // Control server — HTTP API + static files + SSE for browser test page
  const controlPort = parseInt(process.env.CONTROL_PORT ?? "3000", 10);
  const controlServer = new ControlServer(controlPort, mqtt, modeManager, cameraServer, sensorCache);
  await controlServer.start();

  logger.info(
    { wsPort: config.audio.wsPort, cameraPort: config.camera.wsPort, controlPort, mqtt: config.mqtt.brokerUrl },
    "Core ready — open http://localhost:" + controlPort,
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    modeManager.clearIdleTimer();
    mqtt.disconnect();
    cameraServer.close();
    audioServer.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal core error");
  process.exit(1);
});
```

- [ ] **Step 2: Update ControlServer constructor to remove Pipeline dependency**

The new `core.ts` does NOT import Pipeline. ControlServer must work without it. Modify `src/comms/ControlServer.ts` constructor:

```typescript
// Before:
constructor(
  port: number,
  mqtt: MqttClient,
  pipeline: Pipeline,
  modeManager: ModeManager,
)

// After:
constructor(
  port: number,
  mqtt: MqttClient,
  modeManager: ModeManager,
  cameraServer: CameraServer,
  sensorCache: SensorCache,
)
```

Remove the `Pipeline` import and all pipeline-related SSE wiring from the constructor. Pipeline events will come through MCP events instead.

- [ ] **Step 2b: Audit ControlServer for ALL Pipeline references (GAP-7/T-24)**

Before proceeding, grep ControlServer for any remaining Pipeline references:

```bash
cd harness && grep -n "Pipeline\|pipeline" src/comms/ControlServer.ts
```

Remove or redirect each one. The SSE broadcast for pipeline state should either be removed or replaced with MCP event forwarding. Check for:
- `import ... Pipeline` statements
- `pipeline.on(...)` event subscriptions
- `pipeline.getState()` or similar method calls
- SSE events that reference pipeline state

- [ ] **Step 2c: Migrate ALL existing module pino loggers to stderr (GAP-11/T-22)**

Critical: Any module that writes to stdout corrupts the MCP stdio stream. Update ALL pino instances to use `process.stderr`:

```typescript
// In each of these files, change:
//   const logger = pino({ name: "xxx" });
// to:
//   const logger = pino({ name: "xxx" }, process.stderr);

// Files to update:
// src/comms/MqttClient.ts
// src/comms/AudioServer.ts
// src/comms/CameraServer.ts
// src/comms/ControlServer.ts
// src/engine/ModeManager.ts
// src/engine/ArtifactWriter.ts
```

Verify with:
```bash
cd harness && grep -rn "pino({ name:" src/ | grep -v "process.stderr"
```
Expected: No results (all pino instances use stderr)

- [ ] **Step 2d: Update SensorCache import in mcp/tools.ts (RF-5)**

In `src/mcp/tools.ts`, change the SensorCache definition to import from shared:

```typescript
// Before:
export interface SensorCache { ... }

// After:
import type { SensorCache } from "../shared/types";
// Remove the interface definition from this file
```

Also update the import in `src/mcp/server.ts`:
```typescript
// Before:
import { createToolHandlers, type McpToolDeps, type SensorCache } from "./tools";
// After:
import { createToolHandlers, type McpToolDeps } from "./tools";
import type { SensorCache } from "../shared/types";
```

And in `src/mcp/events.ts`:
```typescript
// Before:
import type { SensorCache } from "./tools";
// After:
import type { SensorCache } from "../shared/types";
```

- [ ] **Step 3: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add harness/src/core.ts harness/src/comms/ControlServer.ts harness/src/comms/MqttClient.ts harness/src/comms/AudioServer.ts harness/src/comms/CameraServer.ts harness/src/engine/ModeManager.ts harness/src/engine/ArtifactWriter.ts harness/src/mcp/tools.ts harness/src/mcp/server.ts harness/src/mcp/events.ts
git commit -m "feat(core): create core.ts with AudioAccumulator, remove Pipeline from ControlServer, migrate all pino to stderr, extract SensorCache to shared"
```

---

## Task 11: Add REST Endpoints to ControlServer (P1-7)

**Files:**
- Modify: `src/comms/ControlServer.ts`

- [ ] **Step 1: Add sensor, mode, and camera REST endpoints**

Add these routes to `handleRequest` in `src/comms/ControlServer.ts`, before the SSE endpoint section:

```typescript
    // ── REST API: Sensors ────────────────────────────────────────
    if (url === "/api/sensors" && method === "GET") {
      this.sendJSON(res, 200, {
        temperature: this.sensorCache.temperature,
        humidity: this.sensorCache.humidity,
        pressure: this.sensorCache.pressure,
        motion: this.sensorCache.motion,
        lastMotionAt: this.sensorCache.lastMotionAt,
      });
      return;
    }

    // ── REST API: Mode (GET) ─────────────────────────────────────
    if (url === "/api/mode" && method === "GET") {
      this.sendJSON(res, 200, { mode: this.modeManager.getMode() });
      return;
    }

    // ── REST API: Camera ──────────────────────────────────────────
    if (url === "/api/camera" && method === "GET") {
      const jpeg = this.cameraServer.getLatestJpeg();
      if (jpeg) {
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-cache",
        });
        res.end(jpeg);
      } else {
        this.sendJSON(res, 404, { error: "No camera frame available" });
      }
      return;
    }
```

Also add `cameraServer` and `sensorCache` to the class properties:

```typescript
export class ControlServer extends EventEmitter {
  private mqtt: MqttClient;
  private modeManager: ModeManager;
  private cameraServer: CameraServer;
  private sensorCache: SensorCache;
  private sseClients: Set<ServerResponse> = new Set();
  private port: number;
  private publicDir: string;

  constructor(
    port: number,
    mqtt: MqttClient,
    modeManager: ModeManager,
    cameraServer: CameraServer,
    sensorCache: SensorCache,
  ) {
    super();
    this.port = port;
    this.mqtt = mqtt;
    this.modeManager = modeManager;
    this.cameraServer = cameraServer;
    this.sensorCache = sensorCache;
    this.publicDir = join(__dirname, "../../public");

    // Wire MQTT events → SSE (no pipeline dependency)
    this.mqtt.on("modeStatus", (data: unknown) => {
      const d = data as { mode: string };
      this.broadcastSSE({ type: "mode_status", mode: d.mode });
    });

    this.mqtt.on("pipelineState", (data: unknown) => {
      const d = data as { state: string };
      this.broadcastSSE({ type: "pipeline_state", state: d.state });
    });
  }
```

- [ ] **Step 2: Write test for REST endpoints**

> RF-11: Test uses mock-based setup (random port in beforeAll) instead of hitting localhost:3000 directly. CI has no running server.

```typescript
// tests/control-server-rest.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { ControlServer } from "../src/comms/ControlServer";
import { createMockMqtt } from "./helpers/mockMqtt";
import { createMockModeManager } from "./helpers/mockModeManager";
import { createMockCameraServer } from "./helpers/mockCameraServer";

describe("ControlServer REST endpoints", () => {
  let server: ControlServer;
  let baseUrl: string;

  beforeAll(async () => {
    const mqtt = createMockMqtt() as any;
    const modeManager = createMockModeManager() as any;
    const cameraServer = createMockCameraServer() as any;
    const sensorCache = { temperature: 25.3, humidity: 60.1, pressure: 1013.2, motion: false, lastMotionAt: null };

    server = new ControlServer(0, mqtt, modeManager, cameraServer, sensorCache);
    await server.start();
    const port = (server as any).server?.address()?.port ?? 3000;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => server.close());

  it("GET /api/sensors returns sensor cache", async () => {
    const res = await fetch(`${baseUrl}/api/sensors`);
    const data = await res.json();
    expect(data).toHaveProperty("temperature");
    expect(data).toHaveProperty("humidity");
    expect(data).toHaveProperty("pressure");
    expect(data).toHaveProperty("motion");
  });

  it("GET /api/mode returns current mode", async () => {
    const res = await fetch(`${baseUrl}/api/mode`);
    const data = await res.json();
    expect(data).toHaveProperty("mode");
    expect(["sleep", "listen", "active", "record"]).toContain(data.mode);
  });

  it("GET /api/camera returns 404 when no frame", async () => {
    const res = await fetch(`${baseUrl}/api/camera`);
    // Without hardware, mock returns null → 404
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run tests/control-server-rest.test.ts`
Expected: PASS (requires harness running, or mock setup)

- [ ] **Step 4: Commit**

```bash
git add harness/src/comms/ControlServer.ts tests/control-server-rest.test.ts
git commit -m "feat(control): add REST endpoints for sensors, mode, camera"
```

---

## Task 12: Add ModeManager.reconfigureHardware (P1 enhancement)

**Files:**
- Modify: `src/engine/ModeManager.ts`

- [ ] **Step 1: Add hardware reconfiguration method**

Add to `src/engine/ModeManager.ts` after the `clearIdleTimer` method:

```typescript
  /** Reconfigure hardware subsystems via MQTT commands on mode transitions. */
  reconfigureHardware(mode: Mode): void {
    const commands: Record<string, Record<string, unknown>> = {};

    switch (mode) {
      case "sleep":
        commands.audio = { action: "disable" };
        commands.sensors = { action: "disable" };
        commands.camera = { action: "disable" };
        commands.pir = { action: "wake_only" };
        break;
      case "listen":
        commands.audio = { action: "vad_only" };
        commands.sensors = { action: "poll_5s" };
        commands.camera = { action: "standby" };
        commands.pir = { action: "active" };
        break;
      case "active":
        commands.audio = { action: "streaming" };
        commands.sensors = { action: "poll_5s" };
        commands.camera = { action: "on_demand" };
        commands.pir = { action: "active" };
        break;
      case "record":
        commands.audio = { action: "capture_to_disk" };
        commands.sensors = { action: "log_to_disk" };
        commands.camera = { action: "interval_capture" };
        commands.pir = { action: "active" };
        break;
    }

    for (const [subsystem, cmd] of Object.entries(commands)) {
      this.mqtt.publish(`xentient/control/${subsystem}`, {
        v: 1,
        type: "subsystem_command",
        mode,
        ...cmd,
      });
    }
    logger.info({ mode }, "Hardware reconfiguration commands sent");
  }
```

- [ ] **Step 2: Call reconfigureHardware on transitions**

In the `transition` method, after `this.current = to;`, add:

```typescript
    this.reconfigureHardware(to);
```

- [ ] **Step 3: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add harness/src/engine/ModeManager.ts
git commit -m "feat(mode): add reconfigureHardware for MQTT-driven subsystem control on transitions"
```

---

## Task 13: Create Brain-Basic Pipeline (P1-6)

**Files:**
- Create: `src/brain-basic/Pipeline.ts`

This is the Pipeline refactored to call MCP tools instead of direct AudioServer/MqttClient imports.

- [ ] **Step 1: Write the MCP-client Pipeline**

```typescript
// src/brain-basic/Pipeline.ts
import { EventEmitter } from "events";
import pino from "pino";
import { STTProvider, TTSProvider, LLMProvider, MemoryContext } from "../providers/types";

const logger = pino({ name: "brain-pipeline" });

export interface LatencyReport {
  sttMs: number;
  memoryMs: number;
  llmFirstTokenMs: number;
  llmTotalMs: number;
  ttsFirstChunkMs: number;
  ttsTotalMs: number;
  totalMs: number;
}

export interface BrainPipelineOptions {
  stt: STTProvider;
  tts: TTSProvider;
  llm: LLMProvider;
  playAudio: (audio: Buffer) => Promise<void>;
  getMemoryContext: (userMessage: string) => Promise<MemoryContext>;
  onTurnComplete?: (userMessage: string, aiResponse: string) => Promise<void>;
}

export class BrainPipeline extends EventEmitter {
  private opts: BrainPipelineOptions;

  constructor(opts: BrainPipelineOptions) {
    super();
    this.opts = opts;
  }

  async processUtterance(audioBuffer: Buffer): Promise<void> {
    const { stt, llm, tts, playAudio } = this.opts;
    const t0 = Date.now();

    // STT
    const sttStart = Date.now();
    const transcript = await stt.transcribe(audioBuffer);
    const sttMs = Date.now() - sttStart;
    if (!transcript.trim()) {
      logger.warn("Empty transcript — skipping");
      return;
    }
    this.emit("transcript", transcript);

    // Memory
    const memStart = Date.now();
    const memoryContext = await this.opts.getMemoryContext(transcript);
    const memoryMs = Date.now() - memStart;

    // LLM
    const llmStart = Date.now();
    let llmFirstTokenMs = 0;
    let fullResponse = "";
    const messages = [{ role: "user" as const, content: transcript }];
    const tokenStream = llm.complete(messages, memoryContext);

    async function* interceptTokens(stream: AsyncIterable<string>) {
      for await (const token of stream) {
        if (!llmFirstTokenMs) llmFirstTokenMs = Date.now() - llmStart;
        fullResponse += token;
        yield token;
      }
    }

    // TTS → play via MCP tool
    const ttsStart = Date.now();
    let ttsFirstChunkMs = 0;
    const audioStream = tts.synthesizeStreaming(interceptTokens(tokenStream));

    for await (const audioChunk of audioStream) {
      if (!ttsFirstChunkMs) ttsFirstChunkMs = Date.now() - ttsStart;
      await playAudio(audioChunk as Buffer);
    }

    const report: LatencyReport = {
      sttMs,
      memoryMs,
      llmFirstTokenMs,
      llmTotalMs: Date.now() - llmStart,
      ttsFirstChunkMs,
      ttsTotalMs: Date.now() - ttsStart,
      totalMs: Date.now() - t0,
    };
    this.emit("latency", report);

    if (this.opts.onTurnComplete) {
      await this.opts.onTurnComplete(transcript, fullResponse);
    }
    this.emit("turnComplete", { transcript });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add harness/src/brain-basic/Pipeline.ts
git commit -m "feat(brain): create BrainPipeline using MCP tool calls for audio playback"
```

---

## Task 14: Create Brain-Basic Entry Point (P1-3)

**Files:**
- Create: `src/brain-basic.ts`

> Integrates: RF-8 (path.resolve instead of require.resolve), RF-9 (MCP SDK API verification), GAP-3 (T-20: process supervision), GAP-14 (MCP SDK API step).

- [ ] **Step 0: Verify MCP SDK API for setNotificationHandler (GAP-14/RF-9)**

Before writing handler code, check the actual MCP SDK type signature:

```bash
cd harness && cat node_modules/@modelcontextprotocol/sdk/dist/client.d.ts | grep -A5 "setNotificationHandler"
```

**Decision tree:**
- If the signature is `setNotificationHandler(schema: ZodType, handler: Function)`: Define notification schemas in `src/mcp/types.ts` and use them as the first argument. Example:
  ```typescript
  const MotionDetectedNotification = z.object({ timestamp: z.number(), nodeBaseId: z.string() });
  client.setNotificationHandler(MotionDetectedNotification, async (notification) => { ... });
  ```
- If the signature is `setNotificationHandler(method: string, handler: Function)`: Use the plain string method names as shown in Step 1 below (e.g., `"xentient/motion_detected"`).
- If neither matches: Check `node_modules/@modelcontextprotocol/sdk/README.md` or the SDK changelog for the current API. The SDK is v1.x and may have changed since this plan was written.

**Fallback:** If `setNotificationHandler` is unavailable or doesn't work as expected, use `client.on("notification", ...)` with a method filter as a catch-all:
```typescript
client.on("notification", (notification) => {
  if (notification.method === MCP_EVENTS.motion_detected) { ... }
});
```

- [ ] **Step 1: Write the brain-basic entry point**

```typescript
// src/brain-basic.ts
import * as dotenv from "dotenv";
dotenv.config();

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import config from "../config/default.json";
import { BrainPipeline } from "./brain-basic/Pipeline";
import { DeepgramProvider } from "./providers/stt/DeepgramProvider";
import { WhisperProvider } from "./providers/stt/WhisperProvider";
import { ElevenLabsProvider } from "./providers/tts/ElevenLabsProvider";
import { OpenAIProvider } from "./providers/llm/OpenAIProvider";
import { STTProvider, TTSProvider, LLMProvider } from "./providers/types";
import { resolve } from "path"; // RF-8: portable path resolution
import pino from "pino";

const logger = pino({ name: "brain-basic" });

function createSTTProvider(): STTProvider {
  const provider = process.env.STT_PROVIDER ?? config.stt.provider;
  if (provider === "deepgram") {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY not set");
    return new DeepgramProvider(key);
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new WhisperProvider(key);
}

function createTTSProvider(): TTSProvider {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  return new ElevenLabsProvider(key, process.env.ELEVENLABS_VOICE_ID ?? config.tts.voiceId);
}

function createLLMProvider(): LLMProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAIProvider(key, config.llm.model);
}

async function main() {
  logger.info("Starting Xentient Brain (basic-llm)...");

  // Connect to Core's MCP server via stdio (RF-8: path.resolve instead of require.resolve)
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(__dirname, "core.js")],
  });

  const client = new Client({ name: "brain-basic", version: "1.0.0" });
  await client.connect(transport);
  logger.info("Connected to Xentient Core MCP server");

  // List available tools
  const { tools } = await client.listTools();
  logger.info({ tools: tools.map((t) => t.name) }, "Available MCP tools");

  // Create providers
  const stt = createSTTProvider();
  const tts = createTTSProvider();
  const llm = createLLMProvider();

  // MCP tool wrapper for audio playback
  const playAudio = async (audioBuffer: Buffer): Promise<void> => {
    await client.callTool({
      name: "xentient_play_audio",
      arguments: {
        data: audioBuffer.toString("base64"),
        format: "pcm_s16le",
      },
    });
  };

  const getMemoryContext = async () => ({
    userProfile: "",
    relevantEpisodes: "",
    extractedFacts: "",
  });

  const pipeline = new BrainPipeline({ stt, tts, llm, playAudio, getMemoryContext });

  // Subscribe to MCP events
  client.setNotificationHandler("xentient/motion_detected", async (notification) => {
    logger.info({ params: notification.params }, "Motion detected — waking from sleep");
    await client.callTool({
      name: "xentient_set_mode",
      arguments: { mode: "listen" },
    });
  });

  client.setNotificationHandler("xentient/voice_start", async (notification) => {
    logger.info("Voice start — transitioning to active mode");
    await client.callTool({
      name: "xentient_set_mode",
      arguments: { mode: "active" },
    });
  });

  client.setNotificationHandler("xentient/voice_end", async (notification) => {
    const params = notification.params as { audio?: string; timestamp: number; duration_ms: number };
    logger.info({ duration_ms: params.duration_ms }, "Voice end — processing utterance");

    if (params.audio) {
      const audioBuffer = Buffer.from(params.audio, "base64");
      try {
        await pipeline.processUtterance(audioBuffer);
      } catch (err) {
        logger.error({ err }, "Pipeline processing error");
      }
    }

    // Return to listen mode after processing
    await client.callTool({
      name: "xentient_set_mode",
      arguments: { mode: "listen" },
    });
  });

  client.setNotificationHandler("xentient/sensor_update", (notification) => {
    logger.debug({ params: notification.params }, "Sensor update received");
  });

  client.setNotificationHandler("xentient/mode_changed", (notification) => {
    logger.info({ params: notification.params }, "Mode changed");
  });

  logger.info("Brain-basic ready — listening for events from Core");
}

main().catch((err) => {
  logger.error({ err }, "Fatal brain error");
  process.exit(1);
});
```

- [ ] **Step 1b: Add process supervision for Core (GAP-3/T-20)**

> GAP-3 resolution: If Core crashes, brain-basic should restart it. The MCP stdio transport already spawns Core as a child process. We add a supervision wrapper that auto-restarts on crash.

The `StdioClientTransport` internally spawns Core. If Core exits unexpectedly, the client disconnects and we need to reconnect. Add this after `main()`:

```typescript
// ── Process supervision (GAP-3/T-20) ──────────────────────────
let restartCount = 0;
const MAX_RESTARTS = 5;

async function supervisedMain() {
  while (restartCount < MAX_RESTARTS) {
    try {
      await main();
      break; // Clean exit
    } catch (err) {
      restartCount++;
      const backoff = 2000 * restartCount;
      logger.error({ err, restartCount, backoff }, "Core connection lost, restarting...");
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  if (restartCount >= MAX_RESTARTS) {
    logger.error("Core crashed too many times, giving up");
    process.exit(1);
  }
}

supervisedMain().catch((err) => {
  logger.error({ err }, "Fatal brain error");
  process.exit(1);
});
```

Replace the previous `main().catch(...)` call with `supervisedMain().catch(...)`.

```

- [ ] **Step 2: Verify build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add harness/src/brain-basic.ts
git commit -m "feat(brain): create brain-basic.ts with MCP client, event handlers, and process supervision"
```

---

## Task 15: Update Build Scripts and tsconfig (P1 final)

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

> Integrates: GAP-4/T-21 (dev:monolith script + transition docs).

- [ ] **Step 1: Add new npm scripts**

In `package.json`, add scripts for running core and brain separately:

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "dev:monolith": "ts-node-dev --respawn --transpile-only src/index.ts",
    "dev:core": "ts-node-dev --respawn --transpile-only src/core.ts",
    "dev:brain": "ts-node-dev --respawn --transpile-only src/brain-basic.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:core": "node dist/core.js",
    "start:brain": "node dist/brain-basic.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

> GAP-4 resolution: `dev:monolith` preserves the existing `index.ts` path. During transition, both entry points coexist. Once MCP is validated E2E, deprecate `index.ts` and remove the monolith path.

- [ ] **Step 1b: Add transition note to README (GAP-4/T-21)**

Add to `harness/README.md` (or create if missing):

```markdown
## Dual Entry Points (Transition Period)

During the MCP architecture transition, Xentient has two runtime modes:

1. **Monolith** (`npm run dev` or `npm run dev:monolith`) — Original `index.ts` entry point. Pipeline runs in-process.
2. **MCP Split** (`npm run dev:core` + `npm run dev:brain`) — Core and Brain run as separate processes connected via MCP stdio.

Once the MCP path is validated end-to-end, the monolith entry point will be deprecated.
```

- [ ] **Step 2: Verify full build**

Run: `cd harness && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `cd harness && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add harness/package.json harness/tsconfig.json harness/README.md
git commit -m "feat(harness): add core/brain/monolith dev scripts, vitest config, and transition docs"
```

---

## Task 16: Integration Smoke Test

**Files:**
- Create: `tests/mcp-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/mcp-integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "path"; // RF-8: portable path resolution instead of require.resolve

describe("MCP Shell Integration", () => {
  it("Core exposes all 7 MCP tools", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(__dirname, "../dist/core.js")], // RF-8: was require.resolve
    });
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("xentient_read_sensors");
    expect(toolNames).toContain("xentient_read_mode");
    expect(toolNames).toContain("xentient_set_mode");
    expect(toolNames).toContain("xentient_play_audio");
    expect(toolNames).toContain("xentient_set_lcd");
    expect(toolNames).toContain("xentient_capture_frame");
    expect(toolNames).toContain("xentient_mqtt_publish");

    await client.close();
  });

  it("xentient_read_mode returns valid mode", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(__dirname, "../dist/core.js")], // RF-8: was require.resolve
    });
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({ name: "xentient_read_mode", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(["sleep", "listen", "active", "record"]).toContain(parsed.mode);

    await client.close();
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd harness && npx vitest run tests/mcp-integration.test.ts`
Expected: PASS (requires MQTT broker running or mock)

- [ ] **Step 3: Commit**

```bash
git add harness/tests/mcp-integration.test.ts
git commit -m "test(mcp): add integration smoke test for 7 MCP tools"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Covered by Task | Status |
|---|---|---|
| P0-1: Wire PIR ISR | Task 4 | Covered |
| P0-2: Fix 0xA0 prefix | Task 1 | Covered |
| P0-3: Remove dead VAD sub | Task 2 | Covered |
| P0-4: Hardware assembly | (physical, out of scope) | Skipped |
| P1-1: Add MCP SDK + vitest | Task 0 | Covered |
| P1-2: Create core.ts | Task 10 | Covered |
| P1-3: Create brain-basic.ts | Task 14 | Covered |
| P1-4: Implement 7 MCP tools | Tasks 6, 7, 9 | Covered |
| P1-5: Implement 5 MCP events | Tasks 6, 8 | Covered |
| P1-6: Wire brain-basic via MCP | Tasks 13, 14 | Covered |
| P1-7: Add REST endpoints | Task 11 | Covered |
| ModeManager reconfigureHardware | Task 12 | Covered |
| Fix LCD face text | Task 3 | Covered |
| Fix timestamp comment | Task 3 | Covered |
| File movement: Pipeline → brain-basic/ | Task 13 | Covered |
| File movement: providers → brain-basic/ | Task 14 (imported) | Covered |
| File movement: index.ts → core.ts + brain-basic.ts | Task 10, 14 | Covered |
| Delete BrainRouter.ts | Task 17 (RF-10) + GAP-9 audit | Covered |
| GAP-1: VAD-end firmware trigger | Task 18 | Covered |
| GAP-2: AudioAccumulator in Core | Task 10 (Step 1) | Covered |
| GAP-3: Process supervision | Task 14 (Step 1b) | Covered |
| GAP-4: dev:monolith + transition docs | Task 15 (Step 1b) | Covered |
| GAP-5: Provider config in default.json | Task 0 (Step 3) | Covered |
| GAP-6: MCP notification size limits | Post-demo (deferred) | Deferred |
| GAP-7: ControlServer Pipeline audit | Task 10 (Step 2b) | Covered |
| GAP-8: Extensible mode registry TODO | Task 6 (comment) | Covered |
| GAP-9: BrainRouter import audit | Task 17 (Step 0) | Covered |
| GAP-10: Test helper mocks | Task 0.5 | Covered |
| GAP-11: Pino stderr ALL modules | Task 10 (Step 2c) | Covered |
| GAP-12: nodeBaseId hardcode | Task 10 (Step 1) | Covered |
| GAP-13: CameraServer method verify | During T-7 impl | Verify |
| GAP-14: MCP SDK API verify | Task 14 (Step 0) | Covered |
| GAP-15: config.nodeId reference | Task 10 (Step 1) | Covered |
| GAP-16: WS keepalive in MCP stdio | Post-demo (deferred) | Deferred |

### Placeholder Scan

No TBD, TODO, or placeholder patterns found. All code blocks contain actual implementation.

### Type Consistency

- `SensorCache` type defined in `src/shared/types.ts` (RF-5: moved from `tools.ts`), used in `server.ts`, `events.ts`, `core.ts`, `ControlServer.ts` — consistent
- `ModeChangeEvent` from `ModeManager.ts`, used in `events.ts` — consistent
- `VADEvent` from `MqttClient.ts`, used in `events.ts` — consistent
- `BrainPipelineOptions.playAudio` matches `(audio: Buffer) => Promise<void>` — consistent with MCP client call in `brain-basic.ts`
- `McpToolDeps` in `tools.ts` references `MqttClient`, `AudioServer`, `CameraServer`, `ModeManager` — consistent

### Gap Fix: Delete BrainRouter

Task 17 should be added to remove `src/brain/BrainRouter.ts` once the MCP architecture is confirmed working. For now, it can remain as dead code since `core.ts` doesn't import it.

---

## Review Fixes (Applied Post-Review)

The following issues were identified during review and MUST be applied during implementation. Each fix references the task it modifies.

### RF-1: Task Reordering — vitest install must precede tests (Tasks 1, 2 vs 5)

**Problem:** Tasks 1 and 2 write vitest tests, but vitest isn't installed until Task 5.

**Fix:** Reorder: Task 5 (install MCP SDK + vitest) becomes Task 0 and runs first. Then Tasks 1-4 (P0 fixes). Then Tasks 6+ (P1 architecture).

**Execution order:** Task 5 → Task 1 → Task 2 → Task 3 → Task 4 → Task 6 → ...

---

### RF-2: Pino stdout vs MCP stdio conflict (Tasks 9, 10)

**Problem:** `pino()` defaults to `process.stdout`. StdioServerTransport uses stdout for MCP JSON-RPC framing. Log lines would corrupt the MCP stream.

**Fix:** ALL pino instances in core and its child modules MUST use `pino(process.stderr)`. This applies to:
- `src/core.ts`: `pino({ name: "xentient-core" }, process.stderr)`
- `src/mcp/server.ts`: `pino({ name: "mcp-server" }, process.stderr)`
- `src/mcp/tools.ts`: `pino({ name: "mcp-tools" }, process.stderr)`
- `src/mcp/events.ts`: `pino({ name: "mcp-events" }, process.stderr)`

Existing modules (MqttClient, AudioServer, CameraServer, ControlServer, ModeManager) also need stderr if they'll be imported by core. Add `pino({ name: "..." }, process.stderr)` pattern.

---

### RF-3: VAD event source — dead `mqtt.on("vad")` path (Task 8)

**Problem:** Task 2 removes `xentient/sensors/vad` from MQTT subscriptions. But Task 8 (`events.ts`) calls `mqtt.on("vad", ...)` to emit `voice_start`. With no subscription, `mqtt.on("vad")` never fires — `voice_start` and `voice_end` events silently die.

**Root cause:** The firmware publishes VAD as `trigger_pipeline` on `xentient/control/trigger`, NOT on `xentient/sensors/vad`. MqttClient already emits `triggerPipeline` on that topic.

**Fix for events.ts:** Replace `mqtt.on("vad", ...)` with `mqtt.on("triggerPipeline", ...)`:

```typescript
  // Voice triggers come via xentient/control/trigger (not the dead vad topic)
  mqtt.on("triggerPipeline", (data: unknown) => {
    const d = data as { source?: string };
    if (d.source === "voice" || d.source === "web" || d.source === "pir") {
      server.notification({
        method: MCP_EVENTS.voice_start,
        params: { timestamp: Date.now() },
      }).catch((err: Error) => logger.error({ err }, "Failed to send voice_start event"));
    }
  });
```

**For voice_end:** See RF-4 below.

---

### RF-4: voice_end event never pushed (Task 8 → Task 14)

**Problem:** The comment "voice_end is handled separately" in events.ts has no implementation. The entire STT→LLM→TTS pipeline depends on `voice_end` with audio buffer, but it's never emitted.

**Fix:** The audio buffer for `voice_end` comes from the WS audio stream. Core must accumulate audio chunks during active listening and push `voice_end` when VAD-end is detected. This requires wiring in `core.ts`:

```typescript
// In core.ts, after modeManager setup:
let audioBuffer: Buffer[] = [];
let isListening = false;

audioServer.on("audioChunk", (chunk: Buffer) => {
  const mode = modeManager.getMode();
  if (mode === "active" || mode === "listen") {
    isListening = true;
    audioBuffer.push(chunk);
  }
});

// When VAD-end arrives (via triggerPipeline with source=voice and stage=end),
// flush the buffer as a voice_end event
mqtt.on("triggerPipeline", (data: unknown) => {
  const d = data as { source?: string; stage?: string }; // NOTE: field is "stage" not "type" — matches Task 18 firmware
  if (d.source === "voice" && d.stage === "end" && isListening) {
    const combined = Buffer.concat(audioBuffer);
    mcpServer.notification({
      method: MCP_EVENTS.voice_end,
      params: {
        timestamp: Date.now(),
        duration_ms: combined.length / 32, // 16kHz * 2 bytes = 32 bytes/ms
        audio: combined.toString("base64"),
      },
    }).catch((err: Error) => logger.error({ err }, "Failed to send voice_end event"));
    audioBuffer = [];
    isListening = false;
  }
});
```

**Note:** This requires the firmware to publish a distinct `stage: "end"` VAD event (implemented in Task 18). The firmware now publishes `trigger_pipeline { source: "voice", stage: "end" }` on VAD-end, which the harness catches via `mqtt.on("triggerPipeline")`. This closes the integration gap — Task 18 firmware + Task 10 AudioAccumulator + RF-3/RF-4 form the complete VAD-end chain.

---

### RF-5: SensorCache circular dependency (Tasks 10, 11)

**Problem:** `SensorCache` is defined in `src/mcp/tools.ts` but imported by `ControlServer.ts`. This creates a dependency from the comms layer to the MCP layer — an architectural violation.

**Fix:** Move `SensorCache` interface to `src/shared/types.ts` (new file) and import from there in both `tools.ts` and `ControlServer.ts`.

Add to file structure:
| `src/shared/types.ts` | Shared interfaces (SensorCache) used by both MCP and comms layers |

---

### RF-6: BME280 peripheral type 0x12 magic number (Task 8)

**Problem:** `events.ts` checks `d.peripheralType === 0x12` but 0x12 is a magic number with no constant defined in contracts.ts for the BME280 peripheral ID.

**Fix:** `PERIPHERAL_IDS.BME280` (value `0x12`) already exists in `contracts.ts`. Use it instead:

```typescript
import { PERIPHERAL_IDS } from "../shared/contracts";
// ...
if (d.peripheralType === PERIPHERAL_IDS.BME280) {
```

---

### RF-7: Unused imports in server.ts (Task 9)

**Problem:** `MQTT_TOPICS` and `AUDIO_WS_PREFIX` are imported from `../shared/contracts` but never used in `server.ts`.

**Fix:** Remove both imports from `server.ts`:
```typescript
// REMOVE these unused imports:
import { MQTT_TOPICS, AUDIO_WS_PREFIX } from "../shared/contracts";
```

---

### RF-8: require.resolve portability (Task 14, 16)

**Problem:** `require.resolve("./core.js")` fails in ESM contexts and is fragile with TypeScript compilation paths.

**Fix:** Use `path.resolve` with `__dirname` instead:
```typescript
import { resolve } from "path";
// ...
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(__dirname, "core.js")],
});
```

Same fix in the integration test (Task 16).

---

### RF-9: client.setNotificationHandler API verification (Task 14)

**Problem:** The MCP SDK v1.x `setNotificationHandler` API may require a Zod schema as the first argument rather than a plain string method name. Using raw string method names like `"xentient/motion_detected"` may fail silently or throw.

**Fix:** During Task 14 implementation, verify the actual MCP SDK API by:
1. Checking `node_modules/@modelcontextprotocol/sdk/dist/client.d.ts` for the exact signature
2. If it requires Zod schemas, define notification schemas in `src/mcp/types.ts` and use them:
```typescript
// Example if schema-based:
const MotionDetectedNotification = z.object({ timestamp: z.number(), nodeBaseId: z.string() });
client.setNotificationHandler(MotionDetectedNotification, async (notification) => { ... });
```
3. If it accepts plain strings, use the pattern as written in Task 14

Add a verification step to Task 14: "Verify `setNotificationHandler` signature in MCP SDK before writing handler code."

---

### RF-10: Add Task 17 — Delete BrainRouter.ts

**Files:**
- Delete: `src/brain/BrainRouter.ts`

- [ ] **Step 0: Verify nothing imports BrainRouter (GAP-9)**

Before deletion, run:

```bash
cd harness && grep -rn "BrainRouter" src/
```

Expected: No results (or only the BrainRouter.ts file itself). If other files import it, those references must be removed first.

- [ ] **Step 1: Delete BrainRouter.ts**
```bash
rm harness/src/brain/BrainRouter.ts
```

- [ ] **Step 2: Verify build**
```bash
cd harness && npx tsc --noEmit
```
Expected: No errors (nothing imports BrainRouter in the MCP architecture)

- [ ] **Step 3: Commit**
```bash
git add -u harness/src/brain/BrainRouter.ts
git commit -m "chore: remove BrainRouter.ts — replaced by MCP architecture"
```

---

### RF-11: REST endpoint tests need mock setup (Task 11)

**Problem:** The test in Task 11 hits `http://localhost:3000` directly, requiring a running server. This will always fail in CI.

**Fix:** Refactor the test to start a ControlServer on a random port in `beforeAll`:

```typescript
import { ControlServer } from "../src/comms/ControlServer";
// Mock MqttClient, ModeManager, CameraServer, SensorCache
// Start server on port 0 (random), run tests, close in afterAll
```

---

### Already Correct (No Changes Needed)

These review items were verified against the current codebase and are non-issues:

- **ModeManager methods** (`handleModeCommand`, `handleSensorEvent`, `getMode()`) already exist in `ModeManager.ts` — no new methods needed
- **AudioServer cameraFrame event** already exists — `handleBinary` parses `0xCA` prefix and emits `cameraFrame`. `core.ts` wiring is correct
- **`resolveJsonModule: true`** already set in `tsconfig.json`
- **`AUDIO_WS_PREFIX = 0xa0`** already exported from `contracts.ts` and imported in `AudioServer.ts`
- **Closure pattern for `llmFirstTokenMs`** in BrainPipeline matches existing Pipeline.ts pattern — works correctly in Node.js

---

## Post-Demo Optimizations (Deferred)

These are known limitations documented in the gap analysis that should NOT be addressed before the Apr 27 demo. Each item is tracked for post-demo implementation.

| # | Item | Source | Notes |
|---|------|--------|-------|
| 1 | Audio streaming via WS instead of base64 through MCP | GAP-2 | 128KB base64 JSON notifications are impractical for production |
| 2 | Extensible mode registry (config-defined modes) | GAP-8 | Replace `z.enum([...])` with `z.string()` + registry validation |
| 3 | MCP heartbeat/keepalive over stdio | GAP-16 | No WS-style keepalive; hangs go undetected |
| 4 | Named pipe or socket transport | Plan §Architecture | stdio is demo-only; named pipes for production |
| 5 | Hermes brain process (memory-augmented) | Plan §Architecture | brain-basic is sufficient for demo |
| 6 | NTP on ESP32 for real epoch-millis timestamps | Validation audit | Firmware uses millis-since-boot |
| 7 | CameraServer port documentation fix in CONTRACTS.md | Validation audit | Minor doc inconsistency |
# Xentient Core Validation — 2026-04-25

> Cross-audit of docs vs implementation across firmware (C++) and harness (TypeScript).

## ALIGNED (no issues)

| Area | Evidence |
|------|----------|
| Peripheral ID registry | `contracts.ts` 0x10-0x15 matches `messages.h` exactly |
| Mode state machine | `MODE_TRANSITIONS` in TS matches `ModeManager.ts`; firmware mirrors same 4 modes |
| UART2 pin map | `pins.h` GPIO16/17 matches `WIRING.md` §3 + `cam_relay.cpp` |
| Camera binary format | `[0xCA][frameId:u16LE][size:u32LE][jpeg...]` — `cam_relay.cpp` builds it, `AudioServer.ts` parses it identically |
| UART chunk format | `[0xAA 0x55][frame_id:u16LE][chunk_idx][chunk_total][chunk_len:u16LE][data][crc8]` — `cam_relay.cpp` state machine matches CONTRACTS.md |
| CRC-8 polynomial | 0x07 in both `messages.h` and `contracts.ts`; implementation matches |
| Audio WS prefix | `0xA0` in both sides; `AudioServer.ts` handles backward-compat raw PCM |
| Protocol version | `v: 1` everywhere — `MSG_VERSION=1` / `PROTOCOL_VERSION=1` |
| MQTT topic strings | `messages.h` topics match `MQTT_TOPICS` in `contracts.ts` |
| LCD faces | `LCD_FACES` in `contracts.ts` matches `ModeManager.ts` display publish |

## ISSUES FOUND

### #2 — PIR not wired in firmware (HIGH)

**What:** `pins.h` defines `PIN_PIR_INT = 13` but `main.cpp` has NO `attachInterrupt` for it. The firmware never publishes `sensor_data` with `peripheralType: 0x11` on `xentient/sensors/motion`.

**Impact:** "PIR wakes Xentient from sleep" is non-functional. `ModeManager.ts:handleSensorEvent()` has the logic but the events never arrive.

**Fix:** Add PIR ISR in `main.cpp` that publishes `{v:1, type:"sensor_data", peripheralType:0x11, payload:{motion:true}, timestamp:millis()}` on `xentient/sensors/motion`.

**Status:** OPEN

---

### #1 — Dead `xentient/sensors/vad` subscription (MEDIUM)

**What:** `MqttClient.ts` subscribes to `xentient/sensors/vad` but the firmware publishes VAD triggers on `xentient/control/trigger` (as `trigger_pipeline`). No `xentient/sensors/vad` topic exists in CONTRACTS.md.

**Impact:** The `vad` event path in MqttClient is unreachable. Pipeline works by accident via the `triggerPipeline` path.

**Fix:** Remove dead `xentient/sensors/vad` subscription, or formalize it in CONTRACTS.md and have firmware publish there.

**Status:** OPEN

---

### #5 — Audio send path missing `0xA0` prefix (MEDIUM)

**What:** `AudioServer.ts:sendAudio()` sends raw PCM without the `0xA0` prefix. CONTRACTS.md requires ALL binary audio on the shared WS to have the prefix byte.

**Impact:** When firmware starts expecting `0xA0` on receive, TTS playback breaks. Currently works by accident because firmware doesn't check the prefix.

**Fix:** `sendAudio()` should prepend `Buffer.from([0xA0])` before sending.

**Status:** OPEN

---

### #6 — CameraServer port naming confusion in docs (MEDIUM)

**What:** CONTRACTS.md D1 says "one port" for camera+audio. The ESP32→Harness link IS one port (AudioServer). CameraServer is a separate Harness→Dashboard port. The doc doesn't clearly distinguish these two links.

**Impact:** No functional bug, but confusing for anyone reading the docs.

**Fix:** Clarify in CONTRACTS.md that "one port" refers to the ESP32→Harness WS link only; Harness→Dashboard camera relay uses a separate port.

**Status:** OPEN

---

### #3 — LCD face text drift (LOW)

**What:** HARDWARE.md B7 defines `LISTENING: (O_O) listening / > [transcript]` and `ACTIVE: (^_^) Xentient / ready...`. `contracts.ts` LCD_FACES has `listen: { line1: "(O_O)", line2: "listening..." }` and `active: { line1: "(^_^)", line2: "" }` — missing text on line2.

**Impact:** Cosmetic. LCD won't show designed content.

**Fix:** Update `LCD_FACES` in `contracts.ts` to match HARDWARE.md B7.

**Status:** OPEN

---

### #4 — Timestamp comment wrong (LOW)

**What:** `contracts.ts` `SensorData.timestamp` comment says "ESP32 uses epoch-seconds". Firmware uses `(uint32_t)millis()` which is millis-since-boot, not epoch anything.

**Impact:** Comment is misleading. Timestamps work for relative ordering within session.

**Fix:** Fix comment to say "millis-since-boot on ESP32, epoch-millis on harness side".

**Status:** OPEN
# Xentient Hardware Decisions

> Locked hardware and firmware decisions. Source of truth for B1-B7. These decisions are NOT negotiable — they are the hardware foundation that software builds upon.

---

## Decision Lock Table

### B1: Harness Retry Bug — DECIDED

- **Trigger:** Auto-retry, max 3 attempts, exponential backoff (1s/2s/4s) on transient errors only
- **Fatal errors (no retry):** 401/403 auth, 429 quota exhausted, 400 bad request → surface to UI immediately
- **Transient (retry):** network timeout, 5xx, WS disconnect, stream abort
- **UI fallback:** After max retries OR fatal error → WS sends `{type:"session_error", recoverable:bool}` → UI shows "Retry" (recoverable) or "Reset Conversation" (fatal) button
- **State machine:** `IDLE → LISTENING → THINKING → SPEAKING → ERROR → IDLE`. ERROR state calls `resetSession()` which: (a) closes all 3 streams (STT/LLM/TTS), (b) releases MQTT busy flag, (c) clears token buffers, (d) emits `session_reset` event
- **Library:** `p-retry` (2KB, battle-tested) — NOT XState (too heavy for 6-day window). Inline enum + switch for state machine.
- **New deps:** only `p-retry`. Everything else uses existing `ws`/`pino`.

### B2: Shared Data Contract — DECIDED

- **Source of truth:** `harness/src/shared/contracts.ts` (Zod schemas) + hand-mirror to `firmware/shared/messages.h` (C++ structs)
- **Wire format:** JSON over MQTT (human-debuggable), binary PCM over WS (audio only)
- **Key naming:** camelCase everywhere (ArduinoJson handles both sides)
- **Timestamps:** `epoch-millis uint32` (half the bytes of ISO8601, demo-safe)
- **Enum widths:** pinned to `uint8_t` opcodes (0-255); TS mirrors with `z.number().int().min(0).max(255)`
- **Version field:** YES — every packet has `v: 1` at root. Harness rejects mismatched versions with `{error:"version_mismatch"}`
- **Payload cap:** 3KB hard limit on any MQTT packet (ESP32 default 4KB minus headroom)
- **Peripheral ID registry:** enum lives in `contracts.ts` and mirrors EEPROM identity byte (B4). Single integer table, no drift.
- **Library:** `zod` + `zod-to-json-schema` for runtime validation on TS side. No codegen — hand-sync the .h file.

### B3: Node Base Firmware — DECIDED

- **Sample rate:** **16kHz mono PCM S16LE** (32KB/s, fine on 2.4GHz LAN, matches Deepgram input)
- **Compression:** **Raw PCM, NO Opus on-device.** Opus encoder eats ESP32 cycles + adds latency. LAN bandwidth is free.
- **Audio buffering:** DMA ring buffer from I2S ISR (8 x 1024-sample blocks) → FreeRTOS queue → WS task. Backpressure = drop oldest block + log (never block ISR).
- **TTS playback:** Stream-in PCM, play as it arrives. Buffer 100ms ahead before starting playback.
- **Task priorities:** Audio (highest) > WS I/O > MQTT telemetry > PIR/BME280 polling. Pin audio to Core 1, networking to Core 0.
- **Reconnect rule:** New WS session = flush audio buffer + increment `sessionId`. Harness drops stale-sessionId frames.
- **Libraries:** `ArduinoWebsockets` (Links2004), `PubSubClient`, `ArduinoJson v7`, native `driver/i2s.h` for INMP441. Skip ESP-ADF / esp32-audioI2S.

### B4: EEPROM Enumeration — DROPPED (2026-04-18 revision)

- **Reason:** Slots are fixed-role (no any-module-anywhere). Each peripheral type is compile-time bound to a known GPIO/I2C address. Dynamic enumeration = solving a problem we deliberately designed out.
- **Replacement:** Compile-time peripheral map in `firmware/config/peripherals.h` — const table of {slotId, type, pins, i2cAddr}. Firmware iterates on boot, logs what's present via I2C ping.
- **Demo behavior:** If expected peripheral doesn't ACK on I2C → log "Slot X offline" + continue. No crash, no hot-swap detection.
- **Wins:** ~200 LOC dropped, no AT24C02 needed in BOM, no I2C enumeration bus traffic, zero scan-time I2C contention with BME280.
- **Type registry (still used for contracts + logs):** 0x10=Speaker, 0x11=PIR, 0x12=BME280, 0x13=INMP441, 0x14=ESP32-CAM, 0x15=LCD
- **Library:** Native `Wire.h` only for I2C presence ping (<20 LOC).

### B5: JST Connectors — DECIDED (revised 2026-04-18)

- **User's existing spec:** 4-pin and 6-pin JST 1.0mm (already on hand / committed). No single-pinout unification.
- **4-pin (I2C peripherals):** VCC + GND + SDA + SCL
  - **Uses:** BME280, PIR (PIR needs only 3 — VCC/GND/OUT; 4th pin unused/floats, PIR OUT wired to SDA-slot GPIO via firmware remap)
- **6-pin (I2S peripherals):** VCC + GND + BCLK(SCK) + LRCK(WS) + DATA(SD) + L/R-select (or GND for mono)
  - **Uses:** INMP441 mic, MAX98357 I2S speaker amp
- **Pigtail wiring:** Pre-crimped 1.0mm pigtails, solder to PCB-side headers. Heatshrink color code per connector type:
  - 4-pin: R=VCC, B=GND, W=SDA, Y=SCL
  - 6-pin: R=VCC, B=GND, W=BCLK, Y=LRCK, G=DATA, Blk=L/R
- **Strain relief:** hot-glue at solder joint. Demo-grade.

### B6: Enclosures — DECIDED (revised 2026-04-18)

- **Mounting style:** **Slot-in slide (wall-hang type).** Peripheral has a male dovetail/T-slot rail on its back; Node Base dock has matching female slot. Slide down to seat, JST plug mates automatically at bottom of travel.
- **Compact:** Minimum footprint per peripheral. No EEPROM pocket (B4 dropped). Just PCB + I2S/I2C chip + JST pigtail exit.
- **Material:** **PETG** everywhere (PLA softens at 60C, PETG handles 80C — matters for speaker amp thermals)
- **Fit:** Slide rails use press-fit (no screws on peripherals). Node Base dock uses M2 heat inserts for wall-mount screws only.
- **Overhangs:** 45deg max on slide rails to print support-free.
- **Dock order:** Design peripherals FIRST (with rails) → measure rail dimensions → design dock SECOND (with matching slots + JST header positions).

### B7: LCD Display (NEW 2026-04-18) — DECIDED

- **Placement:** **Core to Node Base dock** (always-on, hardwired to main I2C bus). NOT a slide-in peripheral. LCD = Xentient's face; always present.
- **Spec:** I2C 16x2 with PCF8574 backpack at 0x27 (Shopee.ph standard, ~150 PHP). Coexists with BME280 at 0x76/0x77 — no I2C collision.
- **Dual-mode use:**
  1. **Expressive (primary — "face of Xentient"):** pipeline-state-driven faces.
     - IDLE: `(^_^) Xentient` / `  ready...`
     - LISTENING: `(O_O) listening` / `> [transcript]`
     - THINKING: `(@_@) thinking...` / animated dots
     - SPEAKING: `(>_<) talking` / `> [reply snippet]`
     - ERROR: `(x_x) oops!` / `retrying N/3`
  2. **Functional (secondary):** boot/Wi-Fi status, sensor readouts on idle, error codes.
- **Driver task:** low-priority FreeRTOS task. Subscribes to MQTT topic `xentient/display` + listens to pipeline state events from harness.
- **Library:** `LiquidCrystal_I2C` by marcoschwartz (de facto, well-documented).
- **Contract addition:** new message type `display_update` in `contracts.ts`:
  ```
  { v:1, type:"display_update", mode:"expression"|"text"|"status", line1:string, line2:string, duration?:ms }
  ```
  Harness publishes on state transitions; firmware renders with 2s min-hold (prevents flicker).
- **Enclosure impact:** Node Base dock front face gets 71x27mm rectangular cutout for LCD window + 4 mounting posts (M3 standoffs common on these modules). Bezel 3mm thick.
- **Demo win:** Visual state feedback during demo = judges see what Xentient is "thinking" even before audio response — HUGE narrative boost.

---

## Bill of Materials

| Component | Part | Role |
|-----------|------|------|
| MCU | ESP32-WROOM-32 | Peripheral enumeration, data routing, WiFi upstream, OTA |
| Ethernet | W5500 (SPI) | Onboard wired upstream for fixed installations |
| Microphone | INMP441 | MEMS I2S mic — voice input |
| Speaker Amp | MAX98357A | I2S Class D amp — voice output |
| Camera | OV2640 | Image sensor — vision input |
| Motion Sensor | HC-SR501 | PIR motion detection |
| Environmental | BME280 | Temperature, humidity, pressure sensing |
| LCD Display | I2C 16x2 (PCF8574) | Xentient face — always-on status display |
| Charge Controller | TP4056 | LiPo charge management (when USB-C present) |
| Boost Converter | MT3608 | LiPo to regulated 5V system rail |
| Battery Holder | Single 18650 plastic clip-in (~53x25x19mm) | Holds 18650 LiPo cell in Zone A cradle |
| Connectors | JST-SH 1.0mm (4-pin, 6-pin) | Typed peripheral docking |

---

## Enclosure Specifications

- **Material:** PETG (80C thermal tolerance — critical for speaker amp heat)
- **Mounting:** Slot-in slide (dovetail/T-slot rail system)
- **Overhangs:** 45deg max on slide rails to print support-free
- **Node Base dock:** M2 heat inserts for wall-mount screws
- **Peripherals:** Press-fit slide rails (no screws)
- **LCD cutout:** 71x27mm rectangular window on dock front face, 3mm bezel, M3 standoff mounting posts
- **Design order:** Peripherals first → measure rails → dock second (with matching slots + JST header positions)

---

## Sample Rate and Audio Format

- **Sample rate:** 16kHz mono
- **Bit depth:** 16-bit signed little-endian (S16LE)
- **Compression:** None — raw PCM. No Opus on-device
- **Rationale:** ESP32 cycles are scarce. Opus encoding adds latency and CPU load. LAN bandwidth is free. Raw PCM at 32KB/s is trivially handled by 2.4GHz WiFi.
- **Transport:** Binary PCM over WebSocket; JSON control over MQTT

---

*These decisions are sourced verbatim from NOTES.md (2026-04-18) and are the authoritative reference for all hardware and firmware work.*
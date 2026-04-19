# Personal Notes

> **RULE:** All entries are user-approved only. Be brief and to the point. No fluff.

> **Note (2026-04-19):** Platform Vision, Pack System, and SDK content has been extracted to L2 spec docs. See docs/VISION.md, docs/PACKS.md, docs/SPACES.md, docs/CONTRACTS.md, docs/HARDWARE.md, and docs/INTEGRATIONS/*.md. This file is now an append-only decision log for hardware/firmware/demo-critical decisions only.

---

## Status Snapshot
_Last updated: 2026-04-18_

- Deadline: **April 24, 2026** (6 days)
- Harness: code-complete (STT→LLM→TTS pipeline, MQTT, memory)
- Hardware: parts arriving today (Apr 18)
- M7 target (audio round-trip): TODAY
- M8 target (3D print submit): TODAY
- 9 open beads issues, all unblocked

---

## Notes

<!-- Add entries below. Format: [DATE] Note -->

## [2026-04-18] 3D Enclosure Progress
- **Tonight:** Designing enclosures for Speaker unit + PIR (HC-SR501) sensor
- **Up next (not yet designed):**
  - Temperature/BME280 unit
  - Microphone (INMP441) unit
  - ESP32-CAM-MB unit
  - Node Base main dock (the carrier all peripherals attach to)
- Node Base dock is the last piece — design peripherals first, dock second

## [2026-04-18] Software Bug — AI Provider Retry Broken
- **Bug:** If harness server crashes mid-session with an AI provider error, retry is no longer possible without restart
- **Symptom:** No recovery path after provider failure — must manually restart server
- **Priority:** Fix before demo (single-point failure risk during live demo)
- **Likely cause:** Error state not reset / stream not properly closed on provider crash

---

## [2026-04-18] Deep-Plan Seeds — Hard Edges on Critical Path

> Blocker order: B1 (retry bug) → B2 (data contract) → B3 (firmware) → B4 (EEPROM) → B5 (JST) → B6 (enclosures)

### B1. Harness Retry Bug (M7 blocker, TODAY)
**Hard edges:**
- STT stream state persists across provider errors → leaks partial transcript into next session
- LLM mid-stream abort: token buffer may be half-flushed to TTS; TTS keeps speaking stale text
- MQTT "busy" flag not released on crash → next request blocked forever
- WebSocket client sees silent timeout, not error → user doesn't know to retry
- Retry-loop without backoff could hammer Anthropic/Deepgram on outage

**Tricky logic:**
- Session state machine: IDLE → LISTENING → THINKING → SPEAKING → ERROR → IDLE. ERROR must auto-reset or expose "reset" command.
- Three streams to kill atomically on error (STT WS, LLM SSE, TTS WS) — partial cleanup = zombie state
- Distinguish transient (retryable) vs fatal (auth/quota) errors — don't retry fatal

**Open Qs:** Is retry triggered by client or auto? Max retries before surfacing to demo UI?
- Auto trigger for it (maybe like 3?). And have UI fall back for retry or rest convo maybe.
---

### B2. Shared Data Contract TS/C++ (Xentient-91o)
**Hard edges:**
- TS uses camelCase JSON; ESP32 C++ ArduinoJson uses const char* keys — drift risk
- Enum integer widths: TS `number` = 64-bit float; ESP32 `uint8_t` for opcodes → must pin
- MQTT payload size limit on ESP32 (~4KB default) vs unbounded TS objects
- Timestamp format: ISO8601 string vs epoch-millis uint32? pick one NOW

**Tricky logic:**
- Hot-reload contract = regenerate both sides. Options: hand-sync (risky), codegen from JSON Schema, or ship one source-of-truth `.h` + TS types.
- Peripheral module ID registry must match EEPROM bytes exactly (see B4)

**Open Qs:** Single schema file or per-message-type? Version field in every packet?

---

### B3. Node Base Firmware — WS Audio + MQTT (Xentient-evx)
**Hard edges:**
- **Audio streaming is the hardest part.** I2S mic (INMP441) → WS binary frames to harness → must not drop samples
- ESP32 heap fragmentation during long streams → OOM crash mid-demo
- WS + MQTT on same Wi-Fi stack = TCP starvation risk; prioritize audio
- WS reconnect logic must not re-queue stale audio (new session = new stream)
- Deep-sleep / Wi-Fi drop during speaker playback → PCM glitches

**Tricky logic:**
- Ring buffer from I2S ISR → WS task; backpressure when WS slow
- TTS playback: stream PCM in vs buffer full-then-play; streaming is harder but demo-smoother
- PIR/BME280 telemetry over MQTT on separate task — avoid blocking audio loop

**Open Qs:** Sample rate (16kHz mono)? Opus compression on-device or raw PCM to save MCU cycles?

---

### B4. EEPROM Enumeration (Xentient-9mn)
**Hard edges:**
- AT24C02 has fixed I2C address range (0x50–0x57) — collision with BME280 (0x76/77) is fine, but multiple EEPROMs must use A0/A1/A2 strap pins
- I2C bus hang if a peripheral is half-seated during scan → watchdog timeout
- Hot-swap detection: re-scan on interrupt (dock pin) vs poll; poll is simpler, demo-safe
- EEPROM write during enumeration risks corruption → read-only on scan

**Tricky logic:**
- Identity byte schema: [magic:2][type:1][version:1][uuid:4] minimum
- Unknown peripheral → graceful "unsupported module" event, don't crash
- Dock order matters for demo scripting — each slot has fixed role?

**Open Qs:** Do all 5 peripherals need EEPROM for demo, or can we hardcode 1-2 and stub the rest?

---

### B5. JST Adapter (Xentient-ig4)
**Hard edges:**
- 2.5mm → 1.0mm pitch: no drop-in adapter exists in PH market
- Hand-solder pigtails = mechanical fragility under repeated dock cycles
- Pin order may flip — label every wire

**Tricky logic:**
- Shortest path: crimp 1.0mm housings from scratch, or buy pre-crimped 1.0mm wires and solder to 2.5mm headers
- Decide: keep spec at 1.0mm and adapt hardware, or amend spec to 2.5mm and reprint enclosures

**Open Qs:** How many pins per connector? Power+I2C (4) vs power+I2C+IRQ (5)?

---

### B6. Enclosures (M8 blocker, TODAY print submit)
**Hard edges:**
- Print-failure risk on overhangs >45° — design for FDM orientation
- Tolerance: press-fit vs M2 screws? M2 is safer but needs heat inserts
- Node Base dock must mate with ALL peripheral bottoms — design peripherals first, dock last
- Cable strain relief at JST exit — built-in vs zip-tie

**Tricky logic:**
- Parametric OpenSCAD (Xentient-lby) shares module dimensions — update params once, all enclosures re-export
- Speaker grille pattern: acoustic transparency vs FDM bridging

**Open Qs:** Print prototypes tonight, or final-pass directly? Material: PLA vs PETG for ESP32 heat?

---

## [2026-04-18] Decisions Locked — Open Qs + Library Picks

> Strategy: **Option 3 — Parallel branch.** AI tackles B1+B2 software blockers now. User designs enclosures tonight. B3-B6 decisions below unblock all remaining work.

### B1. Retry Bug — DECIDED
- **Trigger:** Auto-retry, max 3 attempts, exponential backoff (1s/2s/4s) on transient errors only
- **Fatal errors (no retry):** 401/403 auth, 429 quota exhausted, 400 bad request → surface to UI immediately
- **Transient (retry):** network timeout, 5xx, WS disconnect, stream abort
- **UI fallback:** After max retries OR fatal error → WS sends `{type:"session_error", recoverable:bool}` → UI shows "Retry" (recoverable) or "Reset Conversation" (fatal) button
- **State machine:** `IDLE → LISTENING → THINKING → SPEAKING → ERROR → IDLE`. ERROR state calls `resetSession()` which: (a) closes all 3 streams (STT/LLM/TTS), (b) releases MQTT busy flag, (c) clears token buffers, (d) emits `session_reset` event
- **Library:** `p-retry` (2KB, battle-tested) — NOT XState (too heavy for 6-day window). Inline enum + switch for state machine.
- **New deps:** only `p-retry`. Everything else uses existing `ws`/`pino`.

### B2. Data Contract — DECIDED
- **Source of truth:** `harness/src/shared/contracts.ts` (Zod schemas) + hand-mirror to `firmware/shared/messages.h` (C++ structs)
- **Wire format:** JSON over MQTT (human-debuggable), binary PCM over WS (audio only)
- **Key naming:** camelCase everywhere (ArduinoJson handles both sides)
- **Timestamps:** `epoch-millis uint32` (half the bytes of ISO8601, demo-safe)
- **Enum widths:** pinned to `uint8_t` opcodes (0-255); TS mirrors with `z.number().int().min(0).max(255)`
- **Version field:** YES — every packet has `v: 1` at root. Harness rejects mismatched versions with `{error:"version_mismatch"}`
- **Payload cap:** 3KB hard limit on any MQTT packet (ESP32 default 4KB minus headroom)
- **Peripheral ID registry:** enum lives in `contracts.ts` and mirrors EEPROM identity byte (B4). Single integer table, no drift.
- **Library:** `zod` + `zod-to-json-schema` for runtime validation on TS side. No codegen — hand-sync the .h file.

### B3. Node Base Firmware — DECIDED
- **Sample rate:** **16kHz mono PCM S16LE** (32KB/s, fine on 2.4GHz LAN, matches Deepgram input)
- **Compression:** **Raw PCM, NO Opus on-device.** Opus encoder eats ESP32 cycles + adds latency. LAN bandwidth is free.
- **Audio buffering:** DMA ring buffer from I2S ISR (8 x 1024-sample blocks) → FreeRTOS queue → WS task. Backpressure = drop oldest block + log (never block ISR).
- **TTS playback:** Stream-in PCM, play as it arrives. Buffer 100ms ahead before starting playback.
- **Task priorities:** Audio (highest) > WS I/O > MQTT telemetry > PIR/BME280 polling. Pin audio to Core 1, networking to Core 0.
- **Reconnect rule:** New WS session = flush audio buffer + increment `sessionId`. Harness drops stale-sessionId frames.
- **Libraries:** `ArduinoWebsockets` (Links2004), `PubSubClient`, `ArduinoJson v7`, native `driver/i2s.h` for INMP441. Skip ESP-ADF / esp32-audioI2S.

### B4. EEPROM Enumeration — DROPPED (2026-04-18 revision)
- **Reason:** Slots are fixed-role (no any-module-anywhere). Each peripheral type is compile-time bound to a known GPIO/I2C address. Dynamic enumeration = solving a problem we deliberately designed out.
- **Replacement:** Compile-time peripheral map in `firmware/config/peripherals.h` — const table of {slotId, type, pins, i2cAddr}. Firmware iterates on boot, logs what's present via I2C ping.
- **Demo behavior:** If expected peripheral doesn't ACK on I2C → log "Slot X offline" + continue. No crash, no hot-swap detection.
- **Wins:** ~200 LOC dropped, no AT24C02 needed in BOM, no I2C enumeration bus traffic, zero scan-time I2C contention with BME280.
- **Type registry (still used for contracts + logs):** 0x10=Speaker, 0x11=PIR, 0x12=BME280, 0x13=INMP441, 0x14=ESP32-CAM, 0x15=LCD
- **Library:** Native `Wire.h` only for I2C presence ping (<20 LOC).

### B5. JST Connectors — DECIDED (revised 2026-04-18)
- **User's existing spec:** 4-pin and 6-pin JST 1.0mm (already on hand / committed). No single-pinout unification.
- **4-pin (I2C peripherals):** VCC + GND + SDA + SCL
  - **Uses:** BME280, PIR (PIR needs only 3 — VCC/GND/OUT; 4th pin unused/floats, PIR OUT wired to SDA-slot GPIO via firmware remap)
- **6-pin (I2S peripherals):** VCC + GND + BCLK(SCK) + LRCK(WS) + DATA(SD) + L/R-select (or GND for mono)
  - **Uses:** INMP441 mic, MAX98357 I2S speaker amp
- **Pigtail wiring:** Pre-crimped 1.0mm pigtails, solder to PCB-side headers. Heatshrink color code per connector type:
  - 4-pin: R=VCC, B=GND, W=SDA, Y=SCL
  - 6-pin: R=VCC, B=GND, W=BCLK, Y=LRCK, G=DATA, Blk=L/R
- **Strain relief:** hot-glue at solder joint. Demo-grade.

### B6. Enclosures — DECIDED (revised 2026-04-18)
- **Mounting style:** **Slot-in slide (wall-hang type).** Peripheral has a male dovetail/T-slot rail on its back; Node Base dock has matching female slot. Slide down to seat, JST plug mates automatically at bottom of travel.
- **Compact:** Minimum footprint per peripheral. No EEPROM pocket (B4 dropped). Just PCB + I2S/I2C chip + JST pigtail exit.
- **Tonight:** Print **prototypes** of Speaker + PIR with slide rails. Expect 1-2 iterations. Don't final-pass.
- **Material:** **PETG** everywhere (PLA softens at 60C, PETG handles 80C — matters for speaker amp thermals)
- **Fit:** Slide rails use press-fit (no screws on peripherals). Node Base dock uses M2 heat inserts for wall-mount screws only.
- **Overhangs:** 45 max on slide rails to print support-free.
- **Dock order:** Design peripherals FIRST (tonight, with rails) → measure rail dimensions → design dock SECOND (tomorrow, with matching slots + JST header positions).

### B7. LCD Display (NEW 2026-04-18) — DECIDED
- **Placement:** **Core to Node Base dock** (always-on, hardwired to main I2C bus). NOT a slide-in peripheral. LCD = Xentient's face; always present.
- **Spec:** I2C 16x2 with PCF8574 backpack at 0x27 (Shopee.ph standard, ~PHP150). Coexists with BME280 at 0x76/0x77 — no I2C collision.
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
- **Enclosure impact:** Node Base dock front face gets 71x26mm rectangular cutout for LCD window + 4 mounting posts (M3 standoffs common on these modules). Bezel 3mm thick.
- **Demo win:** Visual state feedback during demo = judges see what Xentient is "thinking" even before audio response — HUGE narrative boost.

### Archon / External Libraries — DECIDED
- **Skip Archon.** Harness already has its own memory layer (`MemoryDB`, `FactExtractor`, `MemoryInjector`) on `better-sqlite3`. Archon = 2-day integration risk for zero demo benefit.
- **Skip XState, protobuf, nanopb, ESP-ADF.** All too heavy for 6-day window.
- **Adopt:** `p-retry` + `zod` + `zod-to-json-schema` (harness); `ArduinoWebsockets` + `PubSubClient` + `ArduinoJson` + `LiquidCrystal_I2C` (firmware). That's it.

### Execution Order (Today → Demo, revised post-EEPROM-drop + LCD)
1. **NOW (AI):** Fix B1 retry bug + ship B2 contract file (incl. `display_update` schema for LCD). Target: done today.
2. **TONIGHT (User):** Print Speaker + PIR enclosure prototypes (with slide rails). Also measure LCD module (71x26mm typical) for dock cutout tomorrow.
3. **TOMORROW (parallel):** User → dock design (with slide slots + JST positions + LCD cutout + standoffs) + pigtail wiring. AI → B3 firmware scaffold + compile-time peripheral map + LCD driver task.
4. **Apr 20-21:** Peripheral firmware (I2S audio, PIR/BME280 MQTT telemetry, LCD state-face renderer). Time reclaimed from dropped EEPROM → polish LCD expressions + custom chars.
5. **Apr 22:** Integration — dry-run end-to-end audio round trip + LCD state visualization on real hardware.
6. **Apr 23:** Demo narrative rehearsal (LCD as visual anchor) + buffer day for fixes.
7. **Apr 24:** Demo.
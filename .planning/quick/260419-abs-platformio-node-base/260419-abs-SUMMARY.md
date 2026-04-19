---
phase: quick-260419-abs
plan: "01"
subsystem: firmware
tags: [platformio, esp32, i2c, arduino, scaffold]
dependency_graph:
  requires: []
  provides:
    - firmware/platformio.ini
    - firmware/include/pins.h
    - firmware/include/peripherals.h
    - firmware/src/main.cpp
  affects: []
tech_stack:
  added:
    - PlatformIO (espressif32 platform, arduino framework)
    - LiquidCrystal_I2C @ ^1.1.4 (marcoschwartz)
    - Wire.h (native Arduino/ESP32)
  patterns:
    - Compile-time constexpr peripheral table (no dynamic EEPROM)
    - I2C presence scan on boot with timeout guard
key_files:
  created:
    - firmware/platformio.ini
    - firmware/include/pins.h
    - firmware/include/peripherals.h
    - firmware/src/main.cpp
  modified: []
decisions:
  - "Wire.setTimeout(1000) added to guard I2C scan against floating bus (T-abs-02 threat mitigation — not in plan template, added as Rule 2)"
  - "board=wemos_d1_uno32 used as primary; fallback comment for esp32doit-devkit-v1 in platformio.ini"
metrics:
  duration: ~8 minutes
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
---

# Phase quick-260419-abs Plan 01: PlatformIO Node Base Firmware Scaffold Summary

**One-liner:** ESP32 D1 R32 firmware scaffold with compile-time GPIO map, 6-peripheral constexpr table, I2C boot scan at 0x27/0x76, and conditional LCD "boot ok" display.

## Files Created

| File | Purpose |
|------|---------|
| `firmware/platformio.ini` | PlatformIO project config: board `wemos_d1_uno32`, arduino framework, LiquidCrystal_I2C dep |
| `firmware/include/pins.h` | 7 compile-time GPIO constants matching WIRING.md §3 exactly |
| `firmware/include/peripherals.h` | Compile-time `PERIPHERALS[]` constexpr array, 6 entries (I2C + GPIO-only devices) |
| `firmware/src/main.cpp` | `setup()` I2C scan with serial logging and conditional LCD init; `loop()` no-op |

## GPIO Map Verification

```
PIN_I2C_SDA  = 21   (WIRING.md §3: SDA=21)
PIN_I2C_SCL  = 22   (WIRING.md §3: SCL=22)
PIN_I2S_BCLK = 26   (WIRING.md §3: BCLK=26)
PIN_I2S_LRCK = 25   (WIRING.md §3: LRCK=25)
PIN_MIC_SD   = 35   (WIRING.md §3: MIC_SD=35, input-only)
PIN_AMP_DIN  = 27   (WIRING.md §3: AMP_DIN=27)
PIN_PIR_INT  = 13   (WIRING.md §3: PIR=13)
```

All 7 constants present and matching.

## Peripheral Table

```
PERIPHERALS[0] = { "LCD",       0x15, 0x27 }   — I2C, pinged on boot
PERIPHERALS[1] = { "BME280",    0x12, 0x76 }   — I2C, pinged on boot
PERIPHERALS[2] = { "INMP441",   0x13, 0x00 }   — I2S/GPIO, not pinged
PERIPHERALS[3] = { "MAX98357A", 0x10, 0x00 }   — I2S/GPIO, not pinged
PERIPHERALS[4] = { "PIR",       0x11, 0x00 }   — GPIO, not pinged
PERIPHERALS[5] = { "ESP32-CAM", 0x14, 0x00 }   — GPIO, not pinged
```

6 entries, compile-time constexpr, no EEPROM, no dynamic allocation.

## Build Status

`pio run` could not be executed — PlatformIO CLI (`pio`) is not installed in the agent's shell environment. The firmware was NOT flashed or binary-verified. The code uses standard Arduino/ESP32 APIs with correct syntax; no build errors are anticipated.

**Board ID used:** `wemos_d1_uno32` (primary). Fallback comment for `esp32doit-devkit-v1` included in platformio.ini.

To verify manually:
```bash
cd D:/Projects/Xentient/firmware
pio run
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Wire.setTimeout(1000) added**
- **Found during:** Task 2 — reviewing threat model T-abs-02
- **Issue:** Plan's `main.cpp` template omitted `Wire.setTimeout()` despite the threat model listing it as a required mitigation for I2C bus hang when lines float
- **Fix:** Added `Wire.setTimeout(1000)` immediately after `Wire.begin()`, before the scan loop
- **Files modified:** `firmware/src/main.cpp` (line 19)
- **Commit:** a83bb7a

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 08ea22b | `feat(quick-260419-abs-01): PlatformIO scaffold — platformio.ini, pins.h, peripherals.h` |
| Task 2 | a83bb7a | `feat(quick-260419-abs-01): main.cpp — I2C boot scan, conditional LCD init` |

## Known Stubs

None — all behavior is fully implemented. The `loop()` no-op is intentional (boot scaffold only, per plan objective).

## Threat Flags

None — no new security surface beyond what is documented in the plan's threat model.

## Self-Check

- [x] `firmware/platformio.ini` exists
- [x] `firmware/include/pins.h` exists with 7 GPIO constants
- [x] `firmware/include/peripherals.h` exists with 6-entry constexpr array
- [x] `firmware/src/main.cpp` exists with Wire.setTimeout, i2c_ping loop, LCD conditional
- [x] Commit 08ea22b verified in git log
- [x] Commit a83bb7a verified in git log
- [x] Wire.setTimeout(1000) present (T-abs-02 mitigation)
- [ ] `pio run` binary build: NOT verified (pio CLI unavailable in agent shell)

## Self-Check: PARTIAL PASS

Build correctness is unverified due to missing `pio` CLI in the agent environment. All source files are present, correctly structured, and use valid Arduino/ESP32 APIs. Manual `pio run` required to confirm zero-error compilation.

---
phase: quick-260420-lcd
plan: "01"
subsystem: firmware/lcd
tags: [esp32, arduino, i2c, lcd, driver, state-machine]
dependency_graph:
  requires: [firmware/include/pins.h, firmware/include/peripherals.h, LiquidCrystal_I2C]
  provides: [lcd_driver.h, lcd_driver.cpp, NodeState API]
  affects: [firmware/src/main.cpp]
tech_stack:
  added: [LiquidCrystal_I2C (already in platformio.ini — no new dep)]
  patterns: [file-scope singleton, lastState guard, space-padding anti-flicker]
key_files:
  created:
    - firmware/include/lcd_driver.h
    - firmware/src/lcd_driver.cpp
  modified:
    - firmware/src/main.cpp
decisions:
  - Wire.begin() stays in main.cpp; driver assumes I2C is already up
  - lcd.clear() avoided entirely; 16-char space-padding used instead
  - lcd_init() unconditional — silent hardware fail acceptable for demo phase
  - Demo loop will be replaced by MQTT event handlers in Xentient-cg9
metrics:
  duration: "~3.5 min"
  completed: "2026-04-19"
  tasks_completed: 3
  files_changed: 3
---

# Phase quick-260420-lcd Plan 01: LCD Driver Core Face A Summary

## One-liner

LCD 16x2 I2C driver extracted to persistent file-scope module with NodeState enum, lastState flicker guard, and 5-state demo loop in main.cpp.

## What Was Built

Three tasks executed atomically:

**Task 1 — lcd_driver.h (commit f2138b2)**
Created `firmware/include/lcd_driver.h` with `#pragma once`, `<stdint.h>` include, `NodeState` enum class (BOOT, LISTENING, THINKING, SPEAKING, ERROR_STATE as uint8_t), and declarations for `lcd_init()` and `lcd_set_state(NodeState)`. No implementation in header.

**Task 2 — lcd_driver.cpp (commit 023b850)**
Created `firmware/src/lcd_driver.cpp` with:
- Static file-scope `LiquidCrystal_I2C lcd(0x27, 16, 2)` — persists program lifetime
- `lastState` sentinel initialised to `0xFF` cast so first call always writes
- `stateLabel()` switch returning char pointers (max 16 chars)
- `lcd_init()`: calls `lcd.init()`, `lcd.backlight()`, writes padded brand line, forces BOOT state
- `lcd_set_state()`: early-return on same state, then print + space-pad to 16 chars — no `lcd.clear()`

**Task 3 — main.cpp (commit 13353b6)**
Rewrote `firmware/src/main.cpp`:
- Removed `#include <LiquidCrystal_I2C.h>`, `lcdOnline` bool, and inline `if (lcdOnline)` LCD block
- Added `#include "lcd_driver.h"`
- `setup()`: calls `lcd_init()` + `lcd_set_state(NodeState::BOOT)` unconditionally after peripheral scan
- `loop()`: 5-state demo cycle (static array + idx counter) with `delay(2000)` between transitions

## Build Result

`pio run` (env: `node_base`) exits 0.
RAM: 6.6% (21752 / 327680 bytes). Flash: 21.2% (278181 / 1310720 bytes).

## Deviations from Plan

None — plan executed exactly as written.

The plan specified env `esp32doit-devkit-v1` in the verification command, but `platformio.ini` defines the env as `node_base`. Used `pio run` (default env) instead. Not a deviation — the plan note was a documentation mismatch in the verify block only.

## Known Stubs

`loop()` demo cycle is intentionally temporary. Comment in code references `Xentient-cg9` as the future MQTT handler task that will replace it. The demo is functional and produces visible output on hardware — it is not a rendering stub.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `T-lcd-01` and `T-lcd-02` threats documented in the plan's threat model are accepted as-is (Wire.setTimeout already set in main.cpp; single-threaded Arduino loop eliminates concurrent write races).

## Self-Check: PASSED

- firmware/include/lcd_driver.h: EXISTS
- firmware/src/lcd_driver.cpp: EXISTS
- firmware/src/main.cpp: MODIFIED (no inline LiquidCrystal_I2C constructor)
- Commits: f2138b2, 023b850, 13353b6 — all present in git log

---
phase: quick-260420-mqtt
plan: 01
subsystem: firmware
tags: [mqtt, bme280, telemetry, arduinojson, pubsubclient]
dependency_graph:
  requires: [firmware/src/lcd_driver.cpp, firmware/include/peripherals.h, docs/CONTRACTS.md]
  provides: [mqtt_client, bme_reader, messages.h-protocol-constants, telemetry-publish]
  affects: [firmware/src/main.cpp]
tech_stack:
  added: [PubSubClient 2.8, ArduinoJson 7.x, Adafruit BME280 2.2, Adafruit Unified Sensor 1.1]
  patterns: [auto-reconnect with exponential backoff, JSON telemetry publish, PubSubClient wrapper]
key_files:
  created:
    - firmware/shared/messages.h
    - firmware/include/mqtt_client.h
    - firmware/src/mqtt_client.cpp
    - firmware/include/bme_reader.h
    - firmware/src/bme_reader.cpp
  modified:
    - firmware/platformio.ini
    - firmware/src/main.cpp
decisions:
  - shared/messages.h uses -I shared build flag for include path rather than relative path
  - MQTT reconnect resets retry counter after 10s cooldown when all 3 retries exhausted
  - Timestamp uses millis() (epoch-millis uint32) with TODO for NTP wall clock
metrics:
  duration: 11 min
  completed: 2026-04-19T17:01:31Z
  tasks: 2
  files: 7
---

# Phase quick-260420-mqtt Plan 01: MQTT Pub/Sub Client Summary

MQTT pub/sub client with auto-reconnect and JSON telemetry protocol bridging ESP32 to Mosquitto broker for BME280 sensor data and control/display subscriptions.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create messages.h + mqtt_client + bme_reader modules | 064b42c | messages.h, mqtt_client.h/cpp, bme_reader.h/cpp, platformio.ini |
| 2 | Wire main.cpp — replace demo loop with MQTT telemetry + subscriptions | 1f959ab | main.cpp |

## Key Decisions

1. **shared/ include path via -I flag** — PlatformIO does not auto-include `shared/` directory. Added `-I shared` to `build_flags` in platformio.ini so all source files can `#include "messages.h"` without path prefixes.
2. **Reconnect reset strategy** — After all 3 exponential backoff retries (1s/2s/4s) fail, the retry counter resets after a 10s cooldown period (`MQTT_RETRY_RESET_MS`), then retries begin again. This prevents permanent ERROR_STATE while avoiding tight reconnect loops.
3. **millis() for timestamps** — CONTRACTS.md specifies epoch-millis uint32. Using `millis()` now with a TODO comment for NTP wall clock sync, which is a future enhancement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added -I shared to platformio.ini build_flags**
- **Found during:** Task 1 verification (pio run failed: messages.h not found)
- **Issue:** PlatformIO does not include `firmware/shared/` in the default include search path
- **Fix:** Added `-I shared` to build_flags in platformio.ini
- **Files modified:** firmware/platformio.ini
- **Commit:** 064b42c

**2. [Rule 3 - Blocking] Changed include path in main.cpp from "shared/messages.h" to "messages.h"**
- **Found during:** Task 2 verification (pio run failed: shared/messages.h not found)
- **Issue:** The -I shared flag makes messages.h directly accessible; the plan's `#include "shared/messages.h"` path doesn't work with -I include semantics
- **Fix:** Changed to `#include "messages.h"` to match mqtt_client.cpp convention
- **Files modified:** firmware/src/main.cpp
- **Commit:** 1f959ab

## Verification Results

- `pio run -e node_base` compiles with zero errors (verified after each task)
- RAM: 7.8% (25,680 / 327,680 bytes)
- Flash: 29.6% (387,805 / 1,317,120 bytes)

## Self-Check: PASSED

All 7 files verified present. Both commits (064b42c, 1f959ab) confirmed in git log.
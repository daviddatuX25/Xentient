---
phase: quick-260419-abs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - firmware/platformio.ini
  - firmware/src/main.cpp
  - firmware/include/pins.h
  - firmware/include/peripherals.h
autonomous: true
requirements:
  - abs-platformio-node-base
must_haves:
  truths:
    - "PlatformIO builds firmware with zero errors"
    - "Boot serial log shows I2C scan result for 0x27 (LCD) and 0x76 (BME280)"
    - "GPIO map in pins.h matches WIRING.md §3 exactly (SDA=21, SCL=22, BCLK=26, LRCK=25, MIC_SD=35, AMP_DIN=27, PIR=13)"
    - "If PCF8574 ACKs at 0x27, LCD line 0 shows 'boot ok'"
    - "Peripheral table is compile-time const — no dynamic EEPROM scan (per HARDWARE.md B4)"
  artifacts:
    - path: "firmware/platformio.ini"
      provides: "PlatformIO project config for ESP32 D1 R32"
    - path: "firmware/include/pins.h"
      provides: "GPIO constants matching WIRING.md §3"
    - path: "firmware/include/peripherals.h"
      provides: "Compile-time peripheral map (slotId, type, i2cAddr)"
    - path: "firmware/src/main.cpp"
      provides: "setup() I2C scan + LCD init; loop() no-op"
  key_links:
    - from: "firmware/include/pins.h"
      to: "firmware/src/main.cpp"
      via: "#include"
      pattern: "#include.*pins\\.h"
    - from: "firmware/include/peripherals.h"
      to: "firmware/src/main.cpp"
      via: "#include"
      pattern: "#include.*peripherals\\.h"
    - from: "firmware/src/main.cpp"
      to: "Wire @ 0x27 / 0x76"
      via: "Wire.beginTransmission + endTransmission"
      pattern: "Wire\\.beginTransmission"
---

<objective>
Create a PlatformIO firmware scaffold for the Xentient Node Base (ESP32 D1 R32) that:
- Defines the full GPIO map from WIRING.md §3 as compile-time constants
- Defines a compile-time peripheral table (no dynamic EEPROM, per HARDWARE.md B4)
- Runs an I2C presence scan on boot for 0x27 (LCD PCF8574) and 0x76 (BME280)
- Displays "boot ok" on LCD line 0 if the LCD ACKs
- Logs scan results at 115200 baud

Purpose: Validate the breadboard I2C bus per WIRING.md §7 step 2 before any further firmware work.
Output: Four files under firmware/ that compile clean with `pio run`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@D:/Projects/Xentient/docs/WIRING.md
@D:/Projects/Xentient/docs/HARDWARE.md

<interfaces>
<!-- GPIO constants — derived from WIRING.md §3 (validated above) -->
SDA      = GPIO21   (bidir, I2C bus — BME280 + LCD)
SCL      = GPIO22   (out,   I2C bus — BME280 + LCD)
I2S_BCLK = GPIO26   (out,   INMP441 SCK + MAX98357 BCLK)
I2S_LRCK = GPIO25   (out,   INMP441 WS  + MAX98357 LRC)
MIC_SD   = GPIO35   (in,    INMP441 SD — input-only pin)
AMP_DIN  = GPIO27   (out,   MAX98357 DIN)
PIR_INT  = GPIO13   (in,    PIR HC-SR501 OUT)

<!-- Peripheral type registry — from HARDWARE.md B4 -->
0x10 = Speaker (MAX98357A)
0x11 = PIR (HC-SR501)
0x12 = BME280
0x13 = INMP441
0x14 = ESP32-CAM
0x15 = LCD (PCF8574)

<!-- I2C addresses (from WIRING.md + hardware) -->
LCD PCF8574 = 0x27
BME280      = 0x76 (SDO tied LOW on breakout)

<!-- Libraries -->
Wire.h            — native Arduino/ESP32, no install needed
LiquidCrystal_I2C — lib dependency: johnrickman/LiquidCrystal_I2C
                    PlatformIO lib_deps name: marcoschwartz/LiquidCrystal_I2C
                    (both are the same API: LiquidCrystal_I2C lcd(addr, cols, rows))
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create PlatformIO project skeleton (platformio.ini, pins.h, peripherals.h)</name>
  <files>firmware/platformio.ini, firmware/include/pins.h, firmware/include/peripherals.h</files>
  <action>
Create the firmware/ directory tree and three files.

**firmware/platformio.ini**
```ini
[env:node_base]
platform  = espressif32
board     = wemos_d1_uno32
framework = arduino

monitor_speed = 115200
upload_speed  = 921600

lib_deps =
    marcoschwartz/LiquidCrystal_I2C @ ^1.1.4

build_flags =
    -DCORE_DEBUG_LEVEL=0
```

Note: `wemos_d1_uno32` is the correct PlatformIO board ID for the ESP32 D1 R32 (Uno form factor). If PlatformIO cannot resolve it, fall back to `esp32doit-devkit-v1` and add `board_build.mcu = esp32` — GPIO numbers are identical.

**firmware/include/pins.h**
```cpp
#pragma once

// Xentient Node Base — GPIO map
// Source of truth: docs/WIRING.md §3
// DO NOT edit without updating WIRING.md first.

// I2C bus (shared: BME280 + LCD PCF8574)
static constexpr int PIN_I2C_SDA  = 21;
static constexpr int PIN_I2C_SCL  = 22;

// I2S bus (shared: INMP441 mic in + MAX98357A amp out)
static constexpr int PIN_I2S_BCLK  = 26;
static constexpr int PIN_I2S_LRCK  = 25;
static constexpr int PIN_MIC_SD    = 35;   // input-only pin — do not drive
static constexpr int PIN_AMP_DIN   = 27;

// PIR motion interrupt
static constexpr int PIN_PIR_INT   = 13;
```

**firmware/include/peripherals.h**
```cpp
#pragma once
#include <stdint.h>

// Compile-time peripheral map.
// Per HARDWARE.md B4: slots are fixed-role. No dynamic EEPROM enumeration.
// On boot, firmware pings each I2C address; logs "online" or "offline".
// Type registry (mirrors contracts.ts):
//   0x10=Speaker, 0x11=PIR, 0x12=BME280, 0x13=INMP441, 0x14=ESP32-CAM, 0x15=LCD

struct PeripheralDef {
    const char* name;
    uint8_t     typeId;   // from type registry above
    uint8_t     i2cAddr;  // 0x00 = not I2C (GPIO-only)
};

static constexpr PeripheralDef PERIPHERALS[] = {
    { "LCD",    0x15, 0x27 },
    { "BME280", 0x12, 0x76 },
    // Non-I2C peripherals (GPIO/I2S) — i2cAddr = 0x00, not pinged
    { "INMP441",    0x13, 0x00 },
    { "MAX98357A",  0x10, 0x00 },
    { "PIR",        0x11, 0x00 },
    { "ESP32-CAM",  0x14, 0x00 },
};

static constexpr size_t PERIPHERAL_COUNT =
    sizeof(PERIPHERALS) / sizeof(PERIPHERALS[0]);
```
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient/firmware && cat platformio.ini include/pins.h include/peripherals.h</automated>
  </verify>
  <done>
    - firmware/platformio.ini exists with board=wemos_d1_uno32, framework=arduino, lib_deps includes LiquidCrystal_I2C
    - firmware/include/pins.h defines all 7 GPIO constants matching WIRING.md §3 exactly
    - firmware/include/peripherals.h defines PERIPHERALS[] compile-time const array with 6 entries, LCD at 0x27, BME280 at 0x76
  </done>
</task>

<task type="auto">
  <name>Task 2: Write main.cpp with I2C boot scan and conditional LCD display</name>
  <files>firmware/src/main.cpp</files>
  <action>
Create firmware/src/main.cpp with the following behavior in setup():
1. Serial.begin(115200) and a short delay for monitor attach
2. Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL)
3. Iterate PERIPHERALS[]: for each entry with i2cAddr != 0x00, call Wire.beginTransmission(addr) + Wire.endTransmission() → 0 means ACK (device present)
4. Serial.printf each result: "[BOOT] LCD (0x27): online" or "[BOOT] LCD (0x27): offline"
5. If LCD ACKed: initialize LiquidCrystal_I2C(0x27, 16, 2), call init(), backlight(), setCursor(0,0), print("boot ok")
6. loop() is empty (no-op)

```cpp
#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#include "pins.h"
#include "peripherals.h"

static bool i2c_ping(uint8_t addr) {
    Wire.beginTransmission(addr);
    return (Wire.endTransmission() == 0);
}

void setup() {
    Serial.begin(115200);
    delay(500);   // let monitor attach
    Serial.println("[BOOT] Xentient Node Base starting...");

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    bool lcdOnline = false;

    for (size_t i = 0; i < PERIPHERAL_COUNT; i++) {
        const PeripheralDef& p = PERIPHERALS[i];
        if (p.i2cAddr == 0x00) continue;   // not I2C — skip

        bool present = i2c_ping(p.i2cAddr);
        Serial.printf("[BOOT] %s (0x%02X): %s\n",
                      p.name,
                      p.i2cAddr,
                      present ? "online" : "offline");

        if (p.i2cAddr == 0x27 && present) {
            lcdOnline = true;
        }
    }

    if (lcdOnline) {
        LiquidCrystal_I2C lcd(0x27, 16, 2);
        lcd.init();
        lcd.backlight();
        lcd.setCursor(0, 0);
        lcd.print("boot ok");
        Serial.println("[BOOT] LCD message written.");
    }

    Serial.println("[BOOT] Init complete.");
}

void loop() {
    // no-op — boot scaffold only
}
```

No modifications to pins.h or peripherals.h in this task.
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient/firmware && pio run 2>&1 | tail -20</automated>
  </verify>
  <done>
    - firmware/src/main.cpp compiles with zero errors via `pio run`
    - Serial output on device (or verified by reading code): logs "[BOOT] LCD (0x27): online/offline" and "[BOOT] BME280 (0x76): online/offline"
    - LCD "boot ok" code path present and guarded by lcdOnline flag
    - loop() is empty
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| I2C bus → firmware | Peripheral ACK response treated as trusted (local hardware bus, no network) |
| USB serial → host | Debug log output only; no inbound data parsed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-abs-01 | Spoofing | I2C addr 0x27/0x76 | accept | Local hardware bus, attacker requires physical access; out of scope for prototype |
| T-abs-02 | Denial of Service | Wire.endTransmission() hang | mitigate | Wire.setTimeOut(10) called before scan loop to prevent infinite block if bus floats |
| T-abs-03 | Information Disclosure | Serial log at 115200 | accept | Dev/prototype only; no secrets in log output |
</threat_model>

<verification>
## Build verification
```bash
cd D:/Projects/Xentient/firmware
pio run
# Expected: SUCCESS, 0 errors
```

## GPIO pin audit
```bash
grep "PIN_" D:/Projects/Xentient/firmware/include/pins.h
# Must show: SDA=21, SCL=22, BCLK=26, LRCK=25, MIC_SD=35, AMP_DIN=27, PIR_INT=13
```

## Peripheral table audit
```bash
grep "0x27\|0x76" D:/Projects/Xentient/firmware/include/peripherals.h
# Must show both addresses present
```

## Serial monitor (on-device, optional)
Flash with `pio run -t upload`, then `pio device monitor`.
Expected lines at boot:
```
[BOOT] Xentient Node Base starting...
[BOOT] LCD (0x27): online   <or offline>
[BOOT] BME280 (0x76): online <or offline>
[BOOT] Init complete.
```
If LCD is online, also: `[BOOT] LCD message written.`
</verification>

<success_criteria>
- `pio run` exits with SUCCESS and zero errors
- pins.h contains exactly 7 GPIO constants; all values match WIRING.md §3
- peripherals.h PERIPHERALS[] is const, contains 6 entries, LCD=0x27, BME280=0x76
- main.cpp pings only i2cAddr != 0x00 entries; no EEPROM calls; no dynamic allocation
- LCD path is present and conditional on 0x27 ACK
- Wire.setTimeOut() guards the I2C scan (T-abs-02 mitigation)
</success_criteria>

<output>
After completion, create `.planning/quick/260419-abs-platformio-node-base/260419-abs-01-SUMMARY.md` with:
- Files created and their purposes
- Whether `pio run` succeeded
- Any board ID fallback used (wemos_d1_uno32 vs esp32doit-devkit-v1)
- Actual I2C scan output if device was flashed (optional)
</output>

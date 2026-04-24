---
phase: quick-260420-lcd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - firmware/include/lcd_driver.h
  - firmware/src/lcd_driver.cpp
  - firmware/src/main.cpp
autonomous: true
requirements: [LCD-DRIVER-CORE-A]

must_haves:
  truths:
    - "lcd_init() starts the LCD and displays 'Xentient' on line 0, state label on line 1"
    - "lcd_set_state(NodeState) updates only line 1, no full-screen redraw"
    - "main.cpp setup() calls lcd_init() + lcd_set_state(BOOT) — no inline LCD object"
    - "loop() cycles BOOT→LISTENING→THINKING→SPEAKING→ERROR_STATE with 2s delay for visual validation"
    - "No flicker: repeated calls with same state produce no display write"
  artifacts:
    - path: "firmware/include/lcd_driver.h"
      provides: "NodeState enum + lcd_init/lcd_set_state declarations"
      exports: [lcd_init, lcd_set_state, NodeState]
    - path: "firmware/src/lcd_driver.cpp"
      provides: "LiquidCrystal_I2C instance, state tracking, display logic"
    - path: "firmware/src/main.cpp"
      provides: "Updated setup/loop — delegates LCD to driver"
  key_links:
    - from: "firmware/src/main.cpp"
      to: "firmware/include/lcd_driver.h"
      via: "#include"
    - from: "firmware/src/lcd_driver.cpp"
      to: "LiquidCrystal_I2C"
      via: "static instance at file scope"
    - from: "lcd_set_state"
      to: "lastState guard"
      via: "early-return when s == lastState"
---

<objective>
Extract the inline LCD object from main.cpp setup() into a persistent driver module with a
clean state-machine API. The driver owns the LiquidCrystal_I2C instance at file scope,
exposes lcd_init() and lcd_set_state(NodeState), and prevents flicker by tracking the
last displayed state. main.cpp becomes the thin caller it should be. loop() runs a demo
cycle for visual validation — this will be replaced by MQTT handlers in a future task.

Purpose: Establishes the LCD display API that MQTT event handlers will call.
Output: lcd_driver.h, lcd_driver.cpp, updated main.cpp
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@D:/Projects/Xentient/firmware/include/pins.h
@D:/Projects/Xentient/firmware/include/peripherals.h
@D:/Projects/Xentient/firmware/src/main.cpp

<interfaces>
<!-- Extracted from existing files — executor uses these directly. -->

From firmware/include/pins.h:
```cpp
static constexpr int PIN_I2C_SDA  = 21;
static constexpr int PIN_I2C_SCL  = 22;
```

From firmware/include/peripherals.h:
```cpp
// LCD is first entry in PERIPHERALS[]; i2cAddr = 0x27, typeId = 0x15
```

From firmware/src/main.cpp (current inline LCD block — will be removed):
```cpp
// In setup(), guarded by lcdOnline:
LiquidCrystal_I2C lcd(0x27, 16, 2);
lcd.init();
lcd.backlight();
lcd.setCursor(0, 0);
lcd.print("boot ok");
```

LiquidCrystal_I2C API (library already in platformio.ini):
```cpp
LiquidCrystal_I2C lcd(addr, cols, rows);
lcd.init();
lcd.backlight();
lcd.setCursor(col, row);   // col=0-15, row=0-1
lcd.print("...");
lcd.clear();               // avoid — causes flicker
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create lcd_driver.h — NodeState enum + API declarations</name>
  <files>firmware/include/lcd_driver.h</files>
  <action>
Create firmware/include/lcd_driver.h with:

1. `#pragma once` guard.
2. `enum class NodeState : uint8_t` with values:
   BOOT, LISTENING, THINKING, SPEAKING, ERROR_STATE
   (ERROR_STATE avoids collision with Arduino's ERROR macro if present)
3. Function declarations:
   - `void lcd_init();`   — init LCD, display brand line, show BOOT state
   - `void lcd_set_state(NodeState s);`  — update line 1 only; no-op if state unchanged
4. No implementation — declarations only.

No Arduino.h include needed in the header (types used are only NodeState and void).
Include `<stdint.h>` for uint8_t.
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient && grep -c "lcd_set_state" firmware/include/lcd_driver.h</automated>
  </verify>
  <done>lcd_driver.h exists with NodeState enum and both function declarations. File compiles as a header (no body code).</done>
</task>

<task type="auto">
  <name>Task 2: Create lcd_driver.cpp — driver implementation</name>
  <files>firmware/src/lcd_driver.cpp</files>
  <action>
Create firmware/src/lcd_driver.cpp:

```cpp
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include "lcd_driver.h"

// Static LCD instance — persists for the lifetime of the program.
// Address 0x27, 16 columns, 2 rows (PCF8574 backpack).
static LiquidCrystal_I2C lcd(0x27, 16, 2);

// Sentinel: an invalid cast so the first call always writes.
static NodeState lastState = static_cast<NodeState>(0xFF);

// Map each state to a 16-char-max label for line 1.
static const char* stateLabel(NodeState s) {
    switch (s) {
        case NodeState::BOOT:      return "Booting...";
        case NodeState::LISTENING: return "Listening...";
        case NodeState::THINKING:  return "Thinking...";
        case NodeState::SPEAKING:  return "Speaking...";
        case NodeState::ERROR_STATE: return "ERROR";
        default:                   return "?";
    }
}

void lcd_init() {
    lcd.init();
    lcd.backlight();
    // Line 0: static brand — written once, never cleared.
    lcd.setCursor(0, 0);
    lcd.print("Xentient        ");   // pad to 16 chars to clear any garbage
    // Line 1: initial state — force write by resetting lastState.
    lastState = static_cast<NodeState>(0xFF);
    lcd_set_state(NodeState::BOOT);
}

void lcd_set_state(NodeState s) {
    if (s == lastState) return;   // no-op: prevent flicker on redundant calls
    lastState = s;

    const char* label = stateLabel(s);
    lcd.setCursor(0, 1);
    // Print label then pad the rest of the 16-char row with spaces.
    // Avoids lcd.clear() which causes full-display flicker.
    uint8_t len = 0;
    while (label[len]) { lcd.print(label[len++]); }
    while (len++ < 16) { lcd.print(' '); }
}
```

Do not use lcd.clear() anywhere — padding with spaces is the no-flicker strategy.
Do not include Wire.begin() here — Wire is already initialised in main.cpp setup().
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient && grep -c "lcd_set_state\|lcd_init\|lastState" firmware/src/lcd_driver.cpp</automated>
  </verify>
  <done>lcd_driver.cpp exists. Contains static LiquidCrystal_I2C instance, lastState guard, stateLabel switch, lcd_init(), lcd_set_state(). No lcd.clear() calls.</done>
</task>

<task type="auto">
  <name>Task 3: Update main.cpp — delegate to driver, add demo loop</name>
  <files>firmware/src/main.cpp</files>
  <action>
Replace firmware/src/main.cpp entirely. Keep the existing Wire.begin(), Serial init,
and i2c_ping scan loop unchanged. Replace the inline LCD block and loop():

Key changes:
1. Add `#include "lcd_driver.h"` after the existing includes.
2. In setup(): Remove the `lcdOnline` local variable and the guarded inline LCD block.
   After the peripheral scan loop, call `lcd_init()` unconditionally.
   (lcd_init does not guard against a missing device — if the device is offline the
   library will silently fail, which is acceptable for demo mode; a future task can
   add detection using the existing i2c_ping result.)
   Then call `lcd_set_state(NodeState::BOOT)`.
3. In loop(): Replace the no-op comment with a demo cycle:

```cpp
void loop() {
    // Demo: cycle through all states for visual validation.
    // This block will be replaced by MQTT event handling (Xentient-cg9).
    static const NodeState states[] = {
        NodeState::BOOT,
        NodeState::LISTENING,
        NodeState::THINKING,
        NodeState::SPEAKING,
        NodeState::ERROR_STATE,
    };
    static uint8_t idx = 0;
    lcd_set_state(states[idx]);
    idx = (idx + 1) % 5;
    delay(2000);
}
```

4. Remove `lcdOnline` bool and its entire `if (lcdOnline)` block — they are gone.
5. Keep the `static bool i2c_ping(uint8_t addr)` helper and the peripheral scan loop
   (Serial.printf lines) exactly as-is.

The final file should have no inline LCD object, no `LiquidCrystal_I2C lcd(...)` in setup().
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient && grep -c "lcd_driver\|lcd_init\|lcd_set_state" firmware/src/main.cpp && ! grep -q "LiquidCrystal_I2C lcd" firmware/src/main.cpp && echo "inline LCD removed OK"</automated>
  </verify>
  <done>main.cpp includes lcd_driver.h, calls lcd_init() in setup(), cycles states in loop(). No inline LiquidCrystal_I2C constructor in setup(). Build passes: `pio run -e esp32doit-devkit-v1` exits 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ESP32 firmware → I2C bus | Display commands leave MCU; device at 0x27 must be present |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lcd-01 | Denial of Service | I2C bus | accept | Wire.setTimeout(1000) already set in main.cpp; lcd.init() on missing device silently fails — acceptable for demo phase |
| T-lcd-02 | Tampering | lastState guard | accept | Single-threaded Arduino loop; no concurrent writers possible on ESP32 Arduino runtime |
</threat_model>

<verification>
After all three tasks:

```bash
# 1. Header and source exist
ls firmware/include/lcd_driver.h firmware/src/lcd_driver.cpp

# 2. No inline LCD object remains in main.cpp
grep "LiquidCrystal_I2C lcd" firmware/src/main.cpp  # should return nothing

# 3. PlatformIO build succeeds (env matches platformio.ini)
cd D:/Projects/Xentient/firmware && pio run
```

Visual check on device: power cycle → LCD shows "Xentient" / "Booting..." then
cycles through all five state labels at 2-second intervals without flicker.
</verification>

<success_criteria>
- firmware/include/lcd_driver.h: NodeState enum + 2 function declarations
- firmware/src/lcd_driver.cpp: static lcd instance, lastState guard, stateLabel(), lcd_init(), lcd_set_state()
- firmware/src/main.cpp: includes lcd_driver.h, no inline LiquidCrystal_I2C, demo loop cycles 5 states
- `pio run` exits 0 (no compile errors)
- On hardware: "Xentient" persists on line 0 across all state transitions; line 1 cycles without flicker
</success_criteria>

<output>
After completion, create `.planning/quick/260420-lcd-lcd-core-face-a/260420-lcd-SUMMARY.md`
following the standard GSD summary template.
</output>

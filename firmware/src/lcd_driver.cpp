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
        case NodeState::BOOT:        return "Booting...";
        case NodeState::LISTENING:   return "Listening...";
        case NodeState::THINKING:    return "Thinking...";
        case NodeState::SPEAKING:    return "Speaking...";
        case NodeState::ERROR_STATE: return "ERROR";
        default:                     return "?";
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

#pragma once
#include <stdint.h>

// Xentient LCD driver — public API.
// Owns the LiquidCrystal_I2C instance; exposes a state-machine interface.
// Wire.begin() must be called in main.cpp before lcd_init().

enum class NodeState : uint8_t {
    BOOT        = 0,
    LISTENING   = 1,
    THINKING    = 2,
    SPEAKING    = 3,
    ERROR_STATE = 4,   // avoids collision with Arduino's ERROR macro
};

// Initialise the LCD hardware, write the static brand line ("Xentient") on
// row 0, and display the BOOT state label on row 1.
void lcd_init();

// Update row 1 with the label for state s.
// No-op if s matches the previously displayed state (prevents flicker).
void lcd_set_state(NodeState s);

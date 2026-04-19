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

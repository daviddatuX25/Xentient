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

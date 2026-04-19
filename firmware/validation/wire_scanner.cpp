// BB-I2S Step 1: I2C bus scanner
// Expects: LCD (0x27) + BME280 (0x76) on SDA=21, SCL=22
// If either missing → check wiring before proceeding to I2S test.

#include <Arduino.h>
#include <Wire.h>

static constexpr int SDA_PIN = 21;
static constexpr int SCL_PIN = 22;

// Known addresses from peripherals.h
static constexpr uint8_t ADDR_LCD    = 0x27;
static constexpr uint8_t ADDR_BME280 = 0x76;

static bool i2c_ping(uint8_t addr) {
    Wire.beginTransmission(addr);
    return (Wire.endTransmission() == 0);
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[I2C] Wire Scanner — Xentient 1xi Step 1");

    Wire.begin(SDA_PIN, SCL_PIN);
    Wire.setTimeout(1000);

    // Full bus scan
    Serial.println("[I2C] Scanning 0x03..0x77...");
    uint8_t found = 0;
    for (uint8_t addr = 3; addr <= 0x77; addr++) {
        if (i2c_ping(addr)) {
            Serial.printf("  0x%02X ← found\n", addr);
            found++;
        }
    }
    Serial.printf("[I2C] %d device(s) found\n", found);

    // Targeted check
    bool lcd  = i2c_ping(ADDR_LCD);
    bool bme  = i2c_ping(ADDR_BME280);
    Serial.printf("[I2C] LCD    0x%02X: %s\n", ADDR_LCD,    lcd ? "PASS" : "FAIL");
    Serial.printf("[I2C] BME280 0x%02X: %s\n", ADDR_BME280, bme ? "PASS" : "FAIL");

    if (lcd && bme) {
        Serial.println("[I2C] Both peripherals confirmed. Proceed to I2S read test.");
    } else {
        Serial.println("[I2C] MISSING peripheral(s). Check wiring before continuing.");
    }
}

void loop() {
    // One-shot test. Press RST to re-run.
    delay(5000);
}
#pragma once

// Xentient BME280 Reader — public API.
// Wraps Adafruit_BME280 driver for temperature/humidity/pressure reads.

struct BmeReading {
    float temperature;  // degrees Celsius
    float humidity;     // percent RH
    float pressure;     // hectopascals (hPa)
};

// Initialize Adafruit_BME280 at address 0x76.
// Returns true if sensor found on I2C bus.
bool bme_init();

// Read current sensor values into out struct.
// Returns false on I2C error or NaN readings.
bool bme_read(BmeReading& out);
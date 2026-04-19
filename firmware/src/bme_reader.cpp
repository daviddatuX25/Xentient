#include <Arduino.h>
#include <Adafruit_BME280.h>
#include <Adafruit_Sensor.h>

#include "bme_reader.h"
#include "pins.h"

static Adafruit_BME280 bme;

bool bme_init() {
    // BME280 at address 0x76 on the shared I2C bus.
    // Wire.begin() must be called in main.cpp before this.
    bool found = bme.begin(0x76);
    if (!found) {
        Serial.println("[BME] Sensor not found at 0x76");
    }
    return found;
}

bool bme_read(BmeReading& out) {
    float t = bme.readTemperature();
    float h = bme.readHumidity();
    float p = bme.readPressure() / 100.0F;  // Pa -> hPa

    // Guard against I2C errors returning NaN
    if (isnan(t) || isnan(h) || isnan(p)) {
        Serial.println("[BME] NaN reading — I2C error");
        return false;
    }

    out.temperature = t;
    out.humidity    = h;
    out.pressure    = p;
    return true;
}
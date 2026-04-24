#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <ArduinoJson.h>

#include "pins.h"
#include "peripherals.h"
#include "lcd_driver.h"
#include "mqtt_client.h"
#include "bme_reader.h"
#include "i2s_mic.h"
#include "vad.h"
#include "ws_audio.h"
#include "cam_relay.h"
#include "messages.h"

// --- helpers ---

static bool i2c_ping(uint8_t addr) {
    Wire.beginTransmission(addr);
    return (Wire.endTransmission() == 0);
}

static void wifi_connect() {
    Serial.printf("[WIFI] Connecting to %s...\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    uint8_t attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print('.');
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WIFI] Failed to connect — continuing without network");
    }
}

// VAD start → trigger_pipeline{source:"voice"} on xentient/control/trigger
// VAD end has no wire event (harness infers end from audio stream close)
static void publish_vad(bool active) {
    if (!active || !mqtt_connected()) return;
    JsonDocument doc;
    doc["v"]      = MSG_VERSION;
    doc["type"]   = "trigger_pipeline";
    doc["source"] = TRIGGER_SOURCE_VOICE;
    char buf[96];
    serializeJson(doc, buf, sizeof(buf));
    mqtt_publish(TOPIC_TRIGGER, buf, strlen(buf));
    Serial.println("[VAD] Published: trigger_pipeline source=voice");
}

// --- setup ---

static unsigned long lastTelemetryMs = 0;

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("[BOOT] Xentient Node Base starting...");

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setTimeout(1000);

    for (size_t i = 0; i < PERIPHERAL_COUNT; i++) {
        const PeripheralDef& p = PERIPHERALS[i];
        if (p.i2cAddr == 0x00) continue;
        bool present = i2c_ping(p.i2cAddr);
        Serial.printf("[BOOT] %s (0x%02X): %s\n", p.name, p.i2cAddr, present ? "online" : "offline");
    }

    lcd_init();
    lcd_set_state(NodeState::BOOT);

    bool bmeOk = bme_init();
    Serial.printf("[BOOT] BME280: %s\n", bmeOk ? "online" : "offline");

    wifi_connect();

    mqtt_init();
    ws_audio_init(WS_HARNESS_HOST, WS_HARNESS_PORT);
    i2s_mic_init();
    vad_init();
    cam_relay_init();

    Serial.println("[BOOT] Init complete.");
}

// --- loop ---

static int16_t s_pcm[I2S_MIC_CHUNK_SAMPLES];

static float rounded2(float v) { return round(v * 100.0F) / 100.0F; }

void loop() {
    ws_audio_loop();
    mqtt_loop();
    cam_relay_loop();

    // --- Mic capture + VAD ---
    if (i2s_mic_read(s_pcm, I2S_MIC_CHUNK_SAMPLES)) {
        VadResult vad = vad_process(s_pcm, I2S_MIC_CHUNK_SAMPLES);

        if (vad.transitioned) {
            publish_vad(vad.active);
        }

        if (vad.active) {
            ws_audio_send((const uint8_t*)s_pcm, I2S_MIC_CHUNK_BYTES);
        }
    }

    // --- BME280 telemetry (unchanged cadence) ---
    if (mqtt_connected() && (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS)) {
        lastTelemetryMs = millis();
        BmeReading reading;
        if (bme_read(reading)) {
            JsonDocument doc;
            doc["v"]               = MSG_VERSION;
            doc["type"]            = "sensor_data";
            doc["peripheralType"]  = PERIPHERAL_TYPE_BME280;
            JsonObject payload     = doc["payload"].to<JsonObject>();
            payload["temperature"] = rounded2(reading.temperature);
            payload["humidity"]    = rounded2(reading.humidity);
            payload["pressure"]    = rounded2(reading.pressure);
            doc["timestamp"]       = (uint32_t)millis();
            char buf[256];
            serializeJson(doc, buf, sizeof(buf));
            mqtt_publish(TOPIC_ENV, buf, strlen(buf));
        }
    }
}

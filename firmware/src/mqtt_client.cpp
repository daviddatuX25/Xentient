#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

#include "mqtt_client.h"
#include "messages.h"
#include "lcd_driver.h"

static WiFiClient espClient;
static PubSubClient client(espClient);

// --- Reconnect state ---
static uint8_t  retryCount = 0;
static unsigned long lastReconnectAttempt = 0;

// --- Internal: attempt connection to broker ---
static void mqtt_connect() {
    Serial.printf("[MQTT] Connecting to %s:%d (attempt %d)...\n",
                  MQTT_BROKER_ADDR, MQTT_BROKER_PORT, retryCount + 1);

    if (client.connect(MQTT_CLIENT_ID)) {
        retryCount = 0;
        Serial.println("[MQTT] Connected.");
        lcd_set_state(NodeState::LISTENING);

        // Subscribe to control and display topics
        mqtt_subscribe(TOPIC_MODE_SET);
        mqtt_subscribe(TOPIC_DISPLAY);
    } else {
        Serial.printf("[MQTT] Connect failed, rc=%d\n", client.state());
        lcd_set_state(NodeState::ERROR_STATE);
    }
}

// --- Incoming message callback ---
static void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    // Log received message for now. Future: dispatch to mode/display handlers.
    Serial.printf("[MQTT] Received: topic=%s, length=%u\n", topic, length);
    // Note: payload is not null-terminated. Print as hex prefix for safety.
    if (length > 0) {
        Serial.printf("[MQTT]   payload[0..%u]: ", length < 32 ? length : 32);
        for (unsigned int i = 0; i < (length < 32 ? length : 32); i++) {
            Serial.printf("%02X ", payload[i]);
        }
        Serial.println();
    }
}

// --- Public API ---

void mqtt_init() {
    client.setServer(MQTT_BROKER_ADDR, MQTT_BROKER_PORT);
    client.setCallback(mqtt_callback);
    mqtt_connect();
}

void mqtt_loop() {
    client.loop();

    if (!client.connected()) {
        unsigned long now = millis();

        if (retryCount < MQTT_RETRY_MAX) {
            // Exponential backoff: MQTT_RETRY_BASE_MS * 2^retryCount
            uint32_t delay = MQTT_RETRY_BASE_MS * (1u << retryCount);
            if (now - lastReconnectAttempt >= delay) {
                lastReconnectAttempt = now;
                mqtt_connect();
                // Only increment if connection failed (retryCount is reset in mqtt_connect on success)
                if (!client.connected()) {
                    retryCount++;
                }
            }
        } else {
            // All 3 retries exhausted — wait MQTT_RETRY_RESET_MS then reset counter
            if (now - lastReconnectAttempt >= MQTT_RETRY_CAP_MS) {
                Serial.println("[MQTT] Resetting retry counter after backoff...");
                retryCount = 0;
                lastReconnectAttempt = now;
            }
        }
    }
}

bool mqtt_connected() {
    return client.connected();
}

void mqtt_publish(const char* topic, const char* payload, size_t length) {
    if (length > MQTT_PAYLOAD_CAP) {
        Serial.printf("[MQTT] Payload too large: %u > %u bytes — dropped\n",
                      (unsigned)length, (unsigned)MQTT_PAYLOAD_CAP);
        return;
    }
    client.publish(topic, (const uint8_t*)payload, length, false);  // QoS 0, retain=false
}

void mqtt_subscribe(const char* topic) {
    client.subscribe(topic);
}
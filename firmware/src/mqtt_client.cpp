#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"

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
        mqtt_subscribe(TOPIC_NODE_PROFILE_SET);
    } else {
        Serial.printf("[MQTT] Connect failed, rc=%d\n", client.state());
        lcd_set_state(NodeState::ERROR_STATE);
    }
}

// --- Handle display_update from harness ---
static void handle_display_update(byte* payload, unsigned int length) {
    // Null-terminate for JSON parsing (ArduinoJson doesn't need it but safe practice)
    char buf[256];
    if (length >= sizeof(buf)) return;
    memcpy(buf, payload, length);
    buf[length] = '\0';

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, buf);
    if (err) {
        Serial.printf("[MQTT] display_update parse error: %s\n", err.c_str());
        return;
    }

    const char* line1 = doc["line1"] | "";
    const char* line2 = doc["line2"] | "";
    if (line1[0] || line2[0]) {
        lcd_display_face(line1, line2);
        Serial.printf("[LCD] Face: '%s' / '%s'\n", line1, line2);
    }
}

// --- Handle mode_set from harness/web ---
static void handle_mode_set(byte* payload, unsigned int length) {
    char buf[128];
    if (length >= sizeof(buf)) return;
    memcpy(buf, payload, length);
    buf[length] = '\0';

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, buf);
    if (err) {
        Serial.printf("[MQTT] mode_set parse error: %s\n", err.c_str());
        return;
    }

    const char* mode = doc["mode"] | "";
    if (strcmp(mode, MODE_SLEEP) == 0) {
        lcd_display_face("(_ _) Zzz", "  ready...");
    } else if (strcmp(mode, MODE_LISTEN) == 0) {
        lcd_display_face("(O_O)", "listening...");
    } else if (strcmp(mode, MODE_ACTIVE) == 0) {
        lcd_display_face("(^_^) Xentient", "  ready...");
    }
}

// --- Handle node_profile_set (8.4: JSON parsed HERE, not in Config Task) ---
// Parse + validate in the MQTT callback. If valid, copy fields into
// pendingProfile under critical section and set profileUpdateFlag.
// Store profileId into lastReceivedProfileId immediately (8.5).
static void handle_profile_set(byte* payload, unsigned int length) {
    // Cap: profile payloads should be small, but allow up to 512 bytes
    char buf[512];
    if (length >= sizeof(buf)) {
        Serial.printf("[MQTT] profile_set too large: %u bytes — dropped\n", length);
        return;
    }
    memcpy(buf, payload, length);
    buf[length] = '\0';

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, buf);
    if (err) {
        Serial.printf("[MQTT] profile_set parse error: %s\n", err.c_str());
        return;
    }

    // -- Validate required fields --
    const char* profile_id = doc["profileId"] | "";
    if (profile_id[0] == '\0') {
        Serial.println("[MQTT] profile_set missing profileId — dropped");
        return;
    }

    // -- Snapshot activeProfile for default values (short critical section) --
    NodeProfile snap;
    portENTER_CRITICAL(&profileMux);
    memcpy(&snap, (const void*)&activeProfile, sizeof(NodeProfile));
    portEXIT_CRITICAL(&profileMux);

    // -- Build incoming profile OUTSIDE critical section --
    NodeProfile incoming;
    memset(&incoming, 0, sizeof(NodeProfile));
    strncpy(incoming.profile_id, profile_id, sizeof(incoming.profile_id) - 1);

    // Optional fields with defaults from snapshot if missing
    incoming.pir_interval_ms = doc["pir_interval_ms"] | snap.pir_interval_ms;
    incoming.mic_mode         = doc["mic_mode"].is<int>()
                                ? (uint8_t)doc["mic_mode"].as<int>()
                                : snap.mic_mode;
    incoming.bme_interval_ms = doc["bme_interval_ms"] | snap.bme_interval_ms;
    incoming.camera_mode      = doc["camera_mode"].is<int>()
                                ? (uint8_t)doc["camera_mode"].as<int>()
                                : snap.camera_mode;
    incoming.lcd_face         = doc["lcd_face"].is<int>()
                                ? (uint8_t)doc["lcd_face"].as<int>()
                                : snap.lcd_face;
    incoming.event_mask       = doc["event_mask"].is<int>()
                                ? (uint16_t)doc["event_mask"].as<int>()
                                : snap.event_mask;

    // Store profileId immediately for ack echo (8.5)
    strncpy(lastReceivedProfileId, profile_id, sizeof(lastReceivedProfileId) - 1);
    lastReceivedProfileId[sizeof(lastReceivedProfileId) - 1] = '\0';

    // -- Only the final copy needs the critical section --
    portENTER_CRITICAL(&profileMux);
    memcpy((void*)&pendingProfile, &incoming, sizeof(NodeProfile));
    profileUpdateFlag = true;
    portEXIT_CRITICAL(&profileMux);

    Serial.printf("[MQTT] Profile '%s' queued for hot-swap\n", profile_id);
}

// --- Incoming message callback ---
static void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, TOPIC_DISPLAY) == 0) {
        handle_display_update(payload, length);
        return;
    }
    if (strcmp(topic, TOPIC_MODE_SET) == 0) {
        handle_mode_set(payload, length);
        return;
    }
    if (strcmp(topic, TOPIC_NODE_PROFILE_SET) == 0) {
        handle_profile_set(payload, length);
        return;
    }

    // Unknown topic — log for debugging
    Serial.printf("[MQTT] Received: topic=%s, length=%u\n", topic, length);
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

void mqtt_reconnect() {
    retryCount = 0;
    lastReconnectAttempt = 0;
    if (!client.connected()) {
        mqtt_connect();
    }
}

void send_profile_ack(const char* status) {
    if (!mqtt_connected()) return;

    // Read lastReceivedProfileId under critical section
    char ackProfileId[32];
    portENTER_CRITICAL(&profileMux);
    strncpy(ackProfileId, lastReceivedProfileId, sizeof(ackProfileId) - 1);
    ackProfileId[sizeof(ackProfileId) - 1] = '\0';
    portEXIT_CRITICAL(&profileMux);

    JsonDocument doc;
    doc["v"]         = MSG_VERSION;
    doc["type"]      = "node_profile_ack";
    doc["profileId"] = ackProfileId;
    doc["status"]    = status;
    doc["timestamp"] = (uint32_t)millis();
    char buf[256];
    serializeJson(doc, buf, sizeof(buf));
    mqtt_publish(TOPIC_NODE_PROFILE_ACK, buf, strlen(buf));
    Serial.printf("[MQTT] Sent profile_ack: id='%s' status='%s'\n", ackProfileId, status);
}
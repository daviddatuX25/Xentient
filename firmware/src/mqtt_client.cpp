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

// --- Broker address set at init from provisioning config ---
static char       mqttBrokerHost[46] = MQTT_BROKER_ADDR;
static uint16_t   mqttBrokerPort     = MQTT_BROKER_PORT;

// --- Runtime-resolved nodeId for topic building ---
static char runtimeNodeId[24] = NODE_BASE_ID;
static char runtimeSpaceId[24] = SPACE_ID;
static char resolvedTopicProfileSet[64] = {0};
static char resolvedTopicProfileAck[64] = {0};
static char resolvedTopicBirth[64] = {0};

// --- Reconnect state (H3: guarded by reconnectMux) ---
static portMUX_TYPE reconnectMux = portMUX_INITIALIZER_UNLOCKED;
static uint8_t  retryCount = 0;
static unsigned long lastReconnectAttempt = 0;

// --- Internal: attempt connection to broker ---
static void mqtt_connect() {
    uint8_t attempt;
    portENTER_CRITICAL(&reconnectMux);
    attempt = retryCount + 1;
    portEXIT_CRITICAL(&reconnectMux);

    Serial.printf("[MQTT] Connecting to %s:%u (attempt %d)...\n",
                  mqttBrokerHost, (unsigned)mqttBrokerPort, attempt);

    if (client.connect(MQTT_CLIENT_ID)) {
        portENTER_CRITICAL(&reconnectMux);
        retryCount = 0;
        portEXIT_CRITICAL(&reconnectMux);
        Serial.println("[MQTT] Connected.");
        lcd_set_state(NodeState::LISTENING);

        // Subscribe to control and display topics
        if (!mqtt_subscribe(TOPIC_MODE_SET))
            Serial.printf("[MQTT] WARN: subscribe failed for %s\n", TOPIC_MODE_SET);
        if (!mqtt_subscribe(TOPIC_DISPLAY))
            Serial.printf("[MQTT] WARN: subscribe failed for %s\n", TOPIC_DISPLAY);
        if (!mqtt_subscribe(resolvedTopicProfileSet))
            Serial.printf("[MQTT] WARN: subscribe failed for %s\n", resolvedTopicProfileSet);

        // Publish birth message so harness knows this node is online
        JsonDocument birthDoc;
        birthDoc["v"]        = MSG_VERSION;
        birthDoc["type"]     = "node_birth";
        birthDoc["nodeId"]   = runtimeNodeId;
        birthDoc["spaceId"]  = runtimeSpaceId;
        birthDoc["ts"]       = (uint32_t)(millis() / 1000);
        char birthBuf[128];
        serializeJson(birthDoc, birthBuf, sizeof(birthBuf));
        // Retain=true so harness receives birth even if it (re)connects AFTER firmware
        client.publish(resolvedTopicBirth, (const uint8_t*)birthBuf, strlen(birthBuf), true);
        Serial.printf("[MQTT] Birth message published for node '%s'\n", runtimeNodeId);
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
    // C3: Range validation — reject out-of-range values, fall back to snapshot
    incoming.pir_interval_ms = doc["pir_interval_ms"] | snap.pir_interval_ms;
    {
        uint8_t mm = doc["mic_mode"].is<int>()
                    ? (uint8_t)doc["mic_mode"].as<int>()
                    : snap.mic_mode;
        incoming.mic_mode = (mm <= 2) ? mm : snap.mic_mode;
    }
    incoming.bme_interval_ms = doc["bme_interval_ms"] | snap.bme_interval_ms;
    {
        uint8_t cm = doc["camera_mode"].is<int>()
                    ? (uint8_t)doc["camera_mode"].as<int>()
                    : snap.camera_mode;
        incoming.camera_mode = (cm <= 2) ? cm : snap.camera_mode;
    }
    {
        uint8_t lf = doc["lcd_face"].is<int>()
                    ? (uint8_t)doc["lcd_face"].as<int>()
                    : snap.lcd_face;
        incoming.lcd_face = (lf <= 3) ? lf : snap.lcd_face;
    }
    incoming.event_mask       = doc["event_mask"].is<int>()
                                ? (uint16_t)doc["event_mask"].as<int>()
                                : snap.event_mask;

    // C1: profileId stored atomically inside critical section with pendingProfile
    portENTER_CRITICAL(&profileMux);
    memcpy((void*)&pendingProfile, &incoming, sizeof(NodeProfile));
    strncpy(lastReceivedProfileId, profile_id, sizeof(lastReceivedProfileId) - 1);
    lastReceivedProfileId[sizeof(lastReceivedProfileId) - 1] = '\0';
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
    if (strcmp(topic, resolvedTopicProfileSet) == 0) {
        handle_profile_set(payload, length);
        return;
    }

    // Unknown topic — log for debugging
    Serial.printf("[MQTT] Received: topic=%s, length=%u\n", topic, length);
}

// --- Public API ---

void mqtt_init(const char* brokerHost, uint16_t brokerPort, const char* nodeId, const char* spaceId) {
    strncpy(mqttBrokerHost, brokerHost, sizeof(mqttBrokerHost) - 1);
    mqttBrokerHost[sizeof(mqttBrokerHost) - 1] = '\0';
    mqttBrokerPort = brokerPort;
    if (nodeId && nodeId[0] != '\0') {
        strncpy(runtimeNodeId, nodeId, sizeof(runtimeNodeId) - 1);
        runtimeNodeId[sizeof(runtimeNodeId) - 1] = '\0';
    } else if (nodeId && nodeId[0] == '\0') {
        Serial.printf("[MQTT] Warning: empty nodeId, falling back to " NODE_BASE_ID "\n");
    }
    if (spaceId && spaceId[0] != '\0') {
        strncpy(runtimeSpaceId, spaceId, sizeof(runtimeSpaceId) - 1);
        runtimeSpaceId[sizeof(runtimeSpaceId) - 1] = '\0';
    }
    // Resolve nodeId-dependent topics at runtime
    buildNodeTopic(runtimeNodeId, TOPIC_NODE_PROFILE_SET_SUFFIX, resolvedTopicProfileSet, sizeof(resolvedTopicProfileSet));
    buildNodeTopic(runtimeNodeId, TOPIC_NODE_PROFILE_ACK_SUFFIX, resolvedTopicProfileAck, sizeof(resolvedTopicProfileAck));
    buildNodeTopic(runtimeNodeId, TOPIC_NODE_BIRTH_SUFFIX, resolvedTopicBirth, sizeof(resolvedTopicBirth));
    client.setServer(mqttBrokerHost, mqttBrokerPort);
    client.setCallback(mqtt_callback);
    mqtt_connect();
}

void mqtt_loop() {
    client.loop();

    if (!client.connected()) {
        unsigned long now = millis();

        portENTER_CRITICAL(&reconnectMux);
        uint8_t rc = retryCount;
        unsigned long lra = lastReconnectAttempt;
        portEXIT_CRITICAL(&reconnectMux);

        if (rc < MQTT_RETRY_MAX) {
            // Exponential backoff: MQTT_RETRY_BASE_MS * 2^retryCount
            uint32_t delay = MQTT_RETRY_BASE_MS * (1u << rc);
            if (now - lra >= delay) {
                portENTER_CRITICAL(&reconnectMux);
                lastReconnectAttempt = now;
                portEXIT_CRITICAL(&reconnectMux);
                mqtt_connect();
                // Only increment if connection failed (retryCount is reset in mqtt_connect on success)
                if (!client.connected()) {
                    portENTER_CRITICAL(&reconnectMux);
                    retryCount++;
                    portEXIT_CRITICAL(&reconnectMux);
                }
            }
        } else {
            // All 3 retries exhausted — wait MQTT_RETRY_CAP_MS then reset counter
            if (now - lra >= MQTT_RETRY_CAP_MS) {
                Serial.println("[MQTT] Resetting retry counter after backoff...");
                portENTER_CRITICAL(&reconnectMux);
                retryCount = 0;
                lastReconnectAttempt = now;
                portEXIT_CRITICAL(&reconnectMux);
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

bool mqtt_subscribe(const char* topic) {
    return client.subscribe(topic);
}

void mqtt_reconnect() {
    portENTER_CRITICAL(&reconnectMux);
    retryCount = 0;
    lastReconnectAttempt = 0;
    portEXIT_CRITICAL(&reconnectMux);
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
    mqtt_publish(resolvedTopicProfileAck, buf, strlen(buf));
    Serial.printf("[MQTT] Sent profile_ack: id='%s' status='%s'\n", ackProfileId, status);
}
#pragma once

// Xentient MQTT Client — public API.
// Wraps PubSubClient with auto-reconnect, retry logic, and payload cap enforcement.

typedef void (*MqttCallback)(const char* topic, const uint8_t* payload, unsigned int length);

// Create WiFiClient + PubSubClient, set server, register callbacks, call connect.
// brokerHost/brokerPort come from provisioning config (NVS), not compile-time constants.
void mqtt_init(const char* brokerHost, uint16_t brokerPort, const char* nodeId = nullptr, const char* spaceId = nullptr);

// MUST be called every loop() iteration — handles PubSubClient.loop() + reconnect logic.
void mqtt_loop();

// Returns true if currently connected to broker.
bool mqtt_connected();

// Publish with QoS 0, retain=false. Checks MQTT_PAYLOAD_CAP before sending.
void mqtt_publish(const char* topic, const char* payload, size_t length);

// Subscribe wrapper. Returns false if subscription failed.
bool mqtt_subscribe(const char* topic);

// Force an immediate MQTT reconnect (called after WiFi reconnect).
void mqtt_reconnect();

// Send node_profile_ack with profileId and status.
// profileId is echoed from lastReceivedProfileId regardless of swap state.
void send_profile_ack(const char* status);
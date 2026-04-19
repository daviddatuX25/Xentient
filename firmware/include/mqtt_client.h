#pragma once

// Xentient MQTT Client — public API.
// Wraps PubSubClient with auto-reconnect, retry logic, and payload cap enforcement.

typedef void (*MqttCallback)(const char* topic, const uint8_t* payload, unsigned int length);

// Create WiFiClient + PubSubClient, set server, register callbacks, call connect.
void mqtt_init();

// MUST be called every loop() iteration — handles PubSubClient.loop() + reconnect logic.
void mqtt_loop();

// Returns true if currently connected to broker.
bool mqtt_connected();

// Publish with QoS 0, retain=false. Checks MQTT_PAYLOAD_CAP before sending.
void mqtt_publish(const char* topic, const char* payload, size_t length);

// Subscribe wrapper.
void mqtt_subscribe(const char* topic);
#pragma once
#include <cstdint>

// Xentient Wire Protocol — C++ hand-mirror of CONTRACTS.md schemas.
// Single source of truth for protocol constants in firmware.
// Hand-sync with contracts.ts — no codegen.

// --- Protocol version ---
static constexpr uint8_t  MSG_VERSION = 1;

// --- Peripheral type registry (matches CONTRACTS.md Peripheral ID Registry) ---
static constexpr uint8_t  PERIPHERAL_TYPE_BME280 = 0x12;
static constexpr uint8_t  PERIPHERAL_TYPE_PIR    = 0x11;
static constexpr uint8_t  PERIPHERAL_TYPE_LCD    = 0x15;

// --- MQTT topics ---
static constexpr const char* TOPIC_ENV     = "xentient/sensors/env";
static constexpr const char* TOPIC_MOTION  = "xentient/sensors/motion";
static constexpr const char* TOPIC_MODE    = "xentient/control/mode";
static constexpr const char* TOPIC_DISPLAY = "xentient/display";

// --- MQTT constraints (per CONTRACTS.md Payload Cap) ---
static constexpr size_t   MQTT_PAYLOAD_CAP    = 3072;   // 3KB hard limit
static constexpr uint8_t  MQTT_RETRY_MAX      = 3;      // max reconnect attempts before backoff reset
static constexpr uint32_t MQTT_RETRY_BASE_MS   = 1000;  // exponential: 1s, 2s, 4s
static constexpr uint32_t MQTT_RETRY_RESET_MS = 10000;  // after all retries fail, wait 10s then reset

// --- Telemetry ---
static constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000; // publish every 5s

// --- Broker defaults (user overrides before build) ---
static constexpr const char* MQTT_BROKER_ADDR = "192.168.1.100";
static constexpr uint16_t     MQTT_BROKER_PORT = 1883;
static constexpr const char* MQTT_CLIENT_ID    = "xentient-node-01";
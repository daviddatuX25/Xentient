#pragma once
#include <cstdint>

// Xentient Wire Protocol — C++ hand-mirror of contracts.ts / CONTRACTS.md.
// Single source of truth for protocol constants in firmware.
// Hand-sync with contracts.ts — no codegen.
// If this file and CONTRACTS.md disagree, CONTRACTS.md wins.

// --- Protocol version ---
static constexpr uint8_t MSG_VERSION = 1;

// --- Peripheral type registry (mirrors PERIPHERAL_IDS in contracts.ts) ---
static constexpr uint8_t PERIPHERAL_TYPE_SPEAKER    = 0x10;
static constexpr uint8_t PERIPHERAL_TYPE_PIR        = 0x11;
static constexpr uint8_t PERIPHERAL_TYPE_BME280     = 0x12;
static constexpr uint8_t PERIPHERAL_TYPE_INMP441    = 0x13;
static constexpr uint8_t PERIPHERAL_TYPE_ESP32_CAM  = 0x14;
static constexpr uint8_t PERIPHERAL_TYPE_LCD        = 0x15;

// --- Mode values (mirrors MODE_VALUES in contracts.ts) ---
static constexpr const char* MODE_SLEEP  = "sleep";
static constexpr const char* MODE_LISTEN = "listen";
static constexpr const char* MODE_ACTIVE = "active";
static constexpr const char* MODE_RECORD = "record";

// --- Pipeline state values (mirrors PIPELINE_STATES in contracts.ts) ---
static constexpr const char* PIPELINE_IDLE      = "idle";
static constexpr const char* PIPELINE_LISTENING = "listening";
static constexpr const char* PIPELINE_THINKING  = "thinking";
static constexpr const char* PIPELINE_SPEAKING  = "speaking";

// --- Trigger sources (mirrors TriggerPipeline.source in contracts.ts) ---
static constexpr const char* TRIGGER_SOURCE_WEB   = "web";
static constexpr const char* TRIGGER_SOURCE_PIR   = "pir";
static constexpr const char* TRIGGER_SOURCE_VOICE = "voice";

// --- MQTT topics — Sensor → Harness ---
static constexpr const char* TOPIC_ENV    = "xentient/sensors/env";    // sensor_data BME280
static constexpr const char* TOPIC_MOTION = "xentient/sensors/motion"; // sensor_data PIR

// --- MQTT topics — Pipeline state → Web ---
static constexpr const char* TOPIC_PIPELINE_STATE   = "xentient/pipeline/state";   // pipeline_state
static constexpr const char* TOPIC_SESSION_COMPLETE = "xentient/session/complete"; // session_complete
static constexpr const char* TOPIC_SESSION_ERROR    = "xentient/session/error";    // session_error
static constexpr const char* TOPIC_MODE_STATUS      = "xentient/status/mode";      // mode_status
static constexpr const char* TOPIC_SPACE_STATUS     = "xentient/status/space";     // space_status

// --- MQTT topics — Web → Core (inbound commands) ---
static constexpr const char* TOPIC_MODE_SET = "xentient/control/mode";     // mode_set
static constexpr const char* TOPIC_TRIGGER  = "xentient/control/trigger";  // trigger_pipeline
static constexpr const char* TOPIC_DISPLAY  = "xentient/display";          // display_update

// --- Audio WebSocket topics (binary, not JSON) ---
static constexpr const char* TOPIC_AUDIO_IN  = "xentient/audio/in";  // Node Base → Harness PCM
static constexpr const char* TOPIC_AUDIO_OUT = "xentient/audio/out"; // Harness → Node Base TTS

// --- Camera MQTT topics (mirrors MQTT_TOPICS in contracts.ts) ---
static constexpr const char* TOPIC_CAMERA_REQUEST = "xentient/camera/request"; // Node ↔ Harness camera request
static constexpr const char* TOPIC_CAMERA_STATUS  = "xentient/camera/status";  // Camera readiness / error

// --- Camera UART frame constants (mirrors contracts.ts) ---
static constexpr uint8_t UART_SYNC_BYTE_1  = 0xAA;  // UART frame sync byte 1
static constexpr uint8_t UART_SYNC_BYTE_2  = 0x55;  // UART frame sync byte 2
static constexpr uint8_t UART_CRC8_POLY    = 0x07;  // CRC-8/ITU polynomial

// --- WS binary prefix bytes (shared AudioServer port discriminator) ---
static constexpr uint8_t CAMERA_WS_PREFIX = 0xCA;  // Camera JPEG frame prefix
static constexpr uint8_t AUDIO_WS_PREFIX  = 0xA0;  // Audio PCM chunk prefix (0xAU in spec notation)

// --- Camera frame constraints ---
static constexpr uint16_t FRAME_ID_MAX      = 65535;  // uint16 wrap
static constexpr uint8_t  UART_CHUNK_MAX_PAYLOAD = 200; // max chunk payload bytes
static constexpr uint32_t CAM_TIMER_INTERVAL_MS  = 3000;  // push every 3s
static constexpr uint32_t CAM_REASSEMBLY_TIMEOUT_MS = 5000; // discard partial frame after 5s

// --- MQTT constraints (per CONTRACTS.md Payload Cap) ---
static constexpr size_t   MQTT_PAYLOAD_CAP   = 3072;  // 3KB hard limit
static constexpr uint8_t  MQTT_RETRY_MAX     = 3;     // exponential: 1s, 2s, 4s
static constexpr uint32_t MQTT_RETRY_BASE_MS = 1000;
static constexpr uint32_t MQTT_RETRY_CAP_MS  = 30000; // cap at 30s per CONTRACTS.md

// --- Telemetry cadence ---
static constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000; // BME280 publish every 5s

// --- Node identity ---
static constexpr const char* MQTT_CLIENT_ID = "xentient-node-01";
static constexpr const char* NODE_BASE_ID   = "node-01";
static constexpr const char* SPACE_ID       = "living-room";

// --- Broker / WiFi (override before flashing) ---
static constexpr const char* MQTT_BROKER_ADDR = "192.168.1.100";
static constexpr uint16_t    MQTT_BROKER_PORT  = 1883;
static constexpr const char* WIFI_SSID         = "your-ssid";
static constexpr const char* WIFI_PASS         = "your-password";

// --- WebSocket harness ---
static constexpr const char* WS_HARNESS_HOST = "192.168.1.100";
static constexpr uint16_t    WS_HARNESS_PORT  = 8765;

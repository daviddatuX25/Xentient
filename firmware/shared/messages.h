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

// --- NodeProfile (mirrors NodeProfile in contracts.ts) ---
// Core compiles a NodeSkill to a NodeProfile and pushes it via MQTT.
// Firmware hot-swaps at end of each work iteration.

typedef struct {
    char     profile_id[32];
    uint16_t pir_interval_ms;
    uint8_t  mic_mode;        // 0=off, 1=vad-only, 2=always-on
    uint16_t bme_interval_ms;
    uint8_t  camera_mode;     // 0=off, 1=on-motion, 2=stream
    uint8_t  lcd_face;        // 0=calm, 1=alert, 2=listening, 3=speaking
    uint16_t event_mask;      // bitmask of EVENT_MASK_* bits
} NodeProfile;

// Event mask bits — must match harness contracts.ts EVENT_MASK_BITS
#define EVENT_MASK_PRESENCE     0x0001
#define EVENT_MASK_MOTION       0x0002
#define EVENT_MASK_ENV          0x0004
#define EVENT_MASK_AUDIO_CHUNK  0x0008
#define EVENT_MASK_VAD          0x0010
#define EVENT_MASK_FRAME        0x0020

// Default profile on boot (safe: PIR presence only, mic off, camera off)
static const NodeProfile DEFAULT_PROFILE = {
    "default",
    1000,   // pir_interval_ms
    0,      // mic_mode: off
    5000,   // bme_interval_ms
    0,      // camera_mode: off
    0,      // lcd_face: calm
    EVENT_MASK_PRESENCE,
};

// --- MQTT topics for NodeProfile hot-swap ---
// NOTE: {nodeId} MUST be resolved at runtime. These are template strings,
// NOT subscribe/publish targets. Use buildNodeTopic() to get the resolved topic.
static constexpr const char* TOPIC_NODE_PROFILE_SET_TPL = "xentient/node/{nodeId}/profile/set";
static constexpr const char* TOPIC_NODE_PROFILE_ACK_TPL = "xentient/node/{nodeId}/profile/ack";
static constexpr const char* TOPIC_NODE_PROFILE_SET_BASE = "xentient/node/";
static constexpr const char* TOPIC_NODE_PROFILE_SET_SUFFIX = "/profile/set";
static constexpr const char* TOPIC_NODE_PROFILE_ACK_SUFFIX = "/profile/ack";

// --- Node birth message (published on first MQTT connect) ---
static constexpr const char* TOPIC_NODE_BIRTH_SUFFIX = "/birth";
// Message: { v:1, type:"node_birth", nodeId:"node-01", timestamp:ms }

// Build a resolved topic string: "xentient/node/<nodeId>/profile/set" or "/ack"
// buf must be at least 64 bytes. Returns pointer to buf.
char* buildNodeTopic(const char* nodeId, const char* suffix, char* buf, size_t bufLen);

// --- Two-task model shared state (critical-section protected) ---
// Task 1 (Work Task, Core 1, high priority): runs activeProfile
// Task 2 (Config Task, Core 0, low priority): receives new profiles via MQTT
//
// profileMux guards the pendingProfile → activeProfile memcpy.
// profileUpdateFlag is set by MQTT callback (any core) and consumed by Config Task.
// lastReceivedProfileId is set by MQTT callback immediately on parse — echoed in ack
// regardless of whether the swap has completed yet.

#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"

extern portMUX_TYPE       profileMux;           // spinlock for critical section
extern volatile NodeProfile activeProfile;
extern volatile NodeProfile pendingProfile;
extern volatile bool       profileUpdateFlag;
extern char               lastReceivedProfileId[32]; // not volatile — only written under profileMux

// --- MQTT constraints (per CONTRACTS.md Payload Cap) ---
static constexpr size_t   MQTT_PAYLOAD_CAP   = 3072;  // 3KB hard limit
static constexpr uint8_t  MQTT_RETRY_MAX     = 3;     // exponential: 1s, 2s, 4s
static constexpr uint32_t MQTT_RETRY_BASE_MS = 1000;
static constexpr uint32_t MQTT_RETRY_CAP_MS  = 30000; // cap at 30s per CONTRACTS.md

// --- Telemetry cadence ---
static constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000; // BME280 publish every 5s

// --- Node identity ---
static constexpr const char* MQTT_CLIENT_ID = "xentient-node-01";

// --- Compile-time defaults (overridden by NVS at runtime) ---
// These serve as fallbacks when NVS is empty (first boot before provisioning).
// Override via build_flags in platformio.ini per environment.
#ifndef MQTT_BROKER_ADDR
  #define MQTT_BROKER_ADDR "10.22.25.106"
#endif
#ifndef MQTT_BROKER_PORT
  #define MQTT_BROKER_PORT 1883
#endif
#ifndef NODE_BASE_ID
  #define NODE_BASE_ID "node-01"
#endif
#ifndef SPACE_ID
  #define SPACE_ID "living-room"
#endif
#ifndef WS_HARNESS_HOST
  #define WS_HARNESS_HOST "10.22.25.106"
#endif
#ifndef WS_HARNESS_PORT
  #define WS_HARNESS_PORT 8080
#endif

// WiFi credentials — only used as compile-time fallback.
// At runtime, WiFiManager handles WiFi connection from NVS.
#ifndef WIFI_SSID
  #define WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASS
  #define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif

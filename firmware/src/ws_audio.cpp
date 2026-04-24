#include <Arduino.h>
#include <WebSocketsClient.h>
#include "ws_audio.h"
#include "messages.h"

static WebSocketsClient s_ws;
static bool s_connected = false;

static void on_ws_event(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            s_connected = true;
            Serial.println("[WS] Connected to harness");
            // Declare audio format so harness can validate expectations
            s_ws.sendTXT("{\"type\":\"audio_format\",\"rate\":16000,\"bits\":16,\"ch\":1}");
            break;
        case WStype_DISCONNECTED:
            s_connected = false;
            Serial.println("[WS] Disconnected — will retry");
            break;
        case WStype_ERROR:
            Serial.printf("[WS] Error len=%u\n", (unsigned)length);
            break;
        default:
            break;
    }
}

void ws_audio_init(const char* host, uint16_t port) {
    s_ws.begin(host, port, "/");
    s_ws.onEvent(on_ws_event);
    s_ws.setReconnectInterval(3000);
    Serial.printf("[WS] Connecting to %s:%u\n", host, port);
}

void ws_audio_loop() { s_ws.loop(); }

// Send audio PCM with 0xA0 prefix per CONTRACTS.md shared WS discriminator.
// Format: [0xA0][pcm S16LE data...]
bool ws_audio_send(const uint8_t* data, size_t length) {
    if (!s_connected) return false;
    // Prepend audio prefix byte
    size_t msgLen = 1 + length;
    uint8_t* msg = (uint8_t*)malloc(msgLen);
    if (!msg) return false;
    msg[0] = AUDIO_WS_PREFIX;  // 0xA0
    memcpy(msg + 1, data, length);
    bool ok = s_ws.sendBIN(msg, msgLen);
    free(msg);
    return ok;
}

// Send raw binary (used by cam_relay for camera frames with 0xCA prefix).
// Does NOT add any prefix — caller must include the discriminator byte.
bool ws_audio_send_raw(const uint8_t* data, size_t length) {
    if (!s_connected) return false;
    return s_ws.sendBIN(data, length);
}

bool ws_audio_connected() { return s_connected; }

#pragma once
#include <cstdint>

// Call once in setup() after WiFi is connected.
void ws_audio_init(const char* host, uint16_t port);

// MUST be called every loop() — handles WS keep-alive and reconnect.
void ws_audio_loop();

// Send audio PCM with 0xA0 prefix (CONTRACTS.md discriminator). Returns false if not connected.
bool ws_audio_send(const uint8_t* data, size_t length);

// Send raw binary without prefix. Used by cam_relay (adds its own 0xCA prefix).
bool ws_audio_send_raw(const uint8_t* data, size_t length);

bool ws_audio_connected();

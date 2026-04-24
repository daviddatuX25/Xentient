#pragma once
#include <cstdint>

// Initialize UART2 for ESP-CAM chunked JPEG reception.
// Call once in setup() after WiFi + ws_audio_init().
void cam_relay_init();

// Call every loop() — reads UART chunks, reassembles, and forwards
// complete JPEG frames over the shared WebSocket.
void cam_relay_loop();

// Stats (for diagnostics)
uint32_t cam_relay_frames_rx();
uint32_t cam_relay_frames_tx();
uint32_t cam_relay_crc_drops();
uint32_t cam_relay_timeout_drops();
uint32_t cam_relay_gap_drops();
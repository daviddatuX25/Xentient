/*
 * val_cam_uart_fwd.cpp — P3-CAM-1 (9v3)
 * ESP-CAM: JPEG capture + UART2 chunked forwarding to Node Base.
 *
 * Captures QQVGA q10 JPEG every 3s, chunks over UART2 using
 * the wire contract from CONTRACTS.md:
 *   [0xAA 0x55][frame_id:u16LE][chunk_idx:u8][chunk_total:u8]
 *   [chunk_len:u16LE][data...][crc8]
 *
 * PlatformIO: pio run -e val_cam_uart_fwd -t upload
 * Monitor:    pio device monitor -e val_cam_uart_fwd
 */

#include <Arduino.h>
#include "esp_camera.h"

// --- ESP32-CAM AI-Thinker pin mapping ---
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// --- UART2 to Node Base ---
// GPIO1/3 are shared with UART0 (USB serial) — can't use both simultaneously.
// Use GPIO2 (TX) and GPIO12 (RX) for UART2 instead.
// Wiring: ESP-CAM GPIO2 → Node Base GPIO16 (RX)
//         ESP-CAM GPIO12 ← Node Base GPIO17 (TX)
#define CAM_UART_NUM      2
#define CAM_TX_PIN         2
#define CAM_RX_PIN         12
#define CAM_BAUD           115200

// --- Wire contract constants (CONTRACTS.md / messages.h) ---
#define UART_SYNC_1       0xAA
#define UART_SYNC_2       0x55
#define CRC8_POLY         0x07
#define UART_CHUNK_MAX     200       // max chunk payload bytes
#define FRAME_INTERVAL_MS  3000      // push every 3s
#define FRAME_ID_WRAP      65535     // uint16 wrap

static HardwareSerial CamSerial(CAM_UART_NUM);
static uint16_t frame_id = 0;
static uint32_t frames_sent = 0;
static uint32_t chunks_sent = 0;
static uint32_t frames_failed = 0;

// --- CRC8/ITU (polynomial 0x07, init 0x00, no final XOR) ---
// Computes CRC-8 over data, with optional initial value for chaining.
static uint8_t crc8_update(uint8_t crc, const uint8_t *data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            if (crc & 0x80)
                crc = (crc << 1) ^ CRC8_POLY;
            else
                crc <<= 1;
        }
    }
    return crc;
}

// --- Send one UART chunk ---
// Format: [0xAA 0x55][frame_id:u16LE][chunk_idx:u8][chunk_total:u8]
//         [chunk_len:u16LE][data...][crc8]
static void send_uart_chunk(uint16_t fid, uint8_t chunk_idx, uint8_t chunk_total,
                            const uint8_t *data, uint16_t data_len) {
    uint8_t header[8];
    header[0] = UART_SYNC_1;
    header[1] = UART_SYNC_2;
    header[2] = fid & 0xFF;
    header[3] = (fid >> 8) & 0xFF;
    header[4] = chunk_idx;
    header[5] = chunk_total;
    header[6] = data_len & 0xFF;
    header[7] = (data_len >> 8) & 0xFF;

    // CRC over header + data (all preceding bytes, per CONTRACTS.md)
    uint8_t crc = crc8_update(0x00, header, 8);
    crc = crc8_update(crc, data, data_len);

    CamSerial.write(header, 8);
    CamSerial.write(data, data_len);
    CamSerial.write(crc);

    chunks_sent++;
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== VAL: CAM UART FWD (9v3) ===");

    // --- UART2 to Node Base ---
    CamSerial.begin(CAM_BAUD, SERIAL_8N1, CAM_RX_PIN, CAM_TX_PIN);
    Serial.printf("[UART2] TX=GPIO%d RX=GPIO%d baud=%u\n", CAM_TX_PIN, CAM_RX_PIN, CAM_BAUD);

    // --- PSRAM check ---
    if (psramFound()) {
        Serial.printf("[PSRAM] Found: %d bytes free\n", ESP.getFreePsram());
    } else {
        Serial.println("[PSRAM] NOT FOUND — JPEG mode requires PSRAM!");
        Serial.println("\n=== VAL FAIL ===");
        return;
    }

    // --- Camera config ---
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format  = PIXFORMAT_JPEG;
    config.frame_size    = FRAMESIZE_QQVGA;   // 160x120
    config.jpeg_quality  = 10;
    config.fb_location   = CAMERA_FB_IN_PSRAM;
    config.fb_count      = 2;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Init FAILED: 0x%x\n", err);
        Serial.println("\n=== VAL FAIL ===");
        return;
    }
    Serial.println("[CAM] Init OK — OV2640 ready");

    // --- Sensor info ---
    sensor_t *s = esp_camera_sensor_get();
    Serial.printf("[CAM] Sensor PID: 0x%x\n", s->id.PID);

    // --- Warm-up: discard 3 frames for auto-exposure ---
    Serial.println("[CAM] Warm-up: discarding 3 frames...");
    for (int i = 0; i < 3; i++) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
        delay(200);
    }

    Serial.println("\n[LOOP] Capturing + sending every 3s over UART2");
    Serial.println("[LOOP] Connect Node Base RX=GPIO16 to see reassembled frames");
    Serial.println("=== VAL READY ===\n");
}

void loop() {
    unsigned long t0 = millis();

    // --- Capture frame ---
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        frames_failed++;
        Serial.printf("[CAM] Capture FAILED (total fails: %u)\n", frames_failed);
        delay(FRAME_INTERVAL_MS);
        return;
    }

    // --- Validate JPEG (must start with FF D8) ---
    if (fb->len < 2 || fb->buf[0] != 0xFF || fb->buf[1] != 0xD8) {
        Serial.printf("[CAM] Invalid JPEG (len=%u, first bytes: %02X %02X)\n",
                      fb->len, fb->len > 0 ? fb->buf[0] : 0, fb->len > 1 ? fb->buf[1] : 0);
        esp_camera_fb_return(fb);
        frames_failed++;
        delay(FRAME_INTERVAL_MS);
        return;
    }

    uint16_t fid = frame_id;
    frame_id = (frame_id + 1) & FRAME_ID_WRAP; // wraps at 65535

    // --- Calculate chunking ---
    uint16_t total_len = (uint16_t)fb->len;
    uint8_t chunk_total = (uint8_t)((total_len + UART_CHUNK_MAX - 1) / UART_CHUNK_MAX);
    if (chunk_total == 0) chunk_total = 1;

    Serial.printf("[CAM] Frame %u: %u bytes → %u chunks\n", fid, total_len, chunk_total);

    // --- Send chunks ---
    uint16_t offset = 0;
    for (uint8_t i = 0; i < chunk_total; i++) {
        uint16_t remaining = total_len - offset;
        uint16_t chunk_len = (remaining > UART_CHUNK_MAX) ? UART_CHUNK_MAX : remaining;

        send_uart_chunk(fid, i, chunk_total, fb->buf + offset, chunk_len);
        offset += chunk_len;

        // Small delay between chunks to avoid UART TX buffer overflow
        delay(1);
    }

    frames_sent++;
    Serial.printf("[CAM] Frame %u sent (%u chunks). Total: %u frames, %u chunks, %u fails\n",
                  fid, chunk_total, frames_sent, chunks_sent, frames_failed);

    esp_camera_fb_return(fb);

    // --- Stats every 30 frames ---
    if (frames_sent % 30 == 0) {
        Serial.printf("\n=== STATS ===\n");
        Serial.printf("  Frames sent:  %u\n", frames_sent);
        Serial.printf("  Chunks sent:  %u\n", chunks_sent);
        Serial.printf("  Frames failed: %u\n", frames_failed);
        Serial.printf("  Free heap:    %u\n", ESP.getFreeHeap());
        Serial.printf("  Free PSRAM:  %u\n", ESP.getFreePsram());
        Serial.printf("=============\n\n");
    }

    // --- Maintain 3s interval (account for capture + send time) ---
    unsigned long elapsed = millis() - t0;
    if (elapsed < FRAME_INTERVAL_MS) {
        delay(FRAME_INTERVAL_MS - elapsed);
    }
}
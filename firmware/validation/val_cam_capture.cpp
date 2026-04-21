/*
 * val_cam_capture.cpp — ESP-CAM smoke test
 * Boot OV2640, capture 1 JPEG to serial, then 10-frame consistency check.
 *
 * PlatformIO: pio run -e val_cam_capture -t upload
 * Monitor:    pio device monitor -e val_cam_capture
 */

#include "esp_camera.h"

// ESP32-CAM AI-Thinker pin mapping
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

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== VAL: CAM CAPTURE ===");

    // --- PSRAM check (JPEG pixel format requires PSRAM) ---
    if (psramFound()) {
        Serial.printf("[PSRAM] Found: %d bytes free\n", ESP.getFreePsram());
    } else {
        Serial.println("[PSRAM] NOT FOUND — JPEG mode requires PSRAM!");
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
    config.fb_location   = CAMERA_PS_RAM;      // Use PSRAM for frame buffer
    config.fb_count      = 1;

    // PSRAM available: 2 frame buffers for better throughput
    if (psramFound()) {
        config.fb_count     = 2;
        config.jpeg_quality = 10;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Init FAILED: 0x%x\n", err);
        return;
    }
    Serial.println("[CAM] Init OK — OV2640 ready");

    // --- Sensor info ---
    sensor_t *s = esp_camera_sensor_get();
    Serial.printf("[CAM] Sensor PID: 0x%x\n", s->id.PID);

    // --- Single capture + hex dump ---
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[CAM] Capture FAILED — null frame buffer");
        return;
    }

    Serial.printf("[CAM] Frame: %u x %u, len=%u bytes, format=%d\n",
                  fb->width, fb->height, fb->len, fb->format);

    // Hex dump first 64 bytes (JPEG starts with FF D8 FF)
    Serial.print("[CAM] Hex dump (first 64): ");
    for (int i = 0; i < 64 && i < (int)fb->len; i++) {
        Serial.printf("%02X ", fb->buf[i]);
    }
    Serial.println();

    esp_camera_fb_return(fb);
    Serial.println("[CAM] Frame buffer freed OK");

    // --- 10-frame consistency test ---
    Serial.println("\n--- 10 Frame Consistency Test ---");
    uint32_t sizes[10];
    uint32_t minSize  = UINT32_MAX;
    uint32_t maxSize  = 0;
    uint32_t totalSize = 0;
    int      okFrames = 0;

    for (int i = 0; i < 10; i++) {
        fb = esp_camera_fb_get();
        if (!fb) {
            Serial.printf("[CAM] Frame %2d FAILED\n", i);
            sizes[i] = 0;
            continue;
        }
        sizes[i] = fb->len;
        if (fb->len < minSize) minSize = fb->len;
        if (fb->len > maxSize) maxSize = fb->len;
        totalSize += fb->len;
        okFrames++;
        Serial.printf("[CAM] Frame %2d: %u bytes\n", i, fb->len);
        esp_camera_fb_return(fb);
        delay(100);
    }

    if (okFrames == 0) {
        Serial.println("[CAM] FAIL — no frames captured");
        Serial.println("\n=== VAL COMPLETE ===");
        return;
    }

    uint32_t avgSize = totalSize / okFrames;
    Serial.printf("\n[CAM] Stats: min=%u max=%u avg=%u (%d/%d ok)\n",
                  minSize, maxSize, avgSize, okFrames, 10);
    Serial.printf("[CAM] Expected QQVGA q10: 3000-5000 bytes\n");

    if (minSize >= 3000 && maxSize <= 10000) {
        Serial.println("[CAM] PASS — Frame sizes in expected range");
    } else {
        Serial.println("[CAM] WARN — Frame sizes outside expected QQVGA q10 range");
    }

    Serial.println("\n=== VAL COMPLETE ===");
}

void loop() {
    delay(5000);
}
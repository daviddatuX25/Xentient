/*
 * val_cam_stress.cpp — P3-CAM-0.6 Bandwidth stress test
 * Captures 50+ frames against high-entropy scenes, reports size distribution.
 * Validates that QQVGA q10 frames fit within 10KB UART budget (115200 baud × 3s).
 *
 * PlatformIO: pio run -e val_cam_stress -t upload
 * Monitor:    pio device monitor -e val_cam_stress
 *
 * Point camera at: printed text, textured walls, complex patterns, book pages.
 * Avoid: plain white wall, lens cap (those give artificially small frames).
 */

#include <Arduino.h>
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

#define NUM_FRAMES 50
#define UART_BUDGET_BYTES 10240  // 10KB safe threshold for 115200 baud × 3s

// Sorting helper for percentile calculation
static void sort_uint32(uint32_t *arr, int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[i]) {
                uint32_t tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
        }
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== VAL: CAM STRESS TEST (99z) ===");
    Serial.printf("[CFG] Frames: %d | Quality: 10 | Size: QQVGA 160x120\n", NUM_FRAMES);
    Serial.printf("[CFG] UART budget: %d bytes (115200 baud x 3s)\n", UART_BUDGET_BYTES);

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
    config.frame_size    = FRAMESIZE_QQVGA;
    config.jpeg_quality  = 10;
    config.fb_location   = CAMERA_FB_IN_PSRAM;
    config.fb_count      = 2;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Init FAILED: 0x%x\n", err);
        Serial.println("\n=== VAL FAIL ===");
        return;
    }
    Serial.println("[CAM] Init OK");

    // Warm-up: discard first 3 frames (camera auto-exposure settling)
    Serial.println("[WARMUP] Discarding 3 frames for auto-exposure...");
    for (int i = 0; i < 3; i++) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
        delay(200);
    }

    // --- Stress test: capture NUM_FRAMES ---
    Serial.printf("\n[CAPTURE] Starting %d-frame stress test...\n", NUM_FRAMES);
    Serial.println("[CAPTURE] Point camera at high-entropy scene (text, patterns, details)");

    uint32_t sizes[NUM_FRAMES];
    int okFrames = 0;
    int overBudget = 0;
    uint32_t minSize  = UINT32_MAX;
    uint32_t maxSize  = 0;
    uint32_t totalSize = 0;
    uint32_t startTime = millis();

    for (int i = 0; i < NUM_FRAMES; i++) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            Serial.printf("[CAPTURE] Frame %2d FAILED (null)\n", i);
            sizes[i] = 0;
            continue;
        }
        sizes[i] = fb->len;
        if (fb->len > 0) {
            okFrames++;
            if (fb->len < minSize) minSize = fb->len;
            if (fb->len > maxSize) maxSize = fb->len;
            totalSize += fb->len;
            if (fb->len > UART_BUDGET_BYTES) overBudget++;
        }
        Serial.printf("[CAPTURE] Frame %2d: %u bytes%s\n", i, fb->len,
                      fb->len > UART_BUDGET_BYTES ? " *** OVER BUDGET ***" : "");
        esp_camera_fb_return(fb);
        delay(100);
    }

    uint32_t elapsed = millis() - startTime;

    if (okFrames == 0) {
        Serial.println("[RESULT] FAIL — no frames captured");
        Serial.println("\n=== VAL FAIL ===");
        return;
    }

    // --- Statistics ---
    uint32_t avgSize = totalSize / okFrames;

    // Sort for percentiles (only the successful frames)
    uint32_t sorted[NUM_FRAMES];
    int sortedCount = 0;
    for (int i = 0; i < NUM_FRAMES; i++) {
        if (sizes[i] > 0) sorted[sortedCount++] = sizes[i];
    }
    sort_uint32(sorted, sortedCount);

    uint32_t p50  = sorted[sortedCount * 50 / 100];
    uint32_t p90  = sorted[sortedCount * 90 / 100];
    uint32_t p95  = sorted[sortedCount * 95 / 100];
    uint32_t p99  = sorted[sortedCount * 99 / 100];

    Serial.println("\n--- STRESS TEST RESULTS ---");
    Serial.printf("[RESULT] Frames captured: %d/%d (took %lu ms)\n", okFrames, NUM_FRAMES, elapsed);
    Serial.printf("[RESULT] Min:  %u bytes\n", minSize);
    Serial.printf("[RESULT] Max:  %u bytes\n", maxSize);
    Serial.printf("[RESULT] Avg:  %u bytes\n", avgSize);
    Serial.printf("[RESULT] P50:  %u bytes\n", p50);
    Serial.printf("[RESULT] P90:  %u bytes\n", p90);
    Serial.printf("[RESULT] P95:  %u bytes\n", p95);
    Serial.printf("[RESULT] P99:  %u bytes\n", p99);
    Serial.printf("[RESULT] Over budget (>10KB): %d frames\n", overBudget);
    Serial.printf("[RESULT] Avg frame time: %lu ms\n", elapsed / okFrames);

    // --- Verdict ---
    Serial.println("\n--- VERDICT ---");
    if (p95 <= UART_BUDGET_BYTES) {
        Serial.printf("[PASS] P95 (%u) within UART budget (%u) — QQVGA q10 safe at 115200 baud\n",
                      p95, UART_BUDGET_BYTES);
    } else {
        Serial.printf("[FAIL] P95 (%u) EXCEEDS UART budget (%u) — need lower quality or smaller frame\n",
                      p95, UART_BUDGET_BYTES);
        Serial.println("[FAIL] Options: reduce jpeg_quality (higher number = smaller), or reduce frame size");
    }

    if (overBudget > 0) {
        Serial.printf("[WARN] %d frames exceeded 10KB budget — high-entropy scenes may need quality adjustment\n", overBudget);
    }

    Serial.println("\n=== VAL COMPLETE ===");
}

void loop() {
    delay(5000);
}
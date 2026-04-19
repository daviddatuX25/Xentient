// BB-I2S Step 2: I2S mic capture + RMS print
// INMP441 on I2S_NUM_0: BCLK=26, LRCK=25, SD=35
// Prints RMS every 500ms. Speak into mic to see values jump.
// Validates: BCLK/LRCK timing, GPIO35 input, >>16 bit-shift.

#include <Arduino.h>
#include <driver/i2s.h>

static constexpr int PIN_BCLK  = 26;
static constexpr int PIN_LRCK  = 25;
static constexpr int PIN_MIC_SD = 35;

static constexpr int SAMPLE_RATE    = 16000;
static constexpr int CHUNK_SAMPLES  = 512;

static constexpr i2s_port_t MIC_PORT = I2S_NUM_0;

static int32_t s_dma[CHUNK_SAMPLES];
static int16_t s_pcm[CHUNK_SAMPLES];

static float compute_rms(const int16_t* data, size_t n) {
    double sum = 0;
    for (size_t i = 0; i < n; i++) {
        double v = (double)data[i] / 32768.0;
        sum += v * v;
    }
    return (float)sqrt(sum / n);
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[I2S] Mic Read Test — Xentient 1xi Step 2");

    const i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = 4,
        .dma_buf_len          = CHUNK_SAMPLES,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0,
    };
    const i2s_pin_config_t pins = {
        .bck_io_num   = PIN_BCLK,
        .ws_io_num    = PIN_LRCK,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num  = PIN_MIC_SD,
    };

    esp_err_t err = i2s_driver_install(MIC_PORT, &cfg, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[I2S] Driver install FAILED: 0x%X\n", err);
        return;
    }
    i2s_set_pin(MIC_PORT, &pins);
    i2s_zero_dma_buffer(MIC_PORT);
    Serial.println("[I2S] Driver installed. Speak into mic...");

    // Print raw DMA sample for bit-shift calibration
    size_t bytes = 0;
    i2s_read(MIC_PORT, s_dma, CHUNK_SAMPLES * sizeof(int32_t), &bytes, pdMS_TO_TICKS(2000));
    Serial.println("[I2S] Raw 32-bit samples (first 8):");
    for (int i = 0; i < 8; i++) {
        Serial.printf("  [%d] 0x%08lX  >>16=%d  >>8=%d\n",
                      i,
                      (unsigned long)s_dma[i],
                      (int16_t)(s_dma[i] >> 16),
                      (int16_t)(s_dma[i] >> 8));
    }
}

void loop() {
    size_t bytes = 0;
    esp_err_t err = i2s_read(MIC_PORT, s_dma, CHUNK_SAMPLES * sizeof(int32_t),
                             &bytes, pdMS_TO_TICKS(100));
    if (err != ESP_OK || bytes < CHUNK_SAMPLES * sizeof(int32_t)) {
        Serial.println("[I2S] Read timeout/error");
        delay(500);
        return;
    }

    for (size_t i = 0; i < CHUNK_SAMPLES; i++) {
        s_pcm[i] = (int16_t)(s_dma[i] >> 16);
    }

    float rms = compute_rms(s_pcm, CHUNK_SAMPLES);
    int peak = 0;
    for (size_t i = 0; i < CHUNK_SAMPLES; i++) {
        int a = abs(s_pcm[i]);
        if (a > peak) peak = a;
    }

    static uint32_t count = 0;
    if (count++ % 2 == 0) {  // print every ~64ms ×2 = ~128ms
        Serial.printf("[I2S] RMS=%.4f  peak=%d\n", rms, peak);
    }
}
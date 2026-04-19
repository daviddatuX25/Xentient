// BB-I2S Step 2: I2S mic capture + RMS print (stereo diagnostic)
// INMP441 on I2S_NUM_0: BCLK=26, LRCK=25, SD=35
// Tests BOTH left and right channels to find where mic data lands.
// If L/R=GND → left channel; if L/R=VDD → right channel.
// Prints raw hex, both channels, and RMS every ~200ms.

#include <Arduino.h>
#include <driver/i2s.h>

static constexpr int PIN_BCLK   = 26;
static constexpr int PIN_LRCK   = 25;
static constexpr int PIN_MIC_SD = 35;

static constexpr int SAMPLE_RATE   = 16000;
static constexpr int CHUNK_SAMPLES = 256;  // stereo frames
static constexpr int DMA_BUF_COUNT = 6;
static constexpr int DMA_BUF_LEN   = 256;

static constexpr i2s_port_t MIC_PORT = I2S_NUM_0;

// Stereo: each frame = 2 × int32_t (left + right)
static int32_t s_dma[CHUNK_SAMPLES * 2];

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
    Serial.println("\n[I2S] Mic Read Test v2 (stereo diag) — Xentient 1xi");
    Serial.printf("[I2S] Pins: BCLK=%d  LRCK=%d  SD=%d\n", PIN_BCLK, PIN_LRCK, PIN_MIC_SD);

    const i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT,  // stereo — read both
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = DMA_BUF_COUNT,
        .dma_buf_len          = DMA_BUF_LEN,
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
    Serial.println("[I2S] Driver installed (stereo mode). Speak into mic...");

    // Discard first few reads (warm-up)
    size_t bytes = 0;
    for (int i = 0; i < 3; i++) {
        i2s_read(MIC_PORT, s_dma, sizeof(s_dma), &bytes, pdMS_TO_TICKS(1000));
    }

    // Diagnostic: print raw stereo frames
    i2s_read(MIC_PORT, s_dma, CHUNK_SAMPLES * 2 * sizeof(int32_t), &bytes, pdMS_TO_TICKS(2000));
    Serial.println("[I2S] Raw stereo frames (first 8 frames):");
    Serial.println("  idx  LEFT_32bit        >>16_L   RIGHT_32bit       >>16_R");
    for (int i = 0; i < 8; i++) {
        int32_t left  = s_dma[i * 2];
        int32_t right = s_dma[i * 2 + 1];
        Serial.printf("  [%d] 0x%08lX  %7d   0x%08lX  %7d\n",
                      i,
                      (unsigned long)left,  (int16_t)(left  >> 16),
                      (unsigned long)right, (int16_t)(right >> 16));
    }
    Serial.println("[I2S] --- Continuous RMS output (L/R) ---");
}

void loop() {
    size_t bytes = 0;
    esp_err_t err = i2s_read(MIC_PORT, s_dma, CHUNK_SAMPLES * 2 * sizeof(int32_t),
                             &bytes, pdMS_TO_TICKS(200));
    if (err != ESP_OK || bytes == 0) {
        Serial.println("[I2S] Read timeout/error");
        delay(300);
        return;
    }

    int frames = bytes / (2 * sizeof(int32_t));
    if (frames > CHUNK_SAMPLES) frames = CHUNK_SAMPLES;

    int16_t left_pcm[CHUNK_SAMPLES];
    int16_t right_pcm[CHUNK_SAMPLES];
    int peak_l = 0, peak_r = 0;

    for (int i = 0; i < frames; i++) {
        left_pcm[i]  = (int16_t)(s_dma[i * 2]     >> 16);
        right_pcm[i] = (int16_t)(s_dma[i * 2 + 1] >> 16);
        int al = abs(left_pcm[i]);
        int ar = abs(right_pcm[i]);
        if (al > peak_l) peak_l = al;
        if (ar > peak_r) peak_r = ar;
    }

    float rms_l = compute_rms(left_pcm, frames);
    float rms_r = compute_rms(right_pcm, frames);

    static uint32_t count = 0;
    if (count++ % 5 == 0) {
        Serial.printf("[I2S] L: rms=%.4f pk=%-6d  R: rms=%.4f pk=%-6d\n", rms_l, peak_l, rms_r, peak_r);
    }
}
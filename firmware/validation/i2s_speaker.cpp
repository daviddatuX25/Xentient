// BB-I2S Speaker: MAX98357A amp output validation
// I2S_NUM_0 TX: BCLK=26, LRCK=25, DIN=27
// Plays 440Hz sine tone at 16kHz, 16-bit stereo
// PASS: 440Hz tone audible from speaker, no DMA errors
// Wiring check: AMP VIN=5V, GND=GND, DIN=27, BCLK=26, LRC=25
//               GAIN pin floating (9dB default), SD pin floating or 3.3V

#include <Arduino.h>
#include <driver/i2s.h>
#include <math.h>

static constexpr int PIN_BCLK    = 26;
static constexpr int PIN_LRCK    = 25;
static constexpr int PIN_AMP_DIN = 27;

static constexpr int SAMPLE_RATE = 16000;
static constexpr int TONE_HZ     = 440;
static constexpr int AMPLITUDE   = 16000;  // ~50% of int16_t max — safe for speaker test
static constexpr int CHUNK       = 256;    // frames per write

static constexpr i2s_port_t AMP_PORT = I2S_NUM_0;

static int16_t s_buf[CHUNK * 2];  // stereo interleaved: [L0,R0, L1,R1, ...]
static float   s_phase     = 0.0f;
static const float PHASE_INC = 2.0f * (float)M_PI * TONE_HZ / SAMPLE_RATE;

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[SPK] MAX98357A Speaker Test — Xentient");
    Serial.printf("[SPK] Pins: BCLK=%d  LRCK=%d  DIN=%d\n", PIN_BCLK, PIN_LRCK, PIN_AMP_DIN);
    Serial.printf("[SPK] Tone: %dHz  SR=%d  Amplitude=%d\n", TONE_HZ, SAMPLE_RATE, AMPLITUDE);

    const i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
        .sample_rate          = SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = 6,
        .dma_buf_len          = 256,
        .use_apll             = false,
        .tx_desc_auto_clear   = true,  // output silence on underrun, not noise
        .fixed_mclk           = 0,
    };
    const i2s_pin_config_t pins = {
        .bck_io_num   = PIN_BCLK,
        .ws_io_num    = PIN_LRCK,
        .data_out_num = PIN_AMP_DIN,
        .data_in_num  = I2S_PIN_NO_CHANGE,
    };

    esp_err_t err = i2s_driver_install(AMP_PORT, &cfg, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[SPK] FAIL driver install: 0x%X — check wiring\n", err);
        while (true) delay(1000);
    }
    i2s_set_pin(AMP_PORT, &pins);
    i2s_zero_dma_buffer(AMP_PORT);
    Serial.println("[SPK] Driver OK. You should hear a 440Hz tone (A4).");
    Serial.println("[SPK] If silent: check SD pin (float or 3.3V), VIN=5V, wiring.");
}

void loop() {
    for (int i = 0; i < CHUNK; i++) {
        int16_t sample       = (int16_t)(AMPLITUDE * sinf(s_phase));
        s_buf[i * 2]     = sample;  // left
        s_buf[i * 2 + 1] = sample;  // right
        s_phase += PHASE_INC;
        if (s_phase >= 2.0f * (float)M_PI) s_phase -= 2.0f * (float)M_PI;
    }

    size_t written = 0;
    esp_err_t err = i2s_write(AMP_PORT, s_buf, sizeof(s_buf), &written, pdMS_TO_TICKS(100));

    static uint32_t chunks = 0;
    static uint32_t last_ms = 0;
    chunks++;
    uint32_t now = millis();
    if (now - last_ms >= 2000) {
        last_ms = now;
        if (err == ESP_OK) {
            Serial.printf("[SPK] RUNNING — chunks=%lu  written=%u B\n", chunks, written);
        } else {
            Serial.printf("[SPK] ERROR 0x%X — chunks=%lu\n", err, chunks);
        }
    }
}

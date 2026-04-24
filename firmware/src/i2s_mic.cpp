#include <Arduino.h>
#include <driver/i2s.h>
#include "i2s_mic.h"
#include "pins.h"

static constexpr i2s_port_t MIC_PORT = I2S_NUM_0;

// Raw 32-bit DMA read buffer. Static to avoid stack allocation on every call.
static int32_t s_dma_buf[I2S_MIC_CHUNK_SAMPLES];

void i2s_mic_init() {
    const i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = I2S_MIC_SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 requires 32-bit frames
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT, // L/R pin tied GND = LEFT channel
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = 4,
        .dma_buf_len          = I2S_MIC_CHUNK_SAMPLES,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0,
    };
    const i2s_pin_config_t pins = {
        .bck_io_num   = PIN_I2S_BCLK,
        .ws_io_num    = PIN_I2S_LRCK,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num  = PIN_MIC_SD,
    };
    i2s_driver_install(MIC_PORT, &cfg, 0, NULL);
    i2s_set_pin(MIC_PORT, &pins);
    i2s_zero_dma_buffer(MIC_PORT);
    Serial.println("[I2S] Mic driver installed (I2S_NUM_0, 16kHz, 32-bit frames)");
}

bool i2s_mic_read(int16_t* out, size_t samples) {
    size_t bytes_read = 0;
    const esp_err_t err = i2s_read(MIC_PORT,
                                   s_dma_buf,
                                   samples * sizeof(int32_t),
                                   &bytes_read,
                                   pdMS_TO_TICKS(100));
    if (err != ESP_OK || bytes_read < samples * sizeof(int32_t)) return false;

    // INMP441: audio is MSB-justified in 32-bit frame (bits 31..8 = 24-bit audio).
    // Right-shift 16 extracts the top 16 bits as signed int16_t PCM.
    // Validate this shift value on breadboard (HARDWARE flag: R1).
    for (size_t i = 0; i < samples; i++) {
        out[i] = (int16_t)(s_dma_buf[i] >> 16);
    }
    return true;
}

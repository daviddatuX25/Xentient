#pragma once
#include <cstdint>

static constexpr int    I2S_MIC_SAMPLE_RATE   = 16000;
static constexpr int    I2S_MIC_CHUNK_SAMPLES = 512;  // 32ms per chunk @ 16kHz
static constexpr size_t I2S_MIC_CHUNK_BYTES   = I2S_MIC_CHUNK_SAMPLES * sizeof(int16_t);

// Call once in setup() after WiFi is up.
void i2s_mic_init();

// Fill `out` with CHUNK_SAMPLES int16_t S16LE PCM samples.
// Blocks up to 100ms waiting for DMA. Returns false on timeout or driver error.
bool i2s_mic_read(int16_t* out, size_t samples);

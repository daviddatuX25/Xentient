#pragma once
#include <cstdint>

// Hysteresis thresholds (16-bit PCM RMS). Calibrate on breadboard.
// Enter threshold intentionally higher than exit to prevent chatter on ambient noise.
static constexpr float VAD_ENTER_RMS = 1000.0f;
static constexpr float VAD_EXIT_RMS  =  600.0f;

struct VadResult {
    bool  active;       // current state after processing this chunk
    bool  transitioned; // true if state flipped (enter or exit)
    float rms;          // last RMS value (useful for threshold tuning via Serial)
};

void      vad_init();
VadResult vad_process(const int16_t* samples, size_t count);

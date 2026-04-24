#include <cmath>
#include "vad.h"

static bool s_active = false;

void vad_init() { s_active = false; }

VadResult vad_process(const int16_t* samples, size_t count) {
    float sum = 0.0f;
    for (size_t i = 0; i < count; i++) {
        const float s = (float)samples[i];
        sum += s * s;
    }
    const float rms = sqrtf(sum / (float)count);

    const bool prev = s_active;
    if (!s_active && rms > VAD_ENTER_RMS) s_active = true;
    if (s_active  && rms < VAD_EXIT_RMS)  s_active = false;

    return { s_active, s_active != prev, rms };
}

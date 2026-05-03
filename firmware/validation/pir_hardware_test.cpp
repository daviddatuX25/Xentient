// BB-PIR Hardware Test: Comprehensive PIR sensor validation
// PIR OUT -> GPIO13 (PIN_PIR_INT)
// Steps: Pin continuity, raw read, interrupt, sensitivity/range,
//        timing characteristics, ambient noise
// PASS criteria documented in docs/VALIDATION-PIR-<date>.md

#include <Arduino.h>

// ── Configuration ──────────────────────────────────────────────
static constexpr int PIN_PIR = 13;           // PIR OUT → GPIO13

static constexpr unsigned long WARMUP_MS       = 20000;  // PIR warmup (AM312 ~2s, HC-SR501 ~20s)
static constexpr unsigned long STEP2_DURATION  = 10000;  // raw read test duration
static constexpr unsigned long STEP3_DURATION  = 30000;  // interrupt test duration
static constexpr unsigned long STEP5_DURATION  = 15000;  // timing measurement window
static constexpr unsigned long STEP6_DURATION  = 10000;  // ambient noise test duration
static constexpr int           STEP2_INTERVAL  = 100;    // poll interval ms
static constexpr int           STEP6_INTERVAL  = 50;     // noise poll interval ms

// ── Step tracking ──────────────────────────────────────────────
static constexpr int STEP_PIN_CHECK    = 1;
static constexpr int STEP_RAW_READ     = 2;
static constexpr int STEP_INTERRUPT    = 3;
static constexpr int STEP_SENSITIVITY  = 4;
static constexpr int STEP_TIMING       = 5;
static constexpr int STEP_AMBIENT      = 6;
static constexpr int STEP_DONE         = 7;

static int  s_step       = STEP_PIN_CHECK;
static bool s_step_ready = true;  // true = waiting for user to proceed

// ── Interrupt state ────────────────────────────────────────────
static volatile bool     s_motion_flag     = false;
static volatile unsigned long s_trigger_ms = 0;
static volatile int      s_interrupt_count  = 0;

void IRAM_ATTR pirISR() {
    unsigned long now = millis();
    s_interrupt_count++;
    // Debounce: only set flag if >200ms since last trigger
    if (now - s_trigger_ms > 200) {
        s_motion_flag = true;
    }
    s_trigger_ms = now;
}

// ── Timing state ───────────────────────────────────────────────
static unsigned long s_rise_ms   = 0;    // when pin went HIGH
static unsigned long s_fall_ms    = 0;    // when pin went LOW
static bool          s_pin_high   = false;
static bool          s_got_rise   = false;
static bool          s_got_fall   = false;
static int           s_hold_count = 0;
static unsigned long s_hold_samples[20];  // store up to 20 hold durations

// ── Step 1: Pin continuity check ───────────────────────────────
void stepPinCheck() {
    Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("STEP 1: Pin Continuity Check");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("Check the following with your multimeter:");
    Serial.println("  1. PIR VCC → 3.3V rail (AM312) or 5V (HC-SR501)");
    Serial.println("  2. PIR GND → ESP32 GND");
    Serial.println("  3. PIR OUT → GPIO13");
    Serial.println("  4. Measure PIR OUT voltage: idle=~0V, triggered=~3.3V");
    Serial.println();

    // Read pin state both with pull-up and without
    pinMode(PIN_PIR, INPUT_PULLUP);
    delay(10);
    int val_pu = digitalRead(PIN_PIR);
    pinMode(PIN_PIR, INPUT);
    delay(10);
    int val_raw = digitalRead(PIN_PIR);
    // 4x rapid reads to check for noise
    int r0 = digitalRead(PIN_PIR);
    int r1 = digitalRead(PIN_PIR);
    int r2 = digitalRead(PIN_PIR);
    int r3 = digitalRead(PIN_PIR);

    Serial.printf("Pin states (no motion expected):\n");
    Serial.printf("  INPUT_PULLUP: %s\n", val_pu ? "HIGH" : "LOW");
    Serial.printf("  INPUT (raw):  %s\n", val_raw ? "HIGH" : "LOW");
    Serial.printf("  4x rapid:     %d%d%d%d\n", r0, r1, r2, r3);
    bool noisy = (val_raw != r0 || r0 != r1 || r1 != r2 || r2 != r3);
    if (noisy) {
        Serial.println("  ⚠ NOISE detected on pin! Check wiring/ground.");
    } else {
        Serial.println("  ✓ Pin reads are stable.");
    }

    if (val_pu == HIGH && val_raw == HIGH) {
        Serial.println("  ⚠ Pin is HIGH at idle — PIR may be in warmup or wiring issue.");
    } else if (val_pu == LOW && val_raw == LOW) {
        Serial.println("  ✓ Pin is LOW at idle — expected for PIR at rest.");
    }

    Serial.println("\n[?] Identify your PIR module:");
    Serial.println("    AM312  — small white dome, no potentiometers, 3.3V");
    Serial.println("    HC-SR501 — larger board, 2 potentiometers + jumper, 5V");
    Serial.println("    Type your module name and press Enter, or just press Enter to continue.");
    s_step = STEP_RAW_READ;
}

// ── Step 2: Raw digital read test ───────────────────────────────
void stepRawRead() {
    Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("STEP 2: Raw Digital Read Test (10 seconds)");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("Wave your hand in front of the PIR dome now!");
    Serial.println("Watching GPIO13 for LOW→HIGH transitions...\n");

    pinMode(PIN_PIR, INPUT_PULLUP);
    int last_state = digitalRead(PIN_PIR);
    int transitions = 0;
    unsigned long start = millis();
    unsigned long first_high_ms = 0;
    unsigned long last_high_ms = 0;
    bool saw_high = false;

    while (millis() - start < STEP2_DURATION) {
        int cur = digitalRead(PIN_PIR);
        unsigned long now = millis();
        if (cur != last_state) {
            transitions++;
            if (cur == HIGH) {
                if (!saw_high) first_high_ms = now;
                last_high_ms = now;
                saw_high = true;
            }
            Serial.printf("  [%5lu ms] GPIO13: %s → %s\n",
                          now - start,
                          last_state == HIGH ? "HIGH" : "LOW",
                          cur == HIGH ? "HIGH" : "LOW");
            last_state = cur;
        }
        delay(STEP2_INTERVAL);
    }

    Serial.println("\n── Step 2 Results ──");
    Serial.printf("  Transitions: %d\n", transitions);
    Serial.printf("  Saw HIGH:    %s\n", saw_high ? "YES ✓" : "NO ✗");
    if (saw_high) {
        Serial.printf("  First HIGH:  %lu ms after start\n", first_high_ms - start);
        Serial.printf("  Last HIGH:   %lu ms after start\n", last_high_ms - start);
    }

    if (saw_high && transitions >= 2) {
        Serial.println("  ✓ PASS: Pin transitions LOW→HIGH on motion.");
    } else if (!saw_high) {
        Serial.println("  ✗ FAIL: No HIGH detected. Check PIR module and wiring.");
    } else {
        Serial.println("  ⚠ Only 1 transition. PIR may need more motion or warmup.");
    }
    s_step = STEP_INTERRUPT;
}

// ── Step 3: Interrupt validation ────────────────────────────────
void stepInterrupt() {
    Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("STEP 3: Interrupt Validation (60 seconds)");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("Phase A: 30s — WALK AROUND in front of PIR");
    Serial.println("Phase B: 30s — SIT COMPLETELY STILL");
    Serial.println();

    pinMode(PIN_PIR, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_PIR), pirISR, RISING);

    // ── Phase A: motion ──
    Serial.println("── Phase A: Walk in front of PIR (30s) ──");
    s_interrupt_count = 0;
    s_motion_flag = false;
    unsigned long start_a = millis();
    int last_report_a = 0;
    while (millis() - start_a < STEP3_DURATION) {
        if (s_motion_flag) {
            s_motion_flag = false;
            Serial.printf("  [MOTION] ISR trigger at %lu ms (count=%d)\n",
                          s_trigger_ms, s_interrupt_count);
        }
        if ((int)((millis() - start_a) / 5000) > last_report_a) {
            last_report_a++;
            Serial.printf("  ... Phase A: %lus elapsed, interrupts=%d\n",
                          (millis() - start_a) / 1000, s_interrupt_count);
        }
        delay(50);
    }
    int motion_count = s_interrupt_count;

    // ── Phase B: stillness ──
    Serial.println("\n── Phase B: Sit still (30s) ──");
    s_interrupt_count = 0;
    s_motion_flag = false;
    unsigned long start_b = millis();
    while (millis() - start_b < STEP3_DURATION) {
        if (s_motion_flag) {
            s_motion_flag = false;
            Serial.printf("  [FALSE?] ISR trigger at %lu ms (count=%d)\n",
                          s_trigger_ms, s_interrupt_count);
        }
        delay(50);
    }
    int still_count = s_interrupt_count;

    detachInterrupt(digitalPinToInterrupt(PIN_PIR));

    Serial.println("\n── Step 3 Results ──");
    Serial.printf("  Phase A (motion):    %d interrupts\n", motion_count);
    Serial.printf("  Phase B (stillness): %d interrupts\n", still_count);

    if (motion_count >= 3 && still_count <= 2) {
        Serial.println("  ✓ PASS: Interrupt fires on motion, low false triggers.");
    } else if (motion_count == 0) {
        Serial.println("  ✗ FAIL: No interrupts during motion. Check ISR/pin.");
    } else if (still_count > 2) {
        Serial.println("  ⚠ WARN: False triggers during stillness. Check PIR placement.");
    }
    s_step = STEP_SENSITIVITY;
}

// ── Step 4: Sensitivity & Range (manual) ───────────────────────
void stepSensitivity() {
    Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("STEP 4: Sensitivity & Range Calibration");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("MANUAL TEST — perform these and record results:");
    Serial.println();
    Serial.println("  A) Walk toward PIR from 5m away.");
    Serial.println("     → At what distance does it first trigger?");
    Serial.println();
    Serial.println("  B) Walk slowly from 1m.");
    Serial.println("     → Does it detect slow motion?");
    Serial.println();
    Serial.println("  C) Walk in a semicircle at 2m radius.");
    Serial.println("     → What is the effective detection angle?");
    Serial.println();
    Serial.println("  Record your observations. Press Enter to continue.");
    // This step is manual — user reads serial and records observations.
    // The sketch waits for serial input to proceed.
    s_step = STEP_TIMING;
}

// ── Step 5: Timing characteristics ─────────────────────────────
void stepTiming() {
    Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("STEP 5: Timing Characteristics (15s)");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("Trigger PIR once, then stay still.");
    Serial.println("Measuring HIGH hold duration and re-trigger cooldown.\n");

    pinMode(PIN_PIR, INPUT_PULLUP);
    s_hold_count = 0;
    s_got_rise = false;
    s_got_fall = false;
    s_pin_high = false;

    unsigned long start = millis();
    int last_state = digitalRead(PIN_PIR);

    while (millis() - start < STEP5_DURATION) {
        int cur = digitalRead(PIN_PIR);
        unsigned long now = millis();

        if (cur == HIGH && last_state == LOW && !s_pin_high) {
            // Rising edge
            s_rise_ms = now;
            s_pin_high = true;
            s_got_rise = true;
            Serial.printf("  ↑ RISE at %lu ms\n", now - start);
        } else if (cur == LOW && last_state == HIGH && s_pin_high) {
            // Falling edge
            s_fall_ms = now;
            unsigned long hold = s_fall_ms - s_rise_ms;
            if (s_hold_count < 20) {
                s_hold_samples[s_hold_count] = hold;
            }
            s_hold_count++;
            s_pin_high = false;
            s_got_fall = true;
            Serial.printf("  ↓ FALL at %lu ms (hold=%lu ms)\n", now - start, hold);
        }
        last_state = cur;
        delay(5);  // fast poll for timing accuracy
    }

    Serial.println("\n── Step 5 Results ──");
    if (s_hold_count > 0) {
        Serial.printf("  Hold durations measured: %d\n", s_hold_count);
        for (int i = 0; i < s_hold_count && i < 20; i++) {
            Serial.printf("    Sample %d: %lu ms\n", i + 1, s_hold_samples[i]);
        }
        // Compute average
        unsigned long sum = 0;
        for (int i = 0; i < s_hold_count && i < 20; i++) {
            sum += s_hold_samples[i];
        }
        Serial.printf("  Average hold time: %lu ms\n", sum / s_hold_count);

        // Check pass criteria: 2-5 seconds (2000-5000ms)
        unsigned long avg = sum / s_hold_count;
        if (avg >= 2000 && avg <= 5000) {
            Serial.println("  ✓ PASS: Hold time within 2-5 second range.");
        } else if (avg < 2000) {
            Serial.println("  ⚠ Hold time <2s — adjust potentiometer (HC-SR501) or check module.");
        } else {
            Serial.println("  ⚠ Hold time >5s — may need adjustment for responsive detection.");
        }
    } else {
        Serial.println("  ✗ FAIL: No hold duration measured. PIR may not have triggered.");
    }
    s_step = STEP_AMBIENT;
}

// ── Step 6: Ambient noise test ─────────────────────────────────
void stepAmbient() {
    Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("STEP 6: Ambient Noise Test (10s)");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("Speak loudly near PIR. Tap the breadboard.");
    Serial.println("Watching for false triggers.\n");

    pinMode(PIN_PIR, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_PIR), pirISR, RISING);
    s_interrupt_count = 0;
    s_motion_flag = false;

    unsigned long start = millis();
    int false_triggers = 0;
    int last_count = 0;

    while (millis() - start < STEP6_DURATION) {
        if (s_interrupt_count > last_count) {
            false_triggers += (s_interrupt_count - last_count);
            last_count = s_interrupt_count;
            Serial.printf("  [TRIGGER] count=%d at %lu ms\n",
                          s_interrupt_count, millis() - start);
        }
        delay(STEP6_INTERVAL);
    }

    detachInterrupt(digitalPinToInterrupt(PIN_PIR));

    Serial.println("\n── Step 6 Results ──");
    Serial.printf("  False triggers during noise: %d\n", false_triggers);
    if (false_triggers == 0) {
        Serial.println("  ✓ PASS: No false triggers from audio/vibration.");
    } else {
        Serial.println("  ⚠ WARN: PIR may be susceptible to vibration. Consider dampening mount.");
    }
    s_step = STEP_DONE;
}

// ── Final summary ──────────────────────────────────────────────
void stepSummary() {
    Serial.println("\n╔══════════════════════════════════════════════╗");
    Serial.println("║  PIR HARDWARE TEST COMPLETE                 ║");
    Serial.println("╚══════════════════════════════════════════════╝");
    Serial.println();
    Serial.println("Review results above and record in");
    Serial.println("docs/VALIDATION-PIR-<date>.md");
    Serial.println();
    Serial.println("Expected PASS criteria:");
    Serial.println("  [ ] Step 2: PIR OUT transitions LOW→HIGH on motion");
    Serial.println("  [ ] Step 3: Interrupt fires on GPIO13, zero false triggers");
    Serial.println("  [ ] Step 4: Detection range ≥ 3m");
    Serial.println("  [ ] Step 5: Hold time between 2-5 seconds");
    Serial.println("  [ ] Step 6: No false triggers from audio/vibration");
    Serial.println();
    Serial.println("If any step FAILS, document the failure details.");
    Serial.println("Halting. Reset to re-run.");
    while (true) delay(1000);
}

// ── Arduino entry points ───────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n╔══════════════════════════════════════════════╗");
    Serial.println("║  Xentient PIR Hardware Test                 ║");
    Serial.println("║  BB-PIR Validation                          ║");
    Serial.println("╚══════════════════════════════════════════════╝");
    Serial.printf("Pin: GPIO%d (PIN_PIR_INT)\n", PIN_PIR);
    Serial.println();
    Serial.println("Waiting for PIR warmup...");

    pinMode(PIN_PIR, INPUT_PULLUP);
    // Warmup: PIR modules need time to stabilize
    for (int i = WARMUP_MS / 1000; i > 0; i--) {
        int state = digitalRead(PIN_PIR);
        Serial.printf("  Warmup: %2ds remaining  (pin=%s)\r", i, state ? "HIGH" : "LOW");
        delay(1000);
    }
    Serial.println("\nWarmup complete. Starting Step 1.");
}

void loop() {
    switch (s_step) {
        case STEP_PIN_CHECK:   stepPinCheck();     break;
        case STEP_RAW_READ:    stepRawRead();       break;
        case STEP_INTERRUPT:   stepInterrupt();     break;
        case STEP_SENSITIVITY: stepSensitivity();   break;
        case STEP_TIMING:      stepTiming();        break;
        case STEP_AMBIENT:     stepAmbient();       break;
        case STEP_DONE:        stepSummary();       break;
    }
}
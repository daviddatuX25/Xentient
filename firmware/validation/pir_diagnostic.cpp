// BB-PIR Diagnostic v2: Test GPIO13 AND GPIO12 simultaneously
// Move PIR OUT wire to GPIO12 for this test.
// If GPIO12 shows motion but GPIO13 doesn't → GPIO13 is bad
// If both show nothing → PIR module is likely dead

#include <Arduino.h>

static constexpr int PIN_OLD = 13;  // original
static constexpr int PIN_NEW = 12;  // try this one

void readPin(int pin, const char* label) {
    pinMode(pin, INPUT_PULLUP);
    int pu = digitalRead(pin);
    pinMode(pin, INPUT);
    int raw = digitalRead(pin);
    int r1 = digitalRead(pin);
    int r2 = digitalRead(pin);
    int r3 = digitalRead(pin);

    Serial.printf("[%s] PU=%d RAW=%d 3x=%d%d%d", label, pu, raw, r1, r2, r3);

    bool noise = (raw != r1 || r1 != r2 || r2 != r3);
    if (noise) {
        Serial.print(" NOISE");
    } else if (raw == 1) {
        Serial.print(" <<< MOTION!");
    } else {
        Serial.print(" idle");
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[PIR-DIAG] Dual-Pin Test — Xentient 2ux");
    Serial.println("[PIR-DIAG] Move PIR OUT to GPIO12 for this test");
    Serial.printf("[PIR-DIAG] Monitoring: GPIO%d (old) + GPIO%d (new)\n\n", PIN_OLD, PIN_NEW);
    Serial.println("[PIR-DIAG] Waiting 15s PIR warmup...");

    // Wait for warmup
    for (int i = 15; i > 0; i--) {
        Serial.printf("[PIR-DIAG] Warmup %ds...\r", i);
        delay(1000);
    }
    Serial.println("\n[PIR-DIAG] Ready! Wave hand now.");
}

void loop() {
    readPin(PIN_OLD, "GPIO13");
    Serial.print("  |  ");
    readPin(PIN_NEW, "GPIO12");
    Serial.println();
    delay(300);
}
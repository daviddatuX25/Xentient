// BB-PIR Step 4: HC-SR501 PIR interrupt validation
// PIR OUT -> GPIO13 (PIN_PIR_INT)
// Tests attachInterrupt(RISING), logs motion events to serial.
// PIR warmup: wait 5-20s after power-on before testing.

#include <Arduino.h>

static constexpr int PIN_PIR_INT = 13;

static volatile bool s_motion_flag = false;
static volatile unsigned long s_last_trigger = 0;

void IRAM_ATTR pirISR() {
    unsigned long now = millis();
    // Debounce: ignore triggers within 500ms
    if (now - s_last_trigger > 500) {
        s_motion_flag = true;
        s_last_trigger = now;
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[PIR] HC-SR501 Interrupt Test — Xentient 2ux");
    Serial.printf("[PIR] Pin: GPIO%d\n", PIN_PIR_INT);

    pinMode(PIN_PIR_INT, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_PIR_INT), pirISR, RISING);

    Serial.println("[PIR] Waiting for warmup (5-20s)...");
    for (int i = 20; i > 0; i--) {
        Serial.printf("[PIR] Warmup: %ds remaining\r", i);
        delay(1000);
    }
    Serial.println("\n[PIR] Ready! Wave hand in front of PIR dome.");
}

void loop() {
    if (s_motion_flag) {
        s_motion_flag = false;
        Serial.printf("[PIR] MOTION DETECTED at %lums (pin=%d HIGH)\n",
                       s_last_trigger, digitalRead(PIN_PIR_INT));
    }
}
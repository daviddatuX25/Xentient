// ESP32-CAM — UART echo responder for Xentient 02i
// Flash via FTDI: IO0 -> GND during upload, remove after.
// CAM TX (GPIO1) -> Node Base GPIO16
// CAM RX (GPIO3) <- Node Base GPIO17
// Responds PONG\n to every PING\n from Node Base.

#include <Arduino.h>

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("[CAM] UART echo ready");
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line == "PING") {
            Serial.println("PONG");
        }
    }
}

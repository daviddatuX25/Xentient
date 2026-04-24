// BB-UART Step 5: ESP32-CAM UART2 integration test
// Node Base RX = GPIO16 ← CAM TX
// Node Base TX = GPIO17 → CAM RX
// Baud: 115200. Open Serial Monitor to see echo test.
//
// Test protocol:
//   Node Base sends "PING\n" every 2s over UART2.
//   CAM firmware echoes back "PONG\n".
//   If no echo within 1s → timeout logged.
//   Also forwards any CAM-originated lines to USB serial.

#include <Arduino.h>

static constexpr int PIN_CAM_RX   = 16;
static constexpr int PIN_CAM_TX   = 17;
static constexpr uint32_t CAM_BAUD = 115200;
static constexpr uint32_t PING_INTERVAL_MS = 2000;
static constexpr uint32_t PONG_TIMEOUT_MS  = 1000;

static HardwareSerial CamSerial(2); // UART2

static unsigned long s_last_ping = 0;
static bool s_waiting_pong = false;
static unsigned long s_ping_sent_at = 0;
static uint32_t s_ping_count = 0;
static uint32_t s_pong_count = 0;

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[CAM-UART] ESP32-CAM UART2 Test — Xentient 02i");
    Serial.printf("[CAM-UART] RX=GPIO%d  TX=GPIO%d  baud=%u\n",
                  PIN_CAM_RX, PIN_CAM_TX, CAM_BAUD);

    CamSerial.begin(CAM_BAUD, SERIAL_8N1, PIN_CAM_RX, PIN_CAM_TX);
    delay(100);

    Serial.println("[CAM-UART] Ready. Sending PING every 2s...");
}

void loop() {
    unsigned long now = millis();

    // --- Send PING ---
    if (now - s_last_ping >= PING_INTERVAL_MS) {
        s_last_ping = now;
        s_ping_count++;
        CamSerial.print("PING\n");
        s_waiting_pong = true;
        s_ping_sent_at = now;
        Serial.printf("[CAM-UART] >> PING #%u sent\n", s_ping_count);
    }

    // --- Read CAM output ---
    while (CamSerial.available()) {
        String line = CamSerial.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) continue;

        if (s_waiting_pong && line == "PONG") {
            s_pong_count++;
            s_waiting_pong = false;
            uint32_t rtt = (uint32_t)(millis() - s_ping_sent_at);
            Serial.printf("[CAM-UART] << PONG #%u  RTT=%ums\n", s_pong_count, rtt);
        } else {
            Serial.printf("[CAM-UART] << %s\n", line.c_str());
        }
    }

    // --- Timeout check ---
    if (s_waiting_pong && (now - s_ping_sent_at) >= PONG_TIMEOUT_MS) {
        s_waiting_pong = false;
        Serial.printf("[CAM-UART] TIMEOUT — no PONG (ping #%u). Check wiring TX/RX.\n",
                      s_ping_count);
    }

    // --- Stats every 10s ---
    static unsigned long s_last_stats = 0;
    if (now - s_last_stats >= 10000) {
        s_last_stats = now;
        Serial.printf("[CAM-UART] Stats: sent=%u  pong=%u  loss=%u%%\n",
                      s_ping_count, s_pong_count,
                      s_ping_count ? (100 * (s_ping_count - s_pong_count) / s_ping_count) : 0);
    }
}

---
phase: quick-260420-mqtt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - firmware/shared/messages.h
  - firmware/include/mqtt_client.h
  - firmware/src/mqtt_client.cpp
  - firmware/include/bme_reader.h
  - firmware/src/bme_reader.cpp
  - firmware/platformio.ini
  - firmware/src/main.cpp
autonomous: true
requirements: [Xentient-cg9]
must_haves:
  truths:
    - "Node Base publishes BME280 telemetry as JSON to xentient/sensors/env on Mosquitto"
    - "Published payload matches CONTRACTS.md sensor_data schema (v, type, peripheralType, payload, timestamp)"
    - "Node Base subscribes to xentient/control/mode and xentient/display"
    - "MQTT client auto-reconnects after broker restart (max 3 attempts, 1s/2s/4s backoff)"
    - "LCD driver still works — lcd_set_state calls unchanged"
    - "loop() never blocks >100ms"
  artifacts:
    - path: "firmware/shared/messages.h"
      provides: "C++ hand-mirror of CONTRACTS.md message schemas and constants"
      contains: "MSG_VERSION, PERIPHERAL_TYPE_BME280, TOPIC_ENV, sensor_data struct"
    - path: "firmware/include/mqtt_client.h"
      provides: "MQTT client API — init, publish, subscribe, loop"
      exports: ["mqtt_init", "mqtt_loop", "mqtt_connected"]
    - path: "firmware/src/mqtt_client.cpp"
      provides: "PubSubClient wrapper with auto-reconnect and retry logic"
      contains: "reconnect_attempt, exponential backoff"
    - path: "firmware/include/bme_reader.h"
      provides: "BME280 sensor reader API"
      exports: ["bme_init", "bme_read"]
    - path: "firmware/src/bme_reader.cpp"
      provides: "Adafruit BME280 driver wrapper, reads temp/hum/pressure"
      contains: "Adafruit_BME280"
    - path: "firmware/platformio.ini"
      provides: "Library dependencies for MQTT, JSON, BME280"
      contains: "PubSubClient, ArduinoJson, Adafruit BME280 Library"
    - path: "firmware/src/main.cpp"
      provides: "Replaces demo loop with MQTT telemetry publish + subscriber callbacks"
      contains: "mqtt_init, bme_init, publish on interval"
  key_links:
    - from: "firmware/src/main.cpp"
      to: "mqtt_client.h"
      via: "mqtt_init/mqtt_loop in setup+loop"
      pattern: "mqtt_init|mqtt_loop"
    - from: "firmware/src/mqtt_client.cpp"
      to: "shared/messages.h"
      via: "topic constants and message version for publish"
      pattern: "TOPIC_|MSG_VERSION"
    - from: "firmware/src/main.cpp"
      to: "bme_reader.h"
      via: "bme_init/bme_read for sensor data"
      pattern: "bme_init|bme_read"
    - from: "firmware/src/mqtt_client.cpp"
      to: "lcd_driver.h"
      via: "lcd_set_state on connect/disconnect"
      pattern: "lcd_set_state"
---

<objective>
MQTT pub/sub client with JSON telemetry protocol for the Xentient Node Base.

Purpose: Bridge the ESP32 to the Mosquitto broker so the harness can receive BME280
sensor telemetry and send control/display commands. Replaces the demo state loop in
main.cpp with real MQTT-driven event handling.

Output: 7 files -- messages.h (protocol constants), mqtt_client.h/.cpp (MQTT wrapper
with auto-reconnect), bme_reader.h/.cpp (BME280 sensor wrapper), updated platformio.ini
(lib deps), updated main.cpp (MQTT telemetry loop replacing demo).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/CONTRACTS.md
@firmware/include/peripherals.h
@firmware/include/pins.h
@firmware/include/lcd_driver.h
@firmware/src/lcd_driver.cpp
@firmware/src/main.cpp
@firmware/platformio.ini

<interfaces>
<!-- Existing interfaces executor must implement against -->

From firmware/include/lcd_driver.h:
```cpp
enum class NodeState : uint8_t {
    BOOT = 0, LISTENING = 1, THINKING = 2, SPEAKING = 3, ERROR_STATE = 4
};
void lcd_init();
void lcd_set_state(NodeState s);
```

From firmware/include/peripherals.h:
```cpp
struct PeripheralDef {
    const char* name;
    uint8_t     typeId;   // 0x12=BME280
    uint8_t     i2cAddr;  // 0x76 for BME280
};
static constexpr PeripheralDef PERIPHERALS[] = { ... };
```

From firmware/include/pins.h:
```cpp
static constexpr int PIN_I2C_SDA = 21;
static constexpr int PIN_I2C_SCL = 22;
```

From docs/CONTRACTS.md sensor_data schema:
```json
{
  "v": 1,
  "type": "sensor_data",
  "peripheralType": 18,
  "payload": { "temperature": 24.5, "humidity": 65.2, "pressure": 1013.25 },
  "timestamp": 1713400000
}
```
Key: camelCase keys, epoch-millis uint32 timestamps, peripheralType=0x12(18) for BME280,
3KB payload cap, MQTT topic "xentient/sensors/env".
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create messages.h + mqtt_client + bme_reader modules</name>
  <files>
    firmware/shared/messages.h,
    firmware/include/mqtt_client.h,
    firmware/src/mqtt_client.cpp,
    firmware/include/bme_reader.h,
    firmware/src/bme_reader.cpp,
    firmware/platformio.ini
  </files>
  <action>
1. Create `firmware/shared/messages.h` — the C++ hand-mirror of CONTRACTS.md schemas.
   This is the single source of truth for protocol constants in firmware. Contents:
   - `#pragma once`, include `<cstdint>`
   - `static constexpr uint8_t  MSG_VERSION = 1;`
   - `static constexpr uint8_t  PERIPHERAL_TYPE_BME280 = 0x12;`
   - `static constexpr uint8_t  PERIPHERAL_TYPE_PIR    = 0x11;`
   - `static constexpr uint8_t  PERIPHERAL_TYPE_LCD    = 0x15;`
   - MQTT topic string constants:
     `static constexpr const char* TOPIC_ENV    = "xentient/sensors/env";`
     `static constexpr const char* TOPIC_MOTION = "xentient/sensors/motion";`
     `static constexpr const char* TOPIC_MODE   = "xentient/control/mode";`
     `static constexpr const char* TOPIC_DISPLAY = "xentient/display";`
   - `static constexpr size_t MQTT_PAYLOAD_CAP = 3072;` (3KB per CONTRACTS.md)
   - `static constexpr uint8_t MQTT_RETRY_MAX = 3;`
   - `static constexpr uint32_t MQTT_RETRY_BASE_MS = 1000;` (exponential: 1s, 2s, 4s)
   - `static constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000;` (publish every 5s)
   - `static constexpr const char* MQTT_BROKER_ADDR = "192.168.1.100";` (default LAN; user overrides before build)
   - `static constexpr uint16_t MQTT_BROKER_PORT = 1883;`
   - `static constexpr const char* MQTT_CLIENT_ID = "xentient-node-01";`

2. Create `firmware/include/mqtt_client.h` — public MQTT API:
   - `#pragma once`
   - `void mqtt_init();` — creates WiFiClient + PubSubClient, sets server, registers callbacks, calls connect
   - `void mqtt_loop();` — must be called every loop() iteration; handles PubSubClient.loop() + reconnect logic
   - `bool mqtt_connected();` — returns true if currently connected to broker
   - `void mqtt_publish(const char* topic, const char* payload, size_t length);` — publish with QoS 0, retain=false; checks MQTT_PAYLOAD_CAP before sending
   - `void mqtt_subscribe(const char* topic);` — subscribe wrapper
   - Callback type: `typedef void (*MqttCallback)(const char* topic, const uint8_t* payload, unsigned int length);`

3. Create `firmware/src/mqtt_client.cpp` — implementation with auto-reconnect:
   - Include: Arduino.h, WiFi.h, PubSubClient.h, "mqtt_client.h", "messages.h", "lcd_driver.h"
   - Static `WiFiClient espClient;` and `PubSubClient client(espClient);`
   - Reconnect state: `static uint8_t retryCount = 0;`, `static unsigned long lastReconnectAttempt = 0;`
   - `mqtt_init()`: call `client.setServer(MQTT_BROKER_ADDR, MQTT_BROKER_PORT)`, set callback, call `mqtt_connect()`
   - `mqtt_connect()`: internal function. Calls `client.connect(MQTT_CLIENT_ID)`. On success: set retryCount=0, lcd_set_state(LISTENING), subscribe to TOPIC_MODE and TOPIC_DISPLAY. On failure: lcd_set_state(ERROR_STATE), log retry count.
   - `mqtt_loop()`: call `client.loop()`. If `!client.connected()` and `retryCount < MQTT_RETRY_MAX` and `millis() - lastReconnectAttempt >= delay`: compute backoff delay = MQTT_RETRY_BASE_MS * (1 << retryCount), set lastReconnectAttempt, call mqtt_connect(), increment retryCount. If retryCount hits max, stay in ERROR_STATE until next loop cycle resets (loop backoff: after all 3 retries fail, wait 10s then reset retryCount to 0 and try again).
   - `mqtt_publish()`: assert length <= MQTT_PAYLOAD_CAP, call `client.publish(topic, payload, length)`.
   - `mqtt_subscribe()`: call `client.subscribe(topic)`.
   - Callback handler: log received topic/payload to Serial for now. Future: dispatch to mode/display handlers.

4. Create `firmware/include/bme_reader.h` — BME280 reader API:
   - `#pragma once`
   - `bool bme_init();` — initialize Adafruit_BME280 at 0x76, return true if sensor found
   - Struct: `struct BmeReading { float temperature; float humidity; float pressure; };`
   - `bool bme_read(BmeReading& out);` — read current values, return false on I2C error

5. Create `firmware/src/bme_reader.cpp` — BME280 implementation:
   - Include: Arduino.h, Adafruit_BME280.h, Adafruit_Sensor.h, "bme_reader.h", "pins.h"
   - Static `Adafruit_BME280 bme;`
   - `bme_init()`: call `bme.begin(0x76)` — returns true if sensor found on I2C
   - `bme_read()`: call `bme.readTemperature()`, `bme.readHumidity()`, `bme.readPressure() / 100.0F` (Pa->hPa), populate out struct, return true. Wrap in try/catch equivalent: check for NaN readings, return false if any value is NaN.

6. Update `firmware/platformio.ini` — add lib_deps:
   - Keep existing: `marcoschwartz/LiquidCrystal_I2C @ ^1.1.4`
   - Add: `knolleary/PubSubClient @ ^2.8`
   - Add: `bblanchon/ArduinoJson @ ^7.0.0`
   - Add: `adafruit/Adafruit BME280 Library @ ^2.2.0`
   - Add: `adafruit/Adafruit Unified Sensor @ ^1.1.0` (transitive dep of BME280)
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient/firmware && pio run -e node_base 2>&1 | tail -5</automated>
  </verify>
  <done>
    All 6 files exist. platformio.ini has 5 lib_deps. messages.h has MSG_VERSION, topic constants, MQTT_RETRY_MAX. mqtt_client.cpp has auto-reconnect with exponential backoff (max 3, 1s/2s/4s). bme_reader.cpp reads temp/humidity/pressure. `pio run` compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire main.cpp — replace demo loop with MQTT telemetry + subscriptions</name>
  <files>firmware/src/main.cpp</files>
  <action>
Rewrite `firmware/src/main.cpp` to replace the demo state loop with real MQTT-driven operation.

New structure:
```cpp
#include <Arduino.h>
#include <Wire.h>
#include <ArduinoJson.h>

#include "pins.h"
#include "peripherals.h"
#include "lcd_driver.h"
#include "mqtt_client.h"
#include "bme_reader.h"
#include "shared/messages.h"

// (keep existing i2c_ping function)

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("[BOOT] Xentient Node Base starting...");

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setTimeout(1000);

    // I2C peripheral scan (same as before)
    for (size_t i = 0; i < PERIPHERAL_COUNT; i++) {
        const PeripheralDef& p = PERIPHERALS[i];
        if (p.i2cAddr == 0x00) continue;
        bool present = i2c_ping(p.i2cAddr);
        Serial.printf("[BOOT] %s (0x%02X): %s\n", p.name, p.i2cAddr, present ? "online" : "offline");
    }

    lcd_init();
    lcd_set_state(NodeState::BOOT);

    // Initialize BME280 sensor
    bool bmeOk = bme_init();
    Serial.printf("[BOOT] BME280: %s\n", bmeOk ? "online" : "offline");

    // Initialize MQTT client (connects to broker, subscribes to topics)
    mqtt_init();

    Serial.println("[BOOT] Init complete.");
}

static unsigned long lastTelemetryMs = 0;

void loop() {
    mqtt_loop();  // MUST be called every iteration — handles reconnect + incoming messages

    // Publish telemetry at TELEMETRY_INTERVAL_MS
    if (mqtt_connected() && (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS)) {
        lastTelemetryMs = millis();

        BmeReading reading;
        if (bme_read(reading)) {
            // Build JSON payload per CONTRACTS.md sensor_data schema
            JsonDocument doc;  // ArduinoJson v7
            doc["v"] = MSG_VERSION;
            doc["type"] = "sensor_data";
            doc["peripheralType"] = PERIPHERAL_TYPE_BME280;

            JsonObject payload = doc["payload"].to<JsonObject>();
            payload["temperature"] = rounded2(reading.temperature);
            payload["humidity"] = rounded2(reading.humidity);
            payload["pressure"] = rounded2(reading.pressure);

            doc["timestamp"] = (uint32_t)millis();  // epoch-millis; TODO: NTP for wall clock

            char buffer[256];
            serializeJson(doc, buffer, sizeof(buffer));
            mqtt_publish(TOPIC_ENV, buffer, strlen(buffer));

            Serial.printf("[MQTT] Published: t=%.1f h=%.1f p=%.1f\n",
                          reading.temperature, reading.humidity, reading.pressure);
        } else {
            Serial.println("[BME] Read failed — skipping publish");
        }
    }

    delay(10);  // yield to WiFi stack — keeps loop() under 100ms
}

// Helper: round float to 2 decimal places for clean JSON output
static float rounded2(float v) {
    return round(v * 100.0F) / 100.0F;
}
```

Key constraints:
- Remove the demo state array and cycle loop entirely (the comment says "will be replaced by MQTT event handling")
- `mqtt_loop()` is called every iteration — this is non-negotiable for PubSubClient
- Telemetry only publishes when `mqtt_connected()` returns true
- JSON uses ArduinoJson v7 API (JsonDocument, doc["key"], serializeJson)
- Timestamp uses millis() now with TODO comment for NTP — epoch-millis uint32 per CONTRACTS.md
- `rounded2()` helper prevents floating-point noise in JSON (24.500001 instead of 24.5)
- `delay(10)` keeps the watchdog and WiFi stack happy without blocking >100ms
- lcd_set_state is called by mqtt_client.cpp on connect/disconnect — main.cpp does not need to call it after boot
  </action>
  <verify>
    <automated>cd D:/Projects/Xentient/firmware && pio run -e node_base 2>&1 | tail -5</automated>
  </verify>
  <done>
    main.cpp has no demo state loop. mqtt_init() called in setup(). mqtt_loop() called every loop() iteration.
    Telemetry publishes JSON to xentient/sensors/env every 5s when connected.
    JSON payload matches CONTRACTS.md sensor_data schema exactly: v, type, peripheralType, payload{temperature,humidity,pressure}, timestamp.
    loop() blocks for max 10ms (delay(10)). `pio run` compiles without errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MQTT broker → Node Base | Untrusted: any client on LAN can publish to subscribed topics |
| Node Base → MQTT broker | Trusted output: firmware controls what it publishes |
| WiFi network | Untrusted: LAN access assumed, no TLS on Mosquitto (local only) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-mqtt-01 | Tampering | xentient/control/mode subscriber | mitigate | Validate mode_set payload against known enum values before dispatching; discard malformed messages |
| T-mqtt-02 | Denial of Service | mqtt_loop reconnect logic | mitigate | Max 3 retry attempts with exponential backoff prevents tight reconnect loop from blocking loop() |
| T-mqtt-03 | Information Disclosure | xentient/sensors/env publisher | accept | Telemetry is non-sensitive env data on local LAN; no PII transmitted |
| T-mqtt-04 | Tampering | MQTT publish payload | mitigate | MQTT_PAYLOAD_CAP (3KB) check before publish prevents oversized packets |
| T-mqtt-05 | Spoofing | MQTT client ID | accept | No auth on local Mosquitto; accepted risk for LAN-only deployment |
</threat_model>

<verification>
1. `pio run -e node_base` compiles with zero errors
2. On flash + boot: Serial shows "[BOOT] BME280: online" and "[MQTT] Published" lines
3. `mosquitto_sub -t "xentient/sensors/env"` on LAN shows JSON matching CONTRACTS.md schema
4. Kill and restart mosquitto broker: firmware reconnects within ~7s (1s + 2s + 4s backoff)
5. LCD shows "Listening..." on connect, "ERROR" on disconnect
</verification>

<success_criteria>
- MQTT client connects to Mosquitto broker on LAN port 1883
- BME280 telemetry published to xentient/sensors/env every 5s as valid JSON
- JSON payload exactly matches CONTRACTS.md sensor_data schema (v:1, type, peripheralType:18, payload, timestamp)
- Auto-reconnect with exponential backoff (1s/2s/4s, max 3 retries, then 10s reset)
- Subscriptions active on xentient/control/mode and xentient/display
- LCD driver functional — state changes on connect/disconnect
- loop() never blocks >100ms
- `pio run` compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/260420-mqtt-pub-sub-client/260420-mqtt-SUMMARY.md`
</output>
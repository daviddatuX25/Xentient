#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "pins.h"
#include "peripherals.h"
#include "lcd_driver.h"
#include "mqtt_client.h"
#include "bme_reader.h"
#include "i2s_mic.h"
#include "vad.h"
#include "ws_audio.h"
#include "cam_relay.h"
#include "messages.h"

// ============================================================================
//  Shared state — two-task model
// ============================================================================
portMUX_TYPE       profileMux           = portMUX_INITIALIZER_UNLOCKED;
volatile NodeProfile activeProfile;
volatile NodeProfile pendingProfile;
volatile bool       profileUpdateFlag    = false;
char               lastReceivedProfileId[32] = {0};

// ============================================================================
//  Helpers
// ============================================================================

static bool i2c_ping(uint8_t addr) {
    Wire.beginTransmission(addr);
    return (Wire.endTransmission() == 0);
}

static void wifi_connect() {
    Serial.printf("[WIFI] Connecting to %s...\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    uint8_t attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print('.');
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WIFI] Failed to connect — continuing without network");
    }
}

// ============================================================================
//  PIR interrupt (GPIO13)
// ============================================================================
static volatile bool pirTriggered = false;
void IRAM_ATTR pir_isr() {
    pirTriggered = true;
}

// ============================================================================
//  VAD state
// ============================================================================
static volatile bool  vad_was_active    = false;
static volatile bool vad_is_active      = false;
static volatile uint32_t vad_start_millis = 0;
static bool last_vad_active = false;

// VAD start -> trigger_pipeline{source:"voice"}
static void publish_vad_start() {
    if (!mqtt_connected()) return;
    JsonDocument doc;
    doc["v"]      = MSG_VERSION;
    doc["type"]   = "trigger_pipeline";
    doc["source"] = TRIGGER_SOURCE_VOICE;
    char buf[128];
    serializeJson(doc, buf, sizeof(buf));
    mqtt_publish(TOPIC_TRIGGER, buf, strlen(buf));
    Serial.println("[VAD] Published: trigger_pipeline source=voice");
    vad_start_millis = millis();
    vad_is_active = true;
}

// VAD end -> trigger_pipeline{source:"voice", stage:"end"}
static void publish_vad_end() {
    if (!mqtt_connected()) return;
    vad_was_active = vad_is_active;
    vad_is_active = false;
    JsonDocument doc;
    doc["v"]           = MSG_VERSION;
    doc["type"]        = "trigger_pipeline";
    doc["source"]      = TRIGGER_SOURCE_VOICE;
    doc["stage"]       = "end";
    doc["duration_ms"] = (uint32_t)(millis() - vad_start_millis);
    char buf[128];
    serializeJson(doc, buf, sizeof(buf));
    mqtt_publish(TOPIC_TRIGGER, buf, strlen(buf));
    Serial.printf("[VAD] Voice end - duration %lu ms\n",
                  (unsigned long)(millis() - vad_start_millis));
}

// ============================================================================
//  LCD face mapping from NodeProfile.lcd_face
// ============================================================================
static void apply_lcd_face(uint8_t lcd_face) {
    switch (lcd_face) {
        case 0:  lcd_set_state(NodeState::LISTENING);  break; // calm
        case 1:  lcd_set_state(NodeState::ERROR_STATE); break; // alert
        case 2:  lcd_set_state(NodeState::LISTENING);  break; // listening
        case 3:  lcd_set_state(NodeState::SPEAKING);   break; // speaking
        default: lcd_set_state(NodeState::LISTENING);  break;
    }
}

// ============================================================================
//  Sensor reconfiguration after profile hot-swap
// ============================================================================
static void reconfigure_sensors(const NodeProfile& p) {
    Serial.printf("[CONFIG] Applying profile '%s': pir=%u bme=%u mic=%u cam=%u lcd=%u mask=0x%04X\n",
                 p.profile_id, p.pir_interval_ms, p.bme_interval_ms,
                 p.mic_mode, p.camera_mode, p.lcd_face, p.event_mask);
    apply_lcd_face(p.lcd_face);
}

// ============================================================================
//  Task handles
// ============================================================================
static TaskHandle_t workTaskHandle  = nullptr;
static TaskHandle_t configTaskHandle = nullptr;

// ============================================================================
//  Work Task — Core 1, high priority
//  Runs the activeProfile: reads sensors at declared intervals, publishes
//  events based on event_mask, controls actuators. Checks profileUpdateFlag
//  at the end of each iteration (Config Task handles the swap).
// ============================================================================

static int16_t s_pcm[I2S_MIC_CHUNK_SAMPLES];
static unsigned long lastPirMs       = 0;
static unsigned long lastBmeMs       = 0;

static float rounded2(float v) { return round(v * 100.0F) / 100.0F; }

static void work_task(void* /*pvParameters*/) {
    // Register with ESP32 task watchdog (5s timeout, panic-on-timeout)
    esp_err_t wdt_err = esp_task_wdt_add(nullptr);
    if (wdt_err != ESP_OK) {
        Serial.printf("[WORK] WDT add failed: %d\n", wdt_err);
    }
    esp_task_wdt_reset();
    Serial.println("[WORK] Task started on core " + String(xPortGetCoreID()));

    while (true) {
        // -- Snapshot activeProfile under critical section --
        // We only need the intervals and mask for this iteration.
        // Copying the whole struct under the spinlock is cheap (sizeof ~42 bytes).
        NodeProfile snap;
        portENTER_CRITICAL(&profileMux);
        memcpy(&snap, (const void*)&activeProfile, sizeof(NodeProfile));
        portEXIT_CRITICAL(&profileMux);

        uint32_t now = millis();

        // -- PIR: poll or ISR-driven depending on event_mask --
        if ((snap.event_mask & (EVENT_MASK_PRESENCE | EVENT_MASK_MOTION)) &&
            pirTriggered && mqtt_connected()) {
            pirTriggered = false;
            JsonDocument doc;
            doc["v"]              = MSG_VERSION;
            doc["type"]           = "sensor_data";
            doc["peripheralType"] = PERIPHERAL_TYPE_PIR;
            JsonObject payload    = doc["payload"].to<JsonObject>();
            payload["motion"]     = true;
            doc["timestamp"]      = (uint32_t)now;
            char buf[128];
            serializeJson(doc, buf, sizeof(buf));
            mqtt_publish(TOPIC_MOTION, buf, strlen(buf));
            Serial.println("[PIR] Motion detected - published sensor_data");
            lastPirMs = now;
        }

        // -- BME280 telemetry at bme_interval_ms --
        if ((snap.event_mask & EVENT_MASK_ENV) &&
            mqtt_connected() &&
            (now - lastBmeMs >= snap.bme_interval_ms)) {
            lastBmeMs = now;
            BmeReading reading;
            if (bme_read(reading)) {
                JsonDocument doc;
                doc["v"]               = MSG_VERSION;
                doc["type"]            = "sensor_data";
                doc["peripheralType"]  = PERIPHERAL_TYPE_BME280;
                JsonObject payload     = doc["payload"].to<JsonObject>();
                payload["temperature"] = rounded2(reading.temperature);
                payload["humidity"]    = rounded2(reading.humidity);
                payload["pressure"]    = rounded2(reading.pressure);
                doc["timestamp"]       = (uint32_t)now;
                char buf[256];
                serializeJson(doc, buf, sizeof(buf));
                mqtt_publish(TOPIC_ENV, buf, strlen(buf));
            }
        }

        // -- Mic + VAD (only if mic_mode != 0) --
        if (snap.mic_mode != 0 && i2s_mic_read(s_pcm, I2S_MIC_CHUNK_SAMPLES)) {
            VadResult vad = vad_process(s_pcm, I2S_MIC_CHUNK_SAMPLES);
            last_vad_active = vad.active;

            // VAD event
            if (vad.transitioned) {
                if (vad.active) {
                    publish_vad_start();
                }
            }

            // Audio chunk forwarding (always-on or VAD-active)
            bool should_send = (snap.mic_mode == 2) ||  // always-on
                               (snap.mic_mode == 1 && vad.active); // vad-only
            if (should_send && (snap.event_mask & EVENT_MASK_AUDIO_CHUNK)) {
                ws_audio_send((const uint8_t*)s_pcm, I2S_MIC_CHUNK_BYTES);
            }
        }

        // -- VAD end detection (silence after speech) --
        if (vad_is_active && !last_vad_active && mqtt_connected()) {
            publish_vad_end();
        }

        // -- Camera relay loop (UART -> WS forwarding) --
        if (snap.camera_mode != 0 && (snap.event_mask & EVENT_MASK_FRAME)) {
            cam_relay_loop();
        }

        // -- WebSocket audio loop (outbound queue drain) --
        ws_audio_loop();

        // -- MQTT loop (keepalive + inbound processing) --
        mqtt_loop();

        // -- Reset watchdog after successful sensor cycle --
        esp_task_wdt_reset();

        // -- Yield: let other tasks run. Use the shortest sensor interval as
        //    the work cycle to avoid busy-waiting, but cap at 10ms minimum. --
        uint16_t min_interval = snap.pir_interval_ms;
        if (snap.bme_interval_ms < min_interval)
            min_interval = snap.bme_interval_ms;
        uint16_t sleep_ms = min_interval / 4;
        if (sleep_ms < 10) sleep_ms = 10;
        vTaskDelay(pdMS_TO_TICKS(sleep_ms));
    }
}

// ============================================================================
//  Config Task — Core 0, low priority
//  Sleeps 500ms, wakes, checks profileUpdateFlag. If set, copies
//  pendingProfile -> activeProfile under critical section, clears flag,
//  reconfigures sensors, sends node_profile_ack.
//  Never parses JSON — all parsing done in MQTT callback.
// ============================================================================

static void config_task(void* /*pvParameters*/) {
    Serial.println("[CONFIG] Task started on core " + String(xPortGetCoreID()));

    while (true) {
        vTaskDelay(pdMS_TO_TICKS(500));

        if (profileUpdateFlag) {
            // -- Swap profile under critical section --
            portENTER_CRITICAL(&profileMux);
            memcpy((void*)&activeProfile, (const void*)&pendingProfile, sizeof(NodeProfile));
            profileUpdateFlag = false;
            portEXIT_CRITICAL(&profileMux);

            Serial.printf("[CONFIG] Profile swapped to '%s'\n", activeProfile.profile_id);

            // -- Reconfigure sensors outside critical section --
            NodeProfile snap;
            portENTER_CRITICAL(&profileMux);
            memcpy(&snap, (const void*)&activeProfile, sizeof(NodeProfile));
            portEXIT_CRITICAL(&profileMux);
            reconfigure_sensors(snap);

            // -- Send ack echoing lastReceivedProfileId --
            send_profile_ack("loaded");
        }
    }
}

// ============================================================================
//  WiFi event handler — reconnect MQTT when WiFi reconnects (8.6)
// ============================================================================

void wifi_event_cb(WiFiEvent_t event) {
    switch (event) {
        case SYSTEM_EVENT_STA_GOT_IP:
        case SYSTEM_EVENT_STA_CONNECTED:
            Serial.println("[WIFI] Connected/reconnected — triggering MQTT reconnect");
            mqtt_reconnect();
            break;
        default:
            break;
    }
}

// ============================================================================
//  setup
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("[BOOT] Xentient Node Base starting...");

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setTimeout(1000);

    for (size_t i = 0; i < PERIPHERAL_COUNT; i++) {
        const PeripheralDef& p = PERIPHERALS[i];
        if (p.i2cAddr == 0x00) continue;
        bool present = i2c_ping(p.i2cAddr);
        Serial.printf("[BOOT] %s (0x%02X): %s\n", p.name, p.i2cAddr, present ? "online" : "offline");
    }

    lcd_init();
    lcd_set_state(NodeState::BOOT);

    bool bmeOk = bme_init();
    Serial.printf("[BOOT] BME280: %s\n", bmeOk ? "online" : "offline");

    // -- Initialize activeProfile with DEFAULT_PROFILE --
    memcpy((void*)&activeProfile, &DEFAULT_PROFILE, sizeof(NodeProfile));
    Serial.printf("[BOOT] activeProfile = '%s'\n", activeProfile.profile_id);

    wifi_connect();

    // Register WiFi event handler for MQTT reconnect on WiFi reconnect (8.6)
    WiFi.onEvent(wifi_event_cb);

    mqtt_init();
    ws_audio_init(WS_HARNESS_HOST, WS_HARNESS_PORT);
    i2s_mic_init();
    vad_init();
    cam_relay_init();

    // -- PIR ISR attachment --
    pinMode(PIN_PIR_INT, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_PIR_INT), pir_isr, RISING);
    Serial.printf("[BOOT] PIR ISR attached on GPIO%d\n", PIN_PIR_INT);

    // -- Initialize task watchdog (5s timeout, panic-on-timeout) --
    esp_task_wdt_init(5, true);
    Serial.println("[BOOT] Task watchdog initialized: 5s timeout, panic on timeout");

    // -- Create Config Task (Core 0, low priority, 3KB stack) --
    xTaskCreatePinnedToCore(
        config_task,
        "configTask",
        3072,
        nullptr,
        1,          // low priority
        &configTaskHandle,
        0           // Core 0
    );

    // -- Create Work Task (Core 1, high priority, 8KB stack) --
    //    Work task replaces the Arduino loop() — it runs the sensor cycle.
    xTaskCreatePinnedToCore(
        work_task,
        "workTask",
        8192,
        nullptr,
        2,          // high priority
        &workTaskHandle,
        1           // Core 1
    );

    Serial.println("[BOOT] Two-task model active. Deleting Arduino loop task.");
    // Delete the default Arduino loop task — our FreeRTOS tasks take over.
    vTaskDelete(nullptr);
}

// ============================================================================
//  loop — never reached (deleted in setup)
// ============================================================================
void loop() {
    // Unreachable — work_task and config_task run instead.
}
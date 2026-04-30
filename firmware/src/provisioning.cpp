#include <Arduino.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>

#include "provisioning.h"

static Preferences prefs;

bool provisioning_has_config() {
    prefs.begin(NVS_NAMESPACE, true); // read-only
    bool has = prefs.isKey(NVS_KEY_WIFI_SSID) && prefs.isKey(NVS_KEY_WIFI_PASS)
            && prefs.isKey(NVS_KEY_MQTT_HOST) && prefs.isKey(NVS_KEY_NODE_ID);
    prefs.end();
    return has;
}

ProvisioningConfig provisioning_read_config() {
    ProvisioningConfig cfg = {};
    // Compile-time defaults from build_flags (fallback)
    strncpy(cfg.mqttHost, MQTT_BROKER_ADDR, sizeof(cfg.mqttHost) - 1);
    cfg.mqttPort = MQTT_BROKER_PORT;
    strncpy(cfg.nodeId, NODE_BASE_ID, sizeof(cfg.nodeId) - 1);
    strncpy(cfg.spaceId, SPACE_ID, sizeof(cfg.spaceId) - 1);
    strncpy(cfg.wsHost, WS_HARNESS_HOST, sizeof(cfg.wsHost) - 1);
    cfg.wsPort = WS_HARNESS_PORT;

    prefs.begin(NVS_NAMESPACE, true);
    if (prefs.isKey(NVS_KEY_WIFI_SSID))
        strncpy(cfg.wifiSsid, prefs.getString(NVS_KEY_WIFI_SSID).c_str(), sizeof(cfg.wifiSsid) - 1);
    if (prefs.isKey(NVS_KEY_WIFI_PASS))
        strncpy(cfg.wifiPass, prefs.getString(NVS_KEY_WIFI_PASS).c_str(), sizeof(cfg.wifiPass) - 1);
    if (prefs.isKey(NVS_KEY_MQTT_HOST))
        strncpy(cfg.mqttHost, prefs.getString(NVS_KEY_MQTT_HOST).c_str(), sizeof(cfg.mqttHost) - 1);
    if (prefs.isKey(NVS_KEY_MQTT_PORT))
        cfg.mqttPort = prefs.getUShort(NVS_KEY_MQTT_PORT, cfg.mqttPort);
    if (prefs.isKey(NVS_KEY_NODE_ID))
        strncpy(cfg.nodeId, prefs.getString(NVS_KEY_NODE_ID).c_str(), sizeof(cfg.nodeId) - 1);
    if (prefs.isKey(NVS_KEY_SPACE_ID))
        strncpy(cfg.spaceId, prefs.getString(NVS_KEY_SPACE_ID).c_str(), sizeof(cfg.spaceId) - 1);
    if (prefs.isKey(NVS_KEY_WS_HOST))
        strncpy(cfg.wsHost, prefs.getString(NVS_KEY_WS_HOST).c_str(), sizeof(cfg.wsHost) - 1);
    if (prefs.isKey(NVS_KEY_WS_PORT))
        cfg.wsPort = prefs.getUShort(NVS_KEY_WS_PORT, cfg.wsPort);
    prefs.end();
    return cfg;
}

bool provisioning_start_portal(const char* provisioningJson) {
    WiFiManager wm;
    wm.setConfigPortalTimeout(180); // 3 min timeout

    // Standard WiFi params
    WiFiManagerParameter p_ssid("ssid", "WiFi SSID", "", 33);
    WiFiManagerParameter p_pass("pass", "WiFi Password", "", 64);
    // Extended params
    WiFiManagerParameter p_mqtt("mqtt", "MQTT Broker", MQTT_BROKER_ADDR, 46);
    WiFiManagerParameter p_mport("mport", "MQTT Port", "1883", 6);
    WiFiManagerParameter p_node("node", "Node ID", NODE_BASE_ID, 24);
    WiFiManagerParameter p_space("space", "Space ID", SPACE_ID, 24);
    WiFiManagerParameter p_wshost("wshost", "WS Host", WS_HARNESS_HOST, 46);
    WiFiManagerParameter p_wsport("wsport", "WS Port", "8080", 6);
    // Paste-JSON field
    WiFiManagerParameter p_json("prov_json", "Provisioning JSON (paste from Dashboard)", "", 512);

    wm.addParameter(&p_ssid);
    wm.addParameter(&p_pass);
    wm.addParameter(&p_mqtt);
    wm.addParameter(&p_mport);
    wm.addParameter(&p_node);
    wm.addParameter(&p_space);
    wm.addParameter(&p_wshost);
    wm.addParameter(&p_wsport);
    wm.addParameter(&p_json);

    // If provisioningJson provided, pre-parse and set WiFi creds
    // (WiFiManager doesn't support programmatic pre-fill of custom params,
    //  so we parse after portal saves)

    bool connected = wm.autoConnect("Xentient-Setup");
    if (!connected) {
        Serial.println("[PROV] Portal timeout — no config saved");
        return false;
    }

    // Check if user pasted provisioning JSON
    String provJson = p_json.getValue();
    if (provJson.length() > 0) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, provJson);
        if (!err) {
            prefs.begin(NVS_NAMESPACE, false);
            if (doc["wifiSsid"].is<const char*>())
                prefs.putString(NVS_KEY_WIFI_SSID, doc["wifiSsid"].as<const char*>());
            if (doc["wifiPass"].is<const char*>())
                prefs.putString(NVS_KEY_WIFI_PASS, doc["wifiPass"].as<const char*>());
            if (doc["mqttBroker"].is<const char*>())
                prefs.putString(NVS_KEY_MQTT_HOST, doc["mqttBroker"].as<const char*>());
            if (doc["mqttPort"].is<int>())
                prefs.putUShort(NVS_KEY_MQTT_PORT, doc["mqttPort"].as<int>());
            if (doc["nodeId"].is<const char*>())
                prefs.putString(NVS_KEY_NODE_ID, doc["nodeId"].as<const char*>());
            if (doc["spaceId"].is<const char*>())
                prefs.putString(NVS_KEY_SPACE_ID, doc["spaceId"].as<const char*>());
            if (doc["wsHost"].is<const char*>())
                prefs.putString(NVS_KEY_WS_HOST, doc["wsHost"].as<const char*>());
            if (doc["wsPort"].is<int>())
                prefs.putUShort(NVS_KEY_WS_PORT, doc["wsPort"].as<int>());
            prefs.end();
            Serial.println("[PROV] Provisioning JSON parsed and saved to NVS");
            return true;
        } else {
            Serial.printf("[PROV] JSON parse failed: %s — falling back to manual fields\n", err.c_str());
        }
    }

    // Fallback: save individual fields
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putString(NVS_KEY_WIFI_SSID, p_ssid.getValue());
    prefs.putString(NVS_KEY_WIFI_PASS, p_pass.getValue());
    prefs.putString(NVS_KEY_MQTT_HOST, p_mqtt.getValue());
    prefs.putUShort(NVS_KEY_MQTT_PORT, (uint16_t)atoi(p_mport.getValue()));
    prefs.putString(NVS_KEY_NODE_ID, p_node.getValue());
    prefs.putString(NVS_KEY_SPACE_ID, p_space.getValue());
    prefs.putString(NVS_KEY_WS_HOST, p_wshost.getValue());
    prefs.putUShort(NVS_KEY_WS_PORT, (uint16_t)atoi(p_wsport.getValue()));
    prefs.end();

    Serial.println("[PROV] Manual config saved to NVS");
    return true;
}

void provisioning_clear() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.clear();
    prefs.end();
    Serial.println("[PROV] NVS config cleared (factory reset)");
}

bool provisioning_check_factory_reset() {
    // GPIO0 = BOOT button on ESP32 boards. Held LOW = pressed.
    pinMode(0, INPUT_PULLUP);
    if (digitalRead(0) == LOW) {
        Serial.println("[PROV] BOOT button held — waiting 3s for factory reset...");
        uint8_t held = 0;
        while (digitalRead(0) == LOW && held < 30) {
            delay(100);
            held++;
        }
        if (held >= 30) { // 3 seconds
            provisioning_clear();
            Serial.println("[PROV] Factory reset triggered — restarting");
            return true;
        }
    }
    return false;
}
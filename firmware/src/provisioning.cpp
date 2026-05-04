#include <Arduino.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>

#include "provisioning.h"
#include "messages.h"

namespace {
// NVS namespace and key constants — file-local to avoid ODR violations (H1)
constexpr const char* NVS_NAMESPACE     = "xentient";
constexpr const char* NVS_KEY_MQTT_HOST = "mqtt_host";
constexpr const char* NVS_KEY_MQTT_PORT = "mqtt_port";
constexpr const char* NVS_KEY_NODE_ID   = "node_id";
constexpr const char* NVS_KEY_SPACE_ID  = "space_id";
constexpr const char* NVS_KEY_WS_HOST   = "ws_host";
constexpr const char* NVS_KEY_WS_PORT   = "ws_port";

// Factory-reset button constants (L2)
constexpr uint8_t  FACTORY_RESET_HOLD_TICKS = 30;
constexpr uint16_t FACTORY_RESET_TICK_MS    = 100;  // 30 * 100ms = 3s

// H2: safeStrncpy guarantees null-termination regardless of source length
void safeStrncpy(char* dst, const char* src, size_t n) {
    if (n == 0) return;
    strncpy(dst, src, n - 1);
    dst[n - 1] = '\0';
}
} // namespace

bool provisioning_has_config() {
    // Only checks the 2 keys required for basic connectivity (MQTT host,
    // Node ID). WiFi creds are managed by WiFiManager internally.
    // The remaining keys (MQTT port, Space ID, WS host, WS port) have
    // compile-time defaults in provisioning_read_config(), so they are not gating. (L3)
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true); // read-only
    bool has = prefs.isKey(NVS_KEY_MQTT_HOST) && prefs.isKey(NVS_KEY_NODE_ID);
    prefs.end();
    return has;
}

ProvisioningConfig provisioning_read_config() {
    ProvisioningConfig cfg = {};
    // Compile-time defaults from build_flags (fallback)
    safeStrncpy(cfg.mqttHost, MQTT_BROKER_ADDR, sizeof(cfg.mqttHost));
    cfg.mqttPort = MQTT_BROKER_PORT;
    safeStrncpy(cfg.nodeId, NODE_BASE_ID, sizeof(cfg.nodeId));
    safeStrncpy(cfg.spaceId, SPACE_ID, sizeof(cfg.spaceId));
    safeStrncpy(cfg.wsHost, WS_HARNESS_HOST, sizeof(cfg.wsHost));
    cfg.wsPort = WS_HARNESS_PORT;

    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);
    if (prefs.isKey(NVS_KEY_MQTT_HOST))
        safeStrncpy(cfg.mqttHost, prefs.getString(NVS_KEY_MQTT_HOST).c_str(), sizeof(cfg.mqttHost));
    if (prefs.isKey(NVS_KEY_MQTT_PORT))
        cfg.mqttPort = prefs.getUShort(NVS_KEY_MQTT_PORT, cfg.mqttPort);
    if (prefs.isKey(NVS_KEY_NODE_ID))
        safeStrncpy(cfg.nodeId, prefs.getString(NVS_KEY_NODE_ID).c_str(), sizeof(cfg.nodeId));
    if (prefs.isKey(NVS_KEY_SPACE_ID))
        safeStrncpy(cfg.spaceId, prefs.getString(NVS_KEY_SPACE_ID).c_str(), sizeof(cfg.spaceId));
    if (prefs.isKey(NVS_KEY_WS_HOST))
        safeStrncpy(cfg.wsHost, prefs.getString(NVS_KEY_WS_HOST).c_str(), sizeof(cfg.wsHost));
    if (prefs.isKey(NVS_KEY_WS_PORT))
        cfg.wsPort = prefs.getUShort(NVS_KEY_WS_PORT, cfg.wsPort);
    prefs.end();
    return cfg;
}

bool provisioning_start_portal(const char* provisioningJson) {
    // TODO: Programmatic JSON input — auto-fill portal fields from provisioningJson parameter
    // Currently JSON paste is only via the WiFiManager form field (prov_json)

    WiFiManager wm;
    wm.setConfigPortalTimeout(180); // 3 min timeout

    // Fetch existing config (or defaults if empty) so fields prepopulate correctly
    // and we don't accidentally overwrite NVS with hardcoded defaults on AutoConnect.
    ProvisioningConfig curCfg = provisioning_read_config();

    // Standard WiFi params handled natively by WiFiManager
    // Extended params
    WiFiManagerParameter p_mqtt("mqtt", "MQTT Broker", curCfg.mqttHost, 46);
    char portStr[8]; sprintf(portStr, "%u", curCfg.mqttPort);
    WiFiManagerParameter p_mport("mport", "MQTT Port", portStr, 6);
    WiFiManagerParameter p_node("node", "Node ID", curCfg.nodeId, 24);
    WiFiManagerParameter p_space("space", "Space ID", curCfg.spaceId, 24);
    WiFiManagerParameter p_wshost("wshost", "WS Host", curCfg.wsHost, 46);
    char wsPortStr[8]; sprintf(wsPortStr, "%u", curCfg.wsPort);
    WiFiManagerParameter p_wsport("wsport", "WS Port", wsPortStr, 6);
    // Paste-JSON field
    WiFiManagerParameter p_json("prov_json", "Provisioning JSON (paste from Dashboard)", "", 512);
    WiFiManagerParameter p_help("<div style='font-size:0.85em; color:#666; margin-top:-10px; margin-bottom:15px;'>&#9432; Optional: Paste the config JSON from the Dashboard here to auto-fill the above settings.</div>");

    wm.addParameter(&p_mqtt);
    wm.addParameter(&p_mport);
    wm.addParameter(&p_node);
    wm.addParameter(&p_space);
    wm.addParameter(&p_wshost);
    wm.addParameter(&p_wsport);
    wm.addParameter(&p_json);
    wm.addParameter(&p_help);

    // If provisioningJson provided, pre-parse and set WiFi creds
    // (WiFiManager doesn't support programmatic pre-fill of custom params,
    //  so we parse after portal saves)

    // Client-side JSON validation in portal
    const char* jsonValidateScript = R"(
<script>
document.addEventListener('DOMContentLoaded', function() {
  var jsonField = document.getElementById('prov_json');
  var form = jsonField ? jsonField.closest('form') : null;
  if (form && jsonField) {
    form.addEventListener('submit', function(e) {
      var val = jsonField.value.trim();
      if (val.length > 0) {
        try { JSON.parse(val); }
        catch(err) {
          e.preventDefault();
          var msg = document.createElement('div');
          msg.style.cssText = 'color:red;padding:8px;margin:4px 0;border:1px solid red;background:#fee';
          msg.textContent = 'Provisioning JSON parse error: ' + err.message;
          jsonField.parentNode.insertBefore(msg, jsonField.nextSibling);
          setTimeout(function() { msg.remove(); }, 5000);
          return false;
        }
      }
    });
  }
});
</script>
)";
    wm.setCustomHeadElement(jsonValidateScript);

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
            // Validate required fields — mqttBroker and nodeId are mandatory
            bool missingRequired = !doc["mqttBroker"].is<const char*>() || !doc["nodeId"].is<const char*>();
            if (missingRequired) {
                Serial.println("[PROV] JSON missing required fields (mqttBroker or nodeId) — aborting save");
                return false;
            }
            // Validate field length bounds (must fit in NVS + C struct)
            auto checkLen = [](const char* label, const char* val, size_t max) -> bool {
                if (val && strlen(val) > max) {
                    Serial.printf("[PROV] Field '%s' too long (%u > %u) — rejected\n", label, (unsigned)strlen(val), (unsigned)max);
                    return false;
                }
                return true;
            };
            if (!checkLen("mqttBroker", doc["mqttBroker"].as<const char*>(), 45) ||
                !checkLen("nodeId", doc["nodeId"].as<const char*>(), 23) ||
                !checkLen("spaceId", doc["spaceId"].is<const char*>() ? doc["spaceId"].as<const char*>() : "", 23) ||
                !checkLen("wsHost", doc["wsHost"].is<const char*>() ? doc["wsHost"].as<const char*>() : "", 45))
                return false;
            Preferences prefs;
            prefs.begin(NVS_NAMESPACE, false);
            // WiFi creds handled by WiFiManager, not NVS
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
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    // WiFi SSID/pass stored by WiFiManager internally — not in Xentient NVS
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
    // Clear Xentient NVS namespace
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    prefs.remove(NVS_KEY_MQTT_HOST);
    prefs.remove(NVS_KEY_MQTT_PORT);
    prefs.remove(NVS_KEY_NODE_ID);
    prefs.remove(NVS_KEY_SPACE_ID);
    prefs.remove(NVS_KEY_WS_HOST);
    prefs.remove(NVS_KEY_WS_PORT);
    // Legacy keys from pre-S3 firmware (wifi_ssid/wifi_pass in xentient namespace)
    prefs.remove("wifi_ssid");
    prefs.remove("wifi_pass");
    prefs.end();

    // Clear WiFiManager's stored WiFi credentials
    // WiFi.disconnect(true) erases SSID/password from NVS flash.
    WiFi.disconnect(true, true);
    delay(100);

    Serial.println("[PROV] NVS + WiFi creds cleared (full factory reset)");
}

bool provisioning_check_factory_reset() {
    // GPIO0 = BOOT button on ESP32 boards. Held LOW = pressed.
    pinMode(0, INPUT_PULLUP);
    if (digitalRead(0) == LOW) {
        Serial.println("[PROV] BOOT button held — waiting 3s for factory reset...");
        uint8_t held = 0;
        while (digitalRead(0) == LOW && held < FACTORY_RESET_HOLD_TICKS) {
            delay(FACTORY_RESET_TICK_MS);
            held++;
        }
        if (held >= FACTORY_RESET_HOLD_TICKS) {
            provisioning_clear();
            Serial.println("[PROV] Factory reset triggered — restarting");
            return true;
        }
    }
    return false;
}

void provisioning_migrate_legacy() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    if (prefs.isKey("wifi_ssid")) {
        prefs.remove("wifi_ssid");
        Serial.println("[PROV] Migrated: removed legacy wifi_ssid key");
    }
    if (prefs.isKey("wifi_pass")) {
        prefs.remove("wifi_pass");
        Serial.println("[PROV] Migrated: removed legacy wifi_pass key");
    }
    prefs.end();
}

#pragma once
#include <cstdint>

// NVS namespace and key constants
static constexpr const char* NVS_NAMESPACE     = "xentient";
static constexpr const char* NVS_KEY_WIFI_SSID = "wifi_ssid";
static constexpr const char* NVS_KEY_WIFI_PASS = "wifi_pass";
static constexpr const char* NVS_KEY_MQTT_HOST = "mqtt_host";
static constexpr const char* NVS_KEY_MQTT_PORT = "mqtt_port";
static constexpr const char* NVS_KEY_NODE_ID   = "node_id";
static constexpr const char* NVS_KEY_SPACE_ID  = "space_id";
static constexpr const char* NVS_KEY_WS_HOST   = "ws_host";
static constexpr const char* NVS_KEY_WS_PORT   = "ws_port";

struct ProvisioningConfig {
    char wifiSsid[33];
    char wifiPass[64];
    char mqttHost[46];
    uint16_t mqttPort;
    char nodeId[24];
    char spaceId[24];
    char wsHost[46];
    uint16_t wsPort;
};

// Returns true if NVS has all required keys populated
bool provisioning_has_config();

// Read stored config from NVS. Returns default-filled struct if missing keys.
ProvisioningConfig provisioning_read_config();

// Start WiFiManager captive portal. Blocks until user saves or timeout.
// If provisioningJson is non-empty, auto-fills from parsed JSON.
// Returns true if new config was saved.
bool provisioning_start_portal(const char* provisioningJson = nullptr);

// Clear all stored config (factory reset)
void provisioning_clear();

// Check GPIO0 (BOOT button) held for 3s on power-up → factory reset
// Call this early in setup() before any WiFi/NVS reads.
// Returns true if factory reset was triggered (caller should ESP.restart()).
bool provisioning_check_factory_reset();
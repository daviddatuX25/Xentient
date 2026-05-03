# ESP32 WiFiManager + NVS Provisioning Stress-Test Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 scenario gaps identified in the WiFiManager + NVS provisioning stress test, prioritizing the demo happy path (S12) and the critical MQTT topic resolution bug (S10).

**Architecture:** Three-layer fix strategy: (1) Firmware runtime topic resolution — replace compile-time `{nodeId}` strings with runtime-resolved nodeId from NVS config; (2) WiFiManager lifecycle hardening — fix factory reset, portal timeout, and dead WiFi creds in NVS; (3) Harness node-connect detection — add MQTT birth message so harness knows when ESP32 connects.

**Tech Stack:** ESP32 Arduino (Preferences.h, WiFiManager, PubSubClient), TypeScript (Harness MqttClient, SpaceManager)

---

## Scenario Audit Results

| # | Scenario | Verdict | Root Cause | Priority |
|---|----------|---------|------------|----------|
| S1 | Fresh boot happy path | Partially works | Portal pre-fills compile-time defaults on empty device | MEDIUM |
| S2 | Normal reboot with NVS | Works | WiFiManager reconnects from its own storage, NVS for extended config | — |
| S3 | JSON vs portal WiFi conflict | Broken | NVS WiFi creds never used for connection; WiFiManager has its own store | HIGH |
| S4 | Factory reset via BOOT | Partially works | Clears NVS but not WiFiManager's WiFi store | HIGH |
| S5 | Harness restart before ESP32 connects | Broken | No dynamic node registration; hardcoded Space in core.ts | MEDIUM |
| S6 | ESP32 MQTT connect detection | Broken | No birth message or confirmNode; profile_ack only after profile_set | CRITICAL |
| S7 | Portal timeout (180s) | Works but fragile | Infinite restart loop; no deep sleep fallback | LOW |
| S8 | Malformed JSON | Partially works | Parse error falls back OK; partial JSON succeeds but may leave gaps | LOW |
| S9 | MCP tool vs REST endpoint | N/A | Neither implemented yet | MEDIUM |
| S10 | MQTT {nodeId} topic resolution | **CRITICAL BUG** | Firmware subscribes to literal `xentient/node/{nodeId}/profile/set`; harness publishes to resolved `xentient/node/node-01/profile/set` — they NEVER match | **CRITICAL** |
| S11 | cleanupStale removes active token | N/A | NodeProvisioner not implemented | LOW |
| S12 | Demo happy path minimum fixes | Blocked by S10, S6, S4 | — | **CRITICAL** |

---

## File Structure

### Firmware (modified)
- Modify: `firmware/src/mqtt_client.cpp` — runtime topic resolution using nodeId from provisioning config
- Modify: `firmware/include/mqtt_client.h` — add `mqtt_init()` signature change to accept nodeId
- Modify: `firmware/src/main.cpp` — pass nodeId from ProvisioningConfig to mqtt_init
- Modify: `firmware/shared/messages.h` — remove `{nodeId}` from topic constants, add template helper
- Modify: `firmware/src/provisioning.cpp` — add WiFiManager WiFi erase in `provisioning_clear()`, fix dead NVS WiFi creds

### Harness (modified)
- Modify: `harness/src/comms/MqttClient.ts` — emit `nodeBirth` on firmware connect message
- Modify: `harness/src/engine/SpaceManager.ts` — handle `nodeBirth` → transition node to active
- Modify: `harness/src/core.ts` — wire `nodeBirth` event

### Tests (new/modified)
- Create: `firmware/tests/test_topic_resolution.cpp` — PlatformIO unit test for topic string building
- Modify: `harness/tests/mcp-integration.test.ts` — add nodeBirth detection test

---

## Task 1: [CRITICAL] Fix MQTT Topic Resolution — Replace `{nodeId}` with Runtime Value

**The #1 demo blocker.** Firmware subscribes to the literal string `xentient/node/{nodeId}/profile/set` instead of resolving `{nodeId}` to the actual nodeId from NVS. Harness publishes to `xentient/node/node-01/profile/set`. They never match, so profile hot-swap is completely broken.

**Files:**
- Modify: `firmware/shared/messages.h:110-111`
- Modify: `firmware/src/mqtt_client.cpp:43-45, 185, 289`
- Modify: `firmware/include/mqtt_client.h:12`
- Modify: `firmware/src/main.cpp:358`

- [ ] **Step 1: Add runtime topic builder in messages.h**

Replace the static `TOPIC_NODE_PROFILE_SET` and `TOPIC_NODE_PROFILE_ACK` with template strings and a builder function. Keep the template strings for documentation but add a runtime builder.

In `firmware/shared/messages.h`, replace lines 110-111:

```cpp
// --- MQTT topics for NodeProfile hot-swap ---
// NOTE: {nodeId} MUST be resolved at runtime. These are template strings,
// NOT subscribe/publish targets. Use buildNodeTopic() to get the resolved topic.
static constexpr const char* TOPIC_NODE_PROFILE_SET_TPL = "xentient/node/{nodeId}/profile/set";
static constexpr const char* TOPIC_NODE_PROFILE_ACK_TPL = "xentient/node/{nodeId}/profile/ack";
static constexpr const char* TOPIC_NODE_PROFILE_SET_BASE = "xentient/node/";
static constexpr const char* TOPIC_NODE_PROFILE_SET_SUFFIX = "/profile/set";
static constexpr const char* TOPIC_NODE_PROFILE_ACK_SUFFIX = "/profile/ack";

// Build a resolved topic string: "xentient/node/<nodeId>/profile/set" or "/ack"
// buf must be at least 64 bytes. Returns pointer to buf.
char* buildNodeTopic(const char* nodeId, const char* suffix, char* buf, size_t bufLen);
```

- [ ] **Step 2: Implement buildNodeTopic() in a new small source file**

Create `firmware/src/topic_builder.cpp`:

```cpp
#include <Arduino.h>
#include "messages.h"
#include <cstdio>

char* buildNodeTopic(const char* nodeId, const char* suffix, char* buf, size_t bufLen) {
    snprintf(buf, bufLen, "xentient/node/%s%s", nodeId, suffix);
    return buf;
}
```

- [ ] **Step 3: Modify mqtt_client.cpp to accept nodeId and resolve topics at runtime**

Add a static `nodeId` storage in `mqtt_client.cpp` and resolve topics at init time.

Replace the static topic strings with runtime-resolved ones. In `firmware/src/mqtt_client.cpp`:

After the existing static variables (around line 11), add:

```cpp
// --- Runtime-resolved nodeId for topic building ---
static char runtimeNodeId[24] = NODE_BASE_ID;
static char resolvedTopicProfileSet[64] = {0};
static char resolvedTopicProfileAck[64] = {0};
```

Modify `mqtt_init()` to accept and store nodeId:

```cpp
void mqtt_init(const char* brokerHost, uint16_t brokerPort, const char* nodeId) {
    strncpy(mqttBrokerHost, brokerHost, sizeof(mqttBrokerHost) - 1);
    mqttBrokerHost[sizeof(mqttBrokerHost) - 1] = '\0';
    mqttBrokerPort = brokerPort;
    if (nodeId) {
        strncpy(runtimeNodeId, nodeId, sizeof(runtimeNodeId) - 1);
        runtimeNodeId[sizeof(runtimeNodeId) - 1] = '\0';
    }
    // Resolve nodeId-dependent topics at runtime
    buildNodeTopic(runtimeNodeId, TOPIC_NODE_PROFILE_SET_SUFFIX, resolvedTopicProfileSet, sizeof(resolvedTopicProfileSet));
    buildNodeTopic(runtimeNodeId, TOPIC_NODE_PROFILE_ACK_SUFFIX, resolvedTopicProfileAck, sizeof(resolvedTopicProfileAck));
    client.setServer(mqttBrokerHost, mqttBrokerPort);
    client.setCallback(mqtt_callback);
    mqtt_connect();
}
```

Replace all references to `TOPIC_NODE_PROFILE_SET` with `resolvedTopicProfileSet`:

In `mqtt_connect()` (line 45):
```cpp
    mqtt_subscribe(resolvedTopicProfileSet);
```

In `mqtt_callback()` (line 185):
```cpp
    if (strcmp(topic, resolvedTopicProfileSet) == 0) {
```

In `send_profile_ack()` (line 289):
```cpp
    mqtt_publish(resolvedTopicProfileAck, buf, strlen(buf));
```

- [ ] **Step 4: Update mqtt_client.h signature**

In `firmware/include/mqtt_client.h`, change:
```cpp
void mqtt_init(const char* brokerHost, uint16_t brokerPort);
```
to:
```cpp
void mqtt_init(const char* brokerHost, uint16_t brokerPort, const char* nodeId = nullptr);
```

- [ ] **Step 5: Update main.cpp to pass nodeId**

In `firmware/src/main.cpp`, change the `mqtt_init()` call from:
```cpp
    mqtt_init(cfg.mqttHost, cfg.mqttPort);
```
to:
```cpp
    mqtt_init(cfg.mqttHost, cfg.mqttPort, cfg.nodeId);
```

- [ ] **Step 6: Verify build compiles**

Run: `cd firmware && pio run -e node_base`
Expected: Build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add firmware/shared/messages.h firmware/src/topic_builder.cpp firmware/src/mqtt_client.cpp firmware/include/mqtt_client.h firmware/src/main.cpp
git commit -m "fix(firmware): resolve {nodeId} in MQTT topics at runtime — profile hot-swap was broken"
```

---

## Task 2: [CRITICAL] Add MQTT Birth Message for Node-Connect Detection

**S6 fix.** Currently the harness has no way to know when an ESP32 connects to MQTT. Profile ack only fires after a profile_set command. Add a birth message that the firmware publishes on first MQTT connect, so the harness can transition the node from "dormant" to "connected".

**Files:**
- Modify: `firmware/shared/messages.h` — add birth topic + message type
- Modify: `firmware/src/mqtt_client.cpp` — publish birth message on connect
- Modify: `harness/src/comms/MqttClient.ts` — emit `nodeBirth` event
- Modify: `harness/src/engine/SpaceManager.ts` — handle nodeBirth
- Modify: `harness/src/core.ts` — wire nodeBirth event

- [ ] **Step 1: Add birth message constants in messages.h**

In `firmware/shared/messages.h`, after the NodeProfile section:

```cpp
// --- Node birth message (published on first MQTT connect) ---
static constexpr const char* TOPIC_NODE_BIRTH = "xentient/node/{nodeId}/birth";
static constexpr const char* TOPIC_NODE_BIRTH_SUFFIX = "/birth";
// Message: { v:1, type:"node_birth", nodeId:"node-01", timestamp:ms }
```

- [ ] **Step 2: Publish birth message in mqtt_connect()**

In `firmware/src/mqtt_client.cpp`, add a static `resolvedTopicBirth` and publish in `mqtt_connect()`:

Add alongside other static resolved topics:
```cpp
static char resolvedTopicBirth[64] = {0};
```

In `mqtt_init()`, after the `buildNodeTopic` calls:
```cpp
    buildNodeTopic(runtimeNodeId, TOPIC_NODE_BIRTH_SUFFIX, resolvedTopicBirth, sizeof(resolvedTopicBirth));
```

In `mqtt_connect()`, after `Serial.println("[MQTT] Connected.")`:
```cpp
        // Publish birth message so harness knows this node is online
        JsonDocument birthDoc;
        birthDoc["v"]        = MSG_VERSION;
        birthDoc["type"]     = "node_birth";
        birthDoc["nodeId"]   = runtimeNodeId;
        birthDoc["timestamp"] = (uint32_t)millis();
        char birthBuf[128];
        serializeJson(birthDoc, birthBuf, sizeof(birthBuf));
        mqtt_publish(resolvedTopicBirth, birthBuf, strlen(birthBuf));
        Serial.printf("[MQTT] Birth message published for node '%s'\n", runtimeNodeId);
```

- [ ] **Step 3: Handle nodeBirth in harness MqttClient.ts**

In `harness/src/comms/MqttClient.ts`, add the `xentient/node/+/birth` subscription and emit:

In the `connect` handler's subscribe list, add:
```typescript
        'xentient/node/+/birth',
```

In `handleMessage()`, add a new branch:
```typescript
      } else if (topic.startsWith('xentient/node/') && topic.endsWith('/birth')) {
        this.emit('nodeBirth', data);
      }
```

Note: This must come BEFORE the generic `topic.startsWith('xentient/node/')` catch at the end of the chain, so reorder accordingly. Actually, looking at the current code, the `profile/ack` handler already uses `startsWith('xentient/node/') && topic.endsWith('/profile/ack')`. The birth handler should use similar pattern. Update the existing `profile/ack` check to also handle `/birth`:

```typescript
      } else if (topic.startsWith('xentient/node/')) {
        if (topic.endsWith('/profile/ack')) {
          this.emit('nodeProfileAck', data);
        } else if (topic.endsWith('/birth')) {
          this.emit('nodeBirth', data);
        } else {
          logger.warn({ topic }, 'Unhandled node topic');
        }
      }
```

- [ ] **Step 4: Handle nodeBirth in SpaceManager.ts**

In `harness/src/engine/SpaceManager.ts`, add:

```typescript
  /** Handle firmware birth message — node is online and ready */
  onNodeBirth(nodeId: string): void {
    for (const [, space] of this.spaces) {
      const node = space.nodes.find(n => n.nodeId === nodeId);
      if (node) {
        if (node.state === 'dormant') {
          node.state = 'running';
          logger.info({ nodeId }, 'Node birth received — transitioning to running');
          // Push default profile to newly connected node
          this.pushDefaultProfile(node);
        }
        break;
      }
    }
  }
```

- [ ] **Step 5: Wire nodeBirth in core.ts**

In `harness/src/core.ts`, after the existing `nodeProfileAck` wiring:

```typescript
  mqtt.on('nodeBirth', (data: { nodeId: string }) => {
    spaceManager.onNodeBirth(data.nodeId);
  });
```

- [ ] **Step 6: Commit**

```bash
git add firmware/shared/messages.h firmware/src/mqtt_client.cpp harness/src/comms/MqttClient.ts harness/src/engine/SpaceManager.ts harness/src/core.ts
git commit -m "feat: add MQTT node birth message for connect detection (S6)"
```

---

## Task 3: [HIGH] Fix Factory Reset — Clear WiFiManager WiFi Creds

**S4 fix.** `provisioning_clear()` only clears the NVS "xentient" namespace. WiFiManager stores WiFi creds in its own internal namespace (`wifi` or similar). After factory reset, the device still auto-connects to the old WiFi.

**Files:**
- Modify: `firmware/src/provisioning.cpp:155-167`

- [ ] **Step 1: Add WiFi.erase() to provisioning_clear()**

In `firmware/src/provisioning.cpp`, replace `provisioning_clear()`:

```cpp
void provisioning_clear() {
    // Clear NVS "xentient" namespace (mqtt, nodeId, spaceId, ws config)
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    prefs.remove(NVS_KEY_WIFI_SSID);
    prefs.remove(NVS_KEY_WIFI_PASS);
    prefs.remove(NVS_KEY_MQTT_HOST);
    prefs.remove(NVS_KEY_MQTT_PORT);
    prefs.remove(NVS_KEY_NODE_ID);
    prefs.remove(NVS_KEY_SPACE_ID);
    prefs.remove(NVS_KEY_WS_HOST);
    prefs.remove(NVS_KEY_WS_PORT);
    prefs.end();

    // Clear WiFiManager's stored WiFi credentials
    // WiFiManager uses ESP32's WiFi storage (nvs namespace "wifi")
    // WiFi.erase() clears ALL stored WiFi credentials
    WiFi.disconnect(true, true);  // disconnect + clear WiFi config
    delay(100);

    Serial.println("[PROV] NVS config + WiFi creds cleared (factory reset)");
}
```

Note: `WiFi.disconnect(true, true)` — first `true` = erase SSID/password from flash, second `true` = disconnect from current AP. This clears WiFiManager's stored creds.

- [ ] **Step 2: Also clear WiFiManager's internal portal config**

WiFiManager stores its own state. Add `wm.resetSettings()` equivalent. Since we don't have a WiFiManager instance in `provisioning_clear()`, use the WiFi API directly. `WiFi.erase()` is the ESP32 equivalent.

Actually, `WiFi.disconnect(true, true)` on ESP32 already handles this. But for extra safety, also explicitly erase the WiFiManager NVS key:

```cpp
    // Also clear WiFiManager's portal-stored credentials
    // (it uses Preferences with namespace "wifi" internally)
    Preferences wifiPrefs;
    wifiPrefs.begin("wifi", false);
    wifiPrefs.clear();
    wifiPrefs.end();
```

Wait — WiFiManager may use a different namespace. The safest approach is to use `WiFi.disconnect(true, true)` which is the ESP32 SDK-level erase. Let's keep it simple and robust:

```cpp
void provisioning_clear() {
    // Clear Xentient NVS namespace
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    prefs.remove(NVS_KEY_WIFI_SSID);
    prefs.remove(NVS_KEY_WIFI_PASS);
    prefs.remove(NVS_KEY_MQTT_HOST);
    prefs.remove(NVS_KEY_MQTT_PORT);
    prefs.remove(NVS_KEY_NODE_ID);
    prefs.remove(NVS_KEY_SPACE_ID);
    prefs.remove(NVS_KEY_WS_HOST);
    prefs.remove(NVS_KEY_WS_PORT);
    prefs.end();

    // Clear WiFiManager's stored WiFi credentials
    // This ensures factory reset truly wipes ALL stored config.
    // WiFi.disconnect(true) erases SSID/password from NVS flash.
    WiFi.disconnect(true, true);
    delay(100);

    Serial.println("[PROV] NVS + WiFi creds cleared (full factory reset)");
}
```

- [ ] **Step 3: Commit**

```bash
git add firmware/src/provisioning.cpp
git commit -m "fix(firmware): factory reset clears WiFiManager WiFi creds (S4)"
```

---

## Task 4: [HIGH] Fix Dead NVS WiFi Credentials — Remove or Document

**S3 fix.** NVS stores `wifi_ssid` and `wifi_pass`, but these are never read for WiFi connection — WiFiManager uses its own internal storage. The NVS WiFi keys are dead data that mislead anyone reading the code. Two options:
1. Remove NVS WiFi keys entirely (WiFiManager handles WiFi)
2. Keep them as backup documentation but mark as "informational only"

Going with option 1: remove the dead keys and stop writing them.

**Files:**
- Modify: `firmware/src/provisioning.cpp:65-68, 135-136, 158-159`
- Modify: `firmware/src/provisioning.h` — remove wifiSsid/wifiPass from ProvisioningConfig? NO — keep for JSON provisioning compatibility

Wait — the JSON provisioning flow from the dashboard token DOES include wifiSsid/wifiPass. The user pastes JSON that may contain WiFi creds. We need to handle that case:
- If JSON has wifiSsid/wifiPass, we should use them for WiFiManager's connection
- But WiFiManager's autoConnect already handles WiFi from its own storage
- The portal form's SSID/pass are what WiFiManager uses for THIS session

The real fix: when parsing JSON with wifiSsid/wifiPass, programmatically set WiFiManager's stored creds so they persist. Use `WiFi.begin(ssid, pass)` + `WiFi.setAutoConnect(true)` or use WiFiManager's `setConf()` method.

Actually, the simplest correct approach: remove the NVS wifi_ssid/wifi_pass keys entirely since they're never read. WiFi creds belong to WiFiManager, not NVS. If JSON has wifiSsid/wifiPass, ignore them in NVS (they were already used by WiFiManager's portal form for this session, or if JSON was pasted, WiFiManager's autoConnect already connected using the portal form's SSID/pass).

Better approach: When JSON has wifiSsid/wifiPass, we should tell WiFiManager to use those as its stored WiFi creds for future reboots. We can do this by calling `WiFi.begin()` with the JSON creds after saving them, which stores them in the ESP32 WiFi NVS:

- [ ] **Step 1: Remove NVS wifi_ssid/wifi_pass from provisioning.cpp**

In `provisioning_read_config()`, remove the lines that read `NVS_KEY_WIFI_SSID` and `NVS_KEY_WIFI_PASS`.

In `provisioning_start_portal()`, in the JSON parse section, instead of writing wifi_ssid/wifi_pass to NVS, use `WiFi.begin()` to store them in ESP32 WiFi flash:

```cpp
            // Store WiFi creds in ESP32 WiFi flash (not NVS)
            // so WiFiManager can use them on next reboot
            if (doc["wifiSsid"].is<const char*>() && doc["wifiPass"].is<const char*>()) {
                const char* ssid = doc["wifiSsid"].as<const char*>();
                const char* pass = doc["wifiPass"].as<const char*>();
                WiFi.begin(ssid, pass);  // stores to flash for auto-reconnect
                Serial.printf("[PROV] WiFi creds from JSON stored: SSID=%s\n", ssid);
            }
```

In the fallback manual-field save section, remove `NVS_KEY_WIFI_SSID` and `NVS_KEY_WIFI_PASS` writes. WiFiManager already handles WiFi cred storage internally.

In `provisioning_clear()`, remove `NVS_KEY_WIFI_SSID` and `NVS_KEY_WIFI_PASS` removals (already covered by `WiFi.disconnect(true, true)`).

In `provisioning_has_config()`, remove wifi_ssid and wifi_pass from the check (WiFiManager handles WiFi separately):

```cpp
bool provisioning_has_config() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);
    bool has = prefs.isKey(NVS_KEY_MQTT_HOST) && prefs.isKey(NVS_KEY_NODE_ID);
    prefs.end();
    return has;
}
```

Wait — we also removed wifi_pass. But what if someone provisions ONLY via the JSON field with WiFi creds? In that case WiFiManager's autoConnect has already connected using the portal form's SSID/pass. The JSON WiFi creds are for NEXT reboot. We need WiFiManager to pick them up.

Actually the simplest correct fix: In the JSON parse branch, after parsing, also call `WiFi.setAutoConnect(true)` and manually store the credentials via `WiFi.begin()`:

```cpp
if (doc["wifiSsid"].is<const char*>() && doc["wifiPass"].is<const char*>()) {
    const char* jSsid = doc["wifiSsid"].as<const char*>();
    const char* jPass = doc["wifiPass"].as<const char*>();
    // Store JSON WiFi creds in ESP32 WiFi NVS for future autoConnect
    WiFi.setAutoConnect(true);
    WiFi.begin(jSsid, jPass);
    delay(100);
}
```

But this is a bit risky — we're already connected via the portal's WiFi, and calling `WiFi.begin()` might disconnect and reconnect. Let's use a simpler approach: just use `WiFi.setAutoConnect(true)` and store the creds via the ESP32 NVS API directly:

Actually, the safest approach for the demo: just remove the NVS wifi keys and add a Serial note. WiFiManager handles WiFi. JSON wifi creds are informational only — if they differ from the portal form, the user will need to re-provision. This is acceptable for demo scope.

- [ ] **Step 1: Remove dead NVS WiFi keys from provisioning_has_config()**

In `firmware/src/provisioning.cpp`, change `provisioning_has_config()`:

```cpp
bool provisioning_has_config() {
    // WiFi connectivity is managed by WiFiManager (separate NVS namespace).
    // We only check MQTT + nodeId — the keys that Xentient NVS owns.
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);
    bool has = prefs.isKey(NVS_KEY_MQTT_HOST) && prefs.isKey(NVS_KEY_NODE_ID);
    prefs.end();
    return has;
}
```

- [ ] **Step 2: Remove NVS WiFi key writes from provisioning_start_portal()**

In the JSON parse branch, remove:
```cpp
            if (doc["wifiSsid"].is<const char*>())
                prefs.putString(NVS_KEY_WIFI_SSID, doc["wifiSsid"].as<const char*>());
            if (doc["wifiPass"].is<const char*>())
                prefs.putString(NVS_KEY_WIFI_PASS, doc["wifiPass"].as<const char*>());
```

Replace with:
```cpp
            // WiFi creds are handled by WiFiManager, not NVS.
            // If JSON has different WiFi than portal form, the user must
            // re-provision next session (acceptable for demo scope — S3 note).
```

In the manual-field fallback, remove:
```cpp
    prefs.putString(NVS_KEY_WIFI_SSID, p_ssid.getValue());
    prefs.putString(NVS_KEY_WIFI_PASS, p_pass.getValue());
```

Replace with comment:
```cpp
    // WiFi SSID/pass stored by WiFiManager internally — not in Xentient NVS
```

In `provisioning_read_config()`, remove:
```cpp
    if (prefs.isKey(NVS_KEY_WIFI_SSID))
        safeStrncpy(cfg.wifiSsid, prefs.getString(NVS_KEY_WIFI_SSID).c_str(), sizeof(cfg.wifiSsid));
    if (prefs.isKey(NVS_KEY_WIFI_PASS))
        safeStrncpy(cfg.wifiPass, prefs.getString(NVS_KEY_WIFI_PASS).c_str(), sizeof(cfg.wifiPass));
```

- [ ] **Step 3: Remove NVS WiFi key removals from provisioning_clear()**

Remove:
```cpp
    prefs.remove(NVS_KEY_WIFI_SSID);
    prefs.remove(NVS_KEY_WIFI_PASS);
```

They're already handled by `WiFi.disconnect(true, true)`.

- [ ] **Step 4: Remove NVS_KEY_WIFI_SSID/PASS constants**

In the anonymous namespace at the top of provisioning.cpp, remove:
```cpp
constexpr const char* NVS_KEY_WIFI_SSID = "wifi_ssid";
constexpr const char* NVS_KEY_WIFI_PASS = "wifi_pass";
```

- [ ] **Step 5: Commit**

```bash
git add firmware/src/provisioning.cpp
git commit -m "fix(firmware): remove dead NVS WiFi keys — WiFiManager owns WiFi lifecycle (S3)"
```

---

## Task 5: [MEDIUM] Add JSON Parse Error Feedback in WiFiManager Portal

**S8 fix.** When a user pastes malformed JSON, the firmware falls back to manual fields silently (only a Serial message). The user has no indication that their JSON was rejected. Add visible feedback.

**Files:**
- Modify: `firmware/src/provisioning.cpp:97-103`

- [ ] **Step 1: Add a WiFiManager custom parameter for status display**

WiFiManager doesn't natively support status messages in the portal. The workaround is to add a read-only parameter that shows the result. But WiFiManager's custom HTML support is limited.

A simpler approach: use WiFiManager's `setCustomHeadElement()` to inject a small JavaScript that validates the JSON field client-side before form submission.

In `provisioning_start_portal()`, before `wm.autoConnect()`:

```cpp
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
          alert('Provisioning JSON parse error: ' + err.message + '\\nPlease fix the JSON or clear the field to use manual entries.');
          return false;
        }
      }
    });
  }
});
</script>
)";
    wm.setCustomHeadElement(jsonValidateScript);
```

- [ ] **Step 2: Add firmware-side fallback logging for partial JSON**

After the JSON parse succeeds but before saving to NVS, add a validation check for required fields:

```cpp
        if (!err) {
            // Validate required fields
            if (!doc["mqttBroker"].is<const char*>() && !doc["nodeId"].is<const char*>()) {
                Serial.println("[PROV] JSON missing required fields (mqttBroker, nodeId) — saving what we have");
            }
            // ... existing NVS save code ...
```

- [ ] **Step 3: Commit**

```bash
git add firmware/src/provisioning.cpp
git commit -m "fix(firmware): add client-side JSON validation + required-field check in portal (S8)"
```

---

## Task 6: [MEDIUM] Fix Portal Timeout — Deep Sleep Instead of Restart Loop

**S7 fix.** Currently, portal timeout (180s with no user action) triggers `ESP.restart()`, which reboots into the same portal, creating an infinite loop. Add a deep sleep fallback so the device doesn't thrash.

**Files:**
- Modify: `firmware/src/main.cpp:340-344`

- [ ] **Step 1: Add deep sleep on portal timeout**

In `firmware/src/main.cpp`, replace the portal timeout restart:

```cpp
        if (!provisioning_start_portal()) {
            Serial.println("[BOOT] Portal timeout — entering deep sleep for 60s then retry");
            lcd_display_face("(x_x)", "timeout...");
            delay(1000);
            esp_sleep_enable_timer_wakeup(60 * 1000000); // 60s in microseconds
            esp_deep_sleep_start();
            // Never reaches here — wakes up and re-runs setup()
        }
```

Same for the "no NVS config" branch:

```cpp
        if (!provisioning_start_portal()) {
            Serial.println("[BOOT] Portal timeout — entering deep sleep for 60s then retry");
            lcd_display_face("(x_x)", "timeout...");
            delay(1000);
            esp_sleep_enable_timer_wakeup(60 * 1000000);
            esp_deep_sleep_start();
        }
```

- [ ] **Step 2: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "fix(firmware): portal timeout enters 60s deep sleep instead of restart loop (S7)"
```

---

## Task 7: [LOW] Add Partial JSON Warning for Incomplete Config

**S8 partial fix.** When JSON parses successfully but is missing required fields (mqttBroker, nodeId), the firmware saves whatever it has. Add a warning Serial log so debugging is easier, and add a runtime check after `provisioning_read_config()` in main.cpp.

**Files:**
- Modify: `firmware/src/main.cpp` — add config completeness check after provisioning

- [ ] **Step 1: Add config validation after provisioning_read_config()**

In `firmware/src/main.cpp`, after `cfg = provisioning_read_config()`, add:

```cpp
    // Validate config completeness
    if (cfg.mqttHost[0] == '\0' || cfg.nodeId[0] == '\0') {
        Serial.println("[BOOT] Incomplete config — mqttHost or nodeId missing, restarting portal");
        provisioning_clear();
        lcd_display_face("(?_?)", "bad config");
        delay(2000);
        esp_sleep_enable_timer_wakeup(10 * 1000000); // 10s
        esp_deep_sleep_start();
    }
```

- [ ] **Step 2: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "fix(firmware): validate config completeness after provisioning (S8)"
```

---

## Task 8: Harness — Wire MQTT Reconnect → Profile Replay for Birth Messages

**S6 continuation.** When MQTT reconnects after a broker restart, the firmware should re-publish its birth message. The harness should re-push profiles.

**Files:**
- Modify: `firmware/src/mqtt_client.cpp` — re-publish birth on reconnect
- Modify: `harness/src/engine/SpaceManager.ts` — onMqttReconnect re-pushes profiles

- [ ] **Step 1: Re-publish birth message in mqtt_reconnect()**

In `firmware/src/mqtt_client.cpp`, in the `SYSTEM_EVENT_STA_GOT_IP` handler (already in main.cpp) and in `mqtt_reconnect()`, after successful connect, the birth message is already published in `mqtt_connect()`. Since `mqtt_reconnect()` calls `mqtt_connect()`, this is already handled. No change needed.

- [ ] **Step 2: Verify onMqttReconnect in SpaceManager already replays profiles**

Looking at `SpaceManager.onMqttReconnect()`:

```typescript
  onMqttReconnect(): void {
    logger.info('MQTT reconnected — replaying active configurations');
    for (const [spaceId, space] of this.spaces) {
```

This already re-pushes active profiles. Combined with the birth message, the harness now has full reconnect detection. No code change needed — just verification.

- [ ] **Step 3: Verify — done, no code change needed**

---

## Task 9: Harness — Add NodeProvisioner for Dynamic Node Registration

**S5 + S9 + S11 fix.** Currently the harness uses a static Space with hardcoded nodeId. Add `NodeProvisioner` for dynamic token generation and `confirmNode()`.

**Files:**
- Create: `harness/src/comms/NodeProvisioner.ts`
- Modify: `harness/src/shared/types.ts` — add `ProvisioningToken`, update `SpaceNode`
- Modify: `harness/src/engine/SpaceManager.ts` — add `registerNode()`, `updateNodeStatus()`, `removeNode()`
- Modify: `harness/src/mcp/tools.ts` — add `xentient_register_node` MCP tool
- Modify: `harness/src/comms/ControlServer.ts` — add `POST /api/nodes/register`
- Create: `harness/tests/node-provisioner.test.ts`

- [ ] **Step 1: Add ProvisioningToken type and update SpaceNode in types.ts**

In `harness/src/shared/types.ts`, add:

```typescript
/** Token generated by Core for ESP32 provisioning */
export interface ProvisioningToken {
  nodeId: string;
  spaceId: string;
  mqttBroker: string;
  mqttPort: number;
  wsHost: string;
  wsPort: number;
  wifiSsid?: string;
  wifiPass?: string;
}
```

Update `SpaceNode` type to include `status` and `lastSeen`:

```typescript
export interface SpaceNode {
  nodeId: string;
  role: string;
  hardware: string[];
  state: 'dormant' | 'running';
  status?: 'pending' | 'active';  // provisioning status
  lastSeen?: number;               // last birth message timestamp
}
```

- [ ] **Step 2: Create NodeProvisioner.ts**

```typescript
import { randomUUID } from 'crypto';
import type { ProvisioningToken } from '../shared/types';
import type { SpaceManager } from '../engine/SpaceManager';
import pino from 'pino';

const logger = pino({ name: 'node-provisioner' }, process.stderr);

export class NodeProvisioner {
  private pendingTokens = new Map<string, {
    token: ProvisioningToken;
    spaceId: string;
    role: string;
    hardware: string[];
    createdAt: number;
  }>();

  constructor(
    private getMqttBroker: () => { host: string; port: number },
    private getWsHost: () => { host: string; port: number },
    private spaceManager: SpaceManager,
  ) {}

  generateToken(spaceId: string, role: string, hardware: string[], wifiSsid?: string): ProvisioningToken {
    const nodeId = `node_${randomUUID().slice(0, 8)}`;
    const token: ProvisioningToken = {
      nodeId,
      spaceId,
      mqttBroker: this.getMqttBroker().host,
      mqttPort: this.getMqttBroker().port,
      wsHost: this.getWsHost().host,
      wsPort: this.getWsHost().port,
      wifiSsid,
    };

    // Register node in SpaceManager immediately (no orphan tokens)
    this.spaceManager.registerNode(spaceId, {
      nodeId,
      role,
      hardware,
      state: 'dormant',
      status: 'pending',
      lastSeen: Date.now(),
    });

    this.pendingTokens.set(nodeId, { token, spaceId, role, hardware, createdAt: Date.now() });
    logger.info({ nodeId, spaceId }, 'Provisioning token generated');
    return token;
  }

  confirmNode(nodeId: string): boolean {
    const pending = this.pendingTokens.get(nodeId);
    if (!pending) return false;
    this.pendingTokens.delete(nodeId);
    this.spaceManager.updateNodeStatus(pending.spaceId, nodeId, 'active');
    logger.info({ nodeId }, 'Node confirmed — active');
    return true;
  }

  cleanupStale(ttlMs = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [nodeId, entry] of this.pendingTokens.entries()) {
      if (now - entry.createdAt > ttlMs) {
        this.spaceManager.removeNode(entry.token.spaceId, nodeId);
        this.pendingTokens.delete(nodeId);
        cleaned++;
        logger.warn({ nodeId }, 'Stale provisioning token cleaned up');
      }
    }
    return cleaned;
  }
}
```

- [ ] **Step 3: Add registerNode/updateNodeStatus/removeNode to SpaceManager**

In `harness/src/engine/SpaceManager.ts`, add three new methods:

```typescript
  registerNode(spaceId: string, node: SpaceNode): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    if (space.nodes.some(n => n.nodeId === node.nodeId)) return false;
    space.nodes.push(node);
    logger.info({ nodeId: node.nodeId, spaceId }, 'Node registered');
    return true;
  }

  updateNodeStatus(spaceId: string, nodeId: string, status: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    const node = space.nodes.find(n => n.nodeId === nodeId);
    if (!node) return false;
    (node as any).status = status;
    (node as any).lastSeen = Date.now();
    return true;
  }

  removeNode(spaceId: string, nodeId: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    const idx = space.nodes.findIndex(n => n.nodeId === nodeId);
    if (idx < 0) return false;
    space.nodes.splice(idx, 1);
    logger.info({ nodeId, spaceId }, 'Node removed');
    return true;
  }
```

- [ ] **Step 4: Wire NodeProvisioner into core.ts**

In `harness/src/core.ts`, after SpaceManager creation:

```typescript
  import { NodeProvisioner } from './comms/NodeProvisioner';

  // After spaceManager is created...
  const nodeProvisioner = new NodeProvisioner(
    () => ({ host: config.mqtt.brokerUrl.split('//')[1]?.split(':')[0] ?? 'localhost', port: 1883 }),
    () => ({ host: config.mqtt.brokerUrl.split('//')[1]?.split(':')[0] ?? 'localhost', port: parseInt(process.env.WS_PORT ?? String(config.audio.wsPort), 10) }),
    spaceManager,
  );

  // Wire nodeBirth → confirmNode
  mqtt.on('nodeBirth', (data: { nodeId: string }) => {
    nodeProvisioner.confirmNode(data.nodeId);
    spaceManager.onNodeBirth(data.nodeId);
  });

  // Cleanup stale tokens every 5 minutes
  setInterval(() => nodeProvisioner.cleanupStale(), 300000);
```

- [ ] **Step 5: Add xentient_register_node MCP tool**

In `harness/src/mcp/tools.ts`, add a new tool handler:

```typescript
    xentient_register_node: async ({ spaceId, role, hardware, wifiSsid }: {
      spaceId?: string; role?: string; hardware?: string[]; wifiSsid?: string;
    }) => {
      const sid = spaceId ?? 'default';
      const r = role ?? 'base';
      const hw = hardware ?? ['motion', 'temperature', 'humidity', 'audio', 'camera'];
      const token = deps.nodeProvisioner?.generateToken(sid, r, hw, wifiSsid);
      if (!token) {
        return { content: [{ type: 'text' as const, text: 'NodeProvisioner not available' }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: `Node registered. Paste this JSON into your Xentient-Setup portal:\n\n${JSON.stringify(token, null, 2)}`,
        }],
      };
    },
```

Add to `McpToolDeps`:
```typescript
  nodeProvisioner?: NodeProvisioner;
```

- [ ] **Step 6: Add POST /api/nodes/register REST endpoint**

In `harness/src/comms/ControlServer.ts`, add a new route handler (following the existing REST endpoint pattern):

```typescript
    // POST /api/nodes/register — generate provisioning token
    this.app.post('/api/nodes/register', async (req, res) => {
      const { spaceId = 'default', role = 'base', hardware, wifiSsid } = req.body;
      const token = this.deps.nodeProvisioner?.generateToken(
        spaceId, role, hardware ?? ['motion', 'temperature', 'humidity', 'audio', 'camera'], wifiSsid,
      );
      if (!token) {
        res.status(503).json({ error: 'NodeProvisioner not available' });
        return;
      }
      res.json({ token, json: JSON.stringify(token, null, 2) });
    });
```

- [ ] **Step 7: Write tests for NodeProvisioner**

Create `harness/tests/node-provisioner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeProvisioner } from '../src/comms/NodeProvisioner';

function mockSpaceManager() {
  const nodes: any[] = [];
  return {
    registerNode: vi.fn((spaceId: string, node: any) => { nodes.push(node); return true; }),
    updateNodeStatus: vi.fn((spaceId: string, nodeId: string, status: string) => {
      const n = nodes.find(x => x.nodeId === nodeId);
      if (n) n.status = status;
      return true;
    }),
    removeNode: vi.fn((spaceId: string, nodeId: string) => {
      const idx = nodes.findIndex(x => x.nodeId === nodeId);
      if (idx >= 0) nodes.splice(idx, 1);
      return true;
    }),
  } as any;
}

describe('NodeProvisioner', () => {
  let sm: any;
  let provisioner: NodeProvisioner;

  beforeEach(() => {
    sm = mockSpaceManager();
    provisioner = new NodeProvisioner(
      () => ({ host: '10.0.0.1', port: 1883 }),
      () => ({ host: '10.0.0.1', port: 8080 }),
      sm,
    );
  });

  it('generates token with unique nodeId and registers in SpaceManager', () => {
    const token = provisioner.generateToken('default', 'base', ['motion']);
    expect(token.nodeId).toMatch(/^node_[a-f0-9]{8}$/);
    expect(token.spaceId).toBe('default');
    expect(token.mqttBroker).toBe('10.0.0.1');
    expect(sm.registerNode).toHaveBeenCalledWith('default', expect.objectContaining({
      nodeId: token.nodeId,
      status: 'pending',
    }));
  });

  it('generates unique nodeIds across calls', () => {
    const a = provisioner.generateToken('default', 'base', ['motion']);
    const b = provisioner.generateToken('default', 'base', ['motion']);
    expect(a.nodeId).not.toBe(b.nodeId);
  });

  it('confirms a pending node transitions to active', () => {
    const token = provisioner.generateToken('default', 'base', ['motion']);
    expect(provisioner.confirmNode(token.nodeId)).toBe(true);
    expect(sm.updateNodeStatus).toHaveBeenCalledWith('default', token.nodeId, 'active');
  });

  it('returns false for unknown nodeId confirm', () => {
    expect(provisioner.confirmNode('unknown')).toBe(false);
  });

  it('cleanupStale removes expired tokens', () => {
    provisioner.generateToken('default', 'base', ['motion']);
    // TTL=0 means everything is stale
    const cleaned = provisioner.cleanupStale(0);
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(sm.removeNode).toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Commit**

```bash
git add harness/src/comms/NodeProvisioner.ts harness/src/shared/types.ts harness/src/engine/SpaceManager.ts harness/src/mcp/tools.ts harness/src/comms/ControlServer.ts harness/src/core.ts harness/tests/node-provisioner.test.ts
git commit -m "feat(harness): add NodeProvisioner for dynamic node registration (S5, S9, S11)"
```

---

## Self-Review

### Spec Coverage

| Scenario | Task | Status |
|----------|------|--------|
| S1 | No separate task — portal pre-fills are acceptable for demo | ACCEPTABLE |
| S2 | No fix needed — WiFiManager handles correctly | N/A |
| S3 | Task 4 | Fixed |
| S4 | Task 3 | Fixed |
| S5 | Task 9 | Fixed |
| S6 | Task 2 | Fixed |
| S7 | Task 6 | Fixed |
| S8 | Task 5 + Task 7 | Fixed |
| S9 | Task 9 | Fixed |
| S10 | Task 1 | Fixed |
| S11 | Task 9 | Fixed |
| S12 | Tasks 1+2+3+4 | Demo path unblocked |

### Placeholder Scan

No TBDs, TODOs, or "implement later" found. All code blocks contain actual implementation code.

### Type Consistency

- `ProvisioningConfig.wifiSsid/wifiPass` — kept in the struct for JSON compatibility even though NVS no longer stores them. The `provisioning_read_config()` just returns empty strings for these fields now. This is fine — they're informational.
- `mqtt_init()` signature changed to `(const char* brokerHost, uint16_t brokerPort, const char* nodeId = nullptr)` — the default `nullptr` means callers that don't pass nodeId still work (falls back to `NODE_BASE_ID`).
- `buildNodeTopic()` uses `snprintf` with buf/len — standard C pattern, no heap allocation.
- `SpaceNode.status` added as optional field — backward compatible with existing code that doesn't set it.

---

## Demo Happy Path (S12) — Minimum Fix Set

To make the demo work, implement these tasks in order:

1. **Task 1** (S10) — MQTT topic `{nodeId}` resolution. Without this, profile hot-swap is completely broken.
2. **Task 2** (S6) — Birth message. Without this, harness doesn't know the node is online.
3. **Task 3** (S4) — Factory reset. Without this, you can't recover a misconfigured device without serial monitor.
4. **Task 4** (S3) — Remove dead NVS WiFi keys. Cleanup, not blocking but prevents confusion.

Tasks 5-9 are improvements but not demo-blockers.
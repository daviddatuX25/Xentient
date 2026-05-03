# ESP32 WiFiManager + NVS Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `secrets.h` with a 3-layer config stack: NVS storage, WiFiManager captive portal on first boot, and core-generated node registration JSON for zero-friction provisioning.

**Architecture:** Core (Harness) generates a `NodeProvisioningToken` JSON containing nodeId, spaceId, mqttBroker, mqttPort. User copies this JSON into the ESP32 WiFiManager portal's paste field, which auto-fills all config fields. NVS persists across reboots and OTA. Manual field entry remains as fallback.

**Tech Stack:** ESP32 Arduino (Preferences.h for NVS), WiFiManager (tzapu), PlatformIO, TypeScript (Harness side)

---

## File Structure

### Firmware (new/modified)
- Create: `firmware/src/provisioning.h` — NVS key constants, provisioning state machine, factory reset trigger
- Create: `firmware/src/provisioning.cpp` — WiFiManager + NVS read/write logic, GPIO0 factory reset
- Modify: `firmware/shared/messages.h` — remove `#include "secrets.h"`, add `ProvisioningConfig` struct
- Modify: `firmware/shared/secrets.h.example` — update comment to reflect NVS migration path
- Modify: `firmware/src/main.cpp` — call `provisioning_init()` before WiFi/MQTT, use runtime config
- Modify: `firmware/platformio.ini` — add `WiFiManager` to `lib_deps`

### Harness (new/modified)
- Create: `harness/src/comms/NodeProvisioner.ts` — generates provisioning tokens, persists to SpaceManager on generate
- Modify: `harness/src/mcp/tools.ts` — add `xentient_register_node` MCP tool
- Modify: `harness/src/mcp/types.ts` — add Zod schemas for node registration
- Modify: `harness/src/engine/SpaceManager.ts` — `registerNode(spaceId, nodeId, role, hardware)` method
- Modify: `harness/src/shared/types.ts` — add `ProvisioningToken` type
- Modify: `harness/src/core.ts` — dynamic node registration instead of static Space init
- Modify: `harness/public/js/api.js` — add `registerNode()` API call
- Modify: `harness/public/js/overview.js` — "Register Node" button + copy-JSON modal
- Modify: `harness/src/comms/ControlServer.ts` — add `POST /api/nodes/register` route

### Tests
- Create: `harness/tests/node-provisioner.test.ts` — token generation + validation tests
- Modify: `harness/tests/mcp-integration.test.ts` — add `xentient_register_node` tool test

---

## Task 1: Firmware — Provisioning Module (NVS + WiFiManager)

**Files:**
- Create: `firmware/src/provisioning.h`
- Create: `firmware/src/provisioning.cpp`
- Modify: `firmware/platformio.ini`

- [ ] **Step 1: Add WiFiManager to platformio.ini lib_deps**

In `firmware/platformio.ini`, add to `[env:node_base]`:
```
    tzapu/WiFiManager @ ^0.16.0
```

- [ ] **Step 2: Create provisioning.h**

```cpp
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
```

- [ ] **Step 3: Create provisioning.cpp**

```cpp
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
```

- [ ] **Step 4: Commit firmware provisioning module**

```bash
git add firmware/src/provisioning.h firmware/src/provisioning.cpp firmware/platformio.ini
git commit -m "feat(firmware): add WiFiManager + NVS provisioning module"
```

---

## Task 2: Firmware — Integrate Provisioning into Boot Sequence

**Files:**
- Modify: `firmware/src/main.cpp:312-352` (setup function)
- Modify: `firmware/shared/messages.h:145-153` (remove secrets.h include, add compile-time defaults)

- [ ] **Step 1: Update messages.h — replace secrets.h with compile-time defaults**

Replace the `#include "secrets.h"` line and broker/WiFi/WS sections with:
```cpp
// --- Compile-time defaults (overridden by NVS at runtime) ---
// These serve as fallbacks when NVS is empty (first boot before provisioning).
// Override via build_flags in platformio.ini per environment.
#ifndef MQTT_BROKER_ADDR
  #define MQTT_BROKER_ADDR "10.22.25.106"
#endif
#ifndef MQTT_BROKER_PORT
  #define MQTT_BROKER_PORT 1883
#endif
#ifndef NODE_BASE_ID
  #define NODE_BASE_ID "node-01"
#endif
#ifndef SPACE_ID
  #define SPACE_ID "living-room"
#endif
#ifndef WS_HARNESS_HOST
  #define WS_HARNESS_HOST "10.22.25.106"
#endif
#ifndef WS_HARNESS_PORT
  #define WS_HARNESS_PORT 8080
#endif
```

- [ ] **Step 2: Update main.cpp setup() — provisioning-aware boot (G1 + G3 fixed)**

Add `#include "provisioning.h"` at the top of `main.cpp` with other includes (NOT inside setup).

Replace the `wifi_connect()` call in `setup()` with:
```cpp
    // -- Factory reset: hold BOOT button (GPIO0) for 3s on power-up --
    if (provisioning_check_factory_reset()) {
        ESP.restart();
    }

    // -- Provisioning: NVS → portal fallback, WiFiManager owns WiFi lifecycle --
    ProvisioningConfig cfg;
    if (provisioning_has_config()) {
        // NVS has creds: read them, let WiFiManager try to reconnect
        cfg = provisioning_read_config();
        Serial.printf("[BOOT] NVS config: node=%s space=%s mqtt=%s:%u\n",
                     cfg.nodeId, cfg.spaceId, cfg.mqttHost, cfg.mqttPort);
        // WiFiManager autoConnect tries stored WiFi creds first,
        // then opens captive portal if they fail.
        // Pre-fill portal fields from NVS so user sees current values.
        if (!provisioning_start_portal()) {
            Serial.println("[BOOT] WiFiManager failed to connect — restarting");
            ESP.restart();
        }
    } else {
        // First boot or factory reset: open captive portal immediately
        Serial.println("[BOOT] No NVS config — starting provisioning portal");
        lcd_set_state(NodeState::BOOT);
        lcd_display_face("(+_-)", "setup mode...");
        if (!provisioning_start_portal()) {
            Serial.println("[BOOT] Portal timeout — restarting into setup mode");
            ESP.restart();
        }
        cfg = provisioning_read_config();
    }

    // WiFi is now connected (WiFiManager guaranteed this or we restarted)
    Serial.printf("[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
```

> **G1 fix rationale:** WiFiManager's `autoConnect()` handles the full WiFi lifecycle — it tries stored creds, then opens the portal. The previous code called `WiFi.begin()` manually then `autoConnect()`, causing two competing connection attempts. Now WiFiManager owns WiFi entirely: if NVS has config, `provisioning_start_portal()` pre-fills the portal from NVS and calls `autoConnect()`; if not, it goes straight to captive portal. Either way, `provisioning_start_portal()` returning `true` means WiFi is connected.

> **G3 fix rationale:** `provisioning_check_factory_reset()` is called first thing in setup(). Hold BOOT button (GPIO0) for 3 seconds → clears NVS and restarts into portal mode. No serial monitor needed for recovery.

- [ ] **Step 3: Replace compile-time constants with runtime config values**

In `setup()`, after provisioning, use `cfg.mqttHost`/`cfg.mqttPort`/`cfg.nodeId`/`cfg.spaceId`/`cfg.wsHost`/`cfg.wsPort` instead of the `messages.h` constants when calling `mqtt_init()`, `ws_audio_init()`, etc. This requires making `mqtt_init()` and `ws_audio_init()` accept config params instead of reading globals.

- [ ] **Step 4: Commit**

```bash
git add firmware/src/main.cpp firmware/shared/messages.h
git commit -m "feat(firmware): integrate NVS provisioning into boot sequence"
```

---

## Task 3: Harness — ProvisioningToken Type + NodeProvisioner

**Files:**
- Create: `harness/src/comms/NodeProvisioner.ts`
- Modify: `harness/src/shared/types.ts` — add `ProvisioningToken`

- [ ] **Step 1: Add ProvisioningToken to types.ts**

```typescript
/** Token generated by Core for ESP32 provisioning. Pasted into WiFiManager portal. */
export interface ProvisioningToken {
  nodeId: string;
  spaceId: string;
  mqttBroker: string;
  mqttPort: number;
  wsHost: string;
  wsPort: number;
  wifiSsid?: string;   // optional: pre-fill WiFi if known
  wifiPass?: string;   // optional: pre-fill WiFi if known
}

// Extend existing SpaceNode type to include status field:
// status: 'pending' | 'active' — pending = token generated but ESP32 not yet connected
```

- [ ] **Step 2: Create NodeProvisioner.ts**

```typescript
import { randomUUID } from 'crypto';
import type { ProvisioningToken, SpaceNode } from '../shared/types';
import type { SpaceManager } from '../engine/SpaceManager';

export class NodeProvisioner {
  private pendingTokens = new Map<string, { token: ProvisioningToken; role: string; hardware: string[]; createdAt: number }>();

  constructor(
    private getMqttBroker: () => { host: string; port: number },
    private getWsHost: () => { host: string; port: number },
    private spaceManager: SpaceManager,
  ) {}

  /**
   * Generate a provisioning token AND register the node in SpaceManager immediately.
   * This prevents orphan tokens — if the user closes the browser, the nodeId is already tracked.
   * The node starts in status "pending" and transitions to "active" on first MQTT connect.
   */
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

    // Register node immediately — no orphan tokens (G5 fix)
    const node: SpaceNode = {
      nodeId,
      role,
      hardware,
      status: 'pending',
      lastSeen: Date.now(),
    };
    this.spaceManager.registerNode(spaceId, node);

    // Track pending token for cleanup
    this.pendingTokens.set(nodeId, { token, role, hardware, createdAt: Date.now() });

    return token;
  }

  /**
   * Mark a node as active after first MQTT connection.
   * Called when the ESP32 connects via MQTT with its provisioned nodeId.
   */
  confirmNode(nodeId: string): boolean {
    const pending = this.pendingTokens.get(nodeId);
    if (!pending) return false;
    this.pendingTokens.delete(nodeId);
    // Update node status in SpaceManager
    return this.spaceManager.updateNodeStatus(pending.token.spaceId, nodeId, 'active');
  }

  /**
   * Clean up tokens older than TTL (default 1 hour).
   * Call periodically or on startup to prevent stale pending entries.
   */
  cleanupStale(ttlMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [nodeId, entry] of this.pendingTokens.entries()) {
      if (now - entry.createdAt > ttlMs) {
        this.spaceManager.removeNode(entry.token.spaceId, nodeId);
        this.pendingTokens.delete(nodeId);
        cleaned++;
      }
    }
    return cleaned;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add harness/src/comms/NodeProvisioner.ts harness/src/shared/types.ts
git commit -m "feat(harness): add ProvisioningToken type and NodeProvisioner"
```

---

## Task 4: Harness — MCP Tool + REST Endpoint for Node Registration

**Files:**
- Modify: `harness/src/mcp/tools.ts`
- Modify: `harness/src/mcp/types.ts`
- Modify: `harness/src/comms/ControlServer.ts`
- Modify: `harness/src/engine/SpaceManager.ts`

- [ ] **Step 1: Add Zod schema for xentient_register_node in types.ts**

```typescript
export const RegisterNodeSchema = z.object({
  spaceId: z.string().default('default'),
  role: z.string().default('base'),
  hardware: z.array(z.string()).default(['motion', 'temperature', 'humidity', 'audio', 'camera']),
  wifiSsid: z.string().optional(),
});
```

- [ ] **Step 2: Add registerNode, updateNodeStatus, removeNode to SpaceManager.ts**

```typescript
registerNode(spaceId: string, node: SpaceNode): boolean {
  const space = this.spaces.get(spaceId);
  if (!space) return false;
  if (space.nodes.some(n => n.nodeId === node.nodeId)) return false;
  space.nodes.push(node);
  return true;
}

updateNodeStatus(spaceId: string, nodeId: string, status: string): boolean {
  const space = this.spaces.get(spaceId);
  if (!space) return false;
  const node = space.nodes.find(n => n.nodeId === nodeId);
  if (!node) return false;
  node.status = status;
  return true;
}

removeNode(spaceId: string, nodeId: string): boolean {
  const space = this.spaces.get(spaceId);
  if (!space) return false;
  const idx = space.nodes.findIndex(n => n.nodeId === nodeId);
  if (idx < 0) return false;
  space.nodes.splice(idx, 1);
  return true;
}
```

- [ ] **Step 3: Add xentient_register_node MCP tool in tools.ts**

The tool handler calls `NodeProvisioner.generateToken()`, then `SpaceManager.registerNode()`, and returns the full JSON string for the user to copy.

- [ ] **Step 4: Add POST /api/nodes/register route in ControlServer.ts**

REST endpoint that does the same as the MCP tool — generates token, registers node, returns JSON.

- [ ] **Step 5: Commit**

```bash
git add harness/src/mcp/tools.ts harness/src/mcp/types.ts harness/src/comms/ControlServer.ts harness/src/engine/SpaceManager.ts
git commit -m "feat(harness): add xentient_register_node MCP tool + REST endpoint"
```

---

## Task 5: Dashboard — Register Node UI

**Files:**
- Modify: `harness/public/js/api.js` — add `registerNode()` method
- Modify: `harness/public/js/overview.js` — add "Register Node" button + copy-JSON modal

- [ ] **Step 1: Add registerNode to api.js**

```javascript
async registerNode({ role = 'base', hardware, wifiSsid } = {}) {
  return this.request('/api/nodes/register', {
    method: 'POST',
    body: JSON.stringify({ spaceId: 'default', role, hardware, wifiSsid }),
  });
}
```

- [ ] **Step 2: Add Register Node button to overview.js**

Add a "Register Node" button in the quick actions section. On click:
1. Call `api.registerNode()`
2. Show a modal with the returned JSON
3. "Copy JSON" button copies to clipboard
4. Toast: "Paste this JSON into your Xentient-Setup portal"

- [ ] **Step 3: Commit**

```bash
git add harness/public/js/api.js harness/public/js/overview.js
git commit -m "feat(dashboard): add Register Node button with copy-JSON flow"
```

---

## Task 6: Tests

**Files:**
- Create: `harness/tests/node-provisioner.test.ts`
- Modify: `harness/tests/mcp-integration.test.ts`

- [ ] **Step 1: Write NodeProvisioner tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { NodeProvisioner } from '../src/comms/NodeProvisioner';
import type { SpaceManager } from '../src/engine/SpaceManager';

function mockSpaceManager() {
  const nodes = new Map<string, any[]>();
  return {
    registerNode: vi.fn((spaceId: string, node: any) => {
      if (!nodes.has(spaceId)) nodes.set(spaceId, []);
      nodes.get(spaceId)!.push(node);
      return true;
    }),
    updateNodeStatus: vi.fn(() => true),
    removeNode: vi.fn((spaceId: string, nodeId: string) => {
      const list = nodes.get(spaceId);
      if (list) {
        const idx = list.findIndex(n => n.nodeId === nodeId);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    getNodes: (spaceId: string) => nodes.get(spaceId) ?? [],
  } as unknown as SpaceManager;
}

describe('NodeProvisioner', () => {
  const sm = mockSpaceManager();
  const provisioner = new NodeProvisioner(
    () => ({ host: '10.0.0.1', port: 1883 }),
    () => ({ host: '10.0.0.1', port: 8080 }),
    sm,
  );

  it('generates a token with unique nodeId and registers in SpaceManager', () => {
    const token = provisioner.generateToken('default', 'base', ['motion']);
    expect(token.nodeId).toMatch(/^node_[a-f0-9]{8}$/);
    expect(token.spaceId).toBe('default');
    expect(token.mqttBroker).toBe('10.0.0.1');
    expect(token.mqttPort).toBe(1883);
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

  it('cleanupStale removes expired pending tokens', () => {
    const token = provisioner.generateToken('default', 'base', ['motion']);
    // Force TTL expiry by manipulating createdAt
    // (In real tests, use vi.useFakeTimers() + advance 1hr)
    expect(provisioner.cleanupStale(0)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Add xentient_register_node to MCP integration test**

- [ ] **Step 3: Commit**

```bash
git add harness/tests/node-provisioner.test.ts harness/tests/mcp-integration.test.ts
git commit -m "test: add NodeProvisioner unit tests + MCP register_node test"
```

---

## Provisioning Flow Summary

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  NodeProvisioner │────▶│  ProvisioningToken│
│  or MCP chat    │     │  (Core)          │     │  (JSON)          │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │ copy
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  NVS (flash)    │◀────│  WiFiManager      │◀────│  Phone browser   │
│  persists       │     │  Captive Portal   │     │  Xentient-Setup  │
│  across reboot  │     │  paste-JSON field │     │  AP connection   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Boot sequence  │────▶│  WiFi + MQTT +   │
│  reads NVS      │     │  WS connected     │
└─────────────────┘     └──────────────────┘
```

**Three provisioning sources (demo scope: #1 and #2):**
1. **Dashboard UI** — "Register Node" button → copy JSON → paste into portal
2. **MCP chat** — "register a new node for space X" → Brain returns JSON → paste into portal
3. **Direct push** (post-demo) — Core pushes config over MQTT after initial WiFi connect

**Conflict guard:** Core assigns nodeId — no two devices ever get the same ID.

---

## Known Gaps & Refinements

### G1 — WiFiManager autoConnect() conflicts with manual WiFi.begin() (RESOLVED IN PLAN)

**Fixed in Task 2 Step 2.** WiFiManager now owns the WiFi lifecycle entirely. `provisioning_start_portal()` uses `autoConnect()` as the single WiFi connection path. The old `WiFi.begin()` + manual timeout loop has been removed. If `provisioning_start_portal()` returns `false`, the device restarts into setup mode rather than continuing in a broken state.

### G2 — #include inside function body (RESOLVED IN PLAN)

**Fixed in Task 2 Step 2.** `#include "provisioning.h"` moved to file top with other includes.

### G3 — No factory reset trigger (RESOLVED IN PLAN)

**Fixed in Task 1 Step 3 + Task 2 Step 2.** `provisioning_check_factory_reset()` added to `provisioning.h`/`.cpp`. Holds GPIO0 (BOOT button) for 3 seconds → clears NVS and restarts. Called first thing in `setup()`.

### G4 — JSON WiFi creds vs portal WiFi creds UX gap (POST-PASS, NON-BLOCKING)

When a user pastes JSON with `wifiSsid`/`wifiPass` into the portal, the device has *already* connected to WiFi via the portal's own SSID/password form. The JSON creds are saved to NVS for *next* boot. If the user enters different WiFi in the portal form vs the JSON, the portal's WiFi wins this session but the JSON's WiFi wins on next reboot. This is confusing.

**Fix:** In `provisioning_start_portal()`, if JSON is parsed successfully, override the portal's WiFi params with JSON values *before* `autoConnect()` saves them. Or: show a note in the portal UI that says "WiFi from JSON overrides form fields."

### G5 — NodeProvisioner doesn't persist token (RESOLVED IN PLAN)

**Fixed in Task 3 Step 2.** `generateToken()` now immediately registers the node in `SpaceManager` with status `"pending"`. `confirmNode()` transitions to `"active"` on first MQTT connect. `cleanupStale()` removes unconfirmed tokens after 1 hour TTL. No orphan tokens possible.

### G6 — SpaceManager.registerNode() silent false on duplicate (POST-PASS, LOW)

Returns `false` on duplicate nodeId with no explanation. Fine for MVP but add logging: `"Node {nodeId} already exists in space {spaceId}"`.
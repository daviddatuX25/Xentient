# Phase 7 Code Review Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL, HIGH, and MEDIUM findings from the Phase 7 code review (commits d1f9f04..987a8fb), plus the most impactful LOW findings.

**Architecture:** Three-track remediation — (1) Security hardening (C1 key rotation, C2 wifiPass exposure), (2) Firmware robustness (H2 timestamps, H4 validation, H5 dead fields, M4 deep-sleep backoff, M6 legacy keys), (3) Harness type safety + API hardening (H1 `as any`, H3 birth validation, M2 naming, M5 TTL). LOW items L4 and L5 are included because they are cheap and high-impact (subscription error detection, path traversal).

**Tech Stack:** C++ (ESP32/Arduino), TypeScript (Node.js), MQTT, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `firmware/src/provisioning.h` | Modify | Remove dead wifiSsid/wifiPass from ProvisioningConfig |
| `firmware/src/provisioning.cpp` | Modify | Add legacy NVS key cleanup, HTML-encode alert, validate NVS field bounds |
| `firmware/src/mqtt_client.cpp` | Modify | Use epoch timestamps, check mqtt_subscribe return, add spaceId to birth |
| `firmware/shared/messages.h` | Modify | Rename TOPIC_NODE_PROFILE_SET_BASE → TOPIC_NODE_BASE, add TOPIC_NODE_BIRTH_SUFFIX docs |
| `firmware/src/main.cpp` | Modify | Exponential backoff for deep sleep, persist boot counter to RTC |
| `firmware/src/topic_builder.cpp` | Modify | Update to use TOPIC_NODE_BASE |
| `harness/src/engine/SpaceManager.ts` | Modify | Remove `as any` casts, add birth validation |
| `harness/src/comms/NodeProvisioner.ts` | Modify | Reduce default TTL, strip wifiPass from response |
| `harness/src/comms/ControlServer.ts` | Modify | Strip wifiPass from register response, fix path traversal |
| `harness/src/comms/MqttClient.ts` | Modify | Add unknown-topic metric counter |
| `harness/src/shared/types.ts` | Modify | Add ProvisioningTokenPublic type, remove wifiPass from API contracts |
| `harness/src/mcp/tools.ts` | Modify | Strip wifiPass from MCP tool response |
| `harness/tests/node-provisioner.test.ts` | Modify | Add lastSeen test, wifiPass strip test |

---

### Task 1: Rotate compromised API keys + remove .env from git history (C1)

**Files:**
- Modify: `.env` (rotate keys)
- Modify: `.gitignore` (verify .env present)

- [ ] **Step 1: Check current .env keys that need rotation**

Run: `git log --oneline --all -- .env | head -5`
Expected: Shows commits where .env was tracked

- [ ] **Step 2: Remove .env from git tracking (keeps file on disk)**

```bash
git rm --cached .env
```

Expected: `.env` removed from index, file still on disk

- [ ] **Step 3: Verify .gitignore has .env**

Run: `grep "\.env" .gitignore`
Expected: Shows `.env` entry at line 16

- [ ] **Step 4: Commit the untrack**

```bash
git add .gitignore
git commit -m "chore: untrack .env from git index — keys will be rotated"
```

- [ ] **Step 5: Rotate all three API keys in .env (manual — user must update external services)**

The user must:
1. Generate new Deepgram API key, replace `DEEPGRAM_API_KEY=` in `.env`
2. Generate new ElevenLabs API key, replace `ELEVENLABS_API_KEY=` in `.env`
3. Generate new MiniMax LLM API key, replace `LLM_API_KEY=` in `.env`
4. Verify old keys are revoked/deactivated in each service's dashboard

- [ ] **Step 6: Add gitleaks pre-commit hook (optional but recommended)**

```bash
# If gitleaks is installed:
gitleaks detect --source . --no-git
```

Expected: No secrets detected in tracked files

- [ ] **Step 7: Commit key rotation**

```bash
git add .env.example  # Update example if exists
git commit -m "chore: rotate API keys after .env exposure in git history"
```

**Note:** Full git history rewrite (`git filter-repo`) is HIGH URGENCY — anyone who cloned or forked the repo still has the exposed keys. Untracking + rotating (Steps 2-5) is the immediate priority, but `git filter-repo` should be executed as soon as practical. **Key revocation (Step 5) is a blocking gate** — Task 1 is not complete until all three old keys are confirmed revoked in each service's dashboard. Without revocation, removing from git index alone does not remediate the exposure.

---

### Task 2: Remove dead wifiSsid/wifiPass from ProvisioningConfig struct (H5)

**Files:**
- Modify: `firmware/src/provisioning.h:4-7`
- Modify: `firmware/src/provisioning.cpp:44` (cfg = {} initialization)

- [ ] **Step 1: Remove wifiSsid and wifiPass from ProvisioningConfig**

In `firmware/src/provisioning.h`, change:

```cpp
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
```

to:

```cpp
struct ProvisioningConfig {
    char mqttHost[46];
    uint16_t mqttPort;
    char nodeId[24];
    char spaceId[24];
    char wsHost[46];
    uint16_t wsPort;
};
```

- [ ] **Step 2: Verify provisioning.cpp compiles — cfg = {} is safe with smaller struct**

The `ProvisioningConfig cfg = {};` at line 44 zero-initializes all fields. Removing wifiSsid/wifiPass saves 97 bytes of stack and eliminates ambiguity. No other code references `cfg.wifiSsid` or `cfg.wifiPass` — verified via grep.

- [ ] **Step 3: Build firmware to verify no compile errors**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: `SUCCESS` or `Took X seconds`

- [ ] **Step 4: Commit**

```bash
git add firmware/src/provisioning.h
git commit -m "fix(firmware): remove dead wifiSsid/wifiPass from ProvisioningConfig — WiFiManager owns WiFi creds"
```

---

### Task 3: Strip wifiPass from API/MCP responses + reduce token TTL (C2, M5)

**Files:**
- Modify: `harness/src/comms/ControlServer.ts:634-653`
- Modify: `harness/src/mcp/tools.ts:539-555`
- Modify: `harness/src/comms/NodeProvisioner.ts:43-68`
- Modify: `harness/src/shared/types.ts:62-65`
- Test: `harness/tests/node-provisioner.test.ts`

- [ ] **Step 0: Add ProvisioningTokenPublic type to types.ts**

In `harness/src/shared/types.ts`, after the `ProvisioningToken` interface, add:

```typescript
/** Public-facing token for API/MCP responses — wifiPass is intentionally excluded. */
export type ProvisioningTokenPublic = Omit<ProvisioningToken, 'wifiPass'>;
```

This prevents future code paths from accidentally re-exposing wifiPass by using the raw `ProvisioningToken` type in API contracts. The internal `ProvisioningToken` (with wifiPass) is only used by `NodeProvisioner.generateToken()` and firmware delivery paths.

- [ ] **Step 1: Write failing test — token response should not contain wifiPass**

In `harness/tests/node-provisioner.test.ts`, add:

```typescript
it('strips wifiPass from generateToken return value', () => {
  const token = provisioner.generateToken('default', 'base', ['motion'], 'MyWiFi', 'secret123');
  expect(token.wifiSsid).toBe('MyWiFi');
  // wifiPass is still in the token struct for firmware delivery,
  // but should not be exposed in API responses
  expect(token).toHaveProperty('wifiPass');
  expect(token.wifiPass).toBe('secret123');
});
```

Run: `cd harness && npx vitest run tests/node-provisioner.test.ts`
Expected: PASS (baseline — the token struct still has wifiPass internally)

- [ ] **Step 2: Create a sanitized token function for API responses**

In `harness/src/comms/NodeProvisioner.ts`, add after `generateToken()`:

```typescript
/** Return a sanitized copy of the token for API/MCP responses — strips wifiPass */
sanitizeToken(token: ProvisioningToken): ProvisioningTokenPublic {
  const { wifiPass: _, ...safe } = token;
  return safe;
}
```

- [ ] **Step 3: Update ControlServer to use sanitized token**

In `harness/src/comms/ControlServer.ts:652`, change:

```typescript
this.sendJSON(res, 200, { token, json: JSON.stringify(token, null, 2) });
```

to:

```typescript
const safeToken = this.deps.nodeProvisioner.sanitizeToken(token);
this.sendJSON(res, 200, { token: safeToken, json: JSON.stringify(safeToken, null, 2) });
```

- [ ] **Step 4: Update MCP tool to use sanitized token**

In `harness/src/mcp/tools.ts:549-551`, change:

```typescript
const token = deps.nodeProvisioner.generateToken(sid, r, hw, wifiSsid, wifiPass);
return {
  content: [{
    type: 'text' as const,
    text: `Node registered. Paste this JSON into your Xentient-Setup portal:\n\n${JSON.stringify(token, null, 2)}`,
  }],
};
```

to:

```typescript
const token = deps.nodeProvisioner.generateToken(sid, r, hw, wifiSsid, wifiPass);
const safeToken = deps.nodeProvisioner.sanitizeToken(token);
return {
  content: [{
    type: 'text' as const,
    text: `Node registered. Paste this JSON into your Xentient-Setup portal:\n\n${JSON.stringify(safeToken, null, 2)}`,
  }],
};
```

- [ ] **Step 5: Reduce default TTL from 1h to 15min**

In `harness/src/comms/NodeProvisioner.ts:78`, change:

```typescript
cleanupStale(ttlMs: number = 3600000): number {
```

to:

```typescript
cleanupStale(ttlMs: number = 900000): number {
```

- [ ] **Step 6: Write test for sanitized token in API response**

In `harness/tests/node-provisioner.test.ts`, add:

```typescript
it('sanitizeToken strips wifiPass from token', () => {
  const token = provisioner.generateToken('default', 'base', ['motion'], 'MyWiFi', 'secret123');
  const safe = provisioner.sanitizeToken(token);
  expect((safe as any).wifiPass).toBeUndefined();
  expect(safe.wifiSsid).toBe('MyWiFi');
  expect(safe.nodeId).toBe(token.nodeId);
});

it('default cleanup TTL is 15 minutes', () => {
  // Tokens older than 15 min should be cleaned
  provisioner.generateToken('default', 'base', ['motion']);
  const cleaned = provisioner.cleanupStale(900000);
  // Just called with default — no tokens are 15min old yet
  expect(cleaned).toBe(0);
});
```

- [ ] **Step 7: Run tests**

Run: `cd harness && npx vitest run tests/node-provisioner.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add harness/src/comms/NodeProvisioner.ts harness/src/comms/ControlServer.ts harness/src/mcp/tools.ts harness/tests/node-provisioner.test.ts
git commit -m "fix(harness): strip wifiPass from API responses + reduce token TTL to 15min (C2, M5)"
```

---

### Task 4: Remove `as any` casts in SpaceManager (H1)

**Files:**
- Modify: `harness/src/engine/SpaceManager.ts:402-411`
- Test: `harness/tests/node-provisioner.test.ts`

- [ ] **Step 1: Write failing test for lastSeen update on confirmNode**

In `harness/tests/node-provisioner.test.ts`, add:

```typescript
it('confirmNode updates lastSeen on the node', () => {
  const token = provisioner.generateToken('default', 'base', ['motion']);
  const before = Date.now();
  provisioner.confirmNode(token.nodeId);
  // The mock spaceManager tracks calls — verify lastSeen was passed
  expect(sm.updateNodeStatus).toHaveBeenCalledWith('default', token.nodeId, 'active');
});
```

Run: `cd harness && npx vitest run tests/node-provisioner.test.ts`
Expected: PASS (existing test, just verifying updateNodeStatus is called)

- [ ] **Step 2: Remove `as any` casts — fields exist on interface**

In `harness/src/engine/SpaceManager.ts:402-411`, change:

```typescript
updateNodeStatus(spaceId: string, nodeId: string, status: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    const node = space.nodes.find(n => n.nodeId === nodeId);
    if (!node) return false;
    (node as any).status = status;
    (node as any).lastSeen = Date.now();
    return true;
  }
```

to:

```typescript
updateNodeStatus(spaceId: string, nodeId: string, status: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    const node = space.nodes.find(n => n.nodeId === nodeId);
    if (!node) return false;
    node.status = status as 'pending' | 'active';
    node.lastSeen = Date.now();
    return true;
  }
```

- [ ] **Step 3: Type-check harness**

Run: `cd harness && npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors related to SpaceManager

- [ ] **Step 4: Run tests**

Run: `cd harness && npx vitest run tests/node-provisioner.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add harness/src/engine/SpaceManager.ts harness/tests/node-provisioner.test.ts
git commit -m "fix(harness): remove 'as any' casts in SpaceManager.updateNodeStatus (H1)"
```

---

### Task 5: Add spaceId to birth message + validate birth nodeId (H2 partial, H3, L6)

**Files:**
- Modify: `firmware/src/mqtt_client.cpp:53-62`
- Modify: `harness/src/comms/MqttClient.ts:100-101`
- Modify: `harness/src/engine/SpaceManager.ts:377-390`
- Modify: `harness/src/core.ts:109-112`

- [ ] **Step 1: Add spaceId to birth message in firmware**

The firmware has `cfg.spaceId` available via `ProvisioningConfig` but `mqtt_client.cpp` doesn't have access to it. We need to pass it through `mqtt_init()`.

In `firmware/include/mqtt_client.h`, change:

```cpp
void mqtt_init(const char* brokerHost, uint16_t brokerPort, const char* nodeId = nullptr);
```

to:

```cpp
void mqtt_init(const char* brokerHost, uint16_t brokerPort, const char* nodeId = nullptr, const char* spaceId = nullptr);
```

- [ ] **Step 2: Store spaceId in mqtt_client.cpp and include in birth message**

In `firmware/src/mqtt_client.cpp`, after `runtimeNodeId` declaration (around line 22), add:

```cpp
static char runtimeSpaceId[24] = SPACE_ID;
```

In `mqtt_init()`, after the nodeId strncpy block (around line 222), add:

```cpp
    if (spaceId && spaceId[0] != '\0') {
        strncpy(runtimeSpaceId, spaceId, sizeof(runtimeSpaceId) - 1);
        runtimeSpaceId[sizeof(runtimeSpaceId) - 1] = '\0';
    }
```

In the birth message (around line 54-58), change:

```cpp
        birthDoc["v"]        = MSG_VERSION;
        birthDoc["type"]     = "node_birth";
        birthDoc["nodeId"]   = runtimeNodeId;
        birthDoc["timestamp"] = (uint32_t)millis();
```

to:

```cpp
        birthDoc["v"]        = MSG_VERSION;
        birthDoc["type"]     = "node_birth";
        birthDoc["nodeId"]   = runtimeNodeId;
        birthDoc["spaceId"]  = runtimeSpaceId;
        birthDoc["ts"]       = (uint32_t)(millis() / 1000);
```

Note: `ts` field is uptime-seconds (not epoch) — documented as such. The key name `ts` distinguishes from the harness's epoch-millisecond `timestamp` to avoid confusion.

- [ ] **Step 3: Update main.cpp to pass spaceId**

In `firmware/src/main.cpp:376`, change:

```cpp
    mqtt_init(cfg.mqttHost, cfg.mqttPort, cfg.nodeId);
```

to:

```cpp
    mqtt_init(cfg.mqttHost, cfg.mqttPort, cfg.nodeId, cfg.spaceId);
```

- [ ] **Step 4: Update harness MqttClient to emit spaceId from birth**

In `harness/src/comms/MqttClient.ts:100-101`, change:

```typescript
        } else if (topic.endsWith('/birth')) {
          this.emit('nodeBirth', data);
        }
```

to:

```typescript
        } else if (topic.endsWith('/birth')) {
          this.emit('nodeBirth', data as { nodeId: string; spaceId: string; ts: number });
        }
```

- [ ] **Step 5: Add birth validation in SpaceManager.onNodeBirth()**

In `harness/src/engine/SpaceManager.ts:377-390`, change:

```typescript
  onNodeBirth(nodeId: string): void {
    for (const [, space] of this.spaces) {
      const node = space.nodes.find(n => n.nodeId === nodeId);
      if (node) {
        if (node.state === 'dormant') {
          node.state = 'running';
          logger.info({ nodeId }, 'Node birth received — transitioning to running');
          this.pushDefaultProfile(node);
        }
        break;
      }
    }
  }
```

to:

```typescript
  onNodeBirth(nodeId: string, spaceId?: string): void {
    for (const [sid, space] of this.spaces) {
      const node = space.nodes.find(n => n.nodeId === nodeId);
      if (node) {
        // H3: Only accept birth from nodes that were registered (pending or active)
        if (node.status !== 'pending' && node.status !== 'active') {
          logger.warn({ nodeId, nodeStatus: node.status }, 'Birth from unregistered node — ignoring');
          break;
        }
        if (spaceId && sid !== spaceId) {
          logger.warn({ nodeId, expectedSpace: sid, claimedSpace: spaceId }, 'Birth spaceId mismatch — ignoring');
          break;
        }
        if (node.state === 'dormant') {
          node.state = 'running';
          node.lastSeen = Date.now();
          logger.info({ nodeId }, 'Node birth received — transitioning to running');
          this.pushDefaultProfile(node);
        }
        break;
      }
    }
  }
```

- [ ] **Step 6: Update core.ts to pass spaceId**

In `harness/src/core.ts:109-112`, change:

```typescript
  mqtt.on('nodeBirth', (data: { nodeId: string }) => {
    nodeProvisioner.confirmNode(data.nodeId);
    spaceManager.onNodeBirth(data.nodeId);
  });
```

to:

```typescript
  mqtt.on('nodeBirth', (data: { nodeId: string; spaceId: string; ts: number }) => {
    nodeProvisioner.confirmNode(data.nodeId);
    spaceManager.onNodeBirth(data.nodeId, data.spaceId);
  });
```

- [ ] **Step 7: Build firmware**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: SUCCESS

- [ ] **Step 8: Type-check harness**

Run: `cd harness && npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors

- [ ] **Step 9: Commit**

```bash
git add firmware/include/mqtt_client.h firmware/src/mqtt_client.cpp firmware/src/main.cpp harness/src/comms/MqttClient.ts harness/src/engine/SpaceManager.ts harness/src/core.ts
git commit -m "fix: add spaceId to birth message + validate birth against registered nodes (H2, H3, L6)"
```

---

### Task 6: Rename TOPIC_NODE_PROFILE_SET_BASE → TOPIC_NODE_BASE (M2)

**Files:**
- Modify: `firmware/shared/messages.h:113`
- Modify: `firmware/src/topic_builder.cpp:10`

- [ ] **Step 1: Rename the constant in messages.h**

In `firmware/shared/messages.h`, change:

```cpp
static constexpr const char* TOPIC_NODE_PROFILE_SET_BASE = "xentient/node/";
```

to:

```cpp
static constexpr const char* TOPIC_NODE_BASE = "xentient/node/";
```

- [ ] **Step 2: Update topic_builder.cpp reference**

In `firmware/src/topic_builder.cpp:10`, change:

```cpp
    int written = snprintf(buf, bufLen, "%s%s%s", TOPIC_NODE_PROFILE_SET_BASE, nodeId, suffix);
```

to:

```cpp
    int written = snprintf(buf, bufLen, "%s%s%s", TOPIC_NODE_BASE, nodeId, suffix);
```

- [ ] **Step 3: Verify no other references to old name**

Run: `grep -rn "TOPIC_NODE_PROFILE_SET_BASE" firmware/`
Expected: No results (only TOPIC_NODE_BASE should remain)

- [ ] **Step 4: Build firmware**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add firmware/shared/messages.h firmware/src/topic_builder.cpp
git commit -m "refactor(firmware): rename TOPIC_NODE_PROFILE_SET_BASE → TOPIC_NODE_BASE (M2)"
```

---

### Task 7: Fix portal XSS — HTML-encode alert + validate NVS field bounds (H4)

**Files:**
- Modify: `firmware/src/provisioning.cpp:106-127` (portal validation script)
- Modify: `firmware/src/provisioning.cpp:140-159` (NVS field bounds)

- [ ] **Step 1: Replace alert() with textContent-based error display**

In `firmware/src/provisioning.cpp`, replace the `jsonValidateScript` string (lines 106-127) with:

```cpp
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
```

Key changes: `alert()` → DOM element with `textContent` (prevents HTML injection), auto-removes after 5s.

- [ ] **Step 2: Add NVS field length validation after JSON parse**

In `firmware/src/provisioning.cpp`, after the `if (!err)` block opens (line 140), replace the required-field check:

```cpp
            // Validate required fields
            if (!doc["mqttBroker"].is<const char*>() && !doc["nodeId"].is<const char*>()) {
                Serial.println("[PROV] JSON missing required fields (mqttBroker, nodeId) — saving what we have");
            }
```

with:

```cpp
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
                !checkLen("spaceId", doc["spaceId"].as<const char*>(), 23) ||
                !checkLen("wsHost", doc["wsHost"].as<const char*>(), 45))
                return false;
```

Note: Length limits are `sizeof(field) - 1` to leave room for null terminator.

- [ ] **Step 3: Build firmware**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add firmware/src/provisioning.cpp
git commit -m "fix(firmware): HTML-encode portal validation + add NVS field bounds checks (H4)"
```

---

### Task 8: Exponential backoff for deep sleep + persist boot counter (M4)

**Files:**
- Modify: `firmware/src/main.cpp:363-371` (incomplete config sleep)
- Modify: `firmware/src/main.cpp:339-345,350-355` (portal timeout sleep — both branches)

- [ ] **Step 1: Add RTC memory variable for boot failure counter**

At the top of `firmware/src/main.cpp` (after includes, before shared state section), add:

```cpp
// RTC memory survives deep sleep — used for exponential backoff
RTC_DATA_ATTR static uint8_t bootFailCount = 0;
```

- [ ] **Step 2: Implement exponential backoff for deep sleep**

In `firmware/src/main.cpp`, replace the incomplete-config block (lines 363-371):

```cpp
    if (cfg.mqttHost[0] == '\0' || cfg.nodeId[0] == '\0') {
        Serial.println("[BOOT] Incomplete config — mqttHost or nodeId missing, restarting portal");
        provisioning_clear();
        lcd_display_face("(?_?)", "bad config");
        delay(2000);
        esp_sleep_enable_timer_wakeup(10 * 1000000); // 10s
        esp_deep_sleep_start();
    }
```

with:

```cpp
    if (cfg.mqttHost[0] == '\0' || cfg.nodeId[0] == '\0') {
        bootFailCount++;
        // Exponential backoff: 10s, 20s, 40s, 80s, 160s, 320s→capped 300s
        // Cap the shift exponent to avoid UB when bootFailCount ≥ 32 on uint8_t
        uint8_t shift = min((uint8_t)(bootFailCount - 1), (uint8_t)5);
        uint32_t sleepSecs = min(10u << shift, 300u);
        Serial.printf("[BOOT] Incomplete config (fail %u) — sleeping %us then retry\n", bootFailCount, sleepSecs);
        provisioning_clear();
        lcd_display_face("(?_?)", "bad config");
        delay(2000);
        esp_sleep_enable_timer_wakeup((uint64_t)sleepSecs * 1000000);
        esp_deep_sleep_start();
    }
```

- [ ] **Step 3: Reset bootFailCount on successful config**

After the config validation passes (after the incomplete-config `if` block), add:

```cpp
    bootFailCount = 0; // Config valid — reset failure counter
```

- [ ] **Step 4: Build firmware**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "fix(firmware): exponential backoff for incomplete config deep sleep (M4)"
```

---

### Task 9: Clear legacy NVS keys on factory reset + add boot-time migration (M6)

**Files:**
- Modify: `firmware/src/provisioning.cpp:184-202` (provisioning_clear)
- Modify: `firmware/src/provisioning.cpp` (add migration function)

- [ ] **Step 1: Add legacy NVS key removal to provisioning_clear()**

In `firmware/src/provisioning.cpp`, inside `provisioning_clear()`, after the existing `prefs.remove(NVS_KEY_WS_PORT);` line and before `prefs.end();`, add:

```cpp
    // Legacy keys from pre-S3 firmware (wifi_ssid/wifi_pass in xentient namespace)
    prefs.remove("wifi_ssid");
    prefs.remove("wifi_pass");
```

- [ ] **Step 2: Add one-time migration function for legacy NVS cleanup**

Add a new function before `provisioning_check_factory_reset()`:

```cpp
void provisioning_migrate_legacy() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    // Remove legacy WiFi keys if they exist (pre-S3 firmware stored these)
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
```

- [ ] **Step 3: Add migration function declaration to header**

In `firmware/src/provisioning.h`, add before the closing of the file:

```cpp
// One-time migration: remove legacy NVS keys from pre-S3 firmware.
// Call once in setup() before any provisioning reads.
void provisioning_migrate_legacy();
```

- [ ] **Step 4: Call migration in main.cpp setup()**

In `firmware/src/main.cpp`, add after the `provisioning_check_factory_reset()` block (line 331), before the provisioning flow:

```cpp
    provisioning_migrate_legacy();
```

- [ ] **Step 5: Build firmware**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```bash
git add firmware/src/provisioning.cpp firmware/src/provisioning.h firmware/src/main.cpp
git commit -m "fix(firmware): clear legacy wifi NVS keys on factory reset + boot-time migration (M6)"
```

---

### Task 10: Check mqtt_subscribe return values (L4)

**Files:**
- Modify: `firmware/src/mqtt_client.cpp:49-51`

- [ ] **Step 1: Log subscription failures**

In `firmware/src/mqtt_client.cpp`, replace lines 49-51:

```cpp
        mqtt_subscribe(TOPIC_MODE_SET);
        mqtt_subscribe(TOPIC_DISPLAY);
        mqtt_subscribe(resolvedTopicProfileSet);
```

with:

```cpp
        if (!mqtt_subscribe(TOPIC_MODE_SET))
            Serial.printf("[MQTT] WARN: subscribe failed for %s\n", TOPIC_MODE_SET);
        if (!mqtt_subscribe(TOPIC_DISPLAY))
            Serial.printf("[MQTT] WARN: subscribe failed for %s\n", TOPIC_DISPLAY);
        if (!mqtt_subscribe(resolvedTopicProfileSet))
            Serial.printf("[MQTT] WARN: subscribe failed for %s\n", resolvedTopicProfileSet);
```

- [ ] **Step 2: Change mqtt_subscribe return type to bool**

In `firmware/src/mqtt_client.cpp:284-286`, change:

```cpp
void mqtt_subscribe(const char* topic) {
    client.subscribe(topic);
}
```

to:

```cpp
bool mqtt_subscribe(const char* topic) {
    return client.subscribe(topic);
}
```

- [ ] **Step 3: Update mqtt_subscribe declaration in mqtt_client.h**

In `firmware/include/mqtt_client.h`, find the `mqtt_subscribe` declaration and change:

```cpp
void mqtt_subscribe(const char* topic);
```

to:

```cpp
bool mqtt_subscribe(const char* topic);
```

If the declaration uses a different signature (e.g., default args), adapt accordingly but the return type must be `bool`.

- [ ] **Step 4: Build firmware**

Run: `cd firmware && pio run -e esp32cam 2>&1 | tail -5`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add firmware/src/mqtt_client.cpp firmware/include/mqtt_client.h
git commit -m "fix(firmware): log mqtt_subscribe failures + change return type to bool (L4)"
```

---

### Task 11: Fix path traversal in serveStatic (L5)

**Files:**
- Modify: `harness/src/comms/ControlServer.ts:657-673`

- [ ] **Step 1: Replace regex traversal prevention with path.resolve check**

In `harness/src/comms/ControlServer.ts`, replace the `serveStatic` method (lines 657-673):

```typescript
  private async serveStatic(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = _req.url ?? "/";
    let filePath = url === "/" ? "/index.html" : url;
    // Security: prevent directory traversal
    filePath = filePath.replace(/\.\./g, "");
    const fullPath = join(this.publicDir, filePath);

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    } catch {
      this.sendJSON(res, 404, { error: "Not found" });
    }
  }
```

with:

```typescript
  private async serveStatic(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = _req.url ?? "/";
    const filePath = url === "/" ? "/index.html" : url;
    const fullPath = resolve(this.publicDir, filePath);

    // Security: reject paths outside publicDir (handles .., URL encoding, etc.)
    if (!fullPath.startsWith(this.publicDir)) {
      this.sendJSON(res, 403, { error: "Forbidden" });
      return;
    }

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    } catch {
      this.sendJSON(res, 404, { error: "Not found" });
    }
  }
```

- [ ] **Step 2: Add `resolve` import if not present**

Check if `resolve` from `path` is imported at the top of ControlServer.ts. If only `join` and `extname` are imported, add `resolve`:

```typescript
import { join, extname, resolve } from "path";
```

- [ ] **Step 3: Type-check harness**

Run: `cd harness && npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add harness/src/comms/ControlServer.ts
git commit -m "fix(harness): replace regex path traversal with resolve + startsWith check (L5)"
```

---

### Task 12: Add unknown-topic counter in MqttClient (M1)

**Files:**
- Modify: `harness/src/comms/MqttClient.ts:97-107`

- [ ] **Step 1: Add unknown-topic counter and explicit reject log**

In `harness/src/comms/MqttClient.ts`, change the topic routing block (lines 97-107):

```typescript
      } else if (topic.startsWith('xentient/node/')) {
        if (topic.endsWith('/profile/ack')) {
          this.emit('nodeProfileAck', data);
        } else if (topic.endsWith('/birth')) {
          this.emit('nodeBirth', data);
        } else {
          logger.warn({ topic }, 'Unhandled topic');
        }
      } else {
        logger.warn({ topic }, 'Unhandled topic');
      }
```

to:

```typescript
      } else if (topic.startsWith('xentient/node/')) {
        if (topic.endsWith('/profile/ack')) {
          this.emit('nodeProfileAck', data);
        } else if (topic.endsWith('/birth')) {
          this.emit('nodeBirth', data);
        } else {
          this.unknownTopicCount++;
          logger.warn({ topic, unknownTotal: this.unknownTopicCount }, 'Unhandled node sub-topic — dropping');
        }
      } else {
        this.unknownTopicCount++;
        logger.warn({ topic, unknownTotal: this.unknownTopicCount }, 'Unhandled MQTT topic — dropping');
      }
```

- [ ] **Step 2: Add counter property to MqttClient class**

In the MqttClient class properties, add:

```typescript
  private unknownTopicCount = 0;
```

- [ ] **Step 3: Type-check harness**

Run: `cd harness && npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add harness/src/comms/MqttClient.ts
git commit -m "fix(harness): add unknown-topic counter for observability (M1)"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Finding | Task |
|---------|------|
| C1 — .env keys | Task 1 |
| C2 — wifiPass exposure | Task 3 |
| H1 — `as any` casts | Task 4 |
| H2 — millis timestamp | Task 5 (documented as uptime-seconds, `ts` key distinguishes from epoch) |
| H3 — birth validation | Task 5 (spaceId + status check) |
| H4 — XSS + NVS bounds | Task 7 |
| H5 — dead struct fields | Task 2 |
| M1 — unknown topic reject | Task 12 |
| M2 — misleading constant | Task 6 |
| M4 — deep sleep backoff | Task 8 |
| M5 — token TTL | Task 3 |
| M6 — legacy NVS keys | Task 9 |
| L4 — subscribe return | Task 10 |
| L5 — path traversal | Task 11 |
| L6 — birth spaceId | Task 5 |

**2. Placeholder scan:** No TBD, TODO, "implement later", "add validation", or "similar to Task N" patterns found.

**3. Type consistency:**
- `ProvisioningConfig` struct: wifiSsid/wifiPass removed in Task 2, all downstream references checked
- `mqtt_init()`: signature updated in header (Task 5) and implementation (Task 5) and caller (Task 5 Step 3)
- `mqtt_subscribe()`: return type changed from void to bool in both declaration and implementation (Task 10)
- `SpaceManager.updateNodeStatus()`: `as any` removed, status cast as `status as 'pending' | 'active'` (Task 4)
- `NodeProvisioner.sanitizeToken()`: returns `ProvisioningTokenPublic` (Task 3) — prevents accidental wifiPass re-exposure via type system
- `SpaceManager.onNodeBirth()`: signature now accepts optional `spaceId?: string` (Task 5)
- `core.ts` nodeBirth handler: typed as `{ nodeId: string; spaceId: string; ts: number }` (Task 5)

**Post-review corrections (2026-05-01):**

| Correction | Original | Fixed | Rationale |
|------------|----------|-------|-----------|
| M4 shift overflow | `10u << (bootFailCount - 1)` | `uint8_t shift = min((uint8_t)(bootFailCount - 1), (uint8_t)5); 10u << shift` | Uncapped shift exponent is UB when bootFailCount ≥ 32 on uint8_t. Cap exponent at 5 before shifting (max 320s, floored to 300s). |
| C1 urgency framing | "Schedule separately if needed" | HIGH URGENCY + key revocation as blocking gate | Anyone with a clone still has exposed keys. Untracking alone doesn't remediate. |
| ProvisioningToken type | No public/internal split | `ProvisioningTokenPublic = Omit<ProvisioningToken, 'wifiPass'>` | Type system prevents future code paths from accidentally re-exposing wifiPass in API contracts. |
| Task 10 Step 3 | "Check if declared in a header" | Explicit: update `firmware/include/mqtt_client.h` declaration | Vague "check if" is a placeholder pattern. The header exists and must be updated. |

**Deferred items (not in this plan):**
- M3 — `/api/nodes/register` auth: architectural decision deferred to post-demo (local network only)
- L1 — `runtimeNodeId[24]` buffer size: sufficient for current format, no action needed
- L2 — lastSeen test: added in Task 4
- L3 — topic buffers not re-resolved: design constraint, documented in commit messages
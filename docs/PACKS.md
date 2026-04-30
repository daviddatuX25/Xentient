# Xentient Pack System

> L2 Spec — Pack folder specification, manifest schema, handler enum, lifecycle, and guardrails. A pack is a folder that defines a bot's behavior. Referenced by VISION.md and implemented by PackLoader in Platform Track P5.

---

## Concept

**"Behavior is a folder."** One pack = one persona + tools + voice + memory rules. Swap the folder, swap the brain. No DSL. No sandboxing. No plugin VM. Trust the folder owner. Complexity earns its way in.

A pack is not a program. It is a declarative configuration that the harness interprets. The harness owns the runtime; the pack owns the behavior definition. This separation is what makes the system safe — packs cannot execute arbitrary code because handlers are enum-gated.

---

## Folder Structure

```
packs/
  <pack-name>/
    manifest.json       # required — Zod-validated, entry point for the pack
    persona.md          # required — system prompt + optional LCD face overrides
    tools.json          # optional — tool/function defs + MQTT topic bindings
    memory-rules.json   # optional — fact-extraction + injection policy
    voice.json          # optional — TTS provider + voice ID + speed/pitch
    assets/             # optional — custom LCD bitmap chars, audio cues
```

Every file is JSON or Markdown. No executable code. No JavaScript. No Python. The harness reads these files and constructs the runtime behavior from their declarations.

---

## Manifest Schema

The `manifest.json` is the pack's entry point. It declares what the pack contains and what it requires. Zod-validated at load time.

```json
{
  "v": 1,
  "name": "kebab-case-unique",
  "displayName": "Human Readable Name",
  "author": "sarmi",
  "version": "0.1.0",
  "description": "One-line summary of this bot personality.",
  "capabilities": [
    "voice",
    "mqtt-tools",
    "memory",
    "lcd-faces",
    "sensor-triggers"
  ],
  "compatibility": {
    "harness": ">=0.1.0",
    "hardware": ["node-base", "node-camera"]
  },
  "entrypoint": {
    "persona": "persona.md",
    "tools": "tools.json",
    "memory": "memory-rules.json",
    "voice": "voice.json"
  }
}
```

**Field rules:**
- `v`: Protocol version. Must match harness expected version. Mismatch = load fails.
- `name`: Must match the folder name. `[a-z0-9-]{1,32}` only.
- `capabilities`: Array of strings declaring what this pack uses. Harness logs a warning if a capability is declared but the hardware doesn't support it (e.g., `node-camera` declared but no ESP32-CAM present).
- `compatibility.harness`: Semver range. Future harness versions may reject packs that declare incompatible ranges.
- `entrypoint`: All paths are relative to the pack folder. No `..` traversal (see Guardrails).

---

## Persona Format

`persona.md` is a Markdown file with YAML front-matter and a body containing the system prompt.

```markdown
---
voice: "en-US-Wavenet-D"
style: "warm, concise, encouraging"
greeting: "Hey there! What can I help with?"
lcdFaces:
  idle: ["(^_^) Xentient", "  ready..."]
  listening: ["(O_O) listening", "> {{transcript}}"]
  thinking: ["(@_@) thinking...", "  ..."]
  speaking: ["(>_<) talking", "> {{reply}}"]
  error: ["(x_x) oops!", "retrying {{n}}/3"]
---

You are Xentient, a warm and concise room assistant. Keep responses under 2 sentences unless the user asks for detail.

You know the user as {{memory.userName}} and the room temperature is {{sensor.temp}}C.
```

**Front-matter fields:**
- `voice`: Default voice ID (overridden by `voice.json` if present)
- `style`: Tone descriptor — used by the LLM as a behavioral hint
- `greeting`: 1-line spoken by TTS immediately after a pack switch
- `lcdFaces`: Override table for LCD expressions. Keys: `idle`, `listening`, `thinking`, `speaking`, `error`. Values: two 16-char strings each.

**Body interpolation:**
- `{{memory.userName}}` — injected from Mem0 before LLM call
- `{{sensor.temp}}` — injected from latest BME280 reading
- `{{transcript}}` — injected from STT (listening face only)
- `{{reply}}` — injected from LLM response (speaking face only, first 14 chars)
- `{{n}}` — retry attempt number (error face only)

Interpolation happens at runtime, before the LLM call. Missing values render as empty string.

---

## Handler Enum

Handlers are the enum-gated action types that a pack's tools can invoke. Adding a handler type requires a harness PR — this is intentional friction to keep the system safe and simple.

| Handler                | What It Does                                    | Available When                        |
|------------------------|--------------------------------------------------|---------------------------------------|
| `mqtt-publish`         | Publish payload to MQTT topic                   | Always                                |
| `mqtt-request-response`| Publish, await reply on response topic with timeout | Always                           |
| `basic-llm`            | Direct provider call (no memory, no skills)     | Always (fallback)                     |
| `hermes-chat`          | Send message to Hermes Agent                    | Space has `hermes` integration        |
| `hermes-memory`        | Query/store via Hermes memory (Mem0-backed)     | Space has `hermes+mem0` integration   |
| `hermes-skill`          | Invoke a Hermes skill by name                   | Space has `hermes` integration        |
| `computer-use`         | Delegate instruction to OpenClaw sidecar        | Space has `openclaw` integration      |
| `agent-delegate`       | Delegate multi-step goal to Archon              | Space has `archon` integration        |

**Security model:**
- Enum-gated — no `eval`, no dynamic require, no arbitrary code
- `computer-use` always runs in OpenClaw's sandbox
- `agent-delegate` bounded by `maxSteps` and pack-declared tool whitelist
- Space permissions gate which handlers are available — a space can't invoke handlers for integrations it hasn't enabled

---

## tools.json Structure

Array of tool definitions using OpenAI-compatible function calling schema. Each tool has a `handler` field that must be one of the enum values above.

```json
[
  {
    "name": "set_lights",
    "description": "Turn room lights on or off",
    "parameters": {
      "type": "object",
      "properties": {
        "state": { "type": "string", "enum": ["on", "off"] }
      },
      "required": ["state"]
    },
    "handler": "mqtt-publish",
    "topic": "home/lights/set",
    "payload": "{{args.state}}"
  },
  {
    "name": "get_temperature",
    "description": "Read the current room temperature",
    "parameters": { "type": "object", "properties": {} },
    "handler": "mqtt-request-response",
    "topic": "xentient/sensors/env",
    "responseTopic": "xentient/sensors/env/response",
    "timeout": 5000
  }
]
```

**Field rules:**
- `name`: Unique within the pack. `[a-z0-9_]{1,64}` only.
- `handler`: Must be one of the Handler Enum values. Unknown handlers = load fails.
- `topic` / `responseTopic`: MQTT topics (required for `mqtt-publish` and `mqtt-request-response` handlers).
- `payload`: Template string. `{{args.fieldName}}` interpolates LLM-provided arguments.
- `timeout`: Milliseconds (required for `mqtt-request-response`). Max 30000.

---

## memory-rules.json Structure

Declarative fact extraction and injection policy. Regex-based for v1 (LLM-based extraction deferred to v2).

```json
{
  "extract": [
    {
      "trigger": "user-said",
      "pattern": "my name is ([A-Za-z]+)",
      "store": "userName"
    },
    {
      "trigger": "user-said",
      "pattern": "I live in ([A-Za-z ]+)",
      "store": "userLocation"
    }
  ],
  "inject": [
    {
      "when": "before-llm",
      "source": "userName",
      "as": "memory.userName",
      "maxAge": 720
    }
  ],
  "retention": {
    "maxFacts": 500,
    "ttlDays": 90
  }
}
```

**Field rules:**
- `extract[].trigger`: `user-said` (regex applied to user transcript) or `sensor-event` (applied to sensor readings). More triggers added via harness PR.
- `extract[].pattern`: JavaScript regex pattern. Applied with `new RegExp(pattern)`.
- `inject[].when`: `before-llm` (injected into persona template before LLM call).
- `inject[].maxAge`: Maximum age in hours. Facts older than this are not injected.
- `retention.maxFacts`: Maximum facts stored per pack. Oldest evicted first.
- `retention.ttlDays`: Facts older than this are deleted during maintenance.

**Post-Mem0 migration:** When Mem0 is active, the `extract` rules are handled by Mem0's semantic extraction (far more capable than regex). The `inject` and `retention` rules become configuration for the Mem0Adapter. The JSON structure is preserved for compatibility.

---

## voice.json Structure

TTS voice configuration with provider fallback chain.

```json
{
  "provider": "elevenlabs",
  "voiceId": "abc123",
  "speed": 1.0,
  "pitch": 1.0,
  "fallback": {
    "provider": "google",
    "voiceId": "en-US-Wavenet-D"
  }
}
```

**Field rules:**
- `provider`: Must match a loaded TTS provider in `harness/src/providers/tts/`
- `voiceId`: Provider-specific voice identifier
- `speed` / `pitch`: Multiplier (1.0 = normal). Range: 0.5-2.0.
- `fallback`: Optional. If the primary provider fails, the harness tries this provider. If fallback also fails, falls back to the system default (`config/default.json` TTS config).

---

## Lifecycle

### Boot

1. Harness reads `config/default.json` → `activePack` field
2. Scans `packs/` directory for installed packs
3. Loads the active pack (or `default` if none configured)

### Load

1. Parse `manifest.json` → Zod validate all fields
2. Parse `persona.md` → extract front-matter + body
3. Parse `tools.json` → register tools with Brain Router
4. Parse `memory-rules.json` → configure memory policy
5. Parse `voice.json` → configure TTS provider
6. Push LCD face table to MQTT topic `xentient/display/faces`
7. Emit `pack_loaded` event on `xentient/status/packs`

### Validate Fail

If any required file is missing or any schema validation fails:
1. Log error with specific validation messages
2. Fall back to `default` pack
3. Publish `{type:"pack_error", packName, errors[]}` to MQTT

The `default` pack must always be present. If `packs/default/` is missing, the harness crashes at boot — this is intentional.

### Hot-Reload

`chokidar` watches `packs/<active>/` for file changes:
1. On change, start 500ms debounce timer
2. After debounce, re-run Load sequence
3. MemoryDB is **preserved** across reloads (memory survives pack changes)
4. Tool registry is rebuilt from the new `tools.json`
5. LCD face table is re-pushed if `persona.md` changed

### Pack Switch

Via MQTT control message on `xentient/control/pack`:
1. Receive `{type:"pack_switch", name:"new-pack"}`
2. Validate `new-pack` exists in `packs/`
3. If current mode is IDLE → swap immediately
4. If current mode is ACTIVE/LISTEN → queue until mode returns to IDLE
5. Atomically swap: load new pack, update Brain Router, push new LCD faces
6. Respond on `xentient/status/packs` with `{type:"pack_switched", name:"new-pack"}`
7. LCD flashes switch animation
8. TTS speaks the new pack's `greeting` front-matter line

---

## Guardrails

These rules are enforced by the PackLoader at load time. A junior developer should be able to implement these checks from this spec.

| Rule | Enforcement |
|------|-------------|
| Pack names: `[a-z0-9-]{1,32}` only | Loader rejects invalid names at scan time |
| No `..` path traversal in manifest paths | Loader resolves all entrypoint paths and rejects any that resolve outside the pack folder. Throws `PathTraversalError` |
| Asset files >1MB rejected | Loader checks file size before loading. Keeps hot-reload snappy and prevents memory bloat on embedded-adjacent hardware |
| `default` pack is reserved | Always present, always valid. Harness crashes at boot if `packs/default/` is missing |
| One pack active at a time | No stacking, no inheritance, no composition. If blended behavior is needed, author a third pack that blends |
| Handler types are enum-gated | Adding a handler type requires a harness PR. Unknown handler in `tools.json` = load fails |
| Manifest `v` must match harness expected version | Mismatch = load fails with clear error message. Migrations arrive when first breaking change ships |
| No pack dependencies | Packs are flat, self-contained. No imports from other packs. Shared patterns live in the harness itself |

---

## MQTT Pack Control

### Commands (sent to `xentient/control/pack`)

| Message Type | Schema | Description |
|--------------|--------|-------------|
| `pack_list` | `{v:1, type:"pack_list"}` | Request list of installed packs + active name |
| `pack_switch` | `{v:1, type:"pack_switch", name:"pack-name"}` | Switch to a different pack |
| `pack_reload` | `{v:1, type:"pack_reload"}` | Force hot-reload of active pack from disk |

### Responses (published on `xentient/status/packs`)

| Message Type | Schema | Description |
|--------------|--------|-------------|
| `pack_list_response` | `{v:1, type:"pack_list_response", packs:["default","angry-dad-mode"], active:"default"}` | List of installed packs + currently active |
| `pack_switched` | `{v:1, type:"pack_switched", name:"new-pack"}` | Confirmation that pack switch completed |
| `pack_error` | `{v:1, type:"pack_error", packName:"bad-pack", errors:["manifest invalid"]}` | Load failure with details |

---

## Demo Packs

Two packs planned for demo day (Apr 24). **Pack system code does NOT ship before demo.** This section documents the spec for post-demo P5.

### default

- Port of current hardcoded behavior. Zero visible change when active.
- `persona.md`: Current system prompt verbatim
- `tools.json`: Empty (no custom tools for demo)
- `voice.json`: Current TTS provider config

### angry-dad-mode

- Contrastive persona for pack-switch demo choreography
- `persona.md`: Gruff, impatient personality. LCD face overrides: `idle: [">(>_ <)  Dad", "  what?"]`
- `voice.json`: Deeper voice, slower speed (0.9)
- `greeting`: "Alright, what do you want?"

### Demo Choreography

1. Start in `default` — one clean user turn (e.g., "what's the room temperature?")
2. From presenter laptop: `mosquitto_pub -t xentient/control/pack -m '{"v":1,"type":"pack_switch","name":"angry-dad-mode"}'`
3. LCD flashes switch animation → speaker says "Alright, what do you want?" in new voice
4. Repeat the same user prompt → dramatic tonal contrast
5. Narrator: "Xentient's personality lives in one folder. Swap the folder, swap the brain."

---

*Cross-references: CONTRACTS.md (MQTT pack control topics, message schemas), CONTEXT.md (Brain Router handler table, skill continuum), SPACES.md (one pack per space), NODE-SKILLS.md (L0 Node Skill pairing)*
# Xentient Mega Plan — 3 Workers × 3 Hours

> **Created:** 2026-05-04 06:00 PHT  
> **Constraint:** 3 parallel workers, 3 hours total  
> **Goal:** Ship the platform track to a demoable end-to-end state

---

## ⚠️ LEGACY TRAPS — Read Before Touching Anything

These are the landmines. Every worker must internalize these.

### TRAP 1: TWO Pipeline.ts files exist

| File | What it is | Status |
|------|-----------|--------|
| `harness/src/engine/Pipeline.ts` | **OLD** — Core-side STT/LLM/TTS, coupled to AudioServer + ModeManager | **LEGACY — DO NOT EXTEND** |
| `harness/src/brain-basic/Pipeline.ts` | **NEW** — Brain-side `BrainPipeline`, receives audio via MCP, correct architecture | **THE FUTURE** |

**Rule:** `engine/Pipeline.ts` is imported ONLY by `index.ts` (the old entry point). `core.ts` does NOT import it. Never add features to `engine/Pipeline.ts`.

### TRAP 2: TWO entry points exist

| File | What it is | How it runs |
|------|-----------|-------------|
| `harness/src/index.ts` | **OLD** — runs Core + embedded STT/LLM/TTS in one process. Stubs out SpaceManager/PackLoader/EventBridge with `as any` | `bun run start` (legacy) |
| `harness/src/core.ts` | **NEW** — runs Core only. Full SpaceManager, PackLoader, EventBridge, SkillPersistence, NodeProvisioner. Brain connects externally via MCP stdio | `bun run core` or spawned by brain-basic |

**Rule:** ALL new work targets `core.ts`. The `index.ts` entry point is kept only for quick standalone testing without API keys. Never add features to `index.ts`.

### TRAP 3: brain-basic IS a separate process — but currently LAUNCHES core as its child

**Clarification on process architecture:**

This is the current `brain-basic` dev convenience pattern — it spawns `core.ts` as a stdio child:

```
[brain-basic.ts]  ←MCP stdio→  [core.ts] (child process)
```

**This is WRONG for the target architecture.** The real model is two fully independent processes:

```
[Core]   ←──── always running, owns hardware ────
   ↑  MCP stdio (or SSE transport)
[Brain]  ←──── separate process, connects to Core
```

**Target startup for development:**
```bash
# Terminal 1 — start Core standalone
cd harness && bun run core

# Terminal 2 — start Brain (any implementation)
cd harness && bun run brain        # brain-basic (dev/test)
# OR
bun run brain:hermes               # Hermes (full)
# OR from WSL:
hermes --mcp-server http://localhost:3000/mcp  # external brain
```

**What needs to change in brain-basic.ts:** Remove the StdioClientTransport that spawns core as a child. Replace with a transport that connects to an ALREADY-RUNNING Core. Options:
- `SSEClientTransport` pointing to `http://localhost:3000/mcp` (if Core exposes HTTP MCP)
- `StdioClientTransport` that connects to a named pipe or socket
- Keep stdio BUT require Core to already be running (use `bun run core &` in a script)

**Immediate plan (3-hour sprint):** Keep the spawn pattern for now — it works and is useful for testing. But add a `CORE_MCP_URL` env var check: if set, connect to external Core via HTTP/SSE instead of spawning. This is the bridge to the target architecture.

**Key facts about current wiring:**
- `getBrainConnected` in `core.ts` line 282 is hardcoded `() => true` (stdio = always connected)
- Brain receives events via `client.fallbackNotificationHandler` (custom `xentient/*` methods)
- Brain calls tools via `client.callTool({ name: "xentient_*" })`
- MCP server in Core uses **stdio transport** (`mcp/server.ts` line 357) — one client at a time

### TRAP 4: Default pack has NO skills, NO nodeSkills, NO configurations

`harness/packs/default/skills.json` is just `{ pack: { name: "default" }, skills: [] }`. The `PackSkillManifestSchema` in contracts.ts expects `configurations` and `nodeSkills` arrays. `PackLoader.loadPack()` must handle partial manifests — verify `configurations` and `nodeSkills` use `.default([])` in the Zod schema.

### TRAP 5: Mode state machine is DEPRECATED but still used everywhere

`contracts.ts`: `MODE_VALUES = ["sleep", "listen", "active", "record"]` is marked deprecated. The new system uses Configuration + CoreNodeState ("dormant"/"running"). ModeManager, dashboard, firmware all still use old modes. **Do not try to remove modes. They coexist with configs.**

### TRAP 6: `getMemoryContext` is stubbed everywhere

Both `index.ts` and `brain-basic.ts` return `{ userProfile: "", relevantEpisodes: "", extractedFacts: "" }`. The memory system (`src/memory/`) was planned but never built. DB files exist (`data/xentient_memory.db-*`) but the directory is empty. **Memory is a Hermes concern — Core stays stateless.**

### TRAP 7: `xentient_brain_stream` MCP tool ALREADY EXISTS

`mcp/tools.ts` line 799 — fully implemented. Validates subtypes, broadcasts `BrainStreamEvent` via `controlServer.broadcastSSE()`, calls `spaceManager.closeEscalation()`. **Do not re-implement.** Dashboard just needs to handle the SSE events.

### TRAP 8: `xentient_play_audio` sends to AudioServer WS, NOT speaker directly

`mcp/tools.ts` line 520 — `deps.audio.sendAudio(audioBuffer)` sends PCM over WebSocket to ESP32. Never send audio over MQTT.

### TRAP 9: `harness/src/brain/` directory IS EMPTY

`src/brain/` exists but has zero files. `docs/BRAIN-INTERFACE.md` references `brain/hermes/HermesAdapter.ts` as "to be built in Phase 14" — it does not exist yet. The Hermes adapter is **greenfield work** for this sprint.

---

## Module Connection Map

```
╔══════════════════════════╗   ╔═══════════════════════════════╗
║   brain-basic.ts         ║   ║  brain/hermes/ (Hermes)       ║
║  (dev/test brain)        ║   ║  (full brain, WSL or native)  ║
║  BrainPipeline           ║   ║  HermesAdapter                ║
║  STT→LLM→TTS             ║   ║  memory recall + LLM + TTS    ║
╚═══════════╤══════════════╝   ╚══════════╤════════════════════╝
            │  MCP stdio                  │  MCP stdio OR SSE
            │  (or CORE_MCP_URL env)      │  (via CORE_MCP_URL)
            ▼                             ▼
╔═══════════════════════════════════════════════════════════════╗
║                         core.ts                              ║
║                                                              ║
║  MqttClient ←→ ESP32 firmware (MQTT :1883)                  ║
║  AudioServer ←→ ESP32 I2S mic (WebSocket :8081)             ║
║  CameraServer ←→ ESP32-CAM (WebSocket :8082)                ║
║  ModeManager ← mqtt.modeCommand / mqtt.sensor               ║
║  SpaceManager ← ModeManager.modeChange                      ║
║    ├─ SkillExecutor ← EventBridge events                    ║
║    │    └─ builtins: _pir-wake, _sensor-telemetry,          ║
║    │       _determine-skill, _voice-capture (new)           ║
║    └─ PackLoader ← packs/default/skills.json                ║
║  EventBridge ← MQTT sensor/trigger → SkillExecutor          ║
║  ControlServer HTTP :3000                                   ║
║    ├─ REST /api/*                                           ║
║    └─ SSE /api/events ──────────────────────────────────►  ║
║  MCP Server (stdio) ← Brain connects here                   ║
║    ├─ 20+ xentient_* tools                                  ║
║    └─ push notifications → xentient/skill_escalated etc.   ║
╚═══════════════════════════════════════════════════════════════╝
            │ HTTP + SSE
            ▼
╔═══════════════════════════╗
║   Dashboard (public/)    ║
║   main.js  overview.js   ║
║   skills.js telemetry.js ║
╚═══════════════════════════╝
```

**Key rule:** Core is always started first. Brain(s) connect to it. Core never reaches out to Brain.

---

---

## ⚡ Hermes + External Brain Architecture (Phase 14 — include in this sprint)

### What is Hermes?

Hermes is a Claude Code agent (or similar CLI-based AI) that will serve as the **full Brain** for Xentient. It runs as a separate OS process — potentially in WSL on Windows, or natively on Linux/Mac. It is **not embedded in Core**.

### The Problem to Solve

How does an external agent like `hermes` CLI (or `claude` CLI, or any AI tool) connect to Core's MCP server and act as a Brain?

Currently Core's MCP server uses **stdio transport only** (`mcp/server.ts` line 357). That means the Brain process must either:
1. Be spawned by Core as a child (current brain-basic pattern — wrong direction)
2. Connect via a different transport (HTTP SSE MCP)

**The fix:** Add an **HTTP/SSE MCP transport option** to Core so any external process can connect.

### What Needs to Be Built

#### Step 1: Add SSE MCP transport to Core (Worker B, Hour 3)

**File: `harness/src/mcp/server.ts`**

Add a second transport alongside stdio — an SSE/HTTP MCP endpoint. The MCP SDK supports `SSEServerTransport`:

```ts
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// In core.ts, after controlServer.start():
// Register MCP-over-HTTP endpoint on the existing ControlServer
// POST /mcp  → SSE MCP transport
```

Add route to ControlServer:
```ts
.add('POST', '/mcp', this.handleMcpSse.bind(this))
.add('GET', '/mcp', this.handleMcpSse.bind(this))
```

This lets ANY external tool connect to Core's MCP:
```bash
# From WSL, connect Hermes to Core running on Windows host:
export CORE_MCP_URL="http://192.168.x.x:3000/mcp"
```

**GOTCHA:** `SSEServerTransport` creates one transport instance per connection. Multiple Brains can connect simultaneously. Core must handle this — currently `startMcpServer()` creates one `McpServer` with one stdio transport. For SSE, each connecting client gets its own transport instance connected to the same `McpServer`.

#### Step 2: Create `HermesAdapter` (Worker B, Hour 3)

**File: `harness/src/brain/hermes/HermesAdapter.ts`** (NEW — directory is empty)

This adapter makes Hermes act as a Brain. Two modes:

**Mode A — Subprocess (simple, local):**
```ts
// Core (or a launcher script) runs:
const proc = spawn('hermes', [
  '--query', systemPrompt,
  '--mcp-server', 'http://localhost:3000/mcp'
]);
// Hermes connects back to Core via HTTP MCP
```

**Mode B — External/WSL (production):**
```bash
# In WSL terminal:
hermes --mcp-server "http://$(hostname -I | awk '{print $1}'):3000/mcp"
# Hermes connects to Core on the Windows host via WSL bridged IP
```

The adapter itself is a TypeScript script that:
1. Connects to Core via `SSEClientTransport` using `CORE_MCP_URL` env var
2. Calls `xentient_get_capabilities()` on connect — to understand the room
3. Subscribes to `skill_escalated` notifications via `xentient_subscribe_events`
4. On `voice_command` escalation: streams reasoning via `xentient_brain_stream`, calls STT/LLM/TTS, calls `xentient_play_audio`
5. Reads memory context from SQLite (`data/xentient_memory.db`) if available

**File: `harness/src/brain/hermes/index.ts`** — entry point:
```ts
import { HermesAdapter } from './HermesAdapter';
const adapter = new HermesAdapter({
  coreMcpUrl: process.env.CORE_MCP_URL ?? 'http://localhost:3000/mcp',
  stt: createSTTProvider(),
  tts: createTTSProvider(),
  llm: createLLMProvider(),
});
await adapter.connect();
await adapter.run();
```

**File: `harness/package.json`** — add scripts:
```json
"brain": "bun run src/brain-basic.ts",
"brain:hermes": "bun run src/brain/hermes/index.ts",
"core": "bun run src/core.ts"
```

#### Step 3: System Prompt for Hermes-as-Brain

**File: `harness/context/BRAIN-SYSTEM-PROMPT.md`** (NEW)

This is the system prompt injected when Hermes runs as a Brain. It tells Hermes:
- What Xentient is
- What MCP tools are available (from `xentient_get_capabilities`)
- How to respond to escalations (stream reasoning, call tools, play audio)
- How memory works (read from context files)
- The response protocol (always call `xentient_brain_stream` with `escalation_complete` when done)

Template:
```markdown
# Xentient Brain System Prompt

You are the Brain of an ambient intelligence system called Xentient.
You are connected to a physical room via MCP tools.

## Your Capabilities
{{xentient_get_capabilities result injected here at runtime}}

## Response Protocol
1. Call xentient_brain_stream(escalation_received) immediately
2. Stream your reasoning tokens via xentient_brain_stream(reasoning_token)
3. Call room tools as needed (xentient_play_audio, xentient_set_lcd, etc.)
4. ALWAYS call xentient_brain_stream(escalation_complete) when done

## Memory
{{memory context injected from SQLite at escalation time}}
```

### How Hermes Connects (WSL Scenario)

```
Windows Host
├── Core running on port 3000 (bun run core)
├── Dashboard at http://localhost:3000
└── WSL2
    └── hermes --mcp-server http://$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):3000/mcp
        # WSL2 reaches Windows host via the nameserver IP
```

Alternatively, if `claude` CLI supports MCP client mode:
```bash
claude --mcp-server http://localhost:3000/mcp \
       --system-prompt "$(cat harness/context/BRAIN-SYSTEM-PROMPT.md)"
```

### Done Criteria for Hermes Integration

- [ ] Core exposes `/mcp` HTTP endpoint (SSE transport)
- [ ] `bun run brain:hermes` connects to running Core without spawning it
- [ ] `CORE_MCP_URL=http://host:3000/mcp bun run brain:hermes` works from WSL
- [ ] Hermes receives `skill_escalated` for `voice_command` events
- [ ] Hermes calls `xentient_play_audio` to speak response
- [ ] Brain Feed in dashboard shows Hermes reasoning tokens
- [ ] `tsc --noEmit` passes

---

## Worker Assignment (3 hours, parallel)

### Worker A: Dashboard UI — Sub-Controls + Brain Feed

**Scope:** Upgrade Overview panel, add node function indicators, brain feed widget.  
**Touches:** Dashboard frontend (JS/CSS) + one ControlServer handler.  
**Zero risk of breaking Core runtime.**

#### Hour 1: Extend `/api/status` + Overview card

**File: `harness/src/comms/ControlServer.ts`** — `handleGetStatus` (line 255)

Current response: `{ mode, mqtt, camera, sensors }`. Add:
- `brain: this.deps.getBrainConnected()`
- `activePack: this.deps.packLoader.getLoadedPack()`
- `nodeFunctions: { core: true, cam, mic, speaker, tempHumid, pir }` derived from `packLoader.getLoadedPackManifest()?.nodeSkills?.[0]?.requires`
- `activeConfig: spaceManager.getSpace('default')?.activeConfig`

**DON'T:** Add new deps to ControlServerDeps — everything needed is already injected.

**File: `harness/public/js/overview.js`** — add Node Functions pill row

Add helper `renderNodeFunctionPill(label, active, alwaysOn)` → returns `<span class="node-fn always-on|active|inactive">`.

Update System Status card to show:
1. Mode badge (existing)
2. MQTT + BRAIN connection dots (move Brain here from header)
3. Active Pack + Active Config line
4. Node Functions pills: CORE (always green), CAM, MIC, SPKR, ENV, PIR

**File: `harness/public/js/main.js`** — add `state.nodeFunctions`, `state.activeConfig` 

In `refreshState()` and `init()`, read `status.nodeFunctions` and `status.activeConfig` into state.

Handle SSE `pack_loaded` / `pack_unloaded` to refresh node functions (re-fetch `/api/status`).

**File: `harness/public/dashboard.css`** — add `.node-fn`, `.node-fn.always-on`, `.node-fn.active`, `.node-fn.inactive` styles.

#### Hour 2: Brain Feed widget

**IMPORTANT: `xentient_brain_stream` tool already exists and already broadcasts SSE.** The only missing piece is dashboard rendering.

**File: `harness/public/js/main.js`** — add SSE handler for `brain_event` type:
```
case 'brain_event':
  if (state.activeTab === 'overview') appendBrainFeedEvent(event);
  break;
```

**File: `harness/public/js/overview.js`** — add collapsible Brain Feed card at bottom of overview:
- Shows last 20 brain events
- `reasoning_token` → append to streaming text block
- `tool_call_fired` → show amber pill
- `escalation_complete` → show green "done" + auto-clear after 30s
- Card header shows "Brain Feed" with expand/collapse toggle

**File: `harness/public/dashboard.css`** — brain feed styles (`.brain-feed`, `.brain-token`, `.brain-tool-call`)

#### Hour 3: Polish + Pack-Changed SSE

**File: `harness/src/core.ts`** — in the `packLoader.on('pack_loaded')` handler (line 344), also broadcast `nodeFunctions` by reading the manifest:
```ts
packLoader.on('pack_loaded', (data) => {
  const manifest = packLoader.getLoadedPackManifest();
  const ns = manifest?.nodeSkills?.[0];
  controlServer.broadcastSSE({
    type: 'pack_loaded', ...data,
    nodeFunctions: {
      core: true,
      cam: ns?.requires?.camera === true,
      mic: ns?.requires?.mic === true,
      speaker: manifest?.skills?.some(s => s.actions?.some(a => a.type === 'play_chime')) ?? false,
      tempHumid: ns?.requires?.bme === true,
      pir: ns?.requires?.pir === true,
    },
  });
});
```

**File: `harness/public/js/main.js`** — update `pack_loaded` handler to read `event.nodeFunctions`.

**Done criteria:**
- [ ] Node function pills render correctly with loaded pack
- [ ] CORE is always green
- [ ] Brain Feed shows events from `xentient_brain_stream` calls
- [ ] `tsc --noEmit` passes

---

### Worker B: Pipeline Migration (Phase 9) + Voice CoreSkills (Phase 10) + Hermes SSE MCP Bridge

**Scope:** Route voice through skill system, wire Hermes/external brain connection point.  
**Touches:** `brain-basic.ts`, `brain-basic/Pipeline.ts`, `core.ts`, `mcp/server.ts`, `brain/hermes/`.

#### Hour 1: Wire voice escalation through the Skill system

**THE HARD PART:** Currently, `core.ts` sends `voice_end` MCP notification directly to Brain (line 162-189). Brain receives it via `fallbackNotificationHandler` and calls `pipeline.processUtterance()`. This works but **bypasses the Skill system entirely**.

The correct flow should be:
1. Audio chunk → AudioServer → `core.ts` accumulates
2. VAD end → `core.ts` fires EventBridge event `voice_end`
3. EventBridge → `_voice-capture` CoreSkill fires
4. `_voice-capture` escalation → MCP `skill_escalated` notification → Brain
5. Brain receives escalation with audio payload → BrainPipeline.processUtterance()

**What to do:**

**File: `harness/src/engine/builtins.ts`** — add `VOICE_CAPTURE` builtin:
```ts
export const VOICE_CAPTURE: CoreSkill = {
  id: '_voice-capture',
  displayName: 'Voice Capture',
  enabled: true,
  spaceId: '*',
  configFilter: '*',
  trigger: { type: 'event', event: 'voice_end' },
  priority: 10,
  actions: [{ type: 'set_lcd', line1: '(O_O)', line2: 'thinking' }],
  escalation: {
    conditions: [{ field: 'always', operator: '>=', value: 0 }],
    event: 'voice_command',
    contextBuilder: 'full-context',
    priority: 'normal',
    cooldownMs: 0,
  },
  source: 'builtin',
  cooldownMs: 2000,
  fireCount: 0,
  escalationCount: 0,
};
```

Add to `ALL_BUILTINS` array and `BUILTIN_SKILL_IDS` in contracts.ts.

**File: `harness/src/core.ts`** — in the VAD-end handler (line 177-192), instead of sending `voice_end` MCP notification directly, fire it through EventBridge:
```ts
// Replace mcpServer.server.notification with:
eventBridge.handleMqttEvent('voice_end', {
  timestamp: Date.now(),
  duration_ms: combined.length / 32,
  audio: combined.toString('base64'),
});
```

This routes through EventBridge → SkillExecutor → `_voice-capture` skill → escalation → MCP notification with audio in context.

**GOTCHA:** The escalation's `contextBuilder: 'full-context'` must include the `triggerData` (which has the audio base64). Check `harness/src/engine/contextBuilders.ts` to ensure `full-context` passes triggerData through.

#### Hour 2: Update brain-basic to receive skill escalations

**File: `harness/src/brain-basic.ts`** — update `fallbackNotificationHandler`:

Replace the `voice_end` handler with a `skill_escalated` handler:
```ts
case 'xentient/skill_escalated': {
  const esc = params as { skillId: string; event: string; context: any; priority: string };
  if (esc.event === 'voice_command' && esc.context?.audio) {
    const audioBuffer = Buffer.from(esc.context.audio, 'base64');
    // Stream brain reasoning back to Core
    await client.callTool({
      name: 'xentient_brain_stream',
      arguments: { escalation_id: esc.context.escalationId ?? 'unknown', subtype: 'escalation_received', payload: { skillId: esc.skillId } },
    });
    await pipeline.processUtterance(audioBuffer);
    await client.callTool({
      name: 'xentient_brain_stream',
      arguments: { escalation_id: esc.context.escalationId ?? 'unknown', subtype: 'escalation_complete', payload: {} },
    });
  }
  break;
}
```

Keep `voice_start` / `motion_detected` handlers as fallbacks — they set mode via MCP tool, which is still correct.

**CRITICAL DON'T:** Do NOT remove the `voice_end` direct notification path yet. Keep both paths active during migration. The skill-based path will fire first (EventBridge → Skill → escalation). The old direct path fires second (harmless if brain ignores duplicate).

#### Hour 3: BrainPipeline streaming + Hermes SSE MCP bridge

**File: `harness/src/brain-basic/Pipeline.ts`** — in `processUtterance()`, add `onReasoningToken` callback to `BrainPipelineOptions`. In `interceptTokens()`, call it on each token. brain-basic.ts passes a callback that calls `xentient_brain_stream(reasoning_token)`.

**File: `harness/src/brain-basic.ts`** — add `CORE_MCP_URL` env var check:
```ts
const transport = process.env.CORE_MCP_URL
  ? new SSEClientTransport(new URL(process.env.CORE_MCP_URL))  // external Core
  : new StdioClientTransport({ command: 'bun', args: [corePath] }); // spawn Core (legacy dev)
```
Import `SSEClientTransport` from `@modelcontextprotocol/sdk/client/sse.js`.

**File: `harness/src/mcp/server.ts`** — add SSE transport support. The SDK's `McpServer` can handle multiple transports. Add a helper `connectSseClient(req, res)` that creates a new `SSEServerTransport` per HTTP connection and connects it to the existing `McpServer` instance. This function is called by ControlServer's new `/mcp` route.

**File: `harness/src/comms/ControlServer.ts`** — add `/mcp` route that calls `mcpServer.connectSseClient(req, res)`. Wire `mcpServer` into `ControlServerDeps`:
```ts
// Add to ControlServerDeps:
mcpServer?: { connectSseClient: (req, res) => void };
// Add route:
.add('GET', '/mcp', this.handleMcpSse.bind(this))
.add('POST', '/mcp', this.handleMcpSse.bind(this))
```

**File: `harness/src/brain/hermes/index.ts`** — create stub that connects via `SSEClientTransport` and mirrors brain-basic logic.

**File: `harness/package.json`** — add `"brain:hermes": "bun run src/brain/hermes/index.ts"`.

**Done criteria:**
- [ ] Voice goes through Skill system, `_voice-capture` fires in skill log
- [ ] Brain Feed shows reasoning tokens
- [ ] `CORE_MCP_URL=http://localhost:3000/mcp bun run brain` connects without spawning Core
- [ ] `GET /mcp` returns SSE stream (200, text/event-stream)
- [ ] `engine/Pipeline.ts` untouched

---

### Worker C: Default Pack Manifest + NodeSkill Contract (Phase 11 foundation)

**Scope:** Make the default pack a real manifest with configurations, nodeSkills, and first real skills. Wire NodeProfile push on pack load.  
**Touches:** Pack manifest, PackLoader, SpaceManager profile push, ControlServer spaces endpoint.

#### Hour 1: Build the real default pack manifest

**File: `harness/packs/default/skills.json`** — replace empty manifest with full manifest:

```json
{
  "pack": {
    "name": "default",
    "version": "1.0.0",
    "description": "Default Xentient skill pack — ambient presence + voice"
  },
  "configurations": [
    {
      "name": "ambient",
      "displayName": "Ambient Awareness",
      "nodeAssignments": { "base": "ambient-sense" },
      "coreSkills": ["env-logger", "motion-alert"]
    },
    {
      "name": "voice-ready",
      "displayName": "Voice Ready",
      "nodeAssignments": { "base": "voice-listen" },
      "coreSkills": ["env-logger", "motion-alert"]
    }
  ],
  "nodeSkills": [
    {
      "id": "ambient-sense",
      "name": "Ambient Sensor",
      "version": "1.0.0",
      "requires": { "pir": true, "bme": true, "lcd": true },
      "sampling": { "bmeIntervalMs": 5000, "pirDebounceMs": 1000, "micMode": 0, "cameraMode": 0 },
      "emits": ["presence", "env"],
      "expectedBy": "_pir-wake",
      "compatibleConfigs": ["ambient", "voice-ready"]
    },
    {
      "id": "voice-listen",
      "name": "Voice Listener",
      "version": "1.0.0",
      "requires": { "pir": true, "mic": true, "bme": true, "lcd": true },
      "sampling": { "bmeIntervalMs": 5000, "pirDebounceMs": 1000, "micMode": 1, "audioRate": 16000, "audioChunkMs": 100, "vadThreshold": 0.3 },
      "emits": ["presence", "env", "vad", "audio_chunk"],
      "expectedBy": "_voice-capture",
      "compatibleConfigs": ["voice-ready"]
    }
  ],
  "skills": [
    {
      "id": "env-logger",
      "displayName": "Environment Logger",
      "trigger": { "type": "interval", "everyMs": 60000 },
      "actions": [{ "type": "log", "message": "env-snapshot" }],
      "priority": 90
    },
    {
      "id": "motion-alert",
      "displayName": "Motion Alert",
      "trigger": { "type": "event", "event": "motion_detected" },
      "actions": [
        { "type": "set_lcd", "line1": "(O_O)!", "line2": "motion" },
        { "type": "increment_counter", "name": "motion_count" }
      ],
      "cooldownMs": 5000,
      "priority": 30,
      "collect": [{ "type": "counter", "name": "motion_count", "resetAfterMs": 3600000 }],
      "escalation": {
        "conditions": [{ "type": "counter_above", "name": "motion_count", "threshold": 10 }],
        "event": "excessive_motion",
        "contextBuilder": "sensor_snapshot",
        "priority": "normal"
      }
    }
  ]
}
```

**GOTCHA:** `PackSkillManifestSchema` in contracts.ts validates `configurations` and `nodeSkills` as required arrays. Verify `PackLoader.loadPack()` handles partial manifests (it should — check if `z.array().optional()` or required).

**File: `harness/src/shared/contracts.ts`** — if `PackSkillManifestSchema` has `configurations` and `nodeSkills` as required, the empty manifest `{ pack, skills: [] }` would fail validation. Check and fix by making them `.default([])`:
```ts
configurations: z.array(ConfigurationSchema).default([]),
nodeSkills: z.array(NodeSkillSchema).default([]),
```

#### Hour 2: Wire NodeProfile push on pack load

**File: `harness/src/engine/SpaceManager.ts`** — `pushDefaultProfile()` already exists. The gap: it's only called on `onNodeBirth` and `onMqttReconnect`. It should ALSO fire when a pack loads or config activates.

In `executeConfigTransition()` (which fires on config activation):
- After setting `activeConfig`, call `pushDefaultProfile()` for each node in the space
- This sends `NodeProfileSet` MQTT message with the NodeSkill's sampling params

**File: `harness/src/comms/MqttClient.ts`** — verify `publish()` can send to parameterized topics like `xentient/node/{nodeId}/profile/set`. Check if there's a helper or if raw topic string works.

**File: `harness/src/engine/nodeProfileCompiler.ts`** — verify this file exists and correctly compiles a NodeSkill into a `NodeProfileSet` message. If it doesn't exist, create it:
```ts
export function compileNodeProfile(nodeSkill: NodeSkill, nodeId: string): NodeProfileSet {
  return {
    v: 1,
    type: 'node_profile_set',
    profileId: nodeSkill.id,
    pirIntervalMs: nodeSkill.sampling.pirDebounceMs ?? 1000,
    micMode: nodeSkill.sampling.micMode ?? 0,
    bmeIntervalMs: nodeSkill.sampling.bmeIntervalMs ?? 5000,
    cameraMode: nodeSkill.sampling.cameraMode ?? 0,
    lcdFace: nodeSkill.modeTask?.lcdFace ?? 0,
    eventMask: computeEventMask(nodeSkill.emits),
  };
}
```

#### Hour 3: Spaces endpoint upgrade + integration test

**File: `harness/src/comms/ControlServer.ts`** — upgrade `handleListSpaces` (line 503) to return real space data:
```ts
const space = this.deps.spaceManager.getSpace('default');
const manifest = this.deps.packLoader.getLoadedPackManifest();
const config = manifest?.configurations.find(c => c.name === space?.activeConfig);
const nodeSkill = manifest?.nodeSkills.find(ns => ns.id === config?.nodeAssignments?.['base']);

this.sendJSON(res, 200, [{
  id: space?.id ?? 'default',
  activeConfig: space?.activeConfig,
  activePack: space?.activePack,
  availableConfigs: manifest?.configurations.map(c => c.name) ?? [],
  nodes: space?.nodes ?? [],
  nodeSkill: nodeSkill ? { id: nodeSkill.id, requires: nodeSkill.requires, emits: nodeSkill.emits } : null,
}]);
```

**Verification:** Load pack → `GET /api/spaces` returns real config data → `GET /api/status` returns correct `nodeFunctions`.

**Done criteria:**
- [ ] Default pack has 2 configs, 2 nodeSkills, 2 pack skills
- [ ] `PackLoader.loadPack('default')` succeeds with new manifest
- [ ] `/api/status` returns correct `nodeFunctions` from loaded pack
- [ ] `/api/spaces` returns configs + nodeSkill info
- [ ] `tsc --noEmit` passes

---

## DO / DON'T Rules for ALL Workers

### DO ✅

- Run `cd harness && npx tsc --noEmit` before declaring done
- Use `pino` logger with `process.stderr` (MCP stdio safety)
- Use existing patterns: `ControlServerDeps` injection, `broadcastSSE()`, `McpToolDeps` optional chaining
- Keep backward compatibility — add fields, don't remove them
- Test with `bun run core` (not `bun run start` which is the legacy `index.ts`)
- Check contracts.ts before inventing new message types

### DON'T ❌

- **DON'T** modify `harness/src/index.ts` — it's legacy, leave it alone
- **DON'T** modify `harness/src/engine/Pipeline.ts` — it's legacy, leave it alone
- **DON'T** add new deps to `ControlServerDeps` interface — everything needed is already injected
- **DON'T** create new MQTT topics without adding them to `MQTT_TOPICS` in contracts.ts
- **DON'T** break the `as any` stubs in `index.ts` — someone might still use it for quick tests
- **DON'T** hardcode `getBrainConnected: () => true` in new code (it's already there in core.ts, don't duplicate)
- **DON'T** send binary audio over MQTT (use WebSocket AudioServer for audio, MQTT for control)

---

## Verification Matrix

| Test | Worker | Command |
|------|--------|---------|
| TypeScript compiles | ALL | `cd harness && npx tsc --noEmit` |
| Core starts | B, C | `cd harness && bun run core` (no API keys needed for core-only) |
| Dashboard loads | A | Open `http://localhost:3000` |
| Node function pills show | A, C | Load pack → check `/api/status` → check Overview card |
| Brain Feed renders | A, B | Trigger `xentient_brain_stream` via test → check SSE |
| Pack loads with manifest | C | `GET /api/packs` shows `default` loaded |
| Skill escalation fires | B | Trigger voice → check skill log for `_voice-capture` |
| Existing tests pass | ALL | `cd harness && bun test` |

---

## Post-3-Hour Remaining Work

After this sprint, the following phases are partially complete:

| Phase | Status after sprint | Remaining |
|-------|-------------------|-----------|
| 9: Pipeline Migration | Voice routed through skills, brain receives escalations | Remove legacy `voice_end` direct path, delete `engine/Pipeline.ts` |
| 10: Voice CoreSkills | `_voice-capture` builtin working | Add noise-gate, voice-classifier, keyword-spotter (3 more CoreSkills) |
| 11: L0 NodeSkills | Manifest + profile push wired | Firmware handler for `node_profile_set`, real ESP32 ACK |
| 12: Brain Feed | SSE + dashboard widget working | Polish UI, add auto-scroll, truncation |
| 13: Brain Interface | SSE MCP transport + `CORE_MCP_URL` env added | Document `/mcp` endpoint in BRAIN-INTERFACE.md |
| 14: Hermes Wiring | `brain/hermes/index.ts` stub created, connects via SSE | Full memory integration, system prompt injection, WSL testing |
| 15: Deployment | Not started | Docker compose with mosquitto + core + brain containers |

**Estimated remaining after sprint: ~4 more hours across 2-3 sessions.**

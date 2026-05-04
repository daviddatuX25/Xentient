# Xentient Sprint Anchor — Revised Plan
**Status:** Ground-truth locked from codebase audit  
**Target:** 2–3 hours, 3 parallel workers  
**Transport decision:** SSE/HTTP is canonical. Core runs first. Brain connects to it.  
**Brain identity:** Custom `HermesAdapter.ts` — headless Bun/TS script that calls Nous Hermes via Ollama (`/api/chat` or `/v1/chat/completions`). No CLI agent spawning. No `hermes-workspace` iframe. One dashboard.

---

## What the Audit Revealed (Read Before Touching Anything)

These are not opinions — they are confirmed codebase facts that invalidate parts of the original Mega Plan.

| # | Finding | Impact on Plan |
|---|---------|---------------|
| F1 | `SkillExecutor.escalate()` is **fire-and-forget** — no escalationId, no ack tracking, no timeout | Must add EscalationSupervisor in Core |
| F2 | `SpaceManager.closeEscalation()` is a **no-op stub** | Needs real implementation |
| F3 | **No escalationId** generated anywhere — `BrainStreamEvent.escalation_id` field exists but is never populated | Must generate UUID at escalation time |
| F4 | `getBrainConnected` is **hardcoded `() => true`** | Must wire to real SSE connection tracking |
| F5 | ControlServer is **raw Node `http.Server`** with `MicroRouter` — no framework | SSE `/mcp` route is addable but must follow the existing manual pattern |
| F6 | **SSEServerTransport exists** in SDK v1.29.0 at `server/sse.js` | Good — but MCP SDK supports one transport per McpServer instance. Must use second McpServer OR refactor |
| F7 | `AudioServer.sendAudio(buf)` **exists and works** — same path as `xentient_play_audio` MCP tool | Core CAN self-invoke fallback audio directly without brain |
| F8 | **No chime PCM assets exist** — `play_chime` action type is schema-only, emits an event, produces zero audio | Must embed a static sine-wave PCM buffer for the fallback chime |
| F9 | `brain-basic.ts` **never calls `xentient_brain_stream`** — fully unwired end-to-end | Brain Feed widget has no data source yet |
| F10 | `processUtterance()` returns `Promise<void>` — no transcript/response returned | Brain stream calls must be injected via callback, not return value |
| F11 | `_voice-capture` CoreSkill **does not exist** — builtins.ts has `_pir-wake`, `_sensor-telemetry` only | Must add to builtins.ts AND contracts.ts |
| F12 | `brain-basic.ts` listens for `voice_end` MCP notification directly, **bypassing skill system entirely** | Migration path confirmed: route via EventBridge → `_voice-capture` → `skill_escalated` |

---

## Architecture Contract (Locked)

```
┌─────────────────────────────────────────────────────┐
│                    core.ts                          │
│                                                     │
│  EscalationSupervisor (NEW)                         │
│  ├── generates escalationId (UUID)                  │
│  ├── fires MCP notification xentient/skill_escalated│
│  ├── starts 8s timeout                              │
│  └── on timeout → FallbackResponder.fire()          │
│                                                     │
│  FallbackResponder (NEW, inline in core.ts)         │
│  ├── mqtt.publish("xentient/display", errorFace)    │
│  └── audioServer.sendAudio(CHIME_PCM_BUFFER)        │
│                                                     │
│  getBrainConnected → SseBrainTracker (NEW)          │
│  └── true only when ≥1 SSE /mcp client connected   │
│                                                     │
│  ControlServer: adds GET+POST /mcp route            │
│  McpSseServer (second McpServer instance, NEW)      │
│  └── same tool handlers as stdio McpServer          │
└──────────────┬──────────────────────────────────────┘
               │ SSE /mcp  (HTTP, port 3000)
               │ CORE_MCP_URL=http://localhost:3000/mcp
               ▼
┌─────────────────────────────────────────────────────┐
│            HermesAdapter (brain/hermes/)            │
│                                                     │
│  SSEClientTransport → connects to Core /mcp         │
│  on skill_escalated(voice_command):                 │
│  ├── call xentient_brain_stream(escalation_received)│
│  ├── STT: transcribe audio buffer (Whisper/Ollama)  │
│  ├── LLM: stream tokens from Nous Hermes via Ollama │
│  │    └── each token → xentient_brain_stream        │
│  │         (reasoning_token)                        │
│  ├── TTS: synthesize response                       │
│  ├── call xentient_play_audio(pcm)                  │
│  └── call xentient_brain_stream(escalation_complete)│
│       → EscalationSupervisor clears timeout         │
│                                                     │
│  brain-basic.ts (fallback, same SSE transport)      │
│  └── same contract, simpler LLM (OpenAI API etc.)  │
└─────────────────────────────────────────────────────┘
               │ SSE /api/events (existing)
               ▼
┌─────────────────────────────────────────────────────┐
│              Dashboard (public/)                    │
│  Brain Feed widget ← brain_event SSE type           │
│  Node Function pills ← pack_loaded SSE type         │
│  Status card ← /api/status (extended)               │
└─────────────────────────────────────────────────────┘
```

**The non-negotiable invariant:** Core never reaches out to Brain. Core fires escalation, starts timer, handles its own fallback. Brain's `escalation_complete` call is the only way to cancel the timer. If brain dies mid-response, Core still recovers.

---

## The Two McpServer Problem (Critical — Read Before Worker B Starts)

The MCP SDK creates one transport per `McpServer` instance. Currently Core has one `McpServer` on stdio. Adding SSE cannot share that instance cleanly.

**Solution:** Create a second `McpServer` instance (`McpSseServer`) in `mcp/server.ts` that receives the **same `createToolHandlers(deps)` result**. Both server instances share the same tool handler functions via closure — no duplication of business logic.

```ts
// mcp/server.ts (conceptual)
export function createMcpSseServer(deps: McpToolDeps) {
  const server = new McpServer({ name: 'xentient-sse', version: '1.0.0' });
  registerTools(server, deps); // same registration fn
  return {
    connectClient: (req: IncomingMessage, res: ServerResponse) => {
      const transport = new SSEServerTransport('/mcp', res);
      server.connect(transport);
      sseBrainTracker.add(transport);
      req.on('close', () => sseBrainTracker.remove(transport));
    }
  };
}
```

`sseBrainTracker` is a `Set<SSEServerTransport>` — `getBrainConnected` returns `sseBrainTracker.size > 0`.

---

## The Chime PCM Buffer (Worker B must produce this)

No audio assets exist. Embed a static buffer in a new file:

**File: `harness/src/engine/chime.ts`**
```ts
// 0.3s of 440Hz sine wave at 16kHz, 16-bit LE mono
// Generated at build time — no runtime dependency
export const CHIME_PCM: Buffer = generateSineWave(440, 0.3, 16000);

function generateSineWave(hz: number, durationS: number, sampleRate: number): Buffer {
  const samples = Math.floor(sampleRate * durationS);
  const buf = Buffer.allocUnsafe(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.sin(2 * Math.PI * hz * i / sampleRate);
    buf.writeInt16LE(Math.round(v * 16000), i * 2); // soft amplitude
  }
  return buf;
}
```

`FallbackResponder` imports `CHIME_PCM` and calls `audioServer.sendAudio(CHIME_PCM)`.

---

## EscalationSupervisor Contract

**File: `harness/src/engine/EscalationSupervisor.ts`** (NEW)

```ts
interface OpenEscalation {
  escalationId: string;
  skillId: string;
  timer: Timer;
}

export class EscalationSupervisor {
  private open = new Map<string, OpenEscalation>();

  fire(skillId: string, notifyFn: (id: string) => void, fallbackFn: () => void, timeoutMs = 8000): string {
    const escalationId = crypto.randomUUID();
    const timer = setTimeout(() => {
      this.open.delete(escalationId);
      fallbackFn();
    }, timeoutMs);
    this.open.set(escalationId, { escalationId, skillId, timer });
    notifyFn(escalationId);
    return escalationId;
  }

  resolve(escalationId: string): boolean {
    const esc = this.open.get(escalationId);
    if (!esc) return false;
    clearTimeout(esc.timer);
    this.open.delete(escalationId);
    return true;
  }

  get openCount() { return this.open.size; }
}
```

**Wire-up in `core.ts`:**
- `EscalationSupervisor` instantiated once, passed into `mcpDeps`
- `SkillExecutor.escalate()` calls `supervisor.fire()` instead of raw notification
- `xentient_brain_stream` tool handler calls `supervisor.resolve(escalation_id)` when `subtype === 'escalation_complete'`
- `SpaceManager.closeEscalation()` — replace no-op stub with `supervisor.resolve(id)`

---

## Worker Task Breakdown (Revised)

### Worker A — Dashboard (2 hrs, zero Core risk)

**Hour 1: Extend `/api/status` + Node Function pills**

- `ControlServer.ts` `handleGetStatus()` — add to response:
  ```ts
  brain: this.deps.getBrainConnected(),          // now real, not hardcoded
  activePack: this.deps.packLoader.getLoadedPack(),
  activeConfig: spaceManager.getSpace('default')?.activeConfig,
  nodeFunctions: deriveNodeFunctions(packLoader.getLoadedPackManifest()),
  ```
- `overview.js` — add `renderNodeFunctionPill(label, active, alwaysOn)` → `<span class="node-fn ...">`. Show: CORE (always green), CAM, MIC, SPKR, ENV, PIR.
- `main.js` — read `status.nodeFunctions` + `status.activeConfig` in `refreshState()`.
- `dashboard.css` — `.node-fn`, `.node-fn.always-on`, `.node-fn.active`, `.node-fn.inactive`.

**Hour 2: Brain Feed widget**

- `main.js` — SSE `brain_event` handler → `appendBrainFeedEvent(event)`.
- `overview.js` — collapsible Brain Feed card (last 20 events):
  - `reasoning_token` → append to streaming block
  - `tool_call_fired` → amber pill
  - `escalation_received` → blue "Brain activated" pill
  - `escalation_complete` → green "Done" + auto-clear 30s
  - `escalation_timeout` → red "No brain" pill (new SSE type Worker B emits from FallbackResponder)
- `dashboard.css` — `.brain-feed`, `.brain-token`, `.brain-tool-call`.

**Done criteria:**
- [ ] Node function pills render from `/api/status`
- [ ] Brain Feed shows events (can be tested with a manual `broadcastSSE` call)
- [ ] `brain` dot in status reflects real connection state
- [ ] `tsc --noEmit` passes (frontend only, but verify no TS errors in ControlServer additions)

---

### Worker B — Core Infrastructure + Brain SSE Transport (3 hrs)

**Hour 1: EscalationSupervisor + chime + fallback**

1. Create `harness/src/engine/chime.ts` — static PCM buffer (as above).
2. Create `harness/src/engine/EscalationSupervisor.ts` — full implementation above.
3. In `SkillExecutor.ts` `escalate()` (line 358–388):
   - Generate `escalationId` via `crypto.randomUUID()`
   - Replace raw `mcpServer.server.notification()` call with `supervisor.fire(skillId, notifyFn, fallbackFn)`
   - `notifyFn` sends the MCP notification WITH `escalationId` in payload
   - `fallbackFn` publishes LCD error face via MQTT + calls `audioServer.sendAudio(CHIME_PCM)`
4. In `mcp/tools.ts` `xentient_brain_stream` handler — call `supervisor.resolve(args.escalation_id)` when `subtype === 'escalation_complete'`. Also `broadcastSSE({ type: 'brain_event', ...args })` so dashboard gets it.
5. Replace `SpaceManager.closeEscalation()` no-op with `supervisor.resolve(id)`.

**Hour 2: `_voice-capture` CoreSkill + EventBridge wiring**

1. `harness/src/engine/builtins.ts` — add `VOICE_CAPTURE` CoreSkill:
   ```ts
   export const VOICE_CAPTURE: CoreSkill = {
     id: '_voice-capture',
     displayName: 'Voice Capture',
     enabled: true,
     spaceId: '*',
     configFilter: '*',
     trigger: { type: 'event', event: 'voice_end' },
     priority: 10,
     actions: [{ type: 'set_lcd', line1: '(O_O)', line2: 'listening' }],
     escalation: {
       conditions: [{ field: 'always', operator: '>=', value: 0 }],
       event: 'voice_command',
       contextBuilder: 'full-context',
       priority: 'normal',
       cooldownMs: 0,
     },
     source: 'builtin',
     cooldownMs: 3000,   // prevents re-fire while escalation timer runs
     fireCount: 0,
     escalationCount: 0,
   };
   ```
   Add to `ALL_BUILTINS`. Add `'_voice-capture'` to `BUILTIN_SKILL_IDS` in `contracts.ts`.

2. `core.ts` VAD-end handler (line 177–192) — replace the direct MCP `voice_end` notification with:
   ```ts
   eventBridge.handleMqttEvent('voice_end', {
     timestamp: Date.now(),
     duration_ms: combined.length / 32,
     audio: combined.toString('base64'),
   });
   ```
   **Keep** the old direct notification as a commented fallback — do not delete yet.

3. Verify `contextBuilders.ts` `full-context` passes `triggerData` through (audio base64 must survive into the escalation payload).

**Hour 3: SSE MCP transport + getBrainConnected**

1. `harness/src/mcp/server.ts` — add `createMcpSseServer(deps)` function (see "Two McpServer Problem" section above). Exports `{ connectClient, sseBrainTracker }`.

2. `harness/src/comms/ControlServer.ts`:
   - Add to `ControlServerDeps`:
     ```ts
     mcpSse?: { connectClient: (req: IncomingMessage, res: ServerResponse) => void };
     ```
   - Add routes in `MicroRouter`:
     ```ts
     .add('GET', '/mcp', this.handleMcpSse.bind(this))
     .add('POST', '/mcp', this.handleMcpSse.bind(this))
     ```
   - `handleMcpSse(req, res)` → `this.deps.mcpSse?.connectClient(req, res)`.

3. `core.ts` — wire `mcpSse` into `ControlServer` deps. Update `getBrainConnected` to read from `sseBrainTracker`:
   ```ts
   getBrainConnected: () => mcpSseServer.sseBrainTracker.size > 0,
   ```

4. `brain-basic.ts` — add transport switching:
   ```ts
   const transport = process.env.CORE_MCP_URL
     ? new SSEClientTransport(new URL(process.env.CORE_MCP_URL))
     : new StdioClientTransport({ command: 'bun', args: [corePath] });
   ```

5. `harness/package.json` — ensure scripts:
   ```json
   "core": "bun run src/core.ts",
   "brain": "CORE_MCP_URL=http://localhost:3000/mcp bun run src/brain-basic.ts",
   "brain:hermes": "CORE_MCP_URL=http://localhost:3000/mcp bun run src/brain/hermes/index.ts"
   ```

**Done criteria:**
- [ ] `bun run core` starts without spawning brain
- [ ] `CORE_MCP_URL=http://localhost:3000/mcp bun run brain` connects without spawning Core
- [ ] `GET /mcp` returns `200 text/event-stream`
- [ ] `getBrainConnected()` returns `true` only when brain is connected
- [ ] Voice → EventBridge → `_voice-capture` fires (visible in skill log)
- [ ] Escalation timeout triggers chime + LCD error face (testable without brain running)
- [ ] `tsc --noEmit` passes

---

### Worker C — Default Pack + NodeSkill Manifest (2 hrs)

**Hour 1: Real pack manifest**

Replace `harness/packs/default/skills.json` with the full manifest (2 configs, 2 nodeSkills, 2 pack skills) as specified in original Mega Plan Hour 1.

**Critical check first:** In `contracts.ts` `PackSkillManifestSchema` — if `configurations` and `nodeSkills` are required (not `.default([])`), the currently loaded empty manifest `{ pack, skills: [] }` already breaks at runtime. Fix to `.default([])`:
```ts
configurations: z.array(ConfigurationSchema).default([]),
nodeSkills: z.array(NodeSkillSchema).default([]),
```
Verify `PackLoader.loadPack()` calls `.parse()` (Zod) not `.safeParse()` — if it throws on missing fields, the `.default([])` fix is mandatory before anything else.

**Hour 2: Spaces endpoint + NodeProfile push**

1. `ControlServer.ts` `handleListSpaces()` — upgrade to return real data (configs, nodeSkill summary, nodes). See Mega Plan Worker C Hour 3 spec.

2. `SpaceManager.ts` `executeConfigTransition()` — after setting `activeConfig`, call `pushDefaultProfile()` for each node. This sends `NodeProfileSet` MQTT message with sampling params from the NodeSkill.

3. Verify `nodeProfileCompiler.ts` exists. If not, create it (see Mega Plan Worker C Hour 2 spec). Keep it simple — compile NodeSkill sampling fields into the MQTT payload shape firmware expects.

4. `core.ts` `packLoader.on('pack_loaded')` handler — broadcast `nodeFunctions` derived from manifest (see Mega Plan Worker A Hour 3 spec, but this belongs in Worker C since it reads the manifest).

**Done criteria:**
- [ ] `PackLoader.loadPack('default')` succeeds with new manifest, no Zod errors
- [ ] `/api/spaces` returns configs + nodeSkill info
- [ ] `/api/status` returns correct `nodeFunctions` from loaded manifest
- [ ] `pack_loaded` SSE event includes `nodeFunctions` object
- [ ] `tsc --noEmit` passes

---

## HermesAdapter Stub (Worker B, if time allows — otherwise next sprint)

**File: `harness/src/brain/hermes/index.ts`**

Minimum viable stub that proves the SSE transport contract works end-to-end:

```ts
import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const CORE_URL = process.env.CORE_MCP_URL ?? 'http://localhost:3000/mcp';
const client = new McpClient({ name: 'hermes-brain', version: '0.1.0' }, {});
const transport = new SSEClientTransport(new URL(CORE_URL));

await client.connect(transport);
console.error('[hermes] connected to Core at', CORE_URL);

client.fallbackNotificationHandler = async ({ method, params }) => {
  if (method !== 'xentient/skill_escalated') return;
  const { escalationId, event, context } = params as any;
  if (event !== 'voice_command') return;

  // Signal received
  await client.callTool({ name: 'xentient_brain_stream', arguments: {
    escalation_id: escalationId, subtype: 'escalation_received', payload: {}
  }});

  // TODO: STT → Hermes LLM (Ollama) → TTS → xentient_play_audio
  // For now: play chime to prove round-trip works
  await new Promise(r => setTimeout(r, 500));

  await client.callTool({ name: 'xentient_brain_stream', arguments: {
    escalation_id: escalationId, subtype: 'escalation_complete', payload: {}
  }});
};

process.on('SIGINT', () => { client.close(); process.exit(0); });
```

This stub is enough to verify: SSE transport connects, escalation round-trips, timeout is cancelled, Brain Feed shows events. Full Ollama/Hermes LLM integration is the next sprint.

---

## Verification Matrix

| Test | Who | How |
|------|-----|-----|
| TypeScript compiles | ALL | `cd harness && npx tsc --noEmit` |
| Core starts standalone | B, C | `bun run core` — no brain, no crash |
| Brain connects via SSE | B | `CORE_MCP_URL=http://localhost:3000/mcp bun run brain` |
| `getBrainConnected` real | B | `/api/status` → `brain: true/false` matches actual connection |
| Escalation timeout fires | B | Trigger voice with no brain → hear chime within 8s |
| Escalation resolves | B | Trigger voice with brain → timeout does NOT fire |
| Node function pills | A, C | Load pack → check `/api/status` → check Overview |
| Brain Feed renders | A, B | Connect brain → trigger voice → see reasoning_token events |
| Pack loads cleanly | C | `GET /api/packs` → no Zod parse errors in logs |
| Spaces endpoint | C | `GET /api/spaces` → configs + nodeSkill populated |
| Existing tests pass | ALL | `cd harness && bun test` |

---

## Files NOT to Touch (Confirmed Legacy)

| File | Reason |
|------|--------|
| `harness/src/index.ts` | Legacy entry point — leave as-is |
| `harness/src/engine/Pipeline.ts` | Legacy Core-side pipeline — do not extend |
| `harness/src/brain/` (existing empty dir) | Just add files, don't reorganize |

---

## Open Questions for Next Sprint (Deferred Deliberately)

1. **Hermes full LLM loop** — Ollama endpoint, STT provider (Whisper via Ollama or standalone), TTS provider (Kokoro, Piper, or Coqui), streaming token callback into `xentient_brain_stream`.
2. **Multiple brain support** — `McpSseServer` supports multiple simultaneous SSE connections. What happens when two brains both try to resolve the same escalation? Need a "first-wins" or "primary brain" concept.
3. **Escalation-open guard** — currently only `cooldownMs` prevents re-fire. After this sprint, add an explicit "escalation in flight" flag to `SkillExecutor` so a skill with `cooldownMs: 0` can't double-fire.
4. **`play_chime` action type** — currently schema-only, emits an event, produces no audio. Wire it to `CHIME_PCM` + `audioServer.sendAudio()` properly.
5. **WSL networking** — when running Core on Windows and Hermes in WSL2, `CORE_MCP_URL` must use the Windows host IP (from `/etc/resolv.conf` nameserver), not `localhost`. Document this in `README.md`.

# Worker B Plan — Core Infrastructure: EscalationSupervisor + Voice Skill Routing + SSE MCP Transport

**Track:** Core runtime (highest risk — read every TRAP before touching anything)  
**Estimated time:** 3 hours  
**Primary files touched:** `harness/src/engine/EscalationSupervisor.ts` (NEW), `harness/src/engine/chime.ts` (NEW), `harness/src/engine/builtins.ts`, `harness/src/engine/SkillExecutor.ts`, `harness/src/core.ts`, `harness/src/mcp/server.ts`, `harness/src/comms/ControlServer.ts`, `harness/src/brain-basic.ts`, `harness/src/brain-basic/Pipeline.ts`, `harness/src/brain/hermes/index.ts` (NEW), `harness/package.json`

**References — read these before starting:**
- Full architectural intent & code snippets: `@[c:\Users\sarmi\.gemini\antigravity\brain\0ed0b401-85b2-4cec-8dee-2f95f3718027\artifacts\xentient_mega_plan.md.resolved]` — "Worker B" and "Hermes Integration" sections
- Ground-truth codebase audit (F1–F12): `@[tasks/XENTIENT-SPRINT-ANCHOR.md]` — "Worker B" section, "Architecture Contract", "Two McpServer Problem", "EscalationSupervisor Contract"

---

## Philosophy

Worker B is the **spine** of this sprint. Every other worker depends on you:
- Worker A's Brain Feed is empty until you wire `xentient_brain_stream` calls in brain-basic
- Worker C's node functions only reach the dashboard via SSE events you must emit
- The whole escalation architecture (EscalationSupervisor + chime fallback) is yours

The goal: Core becomes **self-sufficient**. If the brain dies mid-response, Core recovers on its own
(chime + LCD error face). The brain is no longer a requirement for Core to stay stable.

**The hardest constraint:** You must not break the existing stdio transport path. brain-basic currently
spawns Core as a child via stdio — that still has to work as a fallback (`CORE_MCP_URL` unset).

---

## TRAPS — Internalize Before Writing Any Code

From `@[tasks/XENTIENT-SPRINT-ANCHOR.md]`:

| # | Trap | What it means for your work |
|---|------|-----------------------------|
| F1 | `SkillExecutor.escalate()` is fire-and-forget | You must add EscalationSupervisor **around** it, not inside it |
| F2 | `SpaceManager.closeEscalation()` is a no-op stub | Replace with `supervisor.resolve(id)` |
| F3 | No escalationId generated anywhere | You generate it in `EscalationSupervisor.fire()` |
| F4 | `getBrainConnected` hardcoded `true` | You replace with `sseBrainTracker.size > 0` |
| F5 | ControlServer is raw `http.Server` + `MicroRouter` | No framework — add route manually following existing pattern |
| F6 | SDK v1.29.0 — one transport per McpServer instance | Use **second McpServer** (`McpSseServer`) — do NOT share with stdio instance |
| F8 | No chime PCM assets exist | Embed static sine-wave buffer in `chime.ts` |
| F9 | brain-basic never calls `xentient_brain_stream` | You wire it in this sprint |
| F10 | `processUtterance()` returns `Promise<void>` | Inject reasoning callback — cannot use return value |
| F11 | `_voice-capture` CoreSkill does not exist | You add it to builtins.ts AND contracts.ts |
| F12 | brain-basic listens for `voice_end` directly | You route through EventBridge → `_voice-capture` → `skill_escalated` |

> **DO NOT touch:** `harness/src/index.ts` (legacy entry), `harness/src/engine/Pipeline.ts` (legacy Core-side pipeline)

---

## Hour 1 — EscalationSupervisor + Chime + Fallback

### 1a. Create `harness/src/engine/chime.ts` (NEW)

No audio assets exist (F8). Embed a static sine-wave buffer — no runtime deps, no file reads.

Full implementation is in the Sprint Anchor ("The Chime PCM Buffer" section) — copy it exactly:
- Function: `generateSineWave(440, 0.3, 16000)` → 0.3s at 440 Hz, 16kHz, 16-bit LE mono
- Export: `export const CHIME_PCM: Buffer`
- Amplitude: `Math.round(v * 16000)` (soft — not full scale)

### 1b. Create `harness/src/engine/EscalationSupervisor.ts` (NEW)

Full TypeScript contract is in Sprint Anchor ("EscalationSupervisor Contract" section). Implement exactly:

```
interface OpenEscalation { escalationId, skillId, timer }
class EscalationSupervisor:
  - fire(skillId, notifyFn, fallbackFn, timeoutMs=8000): string
      → crypto.randomUUID() as escalationId
      → setTimeout(fallbackFn, timeoutMs)
      → notifyFn(escalationId)  [sends MCP notification with id]
      → returns escalationId
  - resolve(escalationId): boolean
      → clearTimeout, delete from map, return true if found
  - get openCount(): number
```

> **NOTE:** Use `crypto.randomUUID()` — it's available in Bun without imports. Do NOT pull in `uuid` package.

### 1c. Wire EscalationSupervisor into `core.ts`

In `core.ts`:
1. Instantiate `EscalationSupervisor` once at module level (before `ControlServer` / `SkillExecutor` init)
2. Pass it into `mcpDeps` so `SkillExecutor` and the `xentient_brain_stream` tool handler can both access it
3. Update `getBrainConnected` **later** in Hour 3 — for now, leave it as-is

### 1d. Update `SkillExecutor.ts` `escalate()` method

Find `escalate()` (around line 358–388 per Mega Plan — verify actual line).

Current behavior: fire-and-forget MCP notification, no ID, no timeout.

Replace with:
```ts
// Instead of: mcpServer.server.notification(...)
// Do:
const id = supervisor.fire(
  skillId,
  (escalationId) => {
    mcpServer.server.notification({
      method: 'xentient/skill_escalated',
      params: { escalationId, skillId, event: escEvent, context: { ...context, escalationId }, priority },
    });
  },
  () => {
    // Fallback: chime + LCD error face
    deps.mqtt.publish('xentient/display', JSON.stringify({ line1: '(X_X)', line2: 'no brain' }));
    deps.audio.sendAudio(CHIME_PCM);
    controlServer.broadcastSSE({ type: 'brain_event', escalation_id: '?', subtype: 'escalation_timeout', payload: {} });
  },
);
```

> **NOTE — deps availability:** Check what `SkillExecutor` has access to. It may not directly hold
> `deps.audio` or `deps.mqtt`. If not, pass the fallback function in from `core.ts` when constructing
> SkillExecutor, rather than having it reach out for deps it doesn't own. Keep coupling minimal.

> **NOTE — `xentient_brain_stream` tool handler in `mcp/tools.ts`:** Find it (line 799 per Mega Plan).
> When `subtype === 'escalation_complete'`, add: `supervisor.resolve(args.escalation_id)`.
> Also ensure it calls `broadcastSSE({ type: 'brain_event', ...args })` — verify it already does this.

### 1e. Replace `SpaceManager.closeEscalation()` no-op

Find the no-op stub in `SpaceManager.ts`. Replace with:
```ts
closeEscalation(escalationId: string): void {
  this.deps.supervisor?.resolve(escalationId);
}
```
Wire `supervisor` into SpaceManager's deps if not already there, OR if it's simpler, just have `core.ts` pass a callback.

---

## Hour 2 — `_voice-capture` CoreSkill + EventBridge Routing

### 2a. Add `VOICE_CAPTURE` to `harness/src/engine/builtins.ts`

Full CoreSkill definition is in Sprint Anchor ("Worker B Hour 2" section) — copy exactly. Key fields:
```ts
id: '_voice-capture',
trigger: { type: 'event', event: 'voice_end' },
actions: [{ type: 'set_lcd', line1: '(O_O)', line2: 'listening' }],
escalation: {
  conditions: [{ field: 'always', operator: '>=', value: 0 }],
  event: 'voice_command',
  contextBuilder: 'full-context',
  priority: 'normal',
  cooldownMs: 0,
},
cooldownMs: 3000,  // prevents re-fire while escalation timer runs
```

Add `VOICE_CAPTURE` to the `ALL_BUILTINS` array export.

### 2b. Add `'_voice-capture'` to `BUILTIN_SKILL_IDS` in `contracts.ts`

> **CRITICAL:** Do NOT modify any other types or enums in contracts.ts. Surgical addition only.

### 2c. Update VAD-end handler in `core.ts`

Find the VAD-end handler (around line 177–192 per Mega Plan — verify actual line).

Current: sends `voice_end` MCP notification directly to brain.

Replace with EventBridge routing:
```ts
eventBridge.handleMqttEvent('voice_end', {
  timestamp: Date.now(),
  duration_ms: combined.length / 32,
  audio: combined.toString('base64'),
});
```

> **CRITICAL DON'T:** Do NOT delete the old direct notification path yet. Comment it out and leave a note.
> Both paths can coexist during the migration. The skill-based path fires first.

> **NOTE — audio in context:** The escalation payload must carry the base64 audio through to brain-basic.
> Verify `contextBuilders.ts` `full-context` builder passes `triggerData` into the escalation context.
> If it doesn't, `brain-basic` won't have the audio to transcribe. Fix the builder if needed.

### 2d. Update `brain-basic.ts` notification handler

Find `fallbackNotificationHandler`. It currently handles `voice_end` directly.

Add/replace with `xentient/skill_escalated` handler:
```ts
case 'xentient/skill_escalated': {
  const { escalationId, event, context } = params as any;
  if (event !== 'voice_command' || !context?.audio) break;
  const audioBuffer = Buffer.from(context.audio, 'base64');
  await client.callTool({ name: 'xentient_brain_stream', arguments: {
    escalation_id: escalationId, subtype: 'escalation_received', payload: { skillId: params.skillId }
  }});
  await pipeline.processUtterance(audioBuffer);
  await client.callTool({ name: 'xentient_brain_stream', arguments: {
    escalation_id: escalationId, subtype: 'escalation_complete', payload: {}
  }});
  break;
}
```

Keep `voice_start` / `motion_detected` handlers as-is — they're still correct.

### 2e. Wire reasoning tokens into `brain-basic/Pipeline.ts`

Per audit finding F10, `processUtterance()` returns `Promise<void>` — cannot use return value for streaming.

Add `onReasoningToken` callback to `BrainPipelineOptions`:
```ts
interface BrainPipelineOptions {
  // ... existing fields ...
  onReasoningToken?: (token: string) => void;
}
```

In `interceptTokens()` (or wherever LLM tokens are processed), call `this.opts.onReasoningToken?.(token)`.

In `brain-basic.ts`, pass the callback when creating the pipeline:
```ts
const pipeline = new BrainPipeline({
  // ... existing opts ...
  onReasoningToken: async (token) => {
    await client.callTool({ name: 'xentient_brain_stream', arguments: {
      escalation_id: state.currentEscalationId ?? 'unknown',
      subtype: 'reasoning_token',
      payload: { token },
    }});
  },
});
```

> **NOTE:** You need to track `currentEscalationId` in brain-basic state so the callback can reference it.
> Set it when receiving `skill_escalated`, clear it after `escalation_complete`.

---

## Hour 3 — SSE MCP Transport + getBrainConnected

### 3a. Create `McpSseServer` in `harness/src/mcp/server.ts`

The Two McpServer Problem is documented in Sprint Anchor. The solution: a **second McpServer instance**
that shares the same tool handler functions (via closure) but has its own transport lifecycle.

Add to `mcp/server.ts`:
```ts
export function createMcpSseServer(deps: McpToolDeps) {
  const server = new McpServer({ name: 'xentient-sse', version: '1.0.0' });
  registerTools(server, deps);  // same registration fn as stdio server — no duplication of logic
  const sseBrainTracker = new Set<SSEServerTransport>();
  return {
    sseBrainTracker,
    connectClient: (req: IncomingMessage, res: ServerResponse) => {
      const transport = new SSEServerTransport('/mcp', res);
      server.connect(transport);
      sseBrainTracker.add(transport);
      req.on('close', () => sseBrainTracker.delete(transport));
    },
  };
}
```

> **NOTE — import path for SSEServerTransport:** `@modelcontextprotocol/sdk/server/sse.js`
> Verify this path against the actual SDK version (v1.29.0 confirmed in Sprint Anchor F6).
> If the import fails, check `node_modules/@modelcontextprotocol/sdk/` for the correct path.

> **NOTE — `registerTools` must be extractable:** Currently tools may be registered inline in
> `startMcpServer()`. Refactor: extract the tool registration into a `registerTools(server, deps)` function
> that both the stdio server and the SSE server can call. This is the correct abstraction — no business
> logic duplication.

### 3b. Add `/mcp` route to `ControlServer.ts`

Add to `ControlServerDeps`:
```ts
mcpSse?: { connectClient: (req: IncomingMessage, res: ServerResponse) => void };
```

In `MicroRouter` setup, add:
```ts
.add('GET', '/mcp', this.handleMcpSse.bind(this))
.add('POST', '/mcp', this.handleMcpSse.bind(this))
```

Add handler method:
```ts
private handleMcpSse(req: IncomingMessage, res: ServerResponse): void {
  if (!this.deps.mcpSse) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('MCP SSE not configured');
    return;
  }
  this.deps.mcpSse.connectClient(req, res);
}
```

> **NOTE — MicroRouter pattern:** Study the existing `.add()` calls in ControlServer to match the exact
> signature. Do NOT use a framework — this is raw Node `http.Server`. The route must follow the
> existing `handleXxx(req, res)` method pattern exactly.

### 3c. Wire McpSseServer into `core.ts`

```ts
const mcpSseServer = createMcpSseServer(mcpDeps);

// Pass to ControlServer deps:
mcpSse: { connectClient: mcpSseServer.connectClient },

// Update getBrainConnected:
getBrainConnected: () => mcpSseServer.sseBrainTracker.size > 0,
```

### 3d. Add transport switching to `brain-basic.ts`

```ts
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = process.env.CORE_MCP_URL
  ? new SSEClientTransport(new URL(process.env.CORE_MCP_URL))
  : new StdioClientTransport({ command: 'bun', args: [corePath] });
```

> **NOTE:** The `corePath` for StdioClientTransport should point to the `core.ts` entry point.
> Verify the current `corePath` variable in brain-basic.ts — use the same value. Do NOT change it.

### 3e. Update `harness/package.json` scripts

Ensure these scripts exist (add/update as needed):
```json
"core": "bun run src/core.ts",
"brain": "CORE_MCP_URL=http://localhost:3000/mcp bun run src/brain-basic.ts",
"brain:hermes": "CORE_MCP_URL=http://localhost:3000/mcp bun run src/brain/hermes/index.ts"
```

> **NOTE — Windows env var syntax:** PowerShell doesn't support `VAR=val cmd` inline syntax.
> Add a cross-platform note or use a `.env` file pattern, or use `cross-env` package.
> Check if the project already uses `cross-env` or `dotenv`.

### 3f. Create `harness/src/brain/hermes/index.ts` (NEW — minimum viable stub)

Full stub code is in Sprint Anchor ("HermesAdapter Stub" section). Implement exactly as specified:
- Connect via `SSEClientTransport` to `CORE_MCP_URL`
- Handle `xentient/skill_escalated` for `voice_command` events
- Call `xentient_brain_stream(escalation_received)` and `xentient_brain_stream(escalation_complete)`
- TODO comment for full Ollama/STT/TTS wiring (next sprint)
- Handle `SIGINT` gracefully

---

## Done Criteria Checklist

### Core Stability
- [ ] `bun run core` starts without spawning brain — no crash, no errors
- [ ] `GET /mcp` returns `200 text/event-stream` (test with `curl -N http://localhost:3000/mcp`)
- [ ] `getBrainConnected()` returns `false` when no brain connected, `true` when brain is connected
- [ ] `cd harness && npx tsc --noEmit` — zero TypeScript errors

### EscalationSupervisor
- [ ] Voice trigger with NO brain running → chime fires within 8 seconds
- [ ] Voice trigger with NO brain running → LCD shows error face
- [ ] `brain_event` SSE with `subtype: 'escalation_timeout'` is broadcast (Dashboard Worker A can test)
- [ ] Voice trigger WITH brain running → timeout does NOT fire (brain resolves it)

### Voice Routing
- [ ] VAD-end → EventBridge `voice_end` → `_voice-capture` skill fires (visible in skill log)
- [ ] `skill_escalated` MCP notification carries `escalationId` and base64 `audio` in context
- [ ] brain-basic receives `skill_escalated`, calls `xentient_brain_stream(escalation_received)`
- [ ] brain-basic calls `xentient_brain_stream(escalation_complete)` after processing

### SSE Transport
- [ ] `CORE_MCP_URL=http://localhost:3000/mcp bun run brain` connects without spawning Core
- [ ] `bun run brain:hermes` connects and handles escalations (stub round-trip)

---

## Integration Points with Other Workers

| Worker | What they need from you | When |
|--------|------------------------|------|
| **Worker A** | `brain_event` SSE events (brain feed data) | Hour 2 — wire `xentient_brain_stream` calls |
| **Worker A** | `getBrainConnected()` returning real value | Hour 3 — `sseBrainTracker` |
| **Worker C** | `pack_loaded` SSE with `nodeFunctions` | Worker C broadcasts this — but you must not break the `broadcastSSE` call in `core.ts` |

---

## Escalation Flow — Full End-to-End (for verification)

```
ESP32 mic → AudioServer WS → core.ts accumulates PCM chunks
  → VAD end detected
  → eventBridge.handleMqttEvent('voice_end', { audio: base64 })
  → SkillExecutor matches '_voice-capture' trigger
  → SkillExecutor calls supervisor.fire(skillId, notifyFn, fallbackFn)
      → generates escalationId = crypto.randomUUID()
      → setTimeout(fallbackFn, 8000)
      → notifyFn(escalationId) → MCP notification xentient/skill_escalated { escalationId, event: 'voice_command', context: { audio } }
  → [brain-basic OR hermes] receives notification
      → calls xentient_brain_stream(escalation_received)   ← Dashboard shows "Brain activated"
      → transcribes audio, runs LLM, streams tokens
      → each token → xentient_brain_stream(reasoning_token) ← Dashboard appends
      → calls xentient_play_audio(pcm)                      ← Audio plays on ESP32
      → calls xentient_brain_stream(escalation_complete)   ← Dashboard shows "Done"
          → supervisor.resolve(escalationId)               ← Timer cleared, no chime

  [if brain does NOT respond within 8s]:
      → fallbackFn fires
      → mqtt.publish error LCD face
      → audioServer.sendAudio(CHIME_PCM)
      → broadcastSSE(brain_event, escalation_timeout)      ← Dashboard shows red pill
```

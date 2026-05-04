# Worker A Plan — Dashboard UI: Sub-Controls + Brain Feed

**Track:** Frontend only (zero Core runtime risk)  
**Estimated time:** 2 hours  
**Primary files touched:** `harness/public/js/overview.js`, `harness/public/js/main.js`, `harness/public/dashboard.css`, `harness/src/comms/ControlServer.ts`

**References (read these first):**
- Full architectural context: `@[c:\Users\sarmi\.gemini\antigravity\brain\0ed0b401-85b2-4cec-8dee-2f95f3718027\artifacts\xentient_mega_plan.md.resolved]` — "Worker A" section
- Ground-truth audit findings: `@[tasks/XENTIENT-SPRINT-ANCHOR.md]` — "Worker A" section
- Old web track reference (for pattern consistency): `tasks/archived/TRACK-A-WEB.md`

---

## Why This Work Matters (Philosophy)

The dashboard is the only live window into a running Xentient Core. Right now it is blind:

- It doesn't know which hardware peripherals are active (mic, cam, PIR, speaker, ENV sensor)
- It doesn't show when the Brain is reasoning or stuck
- The "brain connected" dot is hardcoded `true` in Core, so it's a lie

This worker makes the dashboard **honest and informative** without touching any Core runtime code.
The goal is: an operator can open the dashboard and understand the full system state at a glance —
what pack is loaded, what hardware is enabled, whether the Brain is alive, and what it's thinking.

---

## Preconditions — Verify Before Starting

- [ ] `bun run core` starts cleanly with no TS errors (`cd harness && npx tsc --noEmit`)
- [ ] Dashboard loads at `http://localhost:3000`
- [ ] `GET /api/status` responds (check current response shape with `curl http://localhost:3000/api/status`)
- [ ] SSE stream works: `curl -N http://localhost:3000/api/events` shows keep-alive pings

> **NOTE:** If Worker B hasn't finished the real `getBrainConnected` yet, the `brain:` field in `/api/status`
> will still be hardcoded `true`. That's OK — wire the dashboard field anyway. It will auto-correct
> once Worker B lands the `SseBrainTracker`.

---

## Hour 1 — Extend `/api/status` + Node Function Pills

### Step 1: Audit `handleGetStatus` in ControlServer.ts

**File:** `harness/src/comms/ControlServer.ts`

Find `handleGetStatus` (search for it — it's around line 255 based on the Mega Plan, but verify the actual line).

Current response shape:
```json
{ "mode": "...", "mqtt": true, "camera": false, "sensors": {...} }
```

**Add these fields to the response object:**
```ts
brain: this.deps.getBrainConnected(),
activePack: this.deps.packLoader.getLoadedPack(),        // pack name string or null
activeConfig: this.deps.spaceManager?.getSpace('default')?.activeConfig ?? null,
nodeFunctions: deriveNodeFunctions(this.deps.packLoader.getLoadedPackManifest()),
```

> **NOTE — `deriveNodeFunctions` is a helper you must write inline or as a private method:**
> ```ts
> function deriveNodeFunctions(manifest: PackSkillManifest | null) {
>   if (!manifest) return { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false };
>   const ns = manifest.nodeSkills?.[0]; // first nodeSkill = active node profile
>   return {
>     core: true,       // ALWAYS true — Core is always running if this endpoint responds
>     cam: ns?.requires?.camera === true,
>     mic: ns?.requires?.mic === true,
>     speaker: manifest.skills?.some(s => s.actions?.some(a => a.type === 'play_chime')) ?? false,
>     tempHumid: ns?.requires?.bme === true,
>     pir: ns?.requires?.pir === true,
>   };
> }
> ```

> **CRITICAL DON'T:** Do NOT add new properties to `ControlServerDeps` interface. Everything needed
> (`getBrainConnected`, `packLoader`, `spaceManager`) must already be injected. If something is missing,
> check `core.ts` where `ControlServer` is instantiated — it may be passed via the deps object already.
> Do NOT attempt to refactor the deps interface; that risks breaking Worker B's concurrent changes.

> **NOTE — `spaceManager` may not be in `ControlServerDeps` by name.** Check `ControlServer.ts` top section
> for the `ControlServerDeps` interface type. If `spaceManager` isn't there, look for an alternative:
> - `getSpaces()` method on another dep
> - `this.deps.getSpace` function
> If it's genuinely not available, return `activeConfig: null` and add a TODO comment.

### Step 2: Add Node Function Pills to `overview.js`

**File:** `harness/public/js/overview.js`

Add a helper function near the top of the file:
```js
/**
 * Renders a single node function pill.
 * @param {string} label  - Short label (e.g., "MIC", "CAM")
 * @param {boolean} active - Whether the function is active
 * @param {boolean} alwaysOn - If true, always renders as green (ignores `active`)
 * @returns {string} HTML string for the pill
 */
function renderNodeFunctionPill(label, active, alwaysOn = false) {
  const cls = alwaysOn ? 'node-fn always-on' : (active ? 'node-fn active' : 'node-fn inactive');
  return `<span class="${cls}">${label}</span>`;
}
```

Find the System Status card render function (likely in a `renderOverview()` or `updateOverview()` function).
Add a Node Functions row after the mode badge and connection dots:
```js
function renderNodeFunctionsRow(nodeFunctions) {
  if (!nodeFunctions) return '';
  const pills = [
    renderNodeFunctionPill('CORE', true, true),          // always green
    renderNodeFunctionPill('CAM',  nodeFunctions.cam),
    renderNodeFunctionPill('MIC',  nodeFunctions.mic),
    renderNodeFunctionPill('SPKR', nodeFunctions.speaker),
    renderNodeFunctionPill('ENV',  nodeFunctions.tempHumid),
    renderNodeFunctionPill('PIR',  nodeFunctions.pir),
  ];
  return `<div class="node-fn-row">${pills.join('')}</div>`;
}
```

> **NOTE:** The exact location to insert this row depends on how overview.js builds the HTML.
> Look for where the mode badge is rendered — add the node functions row immediately after it.
> If the card uses innerHTML template literals, add it within that template.

Also update the pack/config status line:
```js
// Find where "mode" or "pack" is shown in the status card and add:
const packLine = status.activePack
  ? `Pack: <strong>${status.activePack}</strong>${status.activeConfig ? ` · Config: <strong>${status.activeConfig}</strong>` : ''}`
  : `No pack loaded`;
```

### Step 3: Update `main.js` to read new fields from status

**File:** `harness/public/js/main.js`

In `refreshState()` (the function that calls `/api/status` and updates the state object), add:
```js
state.nodeFunctions = status.nodeFunctions ?? null;
state.activeConfig  = status.activeConfig ?? null;
state.activePack    = status.activePack ?? null;
state.brainConnected = status.brain ?? false;
```

> **NOTE:** The `state` object pattern — check how it's currently defined/used at the top of `main.js`.
> It may be a plain JS object or a reactive proxy. Follow the existing pattern exactly.
> Do NOT invent a new state management approach.

Also handle the `pack_loaded` SSE event to refresh state without a full page reload:
```js
case 'pack_loaded':
  // Re-fetch status to get updated nodeFunctions
  refreshState();
  break;
case 'pack_unloaded':
  state.nodeFunctions = { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false };
  state.activePack = null;
  state.activeConfig = null;
  updateUI(); // trigger re-render
  break;
```

> **NOTE — if `pack_loaded` SSE already has a handler:** It may only update the pack name text.
> Find it and extend it rather than creating a duplicate `case 'pack_loaded':` block (that would silently
> fall through or error depending on the switch structure).

### Step 4: Add CSS for Node Function Pills

**File:** `harness/public/dashboard.css`

Add at an appropriate location (near other pill/badge styles):
```css
/* ── Node Function Pills ────────────────────────────────────────── */
.node-fn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.node-fn {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid transparent;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.node-fn.always-on {
  background-color: #22c55e20;  /* green tint */
  color: #22c55e;
  border-color: #22c55e40;
}

.node-fn.active {
  background-color: #3b82f620;  /* blue tint */
  color: #3b82f6;
  border-color: #3b82f640;
}

.node-fn.inactive {
  background-color: #ffffff0a;  /* subtle gray */
  color: #666;
  border-color: #ffffff15;
}
```

> **NOTE:** Match the color palette already used in `dashboard.css`. If the dashboard uses a different
> set of color variables (e.g., CSS custom properties like `--color-success`), use those instead of raw hex.
> Check the top of `dashboard.css` for `--` variable declarations.

---

## Hour 2 — Brain Feed Widget

### Context: What already exists

Per the Sprint Anchor audit (F9):
> "brain-basic.ts **never calls `xentient_brain_stream`** — fully unwired end-to-end"

This means: the `xentient_brain_stream` MCP tool EXISTS in `mcp/tools.ts` (Trap 7 in Mega Plan), 
and it DOES call `controlServer.broadcastSSE()`. But brain-basic never calls it, so there is no data yet.

**The dashboard widget must be built regardless** — Worker B will wire the actual data source.
You can test the widget manually by making a `curl` call to simulate a brain_event SSE push, or 
by temporarily adding a `broadcastSSE` call in a test handler.

### Step 5: Add SSE handler for `brain_event` in `main.js`

**File:** `harness/public/js/main.js`

Find the SSE `onmessage` handler (the switch/if-else block that processes incoming events).
Add a handler for the `brain_event` type:
```js
case 'brain_event':
  if (state.activeTab === 'overview') {
    appendBrainFeedEvent(event.data ?? event);
  }
  break;
```

> **NOTE:** The event data structure from `xentient_brain_stream` tool is:
> ```json
> { "type": "brain_event", "escalation_id": "...", "subtype": "reasoning_token|tool_call_fired|escalation_received|escalation_complete", "payload": { ... } }
> ```
> The `subtype` field drives what the Brain Feed shows.

Also add a `state.brainFeedEvents` array to state, capped at 20 items:
```js
state.brainFeedEvents = [];  // initialize in state setup

// In appendBrainFeedEvent:
function appendBrainFeedEvent(event) {
  state.brainFeedEvents.unshift(event);          // newest first
  if (state.brainFeedEvents.length > 20) {
    state.brainFeedEvents.pop();
  }
  renderBrainFeed();
}
```

### Step 6: Add collapsible Brain Feed card in `overview.js`

**File:** `harness/public/js/overview.js`

Add a `renderBrainFeed()` function:
```js
function renderBrainFeed(events) {
  if (!events || events.length === 0) {
    return `<div class="brain-feed-empty">No brain activity yet.</div>`;
  }
  return events.map(ev => renderBrainFeedEvent(ev)).join('');
}

function renderBrainFeedEvent(ev) {
  switch (ev.subtype) {
    case 'reasoning_token':
      // Append to the current streaming block; if none exists, create one
      return `<span class="brain-token">${escapeHtml(ev.payload?.token ?? '')}</span>`;

    case 'tool_call_fired':
      return `<div class="brain-tool-call">⚙ Tool: <code>${escapeHtml(ev.payload?.toolName ?? '?')}</code></div>`;

    case 'escalation_received':
      return `<div class="brain-pill brain-pill--blue">🧠 Brain activated (${escapeHtml(ev.escalation_id ?? '')})</div>`;

    case 'escalation_complete':
      return `<div class="brain-pill brain-pill--green">✓ Done</div>`;

    case 'escalation_timeout':
      // Emitted by FallbackResponder (Worker B) when timeout fires without brain response
      return `<div class="brain-pill brain-pill--red">⚠ No brain response — fallback triggered</div>`;

    default:
      return `<div class="brain-pill">${escapeHtml(ev.subtype ?? 'unknown')}</div>`;
  }
}
```

Add an `escapeHtml` utility if it doesn't already exist in `main.js` or `overview.js`:
```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Add the Brain Feed card HTML structure in the overview render function, **after the System Status card**:
```js
function renderBrainFeedCard(isExpanded, events) {
  return `
  <div class="card brain-feed-card">
    <div class="card-header" id="brain-feed-toggle" onclick="toggleBrainFeed()">
      <span class="card-title">🧠 Brain Feed</span>
      <span class="brain-feed-toggle-icon">${isExpanded ? '▲' : '▼'}</span>
    </div>
    <div class="brain-feed-body" id="brain-feed-body" ${isExpanded ? '' : 'hidden'}>
      <div class="brain-feed" id="brain-feed-content">
        ${renderBrainFeed(events)}
      </div>
    </div>
  </div>`;
}

function toggleBrainFeed() {
  state.brainFeedExpanded = !state.brainFeedExpanded;
  const body = document.getElementById('brain-feed-body');
  const icon = document.querySelector('#brain-feed-toggle .brain-feed-toggle-icon');
  if (body) body.hidden = !state.brainFeedExpanded;
  if (icon) icon.textContent = state.brainFeedExpanded ? '▲' : '▼';
}
```

> **NOTE — reasoning_token streaming:** The `reasoning_token` events arrive rapidly and should be
> **appended** to an existing text block, not rendered as individual list items. Implement a special
> case: when the last event was also a `reasoning_token` from the same `escalation_id`, find the
> `.brain-token` span for that escalation and append to it rather than creating a new element.
> This avoids the feed becoming a wall of individual characters.
>
> Implementation suggestion:
> ```js
> // Track the current "streaming" element by escalationId
> state.currentStreamEscalationId = null;
>
> function appendBrainFeedEvent(ev) {
>   if (ev.subtype === 'reasoning_token') {
>     if (state.currentStreamEscalationId === ev.escalation_id) {
>       // Append to existing span
>       const el = document.querySelector(`.brain-token[data-esc="${ev.escalation_id}"]`);
>       if (el) { el.textContent += ev.payload?.token ?? ''; return; }
>     }
>     state.currentStreamEscalationId = ev.escalation_id;
>   } else {
>     state.currentStreamEscalationId = null;
>   }
>   // Add new event to list and re-render
>   state.brainFeedEvents.unshift(ev);
>   if (state.brainFeedEvents.length > 20) state.brainFeedEvents.pop();
>   renderBrainFeedContent();
> }
> ```

Also add **auto-clear on `escalation_complete`**: After receiving `escalation_complete`, set a 30-second timer
to clear the feed entries for that escalation:
```js
case 'escalation_complete': {
  const escId = ev.escalation_id;
  setTimeout(() => {
    state.brainFeedEvents = state.brainFeedEvents.filter(e => e.escalation_id !== escId);
    renderBrainFeedContent();
  }, 30_000);
  break;
}
```

### Step 7: Add Brain Feed CSS

**File:** `harness/public/dashboard.css`

```css
/* ── Brain Feed ─────────────────────────────────────────────────── */
.brain-feed-card {
  margin-top: 12px;
}

.brain-feed-card .card-header {
  cursor: pointer;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brain-feed-body {
  padding: 8px 0 0 0;
  max-height: 320px;
  overflow-y: auto;
}

.brain-feed {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
}

.brain-feed-empty {
  color: #666;
  font-style: italic;
  padding: 8px 0;
  font-size: 0.82rem;
}

/* Streaming reasoning text */
.brain-token {
  display: block;
  color: #c0caf5;   /* soft blue-white */
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Tool call indicator */
.brain-tool-call {
  color: #e5a445;   /* amber */
  padding: 2px 0;
}

.brain-tool-call code {
  font-size: 0.8rem;
  background: #ffffff0f;
  padding: 1px 4px;
  border-radius: 3px;
}

/* Status pills */
.brain-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  margin: 2px 0;
  background: #ffffff10;
}

.brain-pill--blue  { background: #3b82f620; color: #60a5fa; }
.brain-pill--green { background: #22c55e20; color: #4ade80; }
.brain-pill--red   { background: #ef444420; color: #f87171; }
```

> **NOTE:** If the dashboard has a defined color system (CSS variables), replace raw hex values with
> the equivalent variables. Consistency with the existing design is more important than exact colors.

---

## Done Criteria Checklist

Run through these before declaring Worker A complete.

### Functional
- [ ] `/api/status` response includes `brain`, `activePack`, `activeConfig`, `nodeFunctions` fields
- [ ] Node function pills render in Overview: CORE is always green, others reflect loaded pack manifest
- [ ] When no pack is loaded, all pills except CORE show as inactive (gray)
- [ ] Brain Feed card is visible in Overview, collapsed by default
- [ ] Brain Feed expands/collapses on header click
- [ ] `pack_loaded` SSE event triggers a state refresh (pills update without reload)
- [ ] `brain` dot in status card reflects real value from `/api/status` (not hardcoded)

### Edge Cases
- [ ] Page loads when Core is running but no pack is loaded — no JS errors
- [ ] Brain Feed shows "No brain activity yet" when empty
- [ ] `reasoning_token` events for same escalation append to one block, not create separate entries
- [ ] `escalation_complete` entries auto-clear after 30 seconds
- [ ] `escalation_timeout` events show red pill (even before Worker B lands — just needs to not crash)

### Code Quality
- [ ] `cd harness && npx tsc --noEmit` — no new TypeScript errors from ControlServer.ts changes
- [ ] No `console.log` left in production paths — use `console.error` or pino logger pattern
- [ ] No hard-coded port numbers in JS — use `window.location.origin` for API calls

---

## Integration Points with Other Workers

| Dependency | On Worker | Notes |
|---|---|---|
| `getBrainConnected()` returning real value | **Worker B** | Dashboard wires the field now. Will auto-correct when B lands `SseBrainTracker`. |
| `brain_event` SSE events | **Worker B** | Brain Feed exists now. Data arrives when B finishes wiring `xentient_brain_stream` calls in brain-basic. |
| `nodeFunctions` in `/api/status` | **Worker C** | Manifest must be loaded by Worker C for pills to show correctly. Until then, all non-CORE pills are inactive. |
| `pack_loaded` SSE with `nodeFunctions` | **Worker C** | Core broadcasts this in `pack_loaded` handler. Worker A must handle it. |

---

## Testing Without Other Workers

You can test Brain Feed manually without waiting for Worker B:

```bash
# In a separate terminal, while Core is running:
# Use the xentient_brain_stream MCP tool via curl or a test script
# OR: temporarily add a test route in ControlServer that broadcasts a brain_event

# Quick manual test with a fake SSE broadcast in dev:
# Add to ControlServer for testing only:
# .add('POST', '/api/test/brain-event', (req, res) => {
#   this.broadcastSSE({ type: 'brain_event', escalation_id: 'test-1', subtype: 'reasoning_token', payload: { token: 'Hello ' } });
#   this.sendJSON(res, 200, { ok: true });
# })
```

> Remove any test routes before marking complete.

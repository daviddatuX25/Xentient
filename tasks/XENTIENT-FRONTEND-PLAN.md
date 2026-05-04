# Xentient Dashboard — Frontend Execution Plan
**Ground-truth locked from codebase audit**  
**Stack:** Vanilla ES modules, raw Node http.Server, one CSS file, no build step  
**Philosophy:** Industrial intelligence. A room that thinks — the UI should feel like mission control for a living space, not a SaaS app.

---

## What the Audit Confirmed (Read First)

| Finding | Impact |
|---------|--------|
| `/api/status` already returns `brain`, `activeConfig`, `nodeFunctions`, `camera` | No backend changes needed for Worker A |
| `main.js` already has `case 'brain_event'` handler | Brain Feed just needs a renderer wired to it |
| `overview.js` already has `renderBrainFeedContent`, `appendBrainFeedEvent` stubs | Implement the body, not the skeleton |
| Mode badge (`SLEEP`) is a `<span id="mode-badge">` in `<header>` | Delete this element and its CSS class |
| Quick Actions has 4 hardcoded mode buttons | Remove Sleep/Listen/Active/Record, keep Trigger Pipeline + Reload Pack |
| Mode tab has SVG state machine + Space Info + Skill Profile dropdown | Replace SVG with Pack/Config switcher, keep Space Info and hardware status |
| CSS uses heavy `--var` custom properties | Color/typography overhaul is a single `:root {}` block change |
| No custom fonts loaded yet | Add via `@font-face` or CDN in `index.html` |
| No animations exist | All motion is net-new, no conflicts |
| `dashboard.css` is the only stylesheet | All changes in one file |

---

## Aesthetic Direction

**"Deep Instrument"** — the feeling of a flight deck or submarine sonar station. Not sci-fi fantasy. Real hardware, real data, real consequence. Every element earns its place.

- **Background:** Not flat `#1f2228`. A very subtle radial gradient — near-black at edges, a barely-perceptible deep blue-green at center. Like a monitor in a dark room.
- **Cards:** True glassmorphism but tasteful — `backdrop-filter: blur(12px)`, `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.08)`. Not frosted glass on a beach photo. Frosted glass on void.
- **Typography:** 
  - UI labels/headers: `"Departure Mono"` (free, Google Fonts) — engineered, not playful. Tighter than GeistMono, more purposeful.
  - Data/sensor values: `"JetBrains Mono"` — the coder's mono, renders beautifully at small sizes.
  - Body text: `"DM Sans"` — clean without being generic Inter.
- **Color palette:**
  ```
  --bg-void:        #0d0f12        (page background)
  --bg-card:        rgba(22,26,32,0.7)   (glassmorphic cards)
  --bg-card-hover:  rgba(28,33,40,0.8)
  --border-subtle:  rgba(255,255,255,0.07)
  --border-active:  rgba(255,255,255,0.16)
  --text-primary:   #e8eaed
  --text-secondary: #7a8394
  --text-dim:       #4a5263
  --accent-teal:    #2dd4bf        (CORE, connected states, primary CTA)
  --accent-amber:   #f59e0b        (tool calls, warnings)
  --accent-red:     #ef4444        (errors, offline, escalation timeout)
  --accent-blue:    #60a5fa        (reasoning tokens, info)
  --accent-green:   #4ade80        (escalation complete, online)
  --node-glow-on:   0 0 8px rgba(45,212,191,0.6)   (active hardware LED)
  --node-glow-off:  none
  ```
- **Motion philosophy:** One animation per meaningful event. Nothing loops unless it means something (connection pulse = alive, not decorative).

---

## File-by-File Changes

### `harness/public/index.html`

**Remove:**
```html
<!-- DELETE THIS -->
<span id="mode-badge" class="mode-badge mode-sleep">SLEEP</span>
```

**Header becomes:**
```html
<header>
  <div class="header-left">
    <span class="logo-mark">⬡</span>
    <h1 class="logo">Xentient</h1>
    <span class="system-identity" id="header-pack-config">—</span>
  </div>
  <div class="header-right">
    <div class="conn-dot" id="mqtt-indicator" data-state="offline" title="MQTT">
      <span class="dot-ring"></span>
      <span class="dot-label">MQTT</span>
    </div>
    <div class="conn-dot" id="brain-indicator" data-state="offline" title="Brain">
      <span class="dot-ring"></span>
      <span class="dot-label">BRAIN</span>
    </div>
  </div>
</header>
```

`header-pack-config` is updated by `main.js` when status loads: `"default / voice-ready"` or `"—"` if no pack loaded.

**Add to `<head>`:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400;500&family=Departure+Mono&display=swap" rel="stylesheet">
```

**Nav stays the same** — hash routing works fine, just update the tab label:
```html
<!-- Change "Mode" tab label to "Space" -->
<button data-tab="space">Space</button>
```

---

### `harness/public/dashboard.css`

**Full `:root` replacement:**
```css
:root {
  /* Backgrounds */
  --bg-void: #0d0f12;
  --bg-card: rgba(22, 26, 32, 0.72);
  --bg-card-hover: rgba(28, 33, 40, 0.85);
  --bg-input: rgba(255, 255, 255, 0.05);

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-active: rgba(255, 255, 255, 0.18);

  /* Text */
  --text-primary: #e8eaed;
  --text-secondary: #7a8394;
  --text-dim: #4a5263;

  /* Accents */
  --accent-teal: #2dd4bf;
  --accent-amber: #f59e0b;
  --accent-red: #ef4444;
  --accent-blue: #60a5fa;
  --accent-green: #4ade80;
  --accent-purple: #a78bfa;

  /* Node LED glows */
  --glow-on: 0 0 0 2px rgba(45, 212, 191, 0.2), 0 0 12px rgba(45, 212, 191, 0.5);
  --glow-off: none;
  --glow-error: 0 0 0 2px rgba(239, 68, 68, 0.2), 0 0 10px rgba(239, 68, 68, 0.4);

  /* Typography */
  --font-ui: 'Departure Mono', monospace;
  --font-data: 'JetBrains Mono', monospace;
  --font-body: 'DM Sans', sans-serif;

  /* Spacing */
  --radius-card: 12px;
  --radius-pill: 6px;
  --card-blur: 12px;
}
```

**Page background:**
```css
body {
  background: var(--bg-void);
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(45, 212, 191, 0.04) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 80%, rgba(96, 165, 250, 0.03) 0%, transparent 50%);
  background-attachment: fixed;
  font-family: var(--font-body);
  color: var(--text-primary);
  min-height: 100vh;
}
```

**Card base:**
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card);
  backdrop-filter: blur(var(--card-blur));
  -webkit-backdrop-filter: blur(var(--card-blur));
  padding: 20px 24px;
  transition: border-color 0.2s ease;
}
.card:hover {
  border-color: var(--border-active);
}

/* Reduced motion fallback */
@media (prefers-reduced-motion: reduce) {
  :root { --card-blur: 0px; }
  * { animation: none !important; transition: none !important; }
}
```

**Connection dots — the breathing pulse:**
```css
.conn-dot {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}
.dot-ring {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: background 0.4s ease, box-shadow 0.4s ease;
}
.conn-dot[data-state="online"] .dot-ring {
  background: var(--accent-teal);
  box-shadow: var(--glow-on);
  animation: breathe 2.4s ease-in-out infinite;
}
.conn-dot[data-state="pending"] .dot-ring {
  background: var(--accent-amber);
  animation: blink 1s step-end infinite;
}
.conn-dot[data-state="offline"] .dot-ring {
  background: var(--text-dim);
}
.conn-dot[data-state="online"] .dot-label {
  color: var(--accent-teal);
}

@keyframes breathe {
  0%, 100% { box-shadow: var(--glow-on); opacity: 1; }
  50% { box-shadow: 0 0 0 2px rgba(45,212,191,0.1), 0 0 6px rgba(45,212,191,0.25); opacity: 0.8; }
}
@keyframes blink {
  0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
}
```

**Node Function Pills (hardware LEDs):**
```css
.node-fn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.node-fn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 20px;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.1em;
  border: 1px solid var(--border-subtle);
  transition: all 0.3s ease;
}
.node-fn-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.node-fn.always-on {
  border-color: rgba(45, 212, 191, 0.3);
  color: var(--accent-teal);
}
.node-fn.always-on .node-fn-led {
  background: var(--accent-teal);
  box-shadow: var(--glow-on);
  animation: breathe 3s ease-in-out infinite;
}
.node-fn.active {
  border-color: rgba(74, 222, 128, 0.25);
  color: var(--accent-green);
}
.node-fn.active .node-fn-led {
  background: var(--accent-green);
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
}
.node-fn.inactive {
  color: var(--text-dim);
  border-color: var(--border-subtle);
}
.node-fn.inactive .node-fn-led {
  background: var(--text-dim);
  opacity: 0.4;
}
```

**Brain Feed card:**
```css
.brain-feed-card {
  border-color: rgba(96, 165, 250, 0.12);
}
.brain-feed-card .card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.brain-feed-title {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.brain-feed-body {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-active) transparent;
}
.brain-token-block {
  font-family: var(--font-data);
  font-size: 12px;
  line-height: 1.6;
  color: var(--accent-blue);
  text-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
  white-space: pre-wrap;
  word-break: break-word;
}
.brain-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 4px;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  animation: pill-enter 0.2s ease;
}
@keyframes pill-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.brain-pill.received  { background: rgba(96,165,250,0.12); color: var(--accent-blue); border: 1px solid rgba(96,165,250,0.2); }
.brain-pill.tool-call { background: rgba(245,158,11,0.12); color: var(--accent-amber); border: 1px solid rgba(245,158,11,0.2); font-family: var(--font-data); }
.brain-pill.complete  { background: rgba(74,222,128,0.12); color: var(--accent-green); border: 1px solid rgba(74,222,128,0.2); }
.brain-pill.timeout   { background: rgba(239,68,68,0.12);  color: var(--accent-red);   border: 1px solid rgba(239,68,68,0.2); }

/* Scroll-lock nudge */
.brain-feed-scroll-nudge {
  position: sticky;
  bottom: 0;
  text-align: center;
  padding: 4px;
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--accent-blue);
  background: linear-gradient(transparent, var(--bg-card));
  cursor: pointer;
  display: none;
}
.brain-feed-scroll-nudge.visible { display: block; }
```

**Delete all legacy mode CSS:**
```css
/* DELETE these blocks entirely: */
/* .mode-badge, .mode-sleep, .mode-listen, .mode-active, .mode-record */
/* .quick-action-mode (the 4 mode buttons) */
/* Any --mode-* CSS variables */
/* .mode-diagram, .mode-node, .mode-edge (SVG state machine) */
```

**Header system identity line:**
```css
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo-mark {
  color: var(--accent-teal);
  font-size: 20px;
  line-height: 1;
}
.logo {
  font-family: var(--font-ui);
  font-size: 14px;
  letter-spacing: 0.15em;
  color: var(--text-primary);
  font-weight: 400;
}
.system-identity {
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-dim);
  padding-left: 12px;
  border-left: 1px solid var(--border-subtle);
}
```

---

### `harness/public/js/main.js`

**Add to state object:**
```js
state.activePack = null;
state.activeConfig = null;
state.nodeFunctions = { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false };
state.brainPending = false; // true = Core running, no brain connected yet
```

**In `refreshState()` (after api.getStatus()):**
```js
state.activePack = status.activePack ?? null;
state.activeConfig = status.activeConfig ?? null;
state.nodeFunctions = status.nodeFunctions ?? state.nodeFunctions;

// Update header identity line
const identEl = document.getElementById('header-pack-config');
if (identEl) {
  identEl.textContent = state.activePack
    ? `${state.activePack} / ${state.activeConfig ?? '—'}`
    : '—';
}

// Brain dot: 3 states — online, pending (core up, no brain), offline
const brainState = status.brain ? 'online'
  : (status.mqtt ? 'pending' : 'offline'); // Core running = mqtt up
updateConnIndicator('brain-indicator', brainState);
```

**In SSE switch — add/update:**
```js
case 'pack_loaded':
  state.activePack = event.pack ?? state.activePack;
  state.nodeFunctions = event.nodeFunctions ?? state.nodeFunctions;
  // re-render overview if active
  if (state.activeTab === 'overview') overview.refreshNodeFunctions(state.nodeFunctions);
  break;

case 'pack_unloaded':
  state.activePack = null;
  state.nodeFunctions = { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false };
  if (state.activeTab === 'overview') overview.refreshNodeFunctions(state.nodeFunctions);
  break;

case 'brain_event':
  if (state.activeTab === 'overview') overview.appendBrainFeedEvent(event);
  break;
```

**Remove:** Any `case 'mode_change'` or `case 'mode_status'` handlers that update a visible mode badge. Keep the state value internally if Skills/Telemetry tabs still need it — just don't render it prominently.

---

### `harness/public/js/overview.js`

**System Status Card — replace content:**
```js
function renderSystemStatusCard(state) {
  return `
    <div class="card">
      <div class="card-label">System Status</div>
      <div class="status-primary">
        <div class="status-row">
          <span class="status-key">Pack</span>
          <span class="status-val" id="ov-pack">
            ${state.activePack
              ? `<span class="badge badge-teal">${state.activePack}</span>`
              : `<span class="badge badge-dim">none loaded</span>`}
          </span>
        </div>
        <div class="status-row">
          <span class="status-key">Config</span>
          <span class="status-val" id="ov-config">
            ${state.activeConfig
              ? `<span class="badge badge-blue">${state.activeConfig}</span>`
              : `<span class="status-dim">—</span>`}
          </span>
        </div>
      </div>
      <div class="node-fn-row" id="ov-node-fns">
        ${renderNodeFunctions(state.nodeFunctions)}
      </div>
    </div>
  `;
}
```

**Node function pills renderer:**
```js
const NODE_FN_LABELS = {
  core:     'CORE',
  cam:      'CAM',
  mic:      'MIC',
  speaker:  'SPKR',
  tempHumid:'ENV',
  pir:      'PIR',
};

function renderNodeFunctions(fns) {
  return Object.entries(NODE_FN_LABELS).map(([key, label]) => {
    const cls = key === 'core' ? 'always-on'
              : fns[key] ? 'active' : 'inactive';
    return `
      <span class="node-fn ${cls}">
        <span class="node-fn-led"></span>
        ${label}
      </span>`;
  }).join('');
}

export function refreshNodeFunctions(fns) {
  const el = document.getElementById('ov-node-fns');
  if (el) el.innerHTML = renderNodeFunctions(fns);
}
```

**Quick Actions Card — remove mode buttons, keep utility actions:**
```js
function renderQuickActionsCard() {
  return `
    <div class="card">
      <div class="card-label">Quick Actions</div>
      <div class="action-row">
        <button class="btn-action" onclick="triggerPipeline()">Trigger Pipeline</button>
        <button class="btn-action" onclick="reloadPack()">Reload Pack</button>
      </div>
    </div>
  `;
  // Sleep / Listen / Active / Record buttons: DELETED
}
```

**Brain Feed card — implement the body:**
```js
export function renderBrainFeedCard() {
  return `
    <div class="card brain-feed-card">
      <div class="card-header">
        <span class="brain-feed-title">Brain Feed</span>
        <button class="btn-ghost btn-sm" onclick="toggleBrainFeed()">↕</button>
      </div>
      <div class="brain-feed-body" id="brain-feed-body">
        <span class="text-dim" style="font-size:11px;font-family:var(--font-data)">
          Waiting for brain connection…
        </span>
      </div>
      <div class="brain-feed-scroll-nudge" id="brain-scroll-nudge" onclick="scrollBrainFeedToBottom()">
        ↓ New activity
      </div>
    </div>
  `;
}

let brainScrollLocked = true;
let currentTokenBlock = null;

export function appendBrainFeedEvent(event) {
  const body = document.getElementById('brain-feed-body');
  if (!body) return;

  // Remove "waiting" placeholder on first event
  const placeholder = body.querySelector('.text-dim');
  if (placeholder) placeholder.remove();

  switch (event.subtype) {
    case 'escalation_received':
      currentTokenBlock = null;
      body.insertAdjacentHTML('beforeend',
        `<div class="brain-pill received">⬡ Brain summoned — ${event.payload?.skillId ?? ''}</div>`);
      break;

    case 'reasoning_token':
      if (!currentTokenBlock) {
        currentTokenBlock = document.createElement('div');
        currentTokenBlock.className = 'brain-token-block';
        body.appendChild(currentTokenBlock);
      }
      currentTokenBlock.textContent += event.payload?.token ?? '';
      break;

    case 'tool_call_fired':
      currentTokenBlock = null;
      body.insertAdjacentHTML('beforeend',
        `<div class="brain-pill tool-call">⚙ ${event.payload?.tool ?? 'tool'}</div>`);
      break;

    case 'escalation_complete':
      currentTokenBlock = null;
      body.insertAdjacentHTML('beforeend',
        `<div class="brain-pill complete">✓ Done</div>`);
      setTimeout(() => trimBrainFeed(body), 30000);
      break;

    case 'escalation_timeout':
      currentTokenBlock = null;
      body.insertAdjacentHTML('beforeend',
        `<div class="brain-pill timeout">✕ No brain — fallback fired</div>`);
      break;
  }

  // Trim to last 20 entries
  trimBrainFeed(body);

  // Auto-scroll logic
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 32;
  if (brainScrollLocked || atBottom) {
    body.scrollTop = body.scrollHeight;
  } else {
    document.getElementById('brain-scroll-nudge')?.classList.add('visible');
  }
}

function trimBrainFeed(body) {
  while (body.children.length > 20) body.removeChild(body.firstChild);
}

function scrollBrainFeedToBottom() {
  const body = document.getElementById('brain-feed-body');
  if (body) body.scrollTop = body.scrollHeight;
  document.getElementById('brain-scroll-nudge')?.classList.remove('visible');
  brainScrollLocked = true;
}

// Pause auto-scroll when user scrolls up manually
document.getElementById('brain-feed-body')?.addEventListener('scroll', (e) => {
  const body = e.target;
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 32;
  brainScrollLocked = atBottom;
  document.getElementById('brain-scroll-nudge')?.classList.toggle('visible', !atBottom);
});
```

---

### `harness/public/js/mode.js` → rename conceptually to `space.js`

**What replaces the SVG state machine:**

```js
// space.js — Pack & Configuration management
export function renderSpaceTab(state) {
  return `
    <div class="tab-content">
      <div class="card">
        <div class="card-label">Active Space</div>
        <div class="space-info" id="space-info">
          ${renderSpaceInfo(state)}
        </div>
      </div>

      <div class="card">
        <div class="card-label">Configurations</div>
        <div class="config-list" id="config-list">
          ${renderConfigList(state)}
        </div>
      </div>

      <div class="card">
        <div class="card-label">Hardware Status</div>
        <div class="hardware-list" id="hardware-status">
          ${renderHardwareStatus(state)}
        </div>
      </div>
    </div>
  `;
  // SVG state machine diagram: DELETED
}

function renderConfigList(state) {
  if (!state.availableConfigs?.length) {
    return `<span class="text-dim">No pack loaded</span>`;
  }
  return state.availableConfigs.map(cfg => `
    <div class="config-row ${cfg === state.activeConfig ? 'config-active' : ''}">
      <span class="config-name">${cfg}</span>
      ${cfg === state.activeConfig
        ? `<span class="badge badge-teal">active</span>`
        : `<button class="btn-ghost btn-sm" onclick="activateConfig('${cfg}')">Activate</button>`}
    </div>
  `).join('');
}
```

**Keep from existing mode.js:** Space Info Card data, Hardware Status offline/online rendering (just restyle).  
**Delete from existing mode.js:** `renderModeDiagram()`, SVG generation, any `mode-node`/`mode-edge` code.

---

### `harness/public/js/components.js`

**Update `updateConnIndicator`** to support 3 states:
```js
export function updateConnIndicator(id, state) {
  // state: 'online' | 'pending' | 'offline'
  const el = document.getElementById(id);
  if (el) el.dataset.state = state;
}
```

---

## Things NOT in the Original Aesthetic Plan (Add These)

| Gap | Fix |
|-----|-----|
| `brain` dot was always `true` (hardcoded) | Now uses 3-state: online/pending/offline. Pending = Core up, no brain yet |
| Mode badge removal breaks `mode_status` SSE handler | Keep `state.mode` internally, just remove visible badge. Telemetry timeline can still log mode changes |
| `backdrop-filter` on every live-updating card is a perf risk | Apply blur only to `.card` not `.brain-feed-body`. Add `--card-blur: 0px` fallback via `prefers-reduced-motion` |
| Brain Feed scroll hijack | Scroll-lock boolean + "↓ New activity" nudge implemented above |
| `data-tab="mode"` in nav → needs to become `data-tab="space"` | Update nav button label AND the `switch` in `main.js` that routes to `renderMode()` → `renderSpace()` |
| No `activateConfig()` function exists yet | Stub it: `POST /api/spaces/default/config` — Worker C adds this endpoint |
| `currentTokenBlock` listener timing | The `addEventListener('scroll', ...)` in `appendBrainFeedEvent` fires before the element exists if called before tab renders — move scroll listener setup into the tab render function |

---

## Verification Checklist

| Check | How |
|-------|-----|
| Mode badge completely gone | Inspect header — no `SLEEP` text, no `.mode-badge` element |
| Mode buttons gone from Quick Actions | Overview has only "Trigger Pipeline" + "Reload Pack" |
| SVG state machine gone from Space tab | No `<svg>` in Space tab DOM |
| Node function pills glow correctly | Load default pack → CORE always teal, others match manifest |
| Brain dot shows 3 states | Kill brain process → dot goes amber (pending). Kill core → dot goes grey |
| Brain Feed streams tokens | Trigger voice → see blue token text stream in real time |
| Brain Feed scroll-lock works | Scroll up mid-stream → auto-scroll pauses → nudge appears |
| `escalation_timeout` pill appears | Trigger voice with no brain connected → red "No brain" pill within 8s |
| Header identity updates | Load pack → header shows `default / voice-ready` |
| `prefers-reduced-motion` respected | Enable in OS → no blur, no animations |
| `tsc --noEmit` passes | Run from harness/ — verify no TS errors in ControlServer additions |

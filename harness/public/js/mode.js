/**
 * mode.js — Mode & Space Controls Panel
 *
 * SVG state machine diagram for hardware modes (sleep/listen/active/record),
 * behavioral mode selector (skill profile), space info card,
 * and hardware status indicators (peripheral detection from sensor timestamps).
 *
 * Hard point H6: SpaceMode vs BehavioralMode UX clarity.
 *   - "Hardware Mode" = mode state machine diagram, 4-color badge system
 *   - "Skill Profile" = dropdown selector, neutral gray styling, no color coding
 *   - These are visually and semantically separated with distinct section headers
 */
import { showToast } from './components.js';

// ─── Mode Node Layout ────────────────────────────────────────────────

const MODE_NODES = {
  sleep:  { x: 150, y: 50,  label: 'SLEEP',  color: 'hsl(240,60%,55%)' },
  listen: { x: 150, y: 150, label: 'LISTEN', color: 'hsl(160,60%,45%)' },
  active: { x: 70,  y: 250, label: 'ACTIVE', color: 'hsl(40,90%,50%)' },
  record: { x: 230, y: 250, label: 'RECORD', color: 'hsl(0,70%,55%)' },
};

const NODE_RADIUS = 30;

// Default transitions if /api/config is unavailable
const DEFAULT_TRANSITIONS = {
  sleep: ['listen'],
  listen: ['active', 'sleep', 'record'],
  active: ['listen', 'sleep', 'record'],
  record: ['listen', 'sleep'],
};

// Behavioral modes for Skill Profile selector (v1 hardcoded)
const BEHAVIORAL_MODES = ['default', 'student', 'teacher'];

// Peripheral definitions for hardware status
const PERIPHERALS = [
  { id: 'bme280',  label: 'BME280 (Climate)',    key: 'temperature' },
  { id: 'pir',     label: 'HC-SR501 (Motion)',   key: 'motion' },
  { id: 'mic',     label: 'INMP441 (Microphone)', key: 'audioLevel' },
  { id: 'lcd',     label: 'LCD 16x2',            key: 'lcdConnected' },
  { id: 'camera',  label: 'ESP32-CAM',           key: 'cameraOnline' },
];

// ─── SVG Diagram Rendering ─────────────────────────────────────────

/**
 * Render the mode state machine SVG diagram.
 * @param {HTMLElement} container - Element to render into
 * @param {string} currentMode - Current hardware mode
 * @param {object} transitions - modeTransitions from /api/config
 */
function renderModeDiagram(container, currentMode, transitions) {
  const trans = transitions || DEFAULT_TRANSITIONS;

  // Build SVG defs (arrowhead marker + glow filter)
  let svg = `<svg viewBox="0 0 300 300" class="mode-diagram">`;
  svg += `<defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="var(--text-secondary)" />
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>`;

  // Draw edges (transition arrows)
  for (const [from, targets] of Object.entries(trans)) {
    for (const to of targets) {
      const a = MODE_NODES[from];
      const b = MODE_NODES[to];
      if (!a || !b) continue;

      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const x1 = a.x + NODE_RADIUS * Math.cos(angle);
      const y1 = a.y + NODE_RADIUS * Math.sin(angle);
      const x2 = b.x - NODE_RADIUS * Math.cos(angle);
      const y2 = b.y - NODE_RADIUS * Math.sin(angle);

      const isReachable = from === currentMode;
      const strokeColor = isReachable ? 'var(--text-secondary)' : 'rgba(125,129,135,0.2)';
      const strokeWidth = isReachable ? 2 : 1;

      svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
        stroke="${strokeColor}" stroke-width="${strokeWidth}"
        marker-end="url(#arrowhead)" />`;
    }
  }

  // Draw nodes
  for (const [id, node] of Object.entries(MODE_NODES)) {
    const isCurrent = id === currentMode;
    const isReachable = trans[currentMode]?.includes(id);
    const opacity = isCurrent ? 1 : isReachable ? 0.9 : 0.3;
    const cursor = isReachable && !isCurrent ? 'pointer' : 'default';
    const glowFilter = isCurrent ? 'filter="url(#glow)"' : '';
    const classes = ['mode-node'];
    if (isCurrent) classes.push('current');
    if (isReachable) classes.push('reachable');

    svg += `<circle cx="${node.x}" cy="${node.y}" r="${NODE_RADIUS}"
      fill="${node.color}" opacity="${opacity}"
      style="cursor:${cursor}" ${glowFilter}
      data-mode="${id}" class="${classes.join(' ')}"
      />`;
    svg += `<text x="${node.x}" y="${node.y + 4}" text-anchor="middle"
      fill="var(--text-primary)" font-family="var(--font-mono)" font-size="11"
      style="pointer-events:none">${node.label}</text>`;
  }

  svg += `</svg>`;
  container.innerHTML = svg;

  // Attach click handlers via event delegation
  container.addEventListener('click', handleDiagramClick);
}

// ─── SVG Click Handling ────────────────────────────────────────────

let _modeState = null;
let _modeApi = null;

function handleDiagramClick(e) {
  const node = e.target.closest('.mode-node');
  if (!node) return;
  const targetMode = node.dataset.mode;
  if (!targetMode || !_modeState || !_modeApi) return;
  handleModeClick(targetMode);
}

function handleModeClick(targetMode) {
  if (targetMode === _modeState.mode) return;

  const transitions = _modeState.config?.modeTransitions || DEFAULT_TRANSITIONS;
  const validTransitions = transitions[_modeState.mode] || [];

  if (!validTransitions.includes(targetMode)) {
    showTransitionError(_modeState.mode, targetMode);
    return;
  }

  attemptModeTransition(targetMode);
}

function showTransitionError(from, to) {
  showToast(`Cannot transition from ${from} to ${to} — must go through valid path`, 'error');
  const node = document.querySelector(`[data-mode="${to}"]`);
  if (node) {
    node.classList.add('invalid-flash');
    setTimeout(() => node.classList.remove('invalid-flash'), 500);
  }
}

// ─── Mode Transition with Loading State ────────────────────────────

async function attemptModeTransition(targetMode) {
  const node = document.querySelector(`[data-mode="${targetMode}"]`);
  if (node) node.classList.add('transitioning');

  try {
    await _modeApi.setMode(targetMode);
    // Success: SSE `mode_change` will update state and re-render diagram
  } catch (err) {
    const msg = err.message || `Mode transition failed`;
    showToast(msg, 'error');
    if (node) {
      node.classList.add('invalid-flash');
      setTimeout(() => node.classList.remove('invalid-flash'), 500);
    }
  } finally {
    if (node) node.classList.remove('transitioning');
  }
}

// ─── Behavioral Mode Selector ──────────────────────────────────────

/**
 * Render the Skill Profile dropdown.
 * Visually distinct from Hardware Mode — neutral gray, no color coding.
 * @param {HTMLElement} container - Element to render into
 * @param {string} currentMode - Current behavioral mode
 * @param {object} api - DashboardAPI instance
 */
function renderBehavioralModeSelector(container, currentMode, api) {
  const selected = currentMode || 'default';

  container.innerHTML = `
    <section class="skill-profile-card">
      <h3 class="section-title">Skill Profile</h3>
      <select id="behavioral-mode" class="mode-select">
        ${BEHAVIORAL_MODES.map(m =>
          `<option value="${m}" ${m === selected ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`
        ).join('')}
      </select>
      <p class="hint">Changes which skills are active based on modeFilter</p>
    </section>
  `;

  const selectEl = document.getElementById('behavioral-mode');
  if (selectEl) {
    selectEl.addEventListener('change', async (e) => {
      const mode = e.target.value;
      try {
        await api.setSpaceMode('default', mode);
        showToast(`Skill profile changed to ${mode}`, 'success');
      } catch (err) {
        showToast(`Error switching profile: ${err.message}`, 'error');
        // Revert select
        e.target.value = selected;
      }
    });
  }
}

// ─── Space Info Card ───────────────────────────────────────────────

/**
 * Render the space info card.
 * @param {HTMLElement} container - Element to render into
 * @param {object} spaces - Spaces data from /api/spaces
 * @param {string} mode - Current hardware mode
 * @param {string} activePack - Currently loaded pack name
 */
function renderSpaceInfo(container, spaces, mode, activePack) {
  // v1: single space. Use first from spaces array or defaults.
  const space = (spaces && spaces.length > 0)
    ? spaces[0]
    : { id: 'default', mode: mode || 'sleep', skillCount: 0 };

  container.innerHTML = `
    <div class="space-info-card">
      <h3 class="section-title">Space</h3>
      <dl class="info-list">
        <dt>Space ID</dt><dd class="text-mono">${space.id}</dd>
        <dt>Hardware Mode</dt><dd><span class="mode-badge mode-${space.mode}">${(space.mode || 'sleep').toUpperCase()}</span></dd>
        <dt>Active Pack</dt><dd>${activePack || 'none'}</dd>
        <dt>Skills</dt><dd class="text-mono">${space.skillCount ?? 0}</dd>
      </dl>
    </div>
  `;
}

// ─── Hardware Status ───────────────────────────────────────────────

/**
 * Render hardware status indicators.
 * Infer peripheral online/offline from last sensor timestamp.
 * @param {HTMLElement} container - Element to render into
 * @param {object} state - Global dashboard state
 */
function renderHardwareStatus(container, state) {
  // Infer ESP32 online: if last sensor reading < 30s ago
  const lastSensorTime = state.sensors?.lastUpdate ?? 0;
  const espOnline = (Date.now() - lastSensorTime) < 30000;

  container.innerHTML = `
    <div class="hardware-status-card">
      <h3 class="section-title">Hardware</h3>
      <div class="status-row">
        <span class="status-indicator ${espOnline ? 'online' : 'offline'}"></span>
        <span>ESP32 NodeBase</span>
        <span class="text-mono text-secondary">${espOnline ? 'Online' : 'Offline'}</span>
      </div>
      ${PERIPHERALS.map(p => {
        const online = espOnline; // If ESP is online, assume all peripherals connected
        return `<div class="status-row peripheral">
          <span class="status-indicator ${online ? 'online' : 'offline'}"></span>
          <span>${p.label}</span>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ─── Main Renderer ─────────────────────────────────────────────────

/**
 * Render the Mode & Space Controls panel.
 * @param {HTMLElement} container - #content element
 * @param {object} state - Global dashboard state
 * @param {object} api - DashboardAPI instance
 * @param {object} sse - DashboardSSE instance
 */
export function renderMode(container, state, api, sse) {
  // Store references for click handlers
  _modeState = state;
  _modeApi = api;

  // Render the full panel layout first (creates DOM containers)
  const transitions = state.config?.modeTransitions || DEFAULT_TRANSITIONS;

  container.innerHTML = `
    <div class="mode-panel grid grid-2">
      <!-- Hardware Mode: SVG State Machine -->
      <div class="card mode-diagram-card">
        <div class="card-title">Hardware Mode</div>
        <div id="mode-diagram-container"></div>
        <p class="hint mt-4">Click a reachable node to transition</p>
      </div>

      <!-- Space Info -->
      <div class="card space-card">
        <div id="space-info-container"></div>

        <!-- Skill Profile (visually distinct from Hardware Mode) -->
        <div id="behavioral-mode-container" class="mt-4"></div>

        <!-- Hardware Status -->
        <div id="hardware-status-container" class="mt-4"></div>
      </div>
    </div>
  `;

  // Now render sub-sections into their containers
  renderModeDiagram(
    document.getElementById('mode-diagram-container'),
    state.mode,
    transitions
  );

  renderBehavioralModeSelector(
    document.getElementById('behavioral-mode-container'),
    state.config?.behavioralMode || 'default',
    api
  );

  // Fetch spaces and render space info
  api.getSpaces().then(spaces => {
    renderSpaceInfo(
      document.getElementById('space-info-container'),
      spaces,
      state.mode,
      state.activePack
    );
  }).catch(() => {
    renderSpaceInfo(
      document.getElementById('space-info-container'),
      null,
      state.mode,
      state.activePack
    );
  });

  renderHardwareStatus(
    document.getElementById('hardware-status-container'),
    state
  );
}
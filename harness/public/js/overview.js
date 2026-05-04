/**
 * overview.js — Dashboard Overview Panel
 *
 * Renders the main landing view with system health, sensor gauges,
 * active skills summary, motion indicator, and quick action buttons.
 */
import { renderGauge, handleQuickAction, renderMotionIndicator, showToast, updateConnIndicator } from './components.js';

// ─── Node Function Pills ───────────────────────────────────────────

function renderNodeFunctionPill(label, active, alwaysOn = false) {
  const cls = alwaysOn ? 'node-fn always-on' : (active ? 'node-fn active' : 'node-fn inactive');
  return `<span class="${cls}">${label}</span>`;
}

function renderNodeFunctionsRow(nodeFunctions) {
  if (!nodeFunctions) return '';
  const pills = [
    renderNodeFunctionPill('CORE', true, true),
    renderNodeFunctionPill('CAM', nodeFunctions.cam),
    renderNodeFunctionPill('MIC', nodeFunctions.mic),
    renderNodeFunctionPill('SPKR', nodeFunctions.speaker),
    renderNodeFunctionPill('ENV', nodeFunctions.tempHumid),
    renderNodeFunctionPill('PIR', nodeFunctions.pir),
  ];
  return `<div class="node-fn-row">${pills.join('')}</div>`;
}

// ─── Brain Feed ─────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBrainFeed(events) {
  if (!events || events.length === 0) {
    return '<div class="brain-feed-empty">No brain activity yet.</div>';
  }
  return events.map(ev => renderBrainFeedEvent(ev)).join('');
}

function renderBrainFeedEvent(ev) {
  switch (ev.subtype) {
    case 'reasoning_token':
      return `<span class="brain-token" data-esc="${escapeHtml(ev.escalation_id ?? '')}">${escapeHtml(ev.payload?.token ?? '')}</span>`;
    case 'tool_call_fired':
      return `<div class="brain-tool-call">&#9881; Tool: <code>${escapeHtml(ev.payload?.toolName ?? '?')}</code></div>`;
    case 'escalation_received':
      return `<div class="brain-pill brain-pill--blue">&#129504; Brain activated (${escapeHtml(ev.escalation_id ?? '')})</div>`;
    case 'escalation_complete':
      return `<div class="brain-pill brain-pill--green">&#10003; Done</div>`;
    case 'escalation_timeout':
      return `<div class="brain-pill brain-pill--red">&#9888; No brain response &mdash; fallback triggered</div>`;
    default:
      return `<div class="brain-pill">${escapeHtml(ev.subtype ?? 'unknown')}</div>`;
  }
}

function renderBrainFeedCard(isExpanded, events) {
  return `
  <div class="card brain-feed-card">
    <div class="card-header" id="brain-feed-toggle" onclick="window._toggleBrainFeed()">
      <span class="card-title">&#129504; Brain Feed</span>
      <span class="brain-feed-toggle-icon">${isExpanded ? '&#9650;' : '&#9660;'}</span>
    </div>
    <div class="brain-feed-body" id="brain-feed-body" ${isExpanded ? '' : 'hidden'}>
      <div class="brain-feed" id="brain-feed-content">
        ${renderBrainFeed(events)}
      </div>
    </div>
  </div>`;
}

// ─── Overview Renderer ──────────────────────────────────────────────

export function renderOverview(container, state, api, sse) {
  const enabledCount = state.skills.filter(s => s.enabled !== false).length;
  const disabledCount = state.skills.length - enabledCount;

  const packLine = state.activePack
    ? `Pack: <strong>${escapeHtml(state.activePack)}</strong>${state.activeConfig ? ` &middot; Config: <strong>${escapeHtml(state.activeConfig)}</strong>` : ''}`
    : 'No pack loaded';

  container.innerHTML = `
    <!-- System Status Card -->
    <div class="card">
      <div class="card-title">System Status</div>
      <div class="flex items-center gap-4" style="flex-wrap: wrap;">
        <span class="mode-badge mode-${state.mode}" style="font-size: 16px; padding: 6px 20px;">
          ${(state.mode || 'sleep').toUpperCase()}
        </span>
        <div class="flex gap-2">
          <span class="conn-indicator ${state.mqtt ? 'connected' : ''}" style="pointer-events: none;">MQTT</span>
          <span class="conn-indicator ${state.camera?.online ? 'connected' : ''}" style="pointer-events: none;">CAM</span>
          <span class="conn-indicator ${state.brain ? 'connected' : ''}" style="pointer-events: none;">BRAIN</span>
        </div>
      </div>
      ${renderNodeFunctionsRow(state.nodeFunctions)}
      <div class="mt-4 text-secondary text-sm">
        ${packLine}
      </div>
    </div>

    <!-- Brain Feed Card -->
    ${renderBrainFeedCard(state.brainFeedExpanded ?? false, state.brainFeedEvents ?? [])}

    <!-- Sensor Gauges Card -->
    <div class="card">
      <div class="card-title">Sensors</div>
      <div class="gauge-group">
        ${renderGauge({
          value: state.sensors.temperature,
          min: 0, max: 50, unit: '°C', label: 'Temperature'
        })}
        ${renderGauge({
          value: state.sensors.humidity,
          min: 0, max: 100, unit: '%', label: 'Humidity'
        })}
        ${renderGauge({
          value: state.sensors.pressure,
          min: 900, max: 1100, unit: 'hPa', label: 'Pressure'
        })}
      </div>
      <div class="mt-4">
        ${renderMotionIndicator(state.sensors.lastMotionAt)}
      </div>
    </div>

    <!-- Active Skills Summary Card -->
    <div class="card">
      <div class="card-title">Skills</div>
      <div class="skills-summary">
        <div class="stat">
          <span class="stat-value">${state.skills.length}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat">
          <span class="stat-value">${enabledCount}</span>
          <span class="stat-label">Enabled</span>
        </div>
        <div class="stat">
          <span class="stat-value">${disabledCount}</span>
          <span class="stat-label">Disabled</span>
        </div>
      </div>
    </div>

    <!-- Quick Actions Card -->
    <div class="card">
      <div class="card-title">Quick Actions</div>
      <div class="quick-actions">
        <button class="action-btn mode-btn mode-sleep-btn" data-action="mode-sleep">Sleep</button>
        <button class="action-btn mode-btn mode-listen-btn" data-action="mode-listen">Listen</button>
        <button class="action-btn mode-btn mode-active-btn" data-action="mode-active">Active</button>
        <button class="action-btn mode-btn mode-record-btn" data-action="mode-record">Record</button>
      </div>
      <div class="quick-actions mt-4">
        <button class="action-btn" data-action="trigger">Trigger Pipeline</button>
        <button class="action-btn" data-action="reload-pack">Reload Pack</button>
      </div>
    </div>
  `;

  // Wire up quick action buttons
  wireQuickActions(container, state, api, sse);
}

// ─── Quick Action Wiring ───────────────────────────────────────────

function wireQuickActions(container, state, api, sse) {
  container.querySelectorAll('.action-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;

      switch (action) {
        case 'mode-sleep':
          handleQuickAction(btn, () => api.setMode('sleep'), 'Switching...');
          break;
        case 'mode-listen':
          handleQuickAction(btn, () => api.setMode('listen'), 'Switching...');
          break;
        case 'mode-active':
          handleQuickAction(btn, () => api.setMode('active'), 'Switching...');
          break;
        case 'mode-record':
          handleQuickAction(btn, () => api.setMode('record'), 'Switching...');
          break;
        case 'trigger':
          handleQuickAction(btn, () => api.trigger(), 'Triggering...');
          break;
        case 'reload-pack':
          if (state.activePack) {
            handleQuickAction(btn, () => api.reloadPack(state.activePack), 'Reloading...');
          } else {
            showToast('No active pack to reload', 'error');
          }
          break;
        default:
          break;
      }
    });
  });
}

/** Toggle brain feed card expand/collapse. Called from main.js. */
export function toggleBrainFeed(state) {
  state.brainFeedExpanded = !state.brainFeedExpanded;
  const body = document.getElementById('brain-feed-body');
  const icon = document.querySelector('#brain-feed-toggle .brain-feed-toggle-icon');
  if (body) body.hidden = !state.brainFeedExpanded;
  if (icon) icon.textContent = state.brainFeedExpanded ? '▲' : '▼';
}

/** Append a brain feed event and re-render the feed content. */
export function appendBrainFeedEvent(ev, state) {
  if (ev.subtype === 'reasoning_token') {
    if (state.currentStreamEscalationId === ev.escalation_id) {
      const el = document.querySelector(`.brain-token[data-esc="${CSS.escape(ev.escalation_id ?? '')}"]`);
      if (el) { el.textContent += ev.payload?.token ?? ''; return; }
    }
    state.currentStreamEscalationId = ev.escalation_id;
  } else {
    state.currentStreamEscalationId = null;
  }

  if (ev.subtype === 'escalation_complete') {
    const escId = ev.escalation_id;
    setTimeout(() => {
      state.brainFeedEvents = state.brainFeedEvents.filter(e => e.escalation_id !== escId);
      renderBrainFeedContent();
    }, 30_000);
  }

  state.brainFeedEvents.unshift(ev);
  if (state.brainFeedEvents.length > 20) state.brainFeedEvents.pop();
  renderBrainFeedContent();
}

/** Re-render just the brain feed content without full overview re-render. */
export function renderBrainFeedContent() {
  const el = document.getElementById('brain-feed-content');
  if (el) {
    el.innerHTML = renderBrainFeed(state.brainFeedEvents ?? []);
  }
}

// ─── Global toggle (set by main.js to avoid circular import) ────────

window._toggleBrainFeed = null; // main.js assigns: window._toggleBrainFeed = () => toggleBrainFeed(state);

// ─── Skeleton (re-exported from components for main.js) ──────────

export { renderOverviewSkeleton } from './components.js';
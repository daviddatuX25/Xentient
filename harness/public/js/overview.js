/**
 * overview.js — Dashboard Overview Panel
 *
 * Renders the main landing view with system health, sensor gauges,
 * active skills summary, motion indicator, and quick action buttons.
 */
import { renderGauge, handleQuickAction, renderMotionIndicator, showToast, updateConnIndicator } from './components.js';
import { toggleAudioStream, setVolume } from './audio.js';

let userScrolled = false;

// ─── Node Function Pills ───────────────────────────────────────────

function renderNodeFunctionPill(label, active, alwaysOn = false) {
  const cls = alwaysOn ? 'node-fn always-on' : (active ? 'node-fn active' : 'node-fn inactive');
  return `<div class="${cls}"><div class="node-fn-led"></div>${label}</div>`;
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

// ─── System Identity Row ────────────────────────────────────────────

function renderSystemIdentityRow(state) {
  const packStr = state.activePack ? escapeHtml(state.activePack) : 'N/A';
  const confStr = state.activeConfig ? escapeHtml(state.activeConfig) : 'N/A';
  
  const brainState = state.brain ? 'online' : (state.mqtt ? 'pending' : 'offline');

  return `
    <div class="flex items-center justify-between" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle);">
      <div class="system-identity" style="border: none; padding: 0; font-size: 13px;">
        PACK: <span style="color: var(--text-primary); margin-right: 12px;">${packStr}</span>
        CONF: <span style="color: var(--text-primary);">${confStr}</span>
      </div>
      <div class="flex gap-4">
        <div class="conn-dot" data-state="${state.mqtt ? 'online' : 'offline'}">
          <div class="dot-ring"></div>
          <span class="dot-label">MQTT</span>
        </div>
        <div class="conn-dot" data-state="${brainState}">
          <div class="dot-ring"></div>
          <span class="dot-label">BRAIN</span>
        </div>
      </div>
    </div>
  `;
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
      return `<span class="brain-token-block" data-esc="${escapeHtml(ev.escalation_id ?? '')}">${escapeHtml(ev.payload?.token ?? '')}</span>`;
    case 'tool_call_fired':
      return `<div class="brain-pill tool-call">&#9881; Tool: <code>${escapeHtml(ev.payload?.toolName ?? '?')}</code></div>`;
    case 'escalation_received':
      return `<div class="brain-pill received">&#129504; Brain activated (${escapeHtml(ev.escalation_id ?? '')})</div>`;
    case 'escalation_complete':
      return `<div class="brain-pill complete">&#10003; Done</div>`;
    case 'escalation_timeout':
      return `<div class="brain-pill timeout">&#9888; No brain response &mdash; fallback triggered</div>`;
    default:
      return `<div class="brain-pill">${escapeHtml(ev.subtype ?? 'unknown')}</div>`;
  }
}

function renderBrainFeedCard(isExpanded, events) {
  return `
  <div class="card brain-feed-card">
    <div class="card-header" id="brain-feed-toggle" onclick="window._toggleBrainFeed()">
      <span class="card-title">&#129504; Brain Feed</span>
      <span class="brain-feed-toggle-icon" style="color: var(--text-secondary); font-size: 0.7rem; user-select: none;">${isExpanded ? '&#9650;' : '&#9660;'}</span>
    </div>
    <div class="brain-feed-body" id="brain-feed-body" ${isExpanded ? '' : 'hidden'} onscroll="window._checkBrainFeedScroll()">
      <div class="brain-feed" id="brain-feed-content">
        ${renderBrainFeed(events)}
      </div>
      <div id="brain-feed-nudge" class="brain-feed-scroll-nudge" onclick="window._scrollToBottomBrainFeed()">
        ↓ Scroll to bottom
      </div>
    </div>
  </div>`;
}

// ─── Live Audio Card ────────────────────────────────────────────────

function renderAudioCard(state) {
  const micOn = state?.nodeFunctions?.mic === true;
  const warning = micOn ? '' : `
    <div class="audio-warn" style="color:var(--color-warning); font-size:0.75rem; margin-bottom:12px;">⚠ Mic is off — switch to <strong>voice-ready</strong> config first</div>
  `;
  return `
    <div class="card audio-card">
      <div class="card-header">
        <span class="card-label">Live Audio</span>
        <span class="text-dim" style="font-size:10px;font-family:var(--font-data)">
          ESP32 mic → browser
        </span>
      </div>
      ${warning}
      <div class="audio-controls">
        <button class="btn-action" id="btn-audio-stream" onclick="toggleAudioStream()">
          ▶ Listen to Node
        </button>
        <div class="volume-row">
          <span class="vol-label">VOL</span>
          <input
            type="range"
            id="audio-volume"
            min="0" max="2" step="0.05" value="1"
            class="vol-slider"
            oninput="setAudioVolume(this.value)"
          />
        </div>
      </div>
    </div>
  `;
}

// ─── Overview Renderer ──────────────────────────────────────────────

export function renderOverview(container, state, api, sse) {
  const enabledCount = state.skills.filter(s => s.enabled !== false).length;
  const disabledCount = state.skills.length - enabledCount;

  container.innerHTML = `
    <!-- System Status Card -->
    <div class="card">
      <div class="card-title">System Status</div>
      ${renderSystemIdentityRow(state)}
      ${renderNodeFunctionsRow(state.nodeFunctions)}
    </div>

    <!-- Brain Feed Card -->
    ${renderBrainFeedCard(state.brainFeedExpanded ?? false, state.brainFeedEvents ?? [])}

    <!-- Live Audio Card -->
    ${renderAudioCard(state)}

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
      <div class="quick-actions mt-4">
        <button class="action-btn" data-action="trigger">Trigger Pipeline</button>
        <button class="action-btn" data-action="reload-pack">Reload Pack</button>
      </div>
    </div>
  `;

  // Wire up quick action buttons
  wireQuickActions(container, state, api, sse);
  
  // Ensure auto-scroll is respected after initial render
  if (state.brainFeedExpanded) {
    requestAnimationFrame(() => updateScrollLock());
  }
}

// ─── Quick Action Wiring ───────────────────────────────────────────

function wireQuickActions(container, state, api, sse) {
  container.querySelectorAll('.action-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;

      switch (action) {
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
  if (body) {
    body.hidden = !state.brainFeedExpanded;
    if (state.brainFeedExpanded) {
      updateScrollLock();
    }
  }
  if (icon) icon.innerHTML = state.brainFeedExpanded ? '&#9650;' : '&#9660;';
}

/** Append a brain feed event and re-render the feed content. */
export function appendBrainFeedEvent(ev, state) {
  if (ev.subtype === 'reasoning_token') {
    if (state.currentStreamEscalationId === ev.escalation_id) {
      const el = document.querySelector(`.brain-token-block[data-esc="${CSS.escape(ev.escalation_id ?? '')}"]`);
      if (el) { 
        el.textContent += ev.payload?.token ?? ''; 
        if (state.brainFeedExpanded) updateScrollLock();
        return; 
      }
    }
    state.currentStreamEscalationId = ev.escalation_id;
  } else {
    state.currentStreamEscalationId = null;
  }

  if (ev.subtype === 'escalation_complete') {
    const escId = ev.escalation_id;
    setTimeout(() => {
      state.brainFeedEvents = state.brainFeedEvents.filter(e => e.escalation_id !== escId);
      renderBrainFeedContent(state.brainFeedEvents);
    }, 30_000);
  }

  // Combine reasoning tokens for same escalation ID
  if (ev.subtype === 'reasoning_token') {
    const lastEvent = state.brainFeedEvents[0];
    if (lastEvent && lastEvent.subtype === 'reasoning_token' && lastEvent.escalation_id === ev.escalation_id) {
        lastEvent.payload.token += ev.payload.token;
    } else {
        state.brainFeedEvents.unshift(ev);
    }
  } else {
    state.brainFeedEvents.unshift(ev);
  }

  if (state.brainFeedEvents.length > 50) state.brainFeedEvents.pop(); // Keep slightly more events since we combine them
  renderBrainFeedContent(state.brainFeedEvents);
}

/** Re-render just the brain feed content without full overview re-render. */
export function renderBrainFeedContent(events) {
  const el = document.getElementById('brain-feed-content');
  if (el) {
    // We expect events to be passed in, avoiding global state access
    el.innerHTML = renderBrainFeed(events || []);
    updateScrollLock();
  }
}

function updateScrollLock() {
  const bodyEl = document.getElementById('brain-feed-body');
  const nudgeEl = document.getElementById('brain-feed-nudge');
  if (!bodyEl) return;
  
  if (!userScrolled) {
    bodyEl.scrollTop = bodyEl.scrollHeight;
    if (nudgeEl) nudgeEl.classList.remove('visible');
  } else if (nudgeEl && bodyEl.scrollHeight > bodyEl.clientHeight) {
    nudgeEl.classList.add('visible');
  }
}

// ─── Global toggle (set by main.js to avoid circular import) ────────

window._toggleBrainFeed = null; // main.js assigns: window._toggleBrainFeed = () => toggleBrainFeed(state);
window._checkBrainFeedScroll = () => {
  const bodyEl = document.getElementById('brain-feed-body');
  if (!bodyEl) return;
  const isAtBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 10;
  userScrolled = !isAtBottom;
  const nudgeEl = document.getElementById('brain-feed-nudge');
  if (nudgeEl) {
    if (userScrolled) nudgeEl.classList.add('visible');
    else nudgeEl.classList.remove('visible');
  }
};
window._scrollToBottomBrainFeed = () => {
  const bodyEl = document.getElementById('brain-feed-body');
  if (!bodyEl) return;
  userScrolled = false;
  bodyEl.scrollTop = bodyEl.scrollHeight;
  const nudgeEl = document.getElementById('brain-feed-nudge');
  if (nudgeEl) nudgeEl.classList.remove('visible');
};

// ─── Skeleton (re-exported from components for main.js) ──────────

export { renderOverviewSkeleton } from './components.js';
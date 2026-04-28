/**
 * overview.js — Dashboard Overview Panel
 *
 * Renders the main landing view with system health, sensor gauges,
 * active skills summary, motion indicator, and quick action buttons.
 */
import { renderGauge, handleQuickAction, renderMotionIndicator, showToast, updateConnIndicator } from './components.js';

// ─── Overview Renderer ──────────────────────────────────────────────

export function renderOverview(container, state, api, sse) {
  const enabledCount = state.skills.filter(s => s.enabled !== false).length;
  const disabledCount = state.skills.length - enabledCount;

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
      <div class="mt-4 text-secondary text-sm">
        Active pack: <span class="text-mono">${state.activePack || 'None'}</span>
      </div>
    </div>

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

// ─── Skeleton (re-exported from components for main.js) ──────────

export { renderOverviewSkeleton } from './components.js';
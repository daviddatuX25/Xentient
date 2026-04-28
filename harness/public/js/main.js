/**
 * main.js — Dashboard entry point
 *
 * Initializes state, hash-based tab routing, REST fetch on load,
 * SSE real-time updates, and renders the active panel.
 */
import { DashboardAPI } from './api.js';
import { DashboardSSE } from './sse.js';
import { renderOverview, renderOverviewSkeleton } from './overview.js';
import { renderSkills, flashSkillRow, refreshSkillList, refreshSkillPack } from './skills.js';
import { renderTelemetry, handleSensorUpdate, handleSkillFired, handleSkillEscalated, handleSkillConflict, handleModeChange, reseedTelemetryData } from './telemetry.js';
import { renderMode } from './mode.js';
import { showToast, updateModeBadge, updateConnIndicator, updatePageTitle, setupGlobalKeyboardShortcuts } from './components.js';

// ─── State ─────────────────────────────────────────────────────────
export const state = {
  mode: 'sleep',
  mqtt: false,
  camera: { online: false },
  brain: false,
  sensors: { temperature: null, humidity: null, pressure: null, motion: null, lastMotionAt: null },
  skills: [],
  activePack: null,
  connected: false,
  activeTab: 'overview',
  config: null,
};

// ─── Tab Routing (Expansion 3.6) ──────────────────────────────────
const TABS = ['overview', 'skills', 'telemetry', 'mode'];

function setActiveTab(tab) {
  if (!TABS.includes(tab)) tab = 'overview';
  state.activeTab = tab;
  window.location.hash = tab;
  renderActivePanel();
  document.querySelectorAll('#nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  if (TABS.includes(hash)) setActiveTab(hash);
});

function renderActivePanel() {
  const content = document.getElementById('content');
  switch (state.activeTab) {
    case 'overview':
      renderOverview(content, state, api, sse);
      break;
    case 'skills':
      renderSkills(content, state, api, sse);
      break;
    case 'telemetry':
      renderTelemetry(content, state, api, sse);
      break;
    case 'mode':
      renderMode(content, state, api, sse);
      break;
    default:
      content.innerHTML = '<div class="panel-placeholder">Unknown panel</div>';
  }
}

// ─── SSE Event Handlers ──────────────────────────────────────────

function onSSEEvent(event) {
  switch (event.type) {
    case 'connected':
      state.connected = true;
      hideReconnectBanner();
      break;
    case 'mode_status':
    case 'mode_change': {
      const newMode = event.mode || event.to;
      if (newMode && newMode !== state.mode) {
        state.mode = newMode;
        updateModeBadge(newMode);
        updatePageTitle(newMode);
        if (state.activeTab === 'overview' || state.activeTab === 'mode') renderActivePanel();
      }
      // Update telemetry mode timeline
      if (state.activeTab === 'telemetry') handleModeChange(event);
      break;
    }
    case 'sensor_update':
      if (event.temperature !== undefined) state.sensors.temperature = event.temperature;
      if (event.humidity !== undefined) state.sensors.humidity = event.humidity;
      if (event.pressure !== undefined) state.sensors.pressure = event.pressure;
      state.sensors.lastUpdate = Date.now();
      // Update telemetry sparklines if on telemetry tab
      if (state.activeTab === 'telemetry') handleSensorUpdate(event);
      if (state.activeTab === 'overview' || state.activeTab === 'mode') renderActivePanel();
      break;
    case 'skill_registered':
    case 'skill_removed':
    case 'skill_updated':
      // Re-fetch skills list on lifecycle changes
      api.getSkills().then(skills => {
        state.skills = skills;
        if (state.activeTab === 'overview') renderActivePanel();
        if (state.activeTab === 'skills') refreshSkillList();
      });
      break;
    case 'pack_loaded':
      state.activePack = event.packName;
      if (state.activeTab === 'overview') renderActivePanel();
      if (state.activeTab === 'skills') refreshSkillPack();
      break;
    case 'pack_unloaded':
      state.activePack = null;
      if (state.activeTab === 'overview') renderActivePanel();
      if (state.activeTab === 'skills') refreshSkillPack();
      break;
    case 'skill_fired':
      // Flash the fired skill row on skills tab
      if (state.activeTab === 'skills') flashSkillRow(event.skillId || event.id);
      // Add to telemetry skill fire log
      if (state.activeTab === 'telemetry') handleSkillFired(event);
      // Fall through to re-render overview stats
    case 'skill_escalated':
      if (state.activeTab === 'telemetry') handleSkillEscalated(event);
      // Re-render overview to update skill fire stats
      if (state.activeTab === 'overview') renderActivePanel();
      break;
    case 'skill_conflict':
      if (state.activeTab === 'telemetry') handleSkillConflict(event);
      if (state.activeTab === 'overview') renderActivePanel();
      break;
    default:
      // Unknown event types are ignored gracefully
      break;
  }
}

function onSSEDisconnect() {
  state.connected = false;
  showReconnectBanner();
}

function onSSEReconnect() {
  state.connected = true;
  hideReconnectBanner();
  // Re-fetch full state on reconnect
  refreshState();
  // Refresh skills panel event mappings if on skills tab
  if (state.activeTab === 'skills') refreshSkillPack();
  // Re-seed telemetry data (sparklines, timelines) on reconnect
  if (state.activeTab === 'telemetry') reseedTelemetryData(api);
}

// ─── State Refresh ───────────────────────────────────────────────

async function refreshState() {
  try {
    const [status, sensors, skills, packs] = await Promise.all([
      api.getStatus().catch(() => null),
      api.getSensors().catch(() => null),
      api.getSkills().catch(() => null),
      api.getPacks().catch(() => null),
    ]);
    if (status) {
      state.mode = status.mode || state.mode;
      state.mqtt = status.mqtt ?? state.mqtt;
      state.brain = status.brain ?? state.brain;
      if (status.camera) state.camera = status.camera;
      updateModeBadge(state.mode);
      updatePageTitle(state.mode);
      updateConnIndicator('mqtt-indicator', state.mqtt);
      updateConnIndicator('brain-indicator', state.brain);
    }
    if (sensors) {
      Object.assign(state.sensors, sensors);
    }
    if (skills) {
      state.skills = skills;
    }
    if (packs) {
      state.activePack = packs.loaded;
    }
    renderActivePanel();
  } catch {
    // Silently handle — state remains from last successful fetch
  }
}

// ─── Reconnect Banner ────────────────────────────────────────────

function showReconnectBanner() {
  document.getElementById('reconnect-banner')?.classList.remove('hidden');
}

function hideReconnectBanner() {
  document.getElementById('reconnect-banner')?.classList.add('hidden');
}

// ─── Init ────────────────────────────────────────────────────────

const api = new DashboardAPI();
const sse = new DashboardSSE();

async function init() {
  // Show skeleton placeholders (Expansion 3.7)
  const content = document.getElementById('content');
  content.innerHTML = renderOverviewSkeleton();

  // Set up global keyboard shortcuts (Escape closes drawer)
  setupGlobalKeyboardShortcuts();

  try {
    // Fetch initial state from REST endpoints
    const [status, sensors, skills, packs, config] = await Promise.all([
      api.getStatus().catch((err) => { console.warn('Failed to fetch status:', err.message); return null; }),
      api.getSensors().catch((err) => { console.warn('Failed to fetch sensors:', err.message); return null; }),
      api.getSkills().catch((err) => { console.warn('Failed to fetch skills:', err.message); return null; }),
      api.getPacks().catch((err) => { console.warn('Failed to fetch packs:', err.message); return null; }),
      api.getConfig().catch((err) => { console.warn('Failed to fetch config:', err.message); return null; }),
    ]);

    if (status) {
      state.mode = status.mode || 'sleep';
      state.mqtt = status.mqtt ?? false;
      state.brain = status.brain ?? false;
      if (status.camera) state.camera = status.camera;
    }
    if (sensors) {
      Object.assign(state.sensors, sensors);
    }
    if (skills) {
      state.skills = skills;
    }
    if (packs) {
      state.activePack = packs.loaded;
    }
    if (config) {
      state.config = config;
    }

    // Update header indicators
    updateModeBadge(state.mode);
    updatePageTitle(state.mode);
    updateConnIndicator('mqtt-indicator', state.mqtt);
    updateConnIndicator('brain-indicator', state.brain);

    // Set initial tab from hash or default
    const hash = window.location.hash.slice(1);
    setActiveTab(TABS.includes(hash) ? hash : 'overview');

    // Connect SSE for real-time updates
    sse.connect(onSSEEvent, onSSEDisconnect, onSSEReconnect);
  } catch (err) {
    showToast('Failed to initialize dashboard', 'error');
    console.error('Dashboard init error:', err);
  }
}

// Nav button click handlers
document.querySelectorAll('#nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab) setActiveTab(tab);
  });
});

init();
/**
 * main.js — Dashboard entry point
 *
 * Initializes state, hash-based tab routing, REST fetch on load,
 * SSE real-time updates, and renders the active panel.
 */
import { DashboardAPI } from './api.js';
import { DashboardSSE } from './sse.js';
import { renderOverview, renderOverviewSkeleton, toggleBrainFeed, appendBrainFeedEvent } from './overview.js';
import { renderSkills, flashSkillRow, refreshSkillList, refreshSkillPack } from './skills.js';
import { renderTelemetry, handleSensorUpdate, handleSkillFired, handleSkillEscalated, handleSkillConflict, handleModeChange, reseedTelemetryData } from './telemetry.js';
import { renderSpaceTab } from './space.js';
import { showToast, updateConnIndicator, updatePageTitle, setupGlobalKeyboardShortcuts } from './components.js';
import './audio.js';

// ─── State ─────────────────────────────────────────────────────────
export const state = {
  mode: 'sleep',
  mqtt: false,
  camera: { online: false },
  brain: false,
  sensors: { temperature: null, humidity: null, pressure: null, motion: null, lastMotionAt: null },
  skills: [],
  activePack: null,
  activeConfig: null,
  nodeFunctions: { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false },
  brainPending: false,
  brainFeedEvents: [],
  brainFeedExpanded: false,
  currentStreamEscalationId: null,
  connected: false,
  activeTab: 'overview',
  config: null,
};

// ─── Tab Routing (Expansion 3.6) ──────────────────────────────────
const TABS = ['overview', 'skills', 'telemetry', 'space'];

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
    case 'space':
      renderSpaceTab(content, state, api, sse);
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
        updatePageTitle(newMode);
        if (state.activeTab === 'overview' || state.activeTab === 'space') renderActivePanel();
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
      if (state.activeTab === 'overview' || state.activeTab === 'space') renderActivePanel();
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
      refreshState(); // Re-fetch to get updated nodeFunctions + activeConfig
      if (state.activeTab === 'skills') refreshSkillPack();
      break;
    case 'pack_unloaded':
      state.activePack = null;
      state.activeConfig = null;
      state.nodeFunctions = { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false };
      if (state.activeTab === 'overview' || state.activeTab === 'space') renderActivePanel();
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
    case 'brain_event':
      if (state.activeTab === 'overview') {
        appendBrainFeedEvent(event, state);
      }
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
      state.activeConfig = status.activeConfig ?? state.activeConfig;
      state.nodeFunctions = status.nodeFunctions ?? state.nodeFunctions;
      if (status.camera) state.camera = status.camera;
      
      updatePageTitle(state.mode);
      
      const identEl = document.getElementById('header-pack-config');
      if (identEl) {
        identEl.textContent = state.activePack
          ? `${state.activePack} / ${state.activeConfig ?? '—'}`
          : '—';
      }
      
      const brainState = status.brain ? 'online' : (status.mqtt ? 'pending' : 'offline');
      updateConnIndicator('mqtt-indicator', state.mqtt ? 'online' : 'offline');
      updateConnIndicator('brain-indicator', brainState);
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
      state.activeConfig = status.activeConfig ?? null;
      state.nodeFunctions = status.nodeFunctions ?? null;
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
    updatePageTitle(state.mode);
    
    const identEl = document.getElementById('header-pack-config');
    if (identEl) {
      identEl.textContent = state.activePack
        ? `${state.activePack} / ${state.activeConfig ?? '—'}`
        : '—';
    }
    
    const brainState = state.brain ? 'online' : (state.mqtt ? 'pending' : 'offline');
    updateConnIndicator('mqtt-indicator', state.mqtt ? 'online' : 'offline');
    updateConnIndicator('brain-indicator', brainState);

    // Set initial tab from hash or default
    const hash = window.location.hash.slice(1);
    setActiveTab(TABS.includes(hash) ? hash : 'overview');

    // Connect SSE for real-time updates
    sse.connect(onSSEEvent, onSSEDisconnect, onSSEReconnect);

    // Wire brain feed toggle (overview.js sets onclick via window global)
    window._toggleBrainFeed = () => toggleBrainFeed(state);
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
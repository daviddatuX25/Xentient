/**
 * space.js — Space Controls Panel
 *
 * Replaces the legacy mode.js diagram with a clean interface for
 * Skill Profile (Pack/Config) selection and Space hardware status.
 */
import { showToast } from './components.js';

// Peripheral definitions for hardware status
const PERIPHERALS = [
  { id: 'bme280',  label: 'BME280 (Climate)',    key: 'temperature' },
  { id: 'pir',     label: 'HC-SR501 (Motion)',   key: 'motion' },
  { id: 'mic',     label: 'INMP441 (Microphone)', key: 'audioLevel' },
  { id: 'lcd',     label: 'LCD 16x2',            key: 'lcdConnected' },
  { id: 'camera',  label: 'ESP32-CAM',           key: 'cameraOnline' },
];

// ─── Pack / Config Selector ──────────────────────────────────────

function renderBehavioralModeSelector(container, activePack, api) {
  const selected = activePack || 'default';

  api.getPacks().then(({ available, loaded }) => {
    const packs = available?.length ? available : [selected];
    const currentLoaded = loaded || selected;

    container.innerHTML = `
      <section class="card skill-profile-card">
        <h3 class="card-title">Skill Profile</h3>
        <div style="display: flex; gap: 12px; align-items: center; margin-top: 12px;">
          <select id="behavioral-mode" class="mode-select" style="background: var(--bg-input); border: 1px solid var(--border-subtle); color: var(--text-primary); padding: 6px 12px; border-radius: 4px; outline: none;">
            ${packs.map(p =>
              `<option value="${p}" ${p === currentLoaded ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
            ).join('')}
          </select>
          <p class="hint" style="color: var(--text-secondary); font-size: 12px; margin: 0;">Changes the active skill pack</p>
        </div>
      </section>
    `;

    const selectEl = document.getElementById('behavioral-mode');
    if (selectEl) {
      selectEl.addEventListener('change', async (e) => {
        const packName = e.target.value;
        try {
          await api.loadPack(packName);
          showToast(`Skill profile changed to ${packName}`, 'success');
        } catch (err) {
          showToast(`Error switching profile: ${err.message}`, 'error');
          e.target.value = currentLoaded;
        }
      });
    }
  }).catch(() => {
    container.innerHTML = `
      <section class="card skill-profile-card">
        <h3 class="card-title">Skill Profile</h3>
        <div style="display: flex; gap: 12px; align-items: center; margin-top: 12px;">
          <select id="behavioral-mode" disabled style="background: var(--bg-input); border: 1px solid var(--border-subtle); color: var(--text-secondary); padding: 6px 12px; border-radius: 4px;">
            <option value="default" selected>Default</option>
          </select>
          <p class="hint" style="color: var(--text-secondary); font-size: 12px; margin: 0;">Could not load packs</p>
        </div>
      </section>
    `;
  });
}

// ─── Space Info Card ───────────────────────────────────────────────

function renderSpaceInfo(container, spaces, activePack, activeConfig) {
  const space = (spaces && spaces.length > 0)
    ? spaces[0]
    : { id: 'default', skillCount: 0 };

  container.innerHTML = `
    <div class="card space-info-card">
      <h3 class="card-title">Space</h3>
      <dl class="info-list" style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; font-size: 13px;">
        <dt style="color: var(--text-secondary);">Space ID</dt>
        <dd style="font-family: var(--font-data); color: var(--text-primary);">${space.id}</dd>
        
        <dt style="color: var(--text-secondary);">Active Pack</dt>
        <dd style="color: var(--text-primary);">${activePack || 'none'}</dd>
        
        <dt style="color: var(--text-secondary);">Active Config</dt>
        <dd style="color: var(--text-primary);">${activeConfig || 'none'}</dd>
        
        <dt style="color: var(--text-secondary);">Skills</dt>
        <dd style="font-family: var(--font-data); color: var(--text-primary);">${space.skillCount ?? 0}</dd>
      </dl>
    </div>
  `;
}

// ─── Hardware Status ───────────────────────────────────────────────

function renderHardwareStatus(container, state) {
  const lastSensorTime = state.sensors?.lastUpdate ?? 0;
  const espOnline = (Date.now() - lastSensorTime) < 30000;

  container.innerHTML = `
    <div class="card hardware-status-card">
      <h3 class="card-title">Hardware Status</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="conn-dot" data-state="${espOnline ? 'online' : 'offline'}">
              <div class="dot-ring"></div>
            </div>
            <span>ESP32 NodeBase</span>
          </div>
          <span style="font-family: var(--font-data); font-size: 11px; color: var(--text-secondary);">${espOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        ${PERIPHERALS.map(p => {
          return `
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="conn-dot" data-state="${espOnline ? 'online' : 'offline'}">
                  <div class="dot-ring" style="width: 6px; height: 6px;"></div>
                </div>
                <span style="color: var(--text-dim); font-size: 13px;">${p.label}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Main Renderer ─────────────────────────────────────────────────

export function renderSpaceTab(container, state, api, sse) {
  container.innerHTML = `
    <div class="space-panel grid grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div id="space-info-container"></div>
      <div id="behavioral-mode-container"></div>
      <div id="hardware-status-container" style="grid-column: 1 / -1;"></div>
    </div>
  `;

  renderBehavioralModeSelector(
    document.getElementById('behavioral-mode-container'),
    state.activePack,
    api
  );

  api.getSpaces().then(spaces => {
    renderSpaceInfo(
      document.getElementById('space-info-container'),
      spaces,
      state.activePack,
      state.activeConfig
    );
  }).catch(() => {
    renderSpaceInfo(
      document.getElementById('space-info-container'),
      null,
      state.activePack,
      state.activeConfig
    );
  });

  renderHardwareStatus(
    document.getElementById('hardware-status-container'),
    state
  );
}

/**
 * components.js — Reusable UI components
 *
 * Toast notifications, mode badge updates, connection indicators,
 * gauge rendering, skeleton placeholders, and quick action helpers.
 */

// ─── Mode Badge ────────────────────────────────────────────────────

const MODE_LABELS = {
  sleep: 'SLEEP',
  listen: 'LISTEN',
  active: 'ACTIVE',
  record: 'RECORD',
};

const MODE_CLASSES = {
  sleep: 'mode-sleep',
  listen: 'mode-listen',
  active: 'mode-active',
  record: 'mode-record',
};

export function updatePageTitle(mode) {
  const label = MODE_LABELS[mode] || MODE_LABELS.sleep;
  document.title = `Xentient — ${label.toLowerCase()}`;
}

// ─── Connection Indicators ─────────────────────────────────────────

export function updateConnIndicator(elementId, state) {
  // state: 'online' | 'pending' | 'offline'
  const el = document.getElementById(elementId);
  if (!el) return;
  el.dataset.state = state;
}

export function updateCameraIndicator(online) {
  updateConnIndicator('camera-indicator', online);
}

// ─── Toast Notifications ───────────────────────────────────────────

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  container.appendChild(toast);

  // Remove after animation completes (5s total = 0.3s in + 4.4s display + 0.3s out)
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// ─── Gauge Component ───────────────────────────────────────────────

const CIRCUMFERENCE = 2 * Math.PI * 42; // ≈ 263.9

/**
 * Render an SVG gauge for a sensor value.
 * @param {object} opts
 * @param {number} opts.value - Current value
 * @param {number} opts.min - Minimum range
 * @param {number} opts.max - Maximum range
 * @param {string} opts.unit - Display unit (°C, %, hPa)
 * @param {string} opts.label - Gauge label (Temperature, Humidity, etc.)
 * @returns {string} HTML string
 */
export function renderGauge({ value, min, max, unit, label }) {
  const displayValue = value !== null && value !== undefined ? value.toFixed(1) : '--';
  const ratio = (value !== null && value !== undefined)
    ? Math.max(0, Math.min(1, (value - min) / (max - min)))
    : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return `<div class="gauge" data-value="${value ?? ''}" data-min="${min}" data-max="${max}" data-unit="${unit}">
    <svg viewBox="0 0 100 100">
      <circle class="gauge-bg" cx="50" cy="50" r="42" />
      <circle class="gauge-fill" cx="50" cy="50" r="42" style="stroke-dashoffset: ${offset}" />
    </svg>
    <span class="gauge-value">${displayValue}</span>
    <span class="gauge-label">${unit}</span>
    <span class="gauge-label">${label}</span>
  </div>`;
}

/**
 * Update an existing gauge's SVG and value display.
 * @param {HTMLElement} gaugeEl - The .gauge element
 * @param {number|null} value - New value
 */
export function updateGauge(gaugeEl, value) {
  if (!gaugeEl) return;
  const min = parseFloat(gaugeEl.dataset.min);
  const max = parseFloat(gaugeEl.dataset.max);
  const ratio = (value !== null && value !== undefined)
    ? Math.max(0, Math.min(1, (value - min) / (max - min)))
    : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  const circle = gaugeEl.querySelector('.gauge-fill');
  const valueSpan = gaugeEl.querySelector('.gauge-value');

  if (circle) circle.style.strokeDashoffset = offset;
  if (valueSpan) valueSpan.textContent = (value !== null && value !== undefined) ? value.toFixed(1) : '--';
}

// ─── Skeleton Placeholders ──────────────────────────────────────────

export function renderSkeletonCard(lines = 2) {
  const widths = ['w-40', 'w-60', 'w-80'];
  let skeletonLines = '';
  for (let i = 0; i < lines; i++) {
    skeletonLines += `<div class="skeleton-line ${widths[i % widths.length]}"></div>`;
  }
  return `<div class="card">${skeletonLines}</div>`;
}

export function renderOverviewSkeleton() {
  return `
    ${renderSkeletonCard(2)}
    <div class="card">
      <div class="card-title">Sensors</div>
      <div class="gauge-group">
        <div class="skeleton-circle"></div>
        <div class="skeleton-circle"></div>
        <div class="skeleton-circle"></div>
      </div>
    </div>
    ${renderSkeletonCard(3)}
    ${renderSkeletonCard(2)}
  `;
}

// ─── Quick Action Helper ───────────────────────────────────────────

/**
 * Handle a quick action button click with loading state and SSE confirmation.
 * @param {HTMLButtonElement} btn - The button element
 * @param {Function} apiCall - Async function returning a Promise
 * @param {string} loadingText - Text to show during loading (optional)
 */
export async function handleQuickAction(btn, apiCall, loadingText) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${loadingText || original + '...'}`;

  try {
    await apiCall();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    // SSE will update state, but restore button after 2s max
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = original;
    }, 2000);
  }
}

// ─── Motion Indicator ───────────────────────────────────────────────

export function renderMotionIndicator(lastMotionAt) {
  const isActive = lastMotionAt && (Date.now() - lastMotionAt < 30000);
  const timeStr = lastMotionAt
    ? new Date(lastMotionAt).toLocaleTimeString()
    : 'No motion detected';
  return `<div class="motion-indicator">
    <span class="motion-dot ${isActive ? 'active' : ''}"></span>
    <span>${timeStr}</span>
  </div>`;
}

// ─── Keyboard Navigation ──────────────────────────────────────────

/**
 * Set up keyboard navigation for skill table rows.
 * Tab through rows, Enter opens detail, Space toggles enable/disable, Escape closes drawer.
 */
export function setupSkillKeyboardNav(tableBodyEl) {
  if (!tableBodyEl) return;

  tableBodyEl.addEventListener('keydown', (e) => {
    const row = e.target.closest('tr[tabindex]');
    if (!row) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        row.click();
        break;
      case ' ':
        e.preventDefault();
        // Toggle the skill enable/disable
        const toggle = row.querySelector('.skill-toggle');
        if (toggle) toggle.click();
        break;
      case 'Escape':
        e.preventDefault();
        // Close any open drawer
        const drawerOverlay = document.querySelector('.drawer-overlay');
        if (drawerOverlay) drawerOverlay.click();
        break;
    }
  });
}

/**
 * Set up global keyboard shortcuts.
 * Escape closes any open drawer/overlay.
 */
export function setupGlobalKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close any open drawer
      const drawerOverlay = document.querySelector('.drawer-overlay');
      if (drawerOverlay) {
        drawerOverlay.click();
      }
    }
  });
}

// ─── Lazy Panel Loading ──────────────────────────────────────────

const loadedPanels = new Set();

/**
 * Lazy-load a panel module. Returns the module's render function.
 * Caches loaded modules to avoid re-importing.
 */
export async function loadPanel(panelName) {
  if (loadedPanels.has(panelName)) {
    // Already loaded, just return the module
    return null;
  }

  try {
    const module = await import(`./${panelName}.js`);
    loadedPanels.add(panelName);
    return module;
  } catch (err) {
    showToast(`Failed to load ${panelName} panel`, 'error');
    console.error(`Failed to load panel ${panelName}:`, err);
    return null;
  }
}
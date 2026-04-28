/**
 * telemetry.js — Live Telemetry & Event Feed Panel (08-05)
 *
 * Real-time sensor sparklines, motion timeline, skill fire log,
 * escalation feed, conflict log, and mode timeline.
 * Uses Canvas for sparkline rendering (H4: no charting library).
 * Design tokens from xai-DESIGN.md via CSS custom properties.
 */

// ── Sparkline: Canvas with retina DPI (H4, Expansion 5.2/5.3) ───────

export class Sparkline {
  constructor(canvasId, maxPoints = 200) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.data = [];
    this.maxPoints = maxPoints;
    this._resizeTimer = null;
    if (this.canvas) {
      this.setupDPI();
      this._bindResize();
    }
  }

  setupDPI() {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return; // Not yet laid out
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this.setupDPI();
        this.draw();
      }, 200); // Debounce at 200ms
    });
  }

  seed(values) {
    this.data = values.slice(-this.maxPoints);
    this.draw();
  }

  push(value) {
    if (value === null || value === undefined) return;
    this.data.push(value);
    if (this.data.length > this.maxPoints) this.data.shift();
    this.draw();
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const { ctx, data } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) {
      // Show "No data" label if empty
      if (data.length === 0) {
        ctx.fillStyle = 'rgba(125, 129, 135, 0.5)';
        ctx.font = '12px GeistMono, ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No data', w / 2, h / 2 + 4);
      }
      return;
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const step = w / (this.maxPoints - 1);

    ctx.beginPath();
    // Read --sparkline-color CSS custom property, fallback to emerald
    const sparkColor = getComputedStyle(this.canvas).getPropertyValue('--sparkline-color').trim()
      || 'hsl(160, 60%, 45%)';
    ctx.strokeStyle = sparkColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      let y;
      if (range === 0) {
        y = h / 2; // Flat-line centering (Expansion 5.3)
      } else {
        y = h - ((data[i] - min) / range) * (h - 4) - 2;
      }
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ── Mode Timeline Color Map ──────────────────────────────────────────

const MODE_COLORS = {
  sleep: 'hsl(240, 60%, 55%)',
  listen: 'hsl(160, 60%, 45%)',
  active: 'hsl(40, 90%, 50%)',
  record: 'hsl(0, 70%, 55%)',
};

// ── Sparkline Color Map ──────────────────────────────────────────────

const SPARKLINE_COLORS = {
  temperature: 'hsl(40, 90%, 50%)',   // amber
  humidity: 'hsl(160, 60%, 45%)',     // emerald
  pressure: 'hsl(240, 60%, 55%)',    // indigo
};

// ── Escalation Level Colors ──────────────────────────────────────────

const ESCALATION_COLORS = {
  critical: 'hsl(0, 70%, 55%)',       // red
  high: 'hsl(40, 90%, 50%)',          // amber
  normal: 'hsl(160, 60%, 45%)',       // emerald (accent-blue is for interactive, not status)
};

// ── Batched DOM Updates (Expansion 11) ──────────────────────────────

let pendingUpdates = [];
let updateScheduled = false;

function scheduleUpdate(fn) {
  pendingUpdates.push(fn);
  if (!updateScheduled) {
    updateScheduled = true;
    requestAnimationFrame(() => {
      const fragment = document.createDocumentFragment();
      pendingUpdates.forEach(u => u(fragment));
      pendingUpdates = [];
      updateScheduled = false;
      const logContainer = document.getElementById('skill-log-list');
      if (logContainer) logContainer.prepend(fragment);
    });
  }
}

// ── Time Formatting ─────────────────────────────────────────────────

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// ── Motion Timeline Rendering ───────────────────────────────────────

function renderMotionTimeline(events) {
  if (!events || events.length === 0) {
    return '<div class="motion-timeline"><div class="timeline-bar"></div><span class="timeline-label">30 min</span><span class="timeline-empty">No motion events</span></div>';
  }

  const now = Date.now();
  const windowMs = 30 * 60 * 1000;
  const start = now - windowMs;

  let dots = '';
  for (const event of events) {
    if (!event.active) continue; // Only show motion-detected dots
    const pct = ((event.timestamp - start) / windowMs) * 100;
    if (pct < 0 || pct > 100) continue;
    dots += `<div class="motion-dot" style="left: ${pct}%" title="${formatTime(event.timestamp)}"></div>`;
  }

  return `<div class="motion-timeline">
    <div class="timeline-bar">${dots}</div>
    <span class="timeline-label">30 min</span>
  </div>`;
}

// ── Mode Timeline Rendering ──────────────────────────────────────────

function renderModeTimeline(intervals) {
  if (!intervals || intervals.length === 0) {
    return '<div class="mode-timeline"><div class="mode-timeline-bar"></div><span class="timeline-empty">No mode data</span></div>';
  }

  const now = Date.now();
  const windowMs = 30 * 60 * 1000;
  const start = now - windowMs;

  let blocks = '';
  for (const interval of intervals) {
    const left = Math.max(0, ((interval.startTime - start) / windowMs) * 100);
    const right = Math.min(100, (((interval.endTime ?? now) - start) / windowMs) * 100);
    const width = right - left;
    if (width <= 0) continue;
    const mode = interval.mode || 'sleep';
    blocks += `<div class="mode-block mode-${mode}" style="left:${left}%;width:${width}%" title="${mode} ${formatTime(interval.startTime)}${interval.endTime ? ' - ' + formatTime(interval.endTime) : ''}"></div>`;
  }

  // Mode legend
  const legend = Object.entries(MODE_COLORS).map(([mode, color]) =>
    `<span class="mode-legend-item"><span class="mode-legend-dot" style="background:${color}"></span>${mode}</span>`
  ).join('');

  return `<div class="mode-timeline">
    <div class="mode-timeline-bar">${blocks}</div>
    <div class="mode-legend">${legend}</div>
  </div>`;
}

// ── Skill Fire Log Rendering ─────────────────────────────────────────

function renderSkillLogEntry(entry) {
  const skillId = entry.skillId || entry.id || 'unknown';
  const ts = entry.timestamp || entry.firedAt || Date.now();
  const trigger = entry.triggerType || entry.trigger?.type || '';
  const priority = entry.priority !== undefined ? entry.priority : '';

  return `<div class="skill-log-entry" data-skill-id="${skillId}">
    <span class="skill-log-time">${formatTime(ts)}</span>
    <span class="skill-log-id">${skillId}</span>
    ${trigger ? `<span class="skill-log-trigger">${trigger}</span>` : ''}
    ${priority !== '' ? `<span class="skill-log-priority">P${priority}</span>` : ''}
  </div>`;
}

function renderSkillLog(entries) {
  if (!entries || entries.length === 0) {
    return '<div class="skill-log-empty">No skill events recorded</div>';
  }
  // Reverse chronological
  const sorted = [...entries].reverse();
  return sorted.map(renderSkillLogEntry).join('');
}

// ── Escalation Feed Rendering ────────────────────────────────────────

function renderEscalationCard(event) {
  const level = (event.level || event.escalation?.level || 'normal').toLowerCase();
  const skillId = event.skillId || event.id || 'unknown';
  const ts = event.timestamp || Date.now();
  const color = ESCALATION_COLORS[level] || ESCALATION_COLORS.normal;

  // Build context JSON for collapsible details (Expansion 5.6)
  const context = event.context || event.escalation?.context;
  let contextHtml = '';
  if (context) {
    // Skip camera frame (v1: no base64 JPEG in dashboard)
    const { cameraFrame, ...rest } = context;
    const jsonStr = JSON.stringify(rest, null, 2);
    contextHtml = `<details class="escalation-context">
      <summary>Context</summary>
      <pre class="context-json">${escapeHtml(jsonStr)}</pre>
    </details>`;
  }

  return `<div class="escalation-card">
    <div class="escalation-header">
      <span class="escalation-level" style="background:${color}">${level.toUpperCase()}</span>
      <span class="skill-id">${skillId}</span>
      <span class="timestamp">${formatTime(ts)}</span>
    </div>
    ${contextHtml}
  </div>`;
}

// ── Conflict Log Rendering ───────────────────────────────────────────

function renderConflictCard(event) {
  const skills = event.skills || event.conflictingSkills || [];
  const resolution = event.resolution || event.winner || 'unknown';
  const ts = event.timestamp || Date.now();
  const winner = typeof resolution === 'object' ? resolution.winner || resolution.id : resolution;

  return `<div class="conflict-card">
    <div class="conflict-header">
      <span class="conflict-icon">CONFLICT</span>
      <span class="timestamp">${formatTime(ts)}</span>
    </div>
    <div class="conflict-skills">
      ${skills.map(s => `<span class="conflict-skill">${typeof s === 'string' ? s : s.id || s.skillId}</span>`).join(' <span class="conflict-vs">vs</span> ')}
    </div>
    <div class="conflict-resolution">
      Winner: <span class="conflict-winner">${winner}</span>
    </div>
  </div>`;
}

// ── HTML Escaping ────────────────────────────────────────────────────

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ── TelemetryPanel State ─────────────────────────────────────────────

const panelState = {
  sparklines: { temp: null, hum: null, press: null },
  motionEvents: [],
  modeIntervals: [],
  skillLogEntries: [],
  escalationEvents: [],
  conflictEvents: [],
  initialized: false,
};

// ── Main Panel Renderer ──────────────────────────────────────────────

export function renderTelemetry(container, state, api, sse) {
  container.innerHTML = `
    <!-- Sensor Sparklines -->
    <div class="card">
      <div class="card-title">Sensor History</div>
      <div class="sparkline-group">
        <div class="sparkline-row">
          <span class="sparkline-label">Temp</span>
          <canvas id="spark-temp" class="sparkline-canvas" style="--sparkline-color: ${SPARKLINE_COLORS.temperature}"></canvas>
          <span id="spark-temp-value" class="sparkline-value">${state.sensors.temperature !== null ? state.sensors.temperature.toFixed(1) : '--'}</span>
        </div>
        <div class="sparkline-row">
          <span class="sparkline-label">Humidity</span>
          <canvas id="spark-hum" class="sparkline-canvas" style="--sparkline-color: ${SPARKLINE_COLORS.humidity}"></canvas>
          <span id="spark-hum-value" class="sparkline-value">${state.sensors.humidity !== null ? state.sensors.humidity.toFixed(1) : '--'}</span>
        </div>
        <div class="sparkline-row">
          <span class="sparkline-label">Pressure</span>
          <canvas id="spark-press" class="sparkline-canvas" style="--sparkline-color: ${SPARKLINE_COLORS.pressure}"></canvas>
          <span id="spark-press-value" class="sparkline-value">${state.sensors.pressure !== null ? state.sensors.pressure.toFixed(1) : '--'}</span>
        </div>
      </div>
    </div>

    <!-- Motion Timeline -->
    <div class="card">
      <div class="card-title">Motion Timeline</div>
      <div id="motion-timeline-container">
        ${renderMotionTimeline(panelState.motionEvents)}
      </div>
    </div>

    <!-- Mode Timeline -->
    <div class="card">
      <div class="card-title">Mode Timeline</div>
      <div id="mode-timeline-container">
        ${renderModeTimeline(panelState.modeIntervals)}
      </div>
    </div>

    <!-- Skill Fire Log -->
    <div class="card">
      <div class="card-title">Skill Fire Log</div>
      <div id="skill-log-list" class="skill-log-container">
        ${renderSkillLog(panelState.skillLogEntries)}
      </div>
    </div>

    <!-- Escalation Feed -->
    <div class="card">
      <div class="card-title">Escalations</div>
      <div id="escalation-feed" class="escalation-container">
        ${panelState.escalationEvents.length > 0
          ? panelState.escalationEvents.map(renderEscalationCard).join('')
          : '<div class="escalation-empty">No escalation events</div>'}
      </div>
    </div>

    <!-- Conflict Log -->
    <div class="card">
      <div class="card-title">Conflicts</div>
      <div id="conflict-feed" class="conflict-container">
        ${panelState.conflictEvents.length > 0
          ? panelState.conflictEvents.map(renderConflictCard).join('')
          : '<div class="conflict-empty">No conflict events</div>'}
      </div>
    </div>
  `;

  // Initialize sparkline instances after DOM is rendered
  initSparklines();

  // Seed data on first load or re-render
  if (!panelState.initialized) {
    seedTelemetryData(api);
    panelState.initialized = true;
  } else {
    // Re-apply existing data to sparkline canvases after re-render
    if (panelState.sparklines.temp) {
      panelState.sparklines.temp.canvas = document.getElementById('spark-temp');
      panelState.sparklines.temp.ctx = panelState.sparklines.temp.canvas?.getContext('2d');
      panelState.sparklines.temp.setupDPI();
      panelState.sparklines.temp.draw();
    }
    // Same for hum and press
    restoreSparkline('hum');
    restoreSparkline('press');
  }
}

function restoreSparkline(key) {
  const sl = panelState.sparklines[key];
  if (!sl) return;
  const canvasId = key === 'hum' ? 'spark-hum' : 'spark-press';
  sl.canvas = document.getElementById(canvasId);
  sl.ctx = sl.canvas?.getContext('2d');
  if (sl.canvas) {
    sl.setupDPI();
    sl.draw();
  }
}

// ── Sparkline Initialization ─────────────────────────────────────────

function initSparklines() {
  panelState.sparklines.temp = new Sparkline('spark-temp');
  panelState.sparklines.hum = new Sparkline('spark-hum');
  panelState.sparklines.press = new Sparkline('spark-press');
}

// ── Data Seeding (H7: Historical data on first load) ────────────────

export async function seedTelemetryData(api) {
  try {
    const [sensorHistory, motionHistory, modeHistory, skillLog] = await Promise.all([
      api.getSensorHistory(5 * 60 * 1000).catch(() => []), // 5 minutes
      api.getMotionHistory(30).catch(() => []),
      api.getModeHistory(30).catch(() => []),
      api.getSkillLog({ limit: 100 }).catch(() => []),
    ]);

    // Seed sparklines with non-null values
    if (sensorHistory.length > 0) {
      const tempData = sensorHistory.map(r => r.temperature).filter(v => v !== null && v !== undefined);
      const humData = sensorHistory.map(r => r.humidity).filter(v => v !== null && v !== undefined);
      const pressData = sensorHistory.map(r => r.pressure).filter(v => v !== null && v !== undefined);

      panelState.sparklines.temp?.seed(tempData);
      panelState.sparklines.hum?.seed(humData);
      panelState.sparklines.press?.seed(pressData);
    }

    // Store histories for re-render
    panelState.motionEvents = motionHistory;
    panelState.modeIntervals = modeHistory;
    panelState.skillLogEntries = Array.isArray(skillLog) ? skillLog : [];

    // Update motion/mode timelines if the panel is visible
    const motionContainer = document.getElementById('motion-timeline-container');
    if (motionContainer) {
      motionContainer.innerHTML = renderMotionTimeline(motionHistory);
    }
    const modeContainer = document.getElementById('mode-timeline-container');
    if (modeContainer) {
      modeContainer.innerHTML = renderModeTimeline(modeHistory);
    }
    const logContainer = document.getElementById('skill-log-list');
    if (logContainer) {
      logContainer.innerHTML = renderSkillLog(panelState.skillLogEntries);
    }
  } catch (err) {
    // Silent — partial data is acceptable
  }
}

// ── SSE-driven Live Updates ──────────────────────────────────────────

export function handleSensorUpdate(event) {
  // Push values to sparklines
  if (event.temperature !== undefined && event.temperature !== null) {
    panelState.sparklines.temp?.push(event.temperature);
    const el = document.getElementById('spark-temp-value');
    if (el) el.textContent = event.temperature.toFixed(1);
  }
  if (event.humidity !== undefined && event.humidity !== null) {
    panelState.sparklines.hum?.push(event.humidity);
    const el = document.getElementById('spark-hum-value');
    if (el) el.textContent = event.humidity.toFixed(1);
  }
  if (event.pressure !== undefined && event.pressure !== null) {
    panelState.sparklines.press?.push(event.pressure);
    const el = document.getElementById('spark-press-value');
    if (el) el.textContent = event.pressure.toFixed(1);
  }

  // Motion state changes — push to motion events and re-render timeline
  if (event.motion !== undefined) {
    panelState.motionEvents.push({ timestamp: Date.now(), active: Boolean(event.motion) });
    if (panelState.motionEvents.length > 180) panelState.motionEvents.shift();
    const motionContainer = document.getElementById('motion-timeline-container');
    if (motionContainer) {
      motionContainer.innerHTML = renderMotionTimeline(panelState.motionEvents);
    }
  }
}

export function handleSkillFired(event) {
  const entry = {
    skillId: event.skillId || event.id,
    timestamp: event.timestamp || event.firedAt || Date.now(),
    triggerType: event.triggerType || event.trigger?.type,
    priority: event.priority,
  };
  panelState.skillLogEntries.unshift(entry);
  if (panelState.skillLogEntries.length > 100) panelState.skillLogEntries.pop();

  // Use batched DOM updates for high-frequency skill fires
  scheduleUpdate((fragment) => {
    const div = document.createElement('div');
    div.innerHTML = renderSkillLogEntry(entry);
    while (div.firstChild) fragment.appendChild(div.firstChild);
  });
}

export function handleSkillEscalated(event) {
  panelState.escalationEvents.unshift(event);
  if (panelState.escalationEvents.length > 50) panelState.escalationEvents.pop();

  const feed = document.getElementById('escalation-feed');
  if (feed) {
    const emptyMsg = feed.querySelector('.escalation-empty');
    if (emptyMsg) emptyMsg.remove();
    feed.insertAdjacentHTML('afterbegin', renderEscalationCard(event));
  }
}

export function handleSkillConflict(event) {
  panelState.conflictEvents.unshift(event);
  if (panelState.conflictEvents.length > 50) panelState.conflictEvents.pop();

  const feed = document.getElementById('conflict-feed');
  if (feed) {
    const emptyMsg = feed.querySelector('.conflict-empty');
    if (emptyMsg) emptyMsg.remove();
    feed.insertAdjacentHTML('afterbegin', renderConflictCard(event));
  }
}

export function handleModeChange(event) {
  // Push transition to mode intervals
  const to = event.to || event.mode;
  if (to) {
    // Close previous interval and add new one to local state
    if (panelState.modeIntervals.length > 0) {
      const last = panelState.modeIntervals[panelState.modeIntervals.length - 1];
      if (last.endTime === null) {
        last.endTime = event.timestamp || Date.now();
      }
    }
    panelState.modeIntervals.push({
      mode: to,
      startTime: event.timestamp || Date.now(),
      endTime: null,
    });
    if (panelState.modeIntervals.length > 100) panelState.modeIntervals.shift();
  }

  const modeContainer = document.getElementById('mode-timeline-container');
  if (modeContainer) {
    modeContainer.innerHTML = renderModeTimeline(panelState.modeIntervals);
  }
}

/** Re-seed data on SSE reconnect */
export function reseedTelemetryData(api) {
  return seedTelemetryData(api);
}
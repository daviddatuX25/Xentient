/**
 * skills.js — Skill Manager Panel (08-04)
 *
 * Full CRUD for skills, pack management, and event mapping management.
 * Includes sortable table, detail drawer, register form with validation,
 * inline delete confirmation, live fire flash, and SSE-driven updates.
 */
import { showToast, handleQuickAction } from './components.js';

// ─── Trigger type field definitions ──────────────────────────────────

const TRIGGER_FIELDS = {
  event:     [{ key: 'eventName', label: 'Event Name', type: 'text' }],
  interval:  [{ key: 'intervalMs', label: 'Interval (ms)', type: 'number' }],
  sensor: [
    { key: 'sensorKey', label: 'Sensor', type: 'select', options: ['temperature', 'humidity', 'pressure', 'motion'] },
    { key: 'operator', label: 'Operator', type: 'select', options: ['>', '<', '>=', '<=', '==', '!='] },
    { key: 'value', label: 'Threshold', type: 'number' },
  ],
  mode: [
    { key: 'fromMode', label: 'From Mode', type: 'select-mode' },
    { key: 'toMode', label: 'To Mode', type: 'select-mode' },
  ],
  cron:      [{ key: 'schedule', label: 'Cron Schedule', type: 'text', placeholder: '0 * * * *' }],
  internal:  [{ key: 'eventName', label: 'Event Name', type: 'text' }],
  composite: [],
};

const AVAILABLE_MODES = ['sleep', 'listen', 'active', 'record'];

// ─── Panel Class ────────────────────────────────────────────────────

export class SkillManagerPanel {
  constructor(api, sse, state) {
    this.api = api;
    this.sse = sse;
    this.state = state;
    this.sortColumn = 'id';
    this.sortAsc = true;
    this.detailSkill = null;
    this.drawerOpen = false;
    this.advancedMode = false;
    this.formTriggerType = '';
    this.formErrors = {};
    this.packs = null;
    this.eventMappings = [];
    this.flashTimers = new Map();

    // Bound SSE handlers
    this._onSkillRegistered = () => this.refreshList();
    this._onSkillRemoved = () => this.refreshList();
    this._onSkillUpdated = () => this.refreshList();
    this._onSkillFired = (d) => this.flashRow(d.skillId || d.id);
    this._onPackLoaded = () => this.refreshPack();
    this._onPackUnloaded = () => this.refreshPack();

    this._sseAttached = false;
  }

  /** Attach SSE listeners (idempotent — only once) */
  attachSSE() {
    if (this._sseAttached || !this.sse) return;
    // The sse object is DashboardSSE which uses onEvent callback,
    // so we don't attach individual listeners here.
    // Instead, main.js dispatches and we get called via refreshList/flashRow.
    this._sseAttached = true;
  }

  // ── Sorting ──────────────────────────────────────────────────────

  sortBy(column) {
    if (this.sortColumn === column) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortColumn = column;
      this.sortAsc = true;
    }
    this.render();
  }

  getSortedSkills() {
    const col = this.sortColumn;
    const dir = this.sortAsc ? 1 : -1;
    return [...(this.state.skills || [])].sort((a, b) => {
      // Handle nested trigger.type as "triggerType" sort column
      const va = col === 'triggerType' ? (a.trigger?.type ?? '') : (a[col] ?? '');
      const vb = col === 'triggerType' ? (b.trigger?.type ?? '') : (b[col] ?? '');
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  sortIcon(column) {
    if (this.sortColumn !== column) return '&#8597;';  // up-down arrow
    return this.sortAsc ? '&#8593;' : '&#8595;';        // up / down
  }

  // ── Refresh ──────────────────────────────────────────────────────

  async refreshList() {
    try {
      const skills = await this.api.getSkills();
      this.state.skills = skills;
    } catch { /* state remains from last fetch */ }
    this.render();
  }

  async refreshPack() {
    try {
      const packs = await this.api.getPacks();
      this.packs = packs;
      this.state.activePack = packs.loaded || null;
    } catch { /* ignore */ }
    this.render();
  }

  async refreshMappings() {
    try {
      this.eventMappings = await this.api.getEventMappings();
    } catch { /* ignore */ }
    this.render();
  }

  // ── Flash Row ────────────────────────────────────────────────────

  flashRow(skillId) {
    // Clear any existing timer for this skill
    if (this.flashTimers.has(skillId)) {
      clearTimeout(this.flashTimers.get(skillId));
    }
    const row = document.querySelector(`.skill-row[data-skill-id="${CSS.escape(skillId)}"]`);
    if (row) {
      row.classList.add('flash-accent');
      this.flashTimers.set(skillId, setTimeout(() => {
        row.classList.remove('flash-accent');
        this.flashTimers.delete(skillId);
      }, 500));
    }
  }

  // ── Drawer ───────────────────────────────────────────────────────

  openDrawer(skillId) {
    this.detailSkill = (this.state.skills || []).find(s => s.id === skillId);
    this.drawerOpen = true;
    this.renderDrawer();
  }

  closeDrawer() {
    this.drawerOpen = false;
    this.detailSkill = null;
    const overlay = document.querySelector('.drawer-overlay');
    const panel = document.querySelector('.drawer-panel');
    if (overlay) overlay.classList.remove('open');
    if (panel) panel.classList.remove('open');
    // Remove after animation
    setTimeout(() => {
      const container = document.querySelector('.drawer-container');
      if (container) container.remove();
    }, 300);
  }

  renderDrawer() {
    if (!this.detailSkill) return;

    // Remove existing drawer if any
    const existing = document.querySelector('.drawer-container');
    if (existing) existing.remove();

    const skill = this.detailSkill;
    const sourceBadge = this.sourceBadgeHTML(skill.source);
    const isBuiltin = skill.source === 'builtin';
    const isPack = skill.source === 'pack';

    const drawerHTML = `
      <div class="drawer-container">
        <div class="drawer-overlay"></div>
        <div class="drawer-panel">
          <div class="drawer-header">
            <h3 class="drawer-title">${esc(skill.displayName || skill.id)}</h3>
            <button class="drawer-close" aria-label="Close">&times;</button>
          </div>
          <div class="drawer-body">
            <div class="detail-field">
              <span class="detail-label">ID</span>
              <span class="detail-value text-mono">${esc(skill.id)}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Display Name</span>
              <span class="detail-value">${esc(skill.displayName || '--')}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Source</span>
              <span class="detail-value">${sourceBadge}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Enabled</span>
              <span class="detail-value">
                <label class="toggle-switch">
                  <input type="checkbox" ${skill.enabled !== false ? 'checked' : ''} data-action="toggle-enabled" data-skill-id="${esc(skill.id)}" ${isBuiltin ? 'disabled' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Trigger Type</span>
              <span class="detail-value text-mono">${esc(skill.trigger?.type || '--')}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Priority</span>
              <span class="detail-value text-mono">${skill.priority ?? '--'}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Space ID</span>
              <span class="detail-value text-mono">${esc(skill.spaceId || '*')}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Fire Count</span>
              <span class="detail-value text-mono">${skill.fireCount ?? 0}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Last Fired</span>
              <span class="detail-value text-mono">${skill.lastFiredAt ? formatTime(skill.lastFiredAt) : 'Never'}</span>
            </div>
            ${skill.trigger ? `
              <div class="detail-section">
                <span class="detail-label">Trigger Config</span>
                <pre class="detail-json">${esc(JSON.stringify(skill.trigger, null, 2))}</pre>
              </div>
            ` : ''}
            <div class="detail-actions">
              ${!isBuiltin && !isPack ? `<button class="action-btn btn-danger-sm" data-action="delete-skill" data-skill-id="${esc(skill.id)}">Delete</button>` : ''}
              ${isPack ? '<span class="text-secondary text-sm">Managed by Pack Loader</span>' : ''}
              ${isBuiltin ? '<span class="text-secondary text-sm">Cannot remove built-in skill</span>' : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHTML);
    this.wireDrawer();
  }

  wireDrawer() {
    const overlay = document.querySelector('.drawer-overlay');
    const closeBtn = document.querySelector('.drawer-close');
    const container = document.querySelector('.drawer-container');

    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeDrawer(); });
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeDrawer());

    const escHandler = (e) => { if (e.key === 'Escape' && this.drawerOpen) { this.closeDrawer(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    // Toggle enabled
    const toggleEl = container?.querySelector('[data-action="toggle-enabled"]');
    if (toggleEl) {
      toggleEl.addEventListener('change', (e) => {
        const skillId = e.target.dataset.skillId;
        const enabled = e.target.checked;
        this.toggleSkill(skillId, enabled);
      });
    }

    // Delete
    const deleteBtn = container?.querySelector('[data-action="delete-skill"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this.requestRemoveSkill(btn.dataset.skillId, btn);
      });
    }

    // Animate in
    requestAnimationFrame(() => {
      overlay?.classList.add('open');
      document.querySelector('.drawer-panel')?.classList.add('open');
    });
  }

  // ── Toggle Skill ─────────────────────────────────────────────────

  async toggleSkill(skillId, enabled) {
    try {
      await this.api.updateSkill(skillId, { enabled });
      // Update local state
      const skill = (this.state.skills || []).find(s => s.id === skillId);
      if (skill) skill.enabled = enabled;
      showToast(`${skillId} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
      this.render();
    }
  }

  // ── Delete with inline confirmation ──────────────────────────────

  async requestRemoveSkill(skillId, btn) {
    if (btn.dataset.confirming === 'true') {
      try {
        await this.api.deleteSkill(skillId);
      } catch (err) {
        if (err.status === 403) {
          showToast(err.data?.error || 'Cannot remove this skill', 'error');
        } else {
          showToast(`Error: ${err.message}`, 'error');
        }
        return;
      }
      return;
    }
    btn.dataset.confirming = 'true';
    btn.textContent = 'Confirm Delete';
    btn.classList.add('btn-danger');
    setTimeout(() => {
      if (btn.isConnected) {
        btn.dataset.confirming = '';
        btn.textContent = 'Delete';
        btn.classList.remove('btn-danger');
      }
    }, 3000);
  }

  // ── Register Skill ───────────────────────────────────────────────

  async registerSkill(formData) {
    const errors = validateSkillForm(formData);
    if (Object.keys(errors).length > 0) {
      this.formErrors = errors;
      this.renderFormErrors();
      return;
    }

    try {
      await this.api.createSkill(formData);
      showToast(`Skill "${formData.id}" registered`, 'success');
      this.clearForm();
    } catch (err) {
      if (err.status === 409) {
        showToast(`Skill "${formData.id}" already exists. Use edit instead.`, 'error');
      } else {
        showToast(`Error: ${err.message}`, 'error');
      }
    }
  }

  async registerSkillAdvanced(jsonStr) {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      this.formErrors = { json: 'Invalid JSON' };
      this.renderFormErrors();
      return;
    }

    try {
      await this.api.createSkill(parsed);
      showToast(`Skill "${parsed.id}" registered`, 'success');
      this.clearForm();
    } catch (err) {
      if (err.status === 409) {
        showToast(`Skill "${parsed.id}" already exists. Use edit instead.`, 'error');
      } else {
        showToast(`Error: ${err.message}`, 'error');
      }
    }
  }

  clearForm() {
    this.formErrors = {};
    this.formTriggerType = '';
    const form = document.getElementById('register-skill-form');
    if (form) form.reset();
    const jsonArea = document.getElementById('skill-json-input');
    if (jsonArea) jsonArea.value = '';
    // Clear dynamic trigger fields
    const fieldsContainer = document.getElementById('trigger-dynamic-fields');
    if (fieldsContainer) fieldsContainer.innerHTML = '';
  }

  renderFormErrors() {
    // Clear previous errors
    document.querySelectorAll('.form-field-error').forEach(el => el.remove());
    document.querySelectorAll('.form-input.has-error').forEach(el => el.classList.remove('has-error'));

    for (const [field, msg] of Object.entries(this.formErrors)) {
      if (field === 'json') {
        const jsonArea = document.getElementById('skill-json-input');
        if (jsonArea) {
          jsonArea.classList.add('has-error');
          jsonArea.insertAdjacentHTML('afterend', `<span class="form-field-error">${esc(msg)}</span>`);
        }
      } else {
        const input = document.querySelector(`[data-form-field="${field}"]`);
        if (input) {
          input.classList.add('has-error');
          input.insertAdjacentHTML('afterend', `<span class="form-field-error">${esc(msg)}</span>`);
        }
      }
    }
  }

  // ── Pack Management ──────────────────────────────────────────────

  async switchPack(packName) {
    try {
      await this.api.loadPack(packName);
      showToast(`Loading pack: ${packName}`, 'success');
    } catch (err) {
      showToast(`Error loading pack: ${err.message}`, 'error');
    }
  }

  async reloadPack() {
    if (!this.state.activePack) {
      showToast('No active pack to reload', 'error');
      return;
    }
    try {
      await this.api.reloadPack(this.state.activePack);
      showToast(`Pack "${this.state.activePack}" reloaded`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  // ── Event Mappings ──────────────────────────────────────────────

  async addMapping(source, eventName) {
    if (!source?.trim() || !eventName?.trim()) {
      showToast('Source and event name are required', 'error');
      return;
    }
    try {
      await this.api.addEventMapping({ source, eventName });
      showToast('Mapping added', 'success');
      this.refreshMappings();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  async removeMapping(id) {
    try {
      await this.api.removeEventMapping(id);
      showToast('Mapping removed', 'success');
      this.refreshMappings();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  // ── Source Badge HTML ────────────────────────────────────────────

  sourceBadgeHTML(source) {
    const classes = {
      builtin: 'badge-builtin',
      pack: 'badge-pack',
      brain: 'badge-brain',
    };
    const labels = {
      builtin: 'Built-in',
      pack: 'Pack',
      brain: 'Brain',
    };
    const cls = classes[source] || 'badge-brain';
    const label = labels[source] || source || '--';
    return `<span class="source-badge ${cls}">${esc(label)}</span>`;
  }

  // ── Main Render ──────────────────────────────────────────────────

  render(container) {
    if (!container) return;

    const skills = this.getSortedSkills();
    const config = this.state.config || {};
    const triggerTypes = config.triggerTypes || ['event', 'interval', 'sensor', 'mode', 'cron', 'internal', 'composite'];
    const packNames = this.packs?.available || [];

    container.innerHTML = `
      <!-- Skill List Card -->
      <div class="card">
        <div class="card-title">Skills</div>
        <div class="skill-table-wrapper">
          <table class="skill-table">
            <thead>
              <tr>
                <th class="sortable" data-sort="id">ID ${this.sortIcon('id')}</th>
                <th class="sortable" data-sort="displayName">Name ${this.sortIcon('displayName')}</th>
                <th class="sortable" data-sort="triggerType">Trigger ${this.sortIcon('triggerType')}</th>
                <th class="sortable" data-sort="priority">Pri ${this.sortIcon('priority')}</th>
                <th class="sortable" data-sort="source">Source ${this.sortIcon('source')}</th>
                <th class="sortable" data-sort="enabled">On ${this.sortIcon('enabled')}</th>
                <th class="sortable" data-sort="fireCount">Fires ${this.sortIcon('fireCount')}</th>
                <th class="sortable" data-sort="lastFiredAt">Last ${this.sortIcon('lastFiredAt')}</th>
              </tr>
            </thead>
            <tbody class="skill-table-body">
              ${skills.length === 0
                ? '<tr><td colspan="8" class="skill-table-empty">No skills registered</td></tr>'
                : skills.map(s => this.renderRow(s)).join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Register Skill Card -->
      <div class="card">
        <div class="card-title">Register Skill</div>
        <div class="form-mode-toggle">
          <button class="mode-toggle-btn ${!this.advancedMode ? 'active' : ''}" data-action="set-simple-mode">Simple</button>
          <button class="mode-toggle-btn ${this.advancedMode ? 'active' : ''}" data-action="set-advanced-mode">Advanced</button>
        </div>

        ${this.advancedMode ? this.renderAdvancedForm() : this.renderSimpleForm(triggerTypes)}
      </div>

      <!-- Pack Management Card -->
      <div class="card">
        <div class="card-title">Pack</div>
        <div class="pack-section">
          <div class="pack-active">
            <span class="pack-label">Active Pack</span>
            <span class="pack-name text-mono">${esc(this.state.activePack || 'None')}</span>
            <span class="pack-count text-mono text-secondary text-sm">${skills.filter(s => s.source === 'pack').length} pack skills</span>
          </div>
          <div class="pack-controls">
            <select class="form-select" id="pack-select">
              <option value="">-- Switch Pack --</option>
              ${packNames.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
            </select>
            <button class="action-btn" data-action="switch-pack">Switch</button>
            <button class="action-btn" data-action="reload-pack">Reload</button>
          </div>
        </div>
      </div>

      <!-- Event Mappings Card -->
      <div class="card">
        <div class="card-title">Event Mappings</div>
        <div class="mapping-table-wrapper">
          <table class="mapping-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Source</th>
                <th>Event Name</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(this.eventMappings || []).length === 0
                ? '<tr><td colspan="5" class="skill-table-empty">No event mappings</td></tr>'
                : this.eventMappings.map(m => this.renderMappingRow(m)).join('')
              }
            </tbody>
          </table>
        </div>
        <div class="mapping-add mt-4">
          <input type="text" class="form-input text-mono" id="mapping-source" placeholder="Source" style="width: 120px;">
          <input type="text" class="form-input text-mono" id="mapping-event" placeholder="Event name" style="width: 200px;">
          <button class="action-btn" data-action="add-mapping">Add Mapping</button>
        </div>
      </div>
    `;

    this.wireEvents(container);
  }

  // ── Row Rendering ────────────────────────────────────────────────

  renderRow(skill) {
    const triggerType = skill.trigger?.type || '--';
    const sourceBadge = this.sourceBadgeHTML(skill.source);
    const isBuiltin = skill.source === 'builtin';
    const isPack = skill.source === 'pack';
    const enabled = skill.enabled !== false;

    return `<tr class="skill-row" data-skill-id="${esc(skill.id)}" data-action="open-drawer">
      <td class="text-mono">${esc(skill.id)}</td>
      <td>${esc(skill.displayName || '--')}</td>
      <td class="text-mono">${esc(triggerType)}</td>
      <td class="text-mono">${skill.priority ?? '--'}</td>
      <td>${sourceBadge}</td>
      <td>
        <label class="toggle-switch" onclick="event.stopPropagation()">
          <input type="checkbox" ${enabled ? 'checked' : ''} data-action="toggle-enabled" data-skill-id="${esc(skill.id)}" ${isBuiltin ? 'disabled' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td class="text-mono">${skill.fireCount ?? 0}</td>
      <td class="text-mono text-secondary text-sm">${skill.lastFiredAt ? formatTime(skill.lastFiredAt) : '--'}</td>
    </tr>`;
  }

  // ── Mapping Row ──────────────────────────────────────────────────

  renderMappingRow(mapping) {
    const isProtected = mapping.protected || mapping.default;
    return `<tr>
      <td class="text-mono">${esc(mapping.id || '--')}</td>
      <td class="text-mono">${esc(mapping.source || '--')}</td>
      <td class="text-mono">${esc(mapping.eventName || '--')}</td>
      <td>${isProtected ? '<span class="source-badge badge-builtin">Default</span>' : '<span class="source-badge badge-brain">Custom</span>'}</td>
      <td>
        ${!isProtected ? `<button class="action-btn btn-danger-sm" data-action="remove-mapping" data-mapping-id="${esc(mapping.id)}">Remove</button>` : ''}
      </td>
    </tr>`;
  }

  // ── Simple Form ──────────────────────────────────────────────────

  renderSimpleForm(triggerTypes) {
    return `
      <form id="register-skill-form" class="skill-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Skill ID</label>
            <input type="text" class="form-input text-mono" data-form-field="id" placeholder="my_skill" required>
          </div>
          <div class="form-group">
            <label class="form-label">Display Name</label>
            <input type="text" class="form-input" data-form-field="displayName" placeholder="My Skill">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Trigger Type</label>
            <select class="form-select" data-form-field="triggerType" data-action="change-trigger-type">
              <option value="">-- Select --</option>
              ${triggerTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <input type="number" class="form-input text-mono" data-form-field="priority" value="50" min="0" max="100">
          </div>
        </div>
        <div id="trigger-dynamic-fields" class="form-row">
          ${this.renderTriggerFields(this.formTriggerType)}
        </div>
        <div class="form-actions">
          <button type="submit" class="action-btn">Register Skill</button>
        </div>
      </form>
    `;
  }

  renderTriggerFields(triggerType) {
    if (!triggerType) return '';
    if (triggerType === 'composite') {
      return '<div class="form-group form-group-full"><span class="text-secondary text-sm">Composite triggers require JSON configuration. Switch to Advanced Mode.</span></div>';
    }
    const fields = TRIGGER_FIELDS[triggerType];
    if (!fields) return '';

    return fields.map(f => {
      if (f.type === 'select') {
        return `<div class="form-group">
          <label class="form-label">${f.label}</label>
          <select class="form-select" data-form-field="trigger_${f.key}" data-trigger-field="${f.key}">
            ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
        </div>`;
      } else if (f.type === 'select-mode') {
        return `<div class="form-group">
          <label class="form-label">${f.label}</label>
          <select class="form-select" data-form-field="trigger_${f.key}" data-trigger-field="${f.key}">
            ${AVAILABLE_MODES.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>`;
      } else {
        return `<div class="form-group">
          <label class="form-label">${f.label}</label>
          <input type="${f.type}" class="form-input ${f.type === 'number' ? 'text-mono' : ''}" data-form-field="trigger_${f.key}" data-trigger-field="${f.key}" placeholder="${f.placeholder || ''}">
        </div>`;
      }
    }).join('');
  }

  // ── Advanced Form ────────────────────────────────────────────────

  renderAdvancedForm() {
    const template = JSON.stringify({
      id: 'my_skill',
      displayName: 'My Skill',
      trigger: { type: 'event', eventName: '' },
      priority: 50,
      enabled: true,
      spaceId: '*',
    }, null, 2);

    return `
      <div class="skill-form">
        <textarea id="skill-json-input" class="form-textarea text-mono" rows="10" spellcheck="false">${esc(template)}</textarea>
        <div class="form-actions mt-4">
          <button class="action-btn" data-action="register-advanced">Register Skill</button>
        </div>
      </div>
    `;
  }

  // ── Event Wiring ─────────────────────────────────────────────────

  wireEvents(container) {
    // Sort column headers
    container.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (col) this.sortBy(col);
      });
    });

    // Row click -> open drawer
    container.querySelectorAll('.skill-row[data-action="open-drawer"]').forEach(row => {
      row.addEventListener('click', (e) => {
        // Don't open drawer if clicking toggle or interactive element
        if (e.target.closest('.toggle-switch') || e.target.closest('button')) return;
        this.openDrawer(row.dataset.skillId);
      });
      row.style.cursor = 'pointer';
    });

    // Toggle enabled checkboxes
    container.querySelectorAll('[data-action="toggle-enabled"]').forEach(el => {
      el.addEventListener('change', (e) => {
        const skillId = e.target.dataset.skillId;
        const enabled = e.target.checked;
        this.toggleSkill(skillId, enabled);
      });
    });

    // Register form submit
    const form = document.getElementById('register-skill-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSimpleFormSubmit();
      });
    }

    // Trigger type change
    const triggerSelect = container.querySelector('[data-action="change-trigger-type"]');
    if (triggerSelect) {
      triggerSelect.addEventListener('change', (e) => {
        this.formTriggerType = e.target.value;
        const fieldsContainer = document.getElementById('trigger-dynamic-fields');
        if (fieldsContainer) {
          fieldsContainer.innerHTML = this.renderTriggerFields(this.formTriggerType);
        }
      });
    }

    // Form mode toggle
    container.querySelectorAll('.mode-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'set-simple-mode') this.advancedMode = false;
        else if (action === 'set-advanced-mode') this.advancedMode = true;
        this.formErrors = {};
        this.render(container);
      });
    });

    // Advanced register
    const advBtn = container.querySelector('[data-action="register-advanced"]');
    if (advBtn) {
      advBtn.addEventListener('click', () => {
        const jsonArea = document.getElementById('skill-json-input');
        if (jsonArea) this.registerSkillAdvanced(jsonArea.value);
      });
    }

    // Pack switch
    const switchBtn = container.querySelector('[data-action="switch-pack"]');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        const sel = document.getElementById('pack-select');
        if (sel && sel.value) this.switchPack(sel.value);
      });
    }

    // Pack reload
    const reloadBtn = container.querySelector('[data-action="reload-pack"]');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => this.reloadPack());
    }

    // Add mapping
    const addMapBtn = container.querySelector('[data-action="add-mapping"]');
    if (addMapBtn) {
      addMapBtn.addEventListener('click', () => {
        const src = document.getElementById('mapping-source');
        const evt = document.getElementById('mapping-event');
        if (src && evt) {
          this.addMapping(src.value, evt.value);
          src.value = '';
          evt.value = '';
        }
      });
    }

    // Remove mapping
    container.querySelectorAll('[data-action="remove-mapping"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeMapping(btn.dataset.mappingId);
      });
    });
  }

  // ── Simple form submission handler ───────────────────────────────

  handleSimpleFormSubmit() {
    const getVal = (field) => {
      const el = document.querySelector(`[data-form-field="${field}"]`);
      return el ? el.value.trim() : '';
    };

    const id = getVal('id');
    const displayName = getVal('displayName');
    const triggerType = getVal('triggerType');
    const priority = parseInt(getVal('priority'), 10) || 50;

    // Build trigger config
    const trigger = { type: triggerType };
    const triggerFields = TRIGGER_FIELDS[triggerType] || [];
    for (const f of triggerFields) {
      const val = getVal(`trigger_${f.key}`);
      if (val !== '') {
        trigger[f.key] = f.type === 'number' ? parseFloat(val) : val;
      }
    }

    const formData = {
      id,
      displayName: displayName || id,
      trigger,
      priority,
      enabled: true,
      spaceId: '*',
    };

    this.registerSkill(formData);
  }
}

// ─── Exported render function (matches main.js signature) ──────────

let _panel = null;

export function renderSkills(container, state, api, sse) {
  if (!_panel) {
    _panel = new SkillManagerPanel(api, sse, state);
    // Initial data fetch for packs and mappings
    _panel.refreshPack();
    _panel.refreshMappings();
  } else {
    _panel.state = state;
  }
  _panel.render(container);
}

// ─── Validation ──────────────────────────────────────────────────────

function validateSkillForm(formData) {
  const errors = {};
  if (!formData.id?.trim()) errors.id = 'Skill ID is required';
  if (!formData.displayName?.trim()) errors.displayName = 'Display name is required';
  if (!formData.trigger?.type) errors.triggerType = 'Trigger type is required';

  const triggerType = formData.trigger?.type;
  if (triggerType === 'event' && !formData.trigger?.eventName) {
    errors.trigger_eventName = 'Event name is required for event triggers';
  }
  if (triggerType === 'interval' && !formData.trigger?.intervalMs) {
    errors.trigger_intervalMs = 'Interval is required for interval triggers';
  }
  if (triggerType === 'sensor') {
    if (!formData.trigger?.sensorKey) errors.trigger_sensorKey = 'Sensor key is required';
    if (formData.trigger?.value === undefined || formData.trigger?.value === '') errors.trigger_value = 'Threshold value is required';
  }
  if (triggerType === 'mode') {
    if (!formData.trigger?.fromMode) errors.trigger_fromMode = 'From mode is required';
    if (!formData.trigger?.toMode) errors.trigger_toMode = 'To mode is required';
  }
  if (triggerType === 'cron' && !formData.trigger?.schedule) {
    errors.trigger_schedule = 'Cron schedule is required';
  }
  return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatTime(ts) {
  if (!ts) return '--';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--';
  }
}

// ─── Expose flashRow to main.js SSE handler ──────────────────────────

export function flashSkillRow(skillId) {
  if (_panel) _panel.flashRow(skillId);
}

export function refreshSkillList() {
  if (_panel) _panel.refreshList();
}

export function refreshSkillPack() {
  if (_panel) _panel.refreshPack();
}
/**
 * api.js — REST API client module
 *
 * Typed fetch wrappers for all ControlServer REST endpoints.
 * Returns parsed JSON on success, throws Error with message on failure.
 */
export class DashboardAPI {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  async request(path, options = {}) {
    const url = `${this.baseURL}${path}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ── Status & Mode ──────────────────────────────────────────────

  async getStatus() {
    return this.request('/api/status');
  }

  async getMode() {
    return this.request('/api/mode');
  }

  async setMode(mode) {
    return this.request('/api/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  // ── Sensors ────────────────────────────────────────────────────

  async getSensors() {
    return this.request('/api/sensors');
  }

  async getSensorHistory(since) {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.request(`/api/sensors/history${query}`);
  }

  // ── Skills ─────────────────────────────────────────────────────

  async getSkills() {
    return this.request('/api/skills');
  }

  async getSkill(id) {
    return this.request(`/api/skills/${encodeURIComponent(id)}`);
  }

  async createSkill(skill) {
    return this.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
    });
  }

  async updateSkill(id, patch) {
    return this.request(`/api/skills/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async deleteSkill(id) {
    return this.request(`/api/skills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async getSkillLog(params = {}) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return this.request(`/api/skill-log${query ? '?' + query : ''}`);
  }

  // ── Packs ──────────────────────────────────────────────────────

  async getPacks() {
    return this.request('/api/packs');
  }

  async loadPack(name) {
    return this.request(`/api/packs/${encodeURIComponent(name)}/load`, {
      method: 'POST',
    });
  }

  async reloadPack(name) {
    return this.request(`/api/packs/${encodeURIComponent(name)}/reload`, {
      method: 'POST',
    });
  }

  // ── Spaces ────────────────────────────────────────────────────

  async getSpaces() {
    return this.request('/api/spaces');
  }

  async setSpaceMode(spaceId, mode) {
    return this.request(`/api/spaces/${encodeURIComponent(spaceId)}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  // ── Event Mappings ────────────────────────────────────────────

  async getEventMappings() {
    return this.request('/api/event-mappings');
  }

  async addEventMapping(mapping) {
    return this.request('/api/event-mappings', {
      method: 'POST',
      body: JSON.stringify(mapping),
    });
  }

  async removeEventMapping(id) {
    return this.request(`/api/event-mappings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ── Config ────────────────────────────────────────────────────

  async getConfig() {
    return this.request('/api/config');
  }

  // ── Actions ───────────────────────────────────────────────────

  async trigger() {
    return this.request('/api/trigger', { method: 'POST' });
  }

  async getCamera() {
    return this.request('/api/camera');
  }
}
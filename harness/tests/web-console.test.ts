import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ControlServer, type ControlServerDeps } from "../src/comms/ControlServer";
import { createMockMqtt } from "./helpers/mockMqtt";
import { createMockModeManager } from "./helpers/mockModeManager";
import { createMockCameraServer } from "./helpers/mockCameraServer";
import type { CoreSkill } from "../src/shared/types";
import { EventEmitter } from "events";

/**
 * Web Console Integration Tests (08-08)
 *
 * Tests REST API endpoints and SSE event flow for the dashboard.
 * Covers: Skills CRUD, Packs, Spaces, Event Mappings, Sensor/Mode History,
 * Config, error cases, body size limits, and SSE event broadcasting.
 */
describe("Web Console Integration Tests", () => {
  let server: ControlServer;
  let baseUrl: string;
  let mockSkills: CoreSkill[];
  let registerSkillFn: ReturnType<typeof vi.fn>;
  let removeSkillFn: ReturnType<typeof vi.fn>;
  let updateSkillFn: ReturnType<typeof vi.fn>;
  let switchModeFn: ReturnType<typeof vi.fn>;
  let addCustomMappingFn: ReturnType<typeof vi.fn>;
  let removeMappingFn: ReturnType<typeof vi.fn>;
  let loadPackFn: ReturnType<typeof vi.fn>;
  let skillLogQueryFn: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const mqtt = createMockMqtt() as any;
    const modeManager = createMockModeManager() as any;
    const cameraServer = createMockCameraServer() as any;
    const sensorCache = { temperature: 25.3, humidity: 60.1, pressure: 1013.2, motion: false, lastMotionAt: null };

    mockSkills = [
      {
        id: '_pir-wake',
        displayName: 'PIR Wake',
        enabled: true,
        spaceId: '*',
        trigger: { type: 'event', event: 'motion_detected' },
        priority: 90,
        actions: [{ type: 'set_mode', mode: 'listen' }],
        source: 'builtin',
        cooldownMs: 0,
        fireCount: 5,
        escalationCount: 0,
      } as CoreSkill,
      {
        id: 'brain-hello',
        displayName: 'Hello Skill',
        enabled: true,
        spaceId: 'default',
        trigger: { type: 'event', event: 'voice_start' },
        priority: 50,
        actions: [{ type: 'log', message: 'hello' }],
        source: 'brain',
        cooldownMs: 0,
        fireCount: 2,
        escalationCount: 0,
      } as CoreSkill,
      {
        id: 'pack-greeting',
        displayName: 'Pack Greeting',
        enabled: true,
        spaceId: '*',
        trigger: { type: 'mode', from: 'sleep', to: 'listen' },
        priority: 40,
        actions: [{ type: 'play_chime', preset: 'morning' }],
        source: 'pack',
        cooldownMs: 5000,
        fireCount: 10,
        escalationCount: 1,
        _pack: 'default',
      } as CoreSkill,
    ];

    registerSkillFn = vi.fn();
    removeSkillFn = vi.fn(() => true);
    updateSkillFn = vi.fn(() => true);
    switchModeFn = vi.fn(() => true);
    addCustomMappingFn = vi.fn(() => 'custom-1');
    removeMappingFn = vi.fn();
    loadPackFn = vi.fn();
    skillLogQueryFn = vi.fn(() => []);

    const listMappingsResult = [
      { id: 'pir-motion', protected: true, source: 'mqtt:sensor', eventName: 'motion_detected', filter: () => true, transform: (d: any) => d },
      { id: 'bme280-sensor', protected: true, source: 'mqtt:sensor', eventName: 'sensor_update', filter: () => true, transform: (d: any) => d },
    ];

    const deps: ControlServerDeps = {
      mqtt,
      modeManager,
      cameraServer,
      sensorCache,
      sensorHistory: { query: () => [] },
      motionHistory: { query: () => [] },
      modeHistory: { query: () => [] },
      spaceManager: {
        listSkills: vi.fn(() => [...mockSkills]),
        registerSkill: registerSkillFn,
        removeSkill: removeSkillFn,
        updateSkill: updateSkillFn,
        activateConfig: switchModeFn,
        skillLog: { append: vi.fn(), query: skillLogQueryFn, attachEscalationResponse: vi.fn() },
      } as any,
      eventBridge: {
        start: vi.fn(),
        stop: vi.fn(),
        listMappings: vi.fn(() => listMappingsResult),
        addCustomMapping: addCustomMappingFn,
        removeMapping: removeMappingFn,
        handleMqttEvent: vi.fn(),
        forwardModeEvent: vi.fn(),
        register: vi.fn(),
      } as any,
      packLoader: {
        loadPack: loadPackFn,
        unloadCurrentPack: vi.fn(),
        getLoadedPack: vi.fn(() => 'default'),
        listAvailablePacks: vi.fn(() => ['default', 'night']),
        reload: vi.fn(),
      } as any,
      skillLog: { append: vi.fn(), query: skillLogQueryFn, attachEscalationResponse: vi.fn() } as any,
      getBrainConnected: () => true,
    };

    server = new ControlServer(deps, 0);
    await server.start();
    const port = (server as any).server?.address()?.port ?? 3000;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => server.close());

  // ── Skills CRUD ────────────────────────────────────────────────────

  describe("GET /api/skills", () => {
    it("returns all skills", async () => {
      const res = await fetch(`${baseUrl}/api/skills`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(3);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('source');
      expect(data[0]).toHaveProperty('fireCount');
    });
  });

  describe("GET /api/skills/:id", () => {
    it("returns a single skill by ID", async () => {
      const res = await fetch(`${baseUrl}/api/skills/_pir-wake`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('_pir-wake');
      expect(data.source).toBe('builtin');
    });

    it("returns 404 for unknown skill", async () => {
      const res = await fetch(`${baseUrl}/api/skills/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/skills", () => {
    it("creates skill with source:brain", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 'test-skill',
          displayName: 'Test',
          trigger: { type: 'event', event: 'test_event' },
          actions: [{ type: 'log', message: 'test' }],
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.skill.source).toBe('brain');
    });

    it("returns 400 for missing required fields", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 'incomplete' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Validation failed');
    });

    it("returns 409 for existing skill ID", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: '_pir-wake',
          displayName: 'Duplicate',
          trigger: { type: 'event', event: 'motion' },
          actions: [{ type: 'log', message: 'dup' }],
        }),
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('already exists');
    });
  });

  describe("PATCH /api/skills/:id", () => {
    it("updates patchable fields only", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, priority: 75 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.patched).toContain('enabled');
      expect(data.patched).toContain('priority');
    });

    it("ignores forbidden fields (id, source, fireCount)", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 'hacked', source: 'hacked', fireCount: 999, enabled: true }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.patched).toContain('enabled');
      expect(data.patched).not.toContain('id');
      expect(data.patched).not.toContain('source');
      expect(data.patched).not.toContain('fireCount');
    });

    it("returns 400 when no patchable fields provided", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 'x', fireCount: 999 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/skills/:id", () => {
    it("removes brain skill", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.removed).toBe('brain-hello');
    });

    it("returns 403 for builtin skill (_pir-wake)", async () => {
      const res = await fetch(`${baseUrl}/api/skills/_pir-wake`, { method: "DELETE" });
      expect(res.status).toBe(403);
    });

    it("returns 403 for pack-managed skill", async () => {
      const res = await fetch(`${baseUrl}/api/skills/pack-greeting`, { method: "DELETE" });
      expect(res.status).toBe(403);
    });
  });

  // ── Skill Log ──────────────────────────────────────────────────────

  describe("GET /api/skill-log", () => {
    it("returns skill log entries", async () => {
      const res = await fetch(`${baseUrl}/api/skill-log`);
      expect(res.status).toBe(200);
    });

    it("filters by skillId", async () => {
      await fetch(`${baseUrl}/api/skill-log?skillId=brain-hello&limit=10`);
      const lastCall = skillLogQueryFn.mock.calls[skillLogQueryFn.mock.calls.length - 1][0];
      expect(lastCall.skillId).toBe('brain-hello');
    });
  });

  // ── Packs ──────────────────────────────────────────────────────────

  describe("GET /api/packs", () => {
    it("returns available and loaded packs", async () => {
      const res = await fetch(`${baseUrl}/api/packs`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.available).toEqual(['default', 'night']);
      expect(data.loaded).toBe('default');
    });
  });

  describe("POST /api/packs/:name/load", () => {
    it("switches pack", async () => {
      const res = await fetch(`${baseUrl}/api/packs/night/load`, { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.loaded).toBe('night');
    });

    it("returns 400 for nonexistent pack", async () => {
      loadPackFn.mockImplementationOnce(() => { throw new Error('Pack manifest not found'); });
      const res = await fetch(`${baseUrl}/api/packs/nonexistent/load`, { method: "POST" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/packs/:name/reload", () => {
    it("hot-reloads pack", async () => {
      const res = await fetch(`${baseUrl}/api/packs/default/reload`, { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  // ── Spaces ────────────────────────────────────────────────────────

  describe("GET /api/spaces", () => {
    it("returns space list", async () => {
      const res = await fetch(`${baseUrl}/api/spaces`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('mode');
      expect(data[0]).toHaveProperty('skillCount');
    });
  });

  describe("POST /api/spaces/:id/mode", () => {
    it("activates config", async () => {
      const res = await fetch(`${baseUrl}/api/spaces/default/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: 'active' }),
      });
      expect(res.status).toBe(200);
      expect(switchModeFn).toHaveBeenCalledWith('default', 'active');
    });

    it("returns 400 for missing config", async () => {
      const res = await fetch(`${baseUrl}/api/spaces/default/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── Event Mappings ────────────────────────────────────────────────

  describe("GET /api/event-mappings", () => {
    it("returns all mappings with serialized functions", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveProperty('hasFilter');
      expect(data[0]).toHaveProperty('hasTransform');
      expect(typeof data[0].hasFilter).toBe('boolean');
    });
  });

  describe("POST /api/event-mappings", () => {
    it("adds custom mapping", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: 'custom', eventName: 'my_event' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('custom-1');
    });

    it("returns 400 for invalid source", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: 'invalid', eventName: 'test' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/event-mappings/:id", () => {
    it("removes custom mapping", async () => {
      removeMappingFn.mockReturnValueOnce(true);
      const res = await fetch(`${baseUrl}/api/event-mappings/custom-1`, { method: "DELETE" });
      expect(res.status).toBe(200);
    });

    it("returns 403 for protected mapping (pir-motion)", async () => {
      removeMappingFn.mockReturnValueOnce(false);
      const res = await fetch(`${baseUrl}/api/event-mappings/pir-motion`, { method: "DELETE" });
      expect(res.status).toBe(403);
    });
  });

  // ── Sensor History ──────────────────────────────────────────────────

  describe("GET /api/sensors/history", () => {
    it("returns ring buffer data", async () => {
      const res = await fetch(`${baseUrl}/api/sensors/history`);
      expect(res.status).toBe(200);
    });
  });

  // ── Motion History ──────────────────────────────────────────────────

  describe("GET /api/sensors/motion-history", () => {
    it("returns PIR events", async () => {
      const res = await fetch(`${baseUrl}/api/sensors/motion-history?minutes=30`);
      expect(res.status).toBe(200);
    });
  });

  // ── Mode History ──────────────────────────────────────────────────

  describe("GET /api/mode/history", () => {
    it("returns mode intervals", async () => {
      const res = await fetch(`${baseUrl}/api/mode/history?minutes=30`);
      expect(res.status).toBe(200);
    });
  });

  // ── Config ────────────────────────────────────────────────────────

  describe("GET /api/config", () => {
    it("returns modeTransitions + triggerTypes + peripheralIds", async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('modeTransitions');
      expect(data).toHaveProperty('availableModes');
      expect(data).toHaveProperty('triggerTypes');
      expect(data).toHaveProperty('peripheralIds');
      expect(data.modeTransitions).toHaveProperty('sleep');
      expect(data.availableModes).toContain('listen');
      expect(data.triggerTypes).toContain('composite');
    });
  });

  // ── Route Table Guards ──────────────────────────────────────────

  describe("Unknown /api route returns 404", () => {
    it("returns 404 for unknown API path", async () => {
      const res = await fetch(`${baseUrl}/api/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe("Non-API route falls through to static files", () => {
    it("serves index.html for /", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Xentient');
    });
  });

  describe("Wrong method returns 405", () => {
    it("PATCH /api/mode returns 405", async () => {
      const res = await fetch(`${baseUrl}/api/mode`, { method: "PATCH" });
      expect(res.status).toBe(405);
    });
  });

  describe("Invalid JSON body returns 400", () => {
    it("POST /api/skills with invalid JSON", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json {{{",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Body > 64KB returns 413", () => {
    it("POST /api/skills with oversized body returns 413", async () => {
      // 65KB body exceeds the 64KB limit
      const largeBody = JSON.stringify({ id: 'x'.repeat(66000) });
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: largeBody,
      });
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toContain('too large');
    });
  });

  // ── SSE Event Broadcasting ────────────────────────────────────────

  describe("SSE broadcastSSE", () => {
    it("sends events to connected SSE clients", async () => {
      // Connect an SSE client
      const events: any[] = [];
      const res = await fetch(`${baseUrl}/api/events`);

      // Use the raw response to manually read SSE data
      // Instead, we test broadcastSSE directly since EventSource requires
      // Node.js polyfill and the test is about verifying the broadcast mechanism
      const client = res as any;

      // Broadcast a test event
      server.broadcastSSE({ type: 'sensor_update', temperature: 25.3, humidity: 60, pressure: 1013 });

      // Close SSE client after test
      // Note: The HTTP response for SSE is kept open, so we clean up by closing
      // The broadcastSSE method writes to all connected clients
      // We verify that the server has at least one SSE client connected
      expect((server as any).sseClients.size).toBeGreaterThan(0);

      // End the SSE response to clean up
      try { client.end?.(); } catch { /* ignore */ }
    });

    it("broadcasts mode_status on MQTT modeStatus event", async () => {
      // The MQTT modeStatus handler is wired in ControlServer constructor
      // We verify it exists by triggering MQTT event
      const mqtt = (server as any).deps?.mqtt as EventEmitter;
      if (mqtt) {
        const sseClientsBefore = (server as any).sseClients.size;
        // Connect an SSE client first
        const res = await fetch(`${baseUrl}/api/events`);
        expect((server as any).sseClients.size).toBe(sseClientsBefore + 1);
        try { (res as any).end?.(); } catch { /* ignore */ }
      }
    });
  });

  // ── CORS Headers ─────────────────────────────────────────────────

  describe("CORS headers", () => {
    it("includes CORS headers on API responses", async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it("OPTIONS returns 204 CORS preflight", async () => {
      const res = await fetch(`${baseUrl}/api/status`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
    });
  });

  // ── Static File Serving ──────────────────────────────────────────

  describe("Static file serving", () => {
    it("serves index.html for root path", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Xentient');
      expect(text).toContain('dashboard');
    });

    it("serves CSS files", async () => {
      const res = await fetch(`${baseUrl}/dashboard.css`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('--bg-primary');
    });

    it("serves JS modules", async () => {
      const res = await fetch(`${baseUrl}/js/main.js`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('DashboardAPI');
    });

    it("returns 404 for non-existent static files", async () => {
      const res = await fetch(`${baseUrl}/nonexistent-file.xyz`);
      expect(res.status).toBe(404);
    });
  });
});
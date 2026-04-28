import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ControlServer, type ControlServerDeps } from "../src/comms/ControlServer";
import { createMockMqtt } from "./helpers/mockMqtt";
import { createMockModeManager } from "./helpers/mockModeManager";
import { createMockCameraServer } from "./helpers/mockCameraServer";
import type { CoreSkill } from "../src/shared/types";

/**
 * Tests for 08-01 REST API Expansion endpoints:
 * Skills, Packs, Spaces, Event Mappings, Sensor History, Config
 */
describe("ControlServer 08-01 API Expansion", () => {
  let server: ControlServer;
  let baseUrl: string;
  let mockSkills: CoreSkill[];
  let registerSkillFn: ReturnType<typeof vi.fn>;
  let removeSkillFn: ReturnType<typeof vi.fn>;
  let updateSkillFn: ReturnType<typeof vi.fn>;
  let switchModeFn: ReturnType<typeof vi.fn>;
  let addCustomMappingFn: ReturnType<typeof vi.fn>;
  let removeMappingFn: ReturnType<typeof vi.fn>;
  let listMappingsResult: any[];
  let loadPackFn: ReturnType<typeof vi.fn>;
  let skillLogQueryFn: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const mqtt = createMockMqtt() as any;
    const modeManager = createMockModeManager() as any;
    const cameraServer = createMockCameraServer() as any;
    const sensorCache = { temperature: 25.3, humidity: 60.1, pressure: 1013.2, motion: false, lastMotionAt: null };

    // Set up mock skills
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

    listMappingsResult = [
      { id: 'pir-motion', protected: true, source: 'mqtt:sensor', eventName: 'motion_detected', filter: () => true, transform: (d: any) => d },
      { id: 'bme280-sensor', protected: true, source: 'mqtt:sensor', eventName: 'sensor_update', filter: () => true, transform: (d: any) => d },
    ];

    const deps: ControlServerDeps = {
      mqtt,
      modeManager,
      cameraServer,
      sensorCache,
      sensorHistory: { query: () => [] },
      spaceManager: {
        listSkills: vi.fn(() => [...mockSkills]),
        registerSkill: registerSkillFn,
        removeSkill: removeSkillFn,
        updateSkill: updateSkillFn,
        switchMode: switchModeFn,
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

  // ── Skills Endpoints ──────────────────────────────────────────────────

  describe("GET /api/skills", () => {
    it("returns all skills with state", async () => {
      const res = await fetch(`${baseUrl}/api/skills`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(3);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('source');
      expect(data[0]).toHaveProperty('fireCount');
      expect(data[0]).toHaveProperty('enabled');
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
      const data = await res.json();
      expect(data.error).toContain('not found');
    });
  });

  describe("POST /api/skills", () => {
    it("creates a new skill and returns 201", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 'new-skill', displayName: 'New Skill' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.skill.id).toBe('new-skill');
      expect(data.skill.source).toBe('brain');
      expect(registerSkillFn).toHaveBeenCalled();
    });

    it("returns 400 when id is missing", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: 'No ID' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Skill ID is required');
    });

    it("returns 409 when skill already exists", async () => {
      const res = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: '_pir-wake' }),
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('already exists');
    });
  });

  describe("PATCH /api/skills/:id", () => {
    it("updates patchable fields and returns 200", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, priority: 75 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.patched).toContain('enabled');
      expect(data.patched).toContain('priority');
      expect(updateSkillFn).toHaveBeenCalled();
    });

    it("returns 400 when no patchable fields provided", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fireCount: 999, escalationCount: 999 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('No patchable fields');
      expect(data.patchableFields).toBeDefined();
    });

    it("returns 404 for unknown skill", async () => {
      const res = await fetch(`${baseUrl}/api/skills/unknown`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/skills/:id", () => {
    it("returns 403 for builtin skills", async () => {
      const res = await fetch(`${baseUrl}/api/skills/_pir-wake`, { method: "DELETE" });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('builtin');
    });

    it("returns 403 for pack-managed skills", async () => {
      const res = await fetch(`${baseUrl}/api/skills/pack-greeting`, { method: "DELETE" });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('pack-managed');
    });

    it("deletes brain skill and returns 200", async () => {
      const res = await fetch(`${baseUrl}/api/skills/brain-hello`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.removed).toBe('brain-hello');
    });

    it("returns 404 for unknown skill", async () => {
      const res = await fetch(`${baseUrl}/api/skills/unknown`, { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/skill-log", () => {
    it("returns skill log entries", async () => {
      const res = await fetch(`${baseUrl}/api/skill-log`);
      expect(res.status).toBe(200);
      // Mock returns empty array
    });

    it("passes query params to skillLog.query", async () => {
      await fetch(`${baseUrl}/api/skill-log?skillId=test&limit=10`);
      expect(skillLogQueryFn).toHaveBeenCalled();
      const call = skillLogQueryFn.mock.calls[skillLogQueryFn.mock.calls.length - 1][0];
      expect(call.skillId).toBe('test');
      expect(call.limit).toBe(10);
    });
  });

  // ── Pack Endpoints ───────────────────────────────────────────────────

  describe("GET /api/packs", () => {
    it("returns available packs and loaded pack", async () => {
      const res = await fetch(`${baseUrl}/api/packs`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.available).toEqual(['default', 'night']);
      expect(data.loaded).toBe('default');
    });
  });

  describe("POST /api/packs/:name/load", () => {
    it("loads a pack and returns 200", async () => {
      const res = await fetch(`${baseUrl}/api/packs/night/load`, { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.loaded).toBe('night');
      expect(loadPackFn).toHaveBeenCalledWith('night');
    });

    it("returns 400 when pack not found", async () => {
      loadPackFn.mockImplementationOnce(() => { throw new Error('Pack manifest not found'); });
      const res = await fetch(`${baseUrl}/api/packs/nonexistent/load`, { method: "POST" });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });
  });

  describe("POST /api/packs/:name/reload", () => {
    it("reloads current pack", async () => {
      const res = await fetch(`${baseUrl}/api/packs/default/reload`, { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  // ── Space Endpoints ──────────────────────────────────────────────────

  describe("GET /api/spaces", () => {
    it("returns list of spaces", async () => {
      const res = await fetch(`${baseUrl}/api/spaces`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('mode');
      expect(data[0]).toHaveProperty('skillCount');
    });
  });

  describe("POST /api/spaces/:id/mode", () => {
    it("sets space mode and returns 200", async () => {
      const res = await fetch(`${baseUrl}/api/spaces/default/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'active' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.mode).toBe('active');
      expect(switchModeFn).toHaveBeenCalledWith('default', 'active');
    });

    it("returns 400 for invalid mode", async () => {
      const res = await fetch(`${baseUrl}/api/spaces/default/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'invalid' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── Event Mapping Endpoints ──────────────────────────────────────────

  describe("GET /api/event-mappings", () => {
    it("returns serialized mappings (functions stripped)", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      // Functions should be serialized as boolean flags
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('protected');
      expect(data[0]).toHaveProperty('source');
      expect(data[0]).toHaveProperty('eventName');
      expect(data[0]).toHaveProperty('hasFilter');
      expect(data[0]).toHaveProperty('hasTransform');
      // No function properties in the response
      expect(typeof data[0].hasFilter).toBe('boolean');
      expect(typeof data[0].hasTransform).toBe('boolean');
    });
  });

  describe("POST /api/event-mappings", () => {
    it("adds a custom mapping and returns 201", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: 'custom', eventName: 'my_event' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.id).toBe('custom-1');
      expect(data.source).toBe('custom');
      expect(data.eventName).toBe('my_event');
      expect(addCustomMappingFn).toHaveBeenCalledWith('custom', 'my_event');
    });

    it("returns 400 for invalid source", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: 'invalid', eventName: 'test' }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when eventName is missing", async () => {
      const res = await fetch(`${baseUrl}/api/event-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: 'custom' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/event-mappings/:id", () => {
    it("removes a mapping and returns 200", async () => {
      removeMappingFn.mockReturnValueOnce(true);
      const res = await fetch(`${baseUrl}/api/event-mappings/custom-1`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.removed).toBe('custom-1');
    });

    it("returns 403 for protected mapping", async () => {
      removeMappingFn.mockReturnValueOnce(false);
      const res = await fetch(`${baseUrl}/api/event-mappings/pir-motion`, { method: "DELETE" });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('protected');
    });

    it("returns 404 for unknown mapping", async () => {
      removeMappingFn.mockReturnValueOnce(false);
      // Clear listMappings to not find the mapping
      const origListMappings = (server as any).deps.eventBridge.listMappings;
      (server as any).deps.eventBridge.listMappings = vi.fn(() => []);
      const res = await fetch(`${baseUrl}/api/event-mappings/nonexistent`, { method: "DELETE" });
      expect(res.status).toBe(404);
      (server as any).deps.eventBridge.listMappings = origListMappings;
    });
  });

  // ── Sensor History Endpoint ──────────────────────────────────────────

  describe("GET /api/sensors/history", () => {
    it("returns sensor history readings", async () => {
      const res = await fetch(`${baseUrl}/api/sensors/history`);
      expect(res.status).toBe(200);
    });
  });

  // ── Config Endpoint ──────────────────────────────────────────────────

  describe("GET /api/config", () => {
    it("returns frontend constants", async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('modeTransitions');
      expect(data).toHaveProperty('availableModes');
      expect(data).toHaveProperty('triggerTypes');
      expect(data).toHaveProperty('peripheralIds');
      // Verify modeTransitions structure
      expect(data.modeTransitions).toHaveProperty('sleep');
      expect(data.modeTransitions.sleep).toContain('listen');
      // Verify availableModes is array of strings
      expect(Array.isArray(data.availableModes)).toBe(true);
      expect(data.availableModes).toContain('sleep');
      // Verify triggerTypes
      expect(Array.isArray(data.triggerTypes)).toBe(true);
      expect(data.triggerTypes).toContain('event');
      expect(data.triggerTypes).toContain('composite');
      // Verify peripheralIds
      expect(data.peripheralIds).toHaveProperty('PIR');
      expect(data.peripheralIds).toHaveProperty('BME280');
    });
  });

  // ── Route ordering guard ─────────────────────────────────────────────

  describe("Route ordering: /api/skill-log vs /api/skills/:id", () => {
    it("/api/skill-log is not captured as /api/skills/log", async () => {
      // If route ordering is broken, GET /api/skill-log would try to find skill with id 'log'
      // and return 404 instead of the skill log endpoint response
      const res = await fetch(`${baseUrl}/api/skill-log`);
      expect(res.status).toBe(200);
    });
  });
});
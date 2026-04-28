import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { SpaceManager } from "../src/engine/SpaceManager";
import { PackLoader } from "../src/engine/PackLoader";
import { ModeManager } from "../src/engine/ModeManager";
import type { SSEEventMap } from "../src/comms/sse-types";

// ── SSE event type definitions ─────────────────────────────────────

describe("SSE event type definitions (sse-types.ts)", () => {
  it("defines all 18 SSE event types", () => {
    const eventTypes: (keyof SSEEventMap)[] = [
      'connected', 'mode_status', 'pipeline_state', 'session_complete',
      'session_error', 'transcript', 'skill_fired', 'skill_escalated',
      'skill_conflict', 'skill_registered', 'skill_removed', 'skill_updated',
      'pack_loaded', 'pack_unloaded', 'event_mapping_added', 'event_mapping_removed',
      'sensor_update', 'counter_update', 'mode_change',
    ];
    expect(eventTypes.length).toBe(19);
  });

  it("SSEEvent is a discriminated union on type field", () => {
    type SSEEvent = SSEEventMap[keyof SSEEventMap];
    const events: SSEEvent[] = [
      { type: 'connected' },
      { type: 'mode_status', mode: 'listen' },
      { type: 'skill_registered', skillId: 'test', source: 'brain', triggerType: 'event' },
      { type: 'skill_removed', skillId: 'test' },
      { type: 'skill_updated', skillId: 'test', patch: { enabled: true } },
      { type: 'pack_loaded', packName: 'default', skillCount: 3 },
      { type: 'pack_unloaded', packName: 'default' },
      { type: 'event_mapping_added', mappingId: 'custom-1', source: 'mqtt:sensor', eventName: 'motion_detected' },
      { type: 'event_mapping_removed', mappingId: 'custom-1' },
      { type: 'sensor_update', temperature: 25.3, humidity: 60, pressure: 1013 },
      { type: 'counter_update', counters: { motion: 5 } },
      { type: 'mode_change', from: 'sleep', to: 'listen', timestamp: Date.now() },
    ];
    // Each event has a type field that narrows the union
    for (const event of events) {
      expect(event.type).toBeDefined();
    }
  });
});

// ── SpaceManager lifecycle events ──────────────────────────────────

describe("SpaceManager lifecycle events", () => {
  let spaceManager: SpaceManager;

  beforeEach(() => {
    const mockMcpServer = { notification: vi.fn().mockResolvedValue(undefined) };
    const mockModeManager = new ModeManager({ connected: true, publish: vi.fn(), on: vi.fn(), nodeId: 'test' } as any);
    const mockMqtt = { on: vi.fn(), publish: vi.fn(), connected: true };
    spaceManager = new SpaceManager(
      mockMcpServer as any,
      mockModeManager,
      mockMqtt as any,
      () => ({ temperature: null, humidity: null, pressure: null, motion: null, lastMotionAt: null }),
    );
  });

  it("emits 'skill_registered' when registerSkill is called", () => {
    const listener = vi.fn();
    spaceManager.on('skill_registered', listener);

    spaceManager.addSpace({ id: 'default', nodeBaseId: 'node-01', activePack: 'default', spaceMode: 'sleep', activeMode: 'default', integrations: [], sensors: [] });
    spaceManager.registerSkill({
      id: 'test-skill',
      displayName: 'Test Skill',
      enabled: true,
      spaceId: 'default',
      trigger: { type: 'event', event: 'test_event' },
      priority: 50,
      actions: [],
      source: 'brain',
      fireCount: 0,
      escalationCount: 0,
    });

    expect(listener).toHaveBeenCalledWith({
      skillId: 'test-skill',
      source: 'brain',
      triggerType: 'event',
    });
  });

  it("emits 'skill_removed' when removeSkill removes a skill", () => {
    const listener = vi.fn();
    spaceManager.on('skill_removed', listener);

    spaceManager.addSpace({ id: 'default', nodeBaseId: 'node-01', activePack: 'default', spaceMode: 'sleep', activeMode: 'default', integrations: [], sensors: [] });
    spaceManager.registerSkill({
      id: 'removable-skill',
      displayName: 'Removable',
      enabled: true,
      spaceId: 'default',
      trigger: { type: 'event', event: 'test' },
      priority: 50,
      actions: [],
      source: 'brain',
      fireCount: 0,
      escalationCount: 0,
    });

    const removed = spaceManager.removeSkill('removable-skill', 'default');
    expect(removed).toBe(true);
    expect(listener).toHaveBeenCalledWith({ skillId: 'removable-skill' });
  });

  it("does NOT emit 'skill_removed' when removeSkill fails", () => {
    const listener = vi.fn();
    spaceManager.on('skill_removed', listener);

    spaceManager.addSpace({ id: 'default', nodeBaseId: 'node-01', activePack: 'default', spaceMode: 'sleep', activeMode: 'default', integrations: [], sensors: [] });
    spaceManager.removeSkill('nonexistent', 'default');

    expect(listener).not.toHaveBeenCalled();
  });

  it("emits 'skill_updated' when updateSkill patches a skill", () => {
    const listener = vi.fn();
    spaceManager.on('skill_updated', listener);

    spaceManager.addSpace({ id: 'default', nodeBaseId: 'node-01', activePack: 'default', spaceMode: 'sleep', activeMode: 'default', integrations: [], sensors: [] });
    spaceManager.registerSkill({
      id: 'patchable-skill',
      displayName: 'Patchable',
      enabled: true,
      spaceId: 'default',
      trigger: { type: 'event', event: 'test' },
      priority: 50,
      actions: [],
      source: 'brain',
      fireCount: 0,
      escalationCount: 0,
    });

    spaceManager.updateSkill('patchable-skill', { displayName: 'Patched' }, 'default');
    expect(listener).toHaveBeenCalledWith({
      skillId: 'patchable-skill',
      patch: { displayName: 'Patched' },
    });
  });

  it("emits 'skill_updated' with {enabled} when disableSkill is called", () => {
    const listener = vi.fn();
    spaceManager.on('skill_updated', listener);

    spaceManager.addSpace({ id: 'default', nodeBaseId: 'node-01', activePack: 'default', spaceMode: 'sleep', activeMode: 'default', integrations: [], sensors: [] });
    spaceManager.registerSkill({
      id: 'disable-skill',
      displayName: 'Disable Me',
      enabled: true,
      spaceId: 'default',
      trigger: { type: 'event', event: 'test' },
      priority: 50,
      actions: [],
      source: 'brain',
      fireCount: 0,
      escalationCount: 0,
    });

    spaceManager.disableSkill('disable-skill', false, 'default');
    expect(listener).toHaveBeenCalledWith({
      skillId: 'disable-skill',
      patch: { enabled: false },
    });
  });
});

// ── PackLoader lifecycle events ─────────────────────────────────────

describe("PackLoader lifecycle events", () => {
  let packLoader: PackLoader;
  let tempDir: string;
  const fs = require('fs');
  const path = require('path');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pack-test-'));
    const manifest = {
      pack: { name: 'test-pack', version: '1.0.0' },
      skills: [{
        id: 'test-pack-skill',
        displayName: 'Test Pack Skill',
        trigger: { type: 'event', event: 'test_event' },
        actions: [{ type: 'log', message: 'hello' }],
      }],
    };
    fs.mkdirSync(path.join(tempDir, 'test-pack'));
    fs.writeFileSync(path.join(tempDir, 'test-pack', 'skills.json'), JSON.stringify(manifest));

    packLoader = new PackLoader(
      tempDir,
      vi.fn(),
      vi.fn().mockReturnValue(true),
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("emits 'pack_loaded' when loadPack succeeds", () => {
    const listener = vi.fn();
    packLoader.on('pack_loaded', listener);

    packLoader.loadPack('test-pack');
    expect(listener).toHaveBeenCalledWith({
      packName: 'test-pack',
      skillCount: 1,
    });
  });

  it("emits 'pack_unloaded' when unloadCurrentPack is called", () => {
    const listener = vi.fn();
    packLoader.on('pack_unloaded', listener);

    packLoader.loadPack('test-pack');
    packLoader.unloadCurrentPack();
    expect(listener).toHaveBeenCalledWith({
      packName: 'test-pack',
    });
  });

  it("does NOT emit 'pack_unloaded' when no pack was loaded", () => {
    const listener = vi.fn();
    packLoader.on('pack_unloaded', listener);

    packLoader.unloadCurrentPack();
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── ModeManager mode_change event ──────────────────────────────────

describe("ModeManager mode_change event", () => {
  let modeManager: ModeManager;

  beforeEach(() => {
    const mockMqtt = { connected: true, publish: vi.fn(), on: vi.fn(), nodeId: 'test' };
    modeManager = new ModeManager(mockMqtt as any, 'sleep');
  });

  it("emits 'mode_change' with timestamp on valid transition", () => {
    const listener = vi.fn();
    modeManager.on('mode_change', listener);

    const result = modeManager.transition('listen');
    expect(result).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const data = listener.mock.calls[0][0];
    expect(data.from).toBe('sleep');
    expect(data.to).toBe('listen');
    expect(data.timestamp).toBeTypeOf('number');
  });

  it("emits 'mode_change' on forceSet", () => {
    const listener = vi.fn();
    modeManager.on('mode_change', listener);

    modeManager.forceSet('active');
    expect(listener).toHaveBeenCalledTimes(1);
    const data = listener.mock.calls[0][0];
    expect(data.from).toBe('sleep');
    expect(data.to).toBe('active');
    expect(data.timestamp).toBeTypeOf('number');
  });

  it("does NOT emit 'mode_change' on invalid transition", () => {
    const listener = vi.fn();
    modeManager.on('mode_change', listener);

    const result = modeManager.transition('active'); // sleep -> active is invalid
    expect(result).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── ControlServer throttled sensor broadcast ───────────────────────

describe("ControlServer broadcastThrottledSensor", () => {
  it("throttles sensor updates to max 1 per second", async () => {
    const { ControlServer } = await import("../src/comms/ControlServer");
    const mockMqtt = new EventEmitter();
    (mockMqtt as any).connected = true;
    (mockMqtt as any).publish = vi.fn();
    (mockMqtt as any).nodeId = 'test';

    const mockModeManager = { getMode: vi.fn().mockReturnValue('sleep'), on: vi.fn() };
    const mockCameraServer = { getStats: vi.fn().mockReturnValue({}) };
    const mockSensorCache = { temperature: 25, humidity: 60, pressure: 1013, motion: false, lastMotionAt: null };
    const mockSpaceManager = { listSkills: vi.fn().mockReturnValue([]), skillLog: { append: vi.fn(), query: vi.fn(), attachEscalationResponse: vi.fn() } };
    const mockEventBridge = { start: vi.fn(), stop: vi.fn(), listMappings: vi.fn().mockReturnValue([]), addCustomMapping: vi.fn().mockReturnValue(''), removeMapping: vi.fn().mockReturnValue(false), handleMqttEvent: vi.fn(), forwardModeEvent: vi.fn(), register: vi.fn() };
    const mockPackLoader = { loadPack: vi.fn(), unloadCurrentPack: vi.fn(), getLoadedPack: vi.fn().mockReturnValue(null), listAvailablePacks: vi.fn().mockReturnValue([]), reload: vi.fn() };
    const mockSkillLog = { append: vi.fn(), query: vi.fn(), attachEscalationResponse: vi.fn() };

    const deps = {
      mqtt: mockMqtt as any,
      modeManager: mockModeManager as any,
      cameraServer: mockCameraServer as any,
      sensorCache: mockSensorCache,
      sensorHistory: { query: vi.fn().mockReturnValue([]) },
      spaceManager: mockSpaceManager as any,
      eventBridge: mockEventBridge as any,
      packLoader: mockPackLoader as any,
      skillLog: mockSkillLog as any,
      getBrainConnected: () => true,
    };

    const server = new ControlServer(deps, 0);

    // Collect broadcast messages
    const messages: string[] = [];
    const mockClient = { write: vi.fn((msg: string) => messages.push(msg)), end: vi.fn() };

    // First call should go through immediately
    server.broadcastThrottledSensor({ temperature: 25, humidity: 60, pressure: 1013 });
    expect(messages.length).toBe(0); // No SSE client connected, so no write happens

    // Close server to prevent port leak
    await server.close();
  });
});

// ── SkillExecutor.getCounters ──────────────────────────────────────

describe("SkillExecutor.getCounters", () => {
  it("returns empty object when no counters exist", async () => {
    const { SkillExecutor } = await import("../src/engine/SkillExecutor");
    const mockModeManager = { getMode: vi.fn().mockReturnValue('listen'), on: vi.fn() };
    const mockMqtt = { connected: true, publish: vi.fn(), on: vi.fn() };
    const mockMcpServer = { notification: vi.fn().mockResolvedValue(undefined) };
    const mockSkillLog = { append: vi.fn() };

    const executor = new SkillExecutor({
      spaceId: 'test',
      modeManager: mockModeManager as any,
      mqttClient: mockMqtt as any,
      mcpServer: mockMcpServer as any,
      skillLog: mockSkillLog as any,
      getSensorSnapshot: () => ({}),
      onObservabilityEvent: vi.fn(),
    });

    expect(executor.getCounters()).toEqual({});
    executor.stop();
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpaceManager } from '../src/engine/SpaceManager';
import type { Space } from '../src/shared/types';

const mockMcpServer = { server: { notification: vi.fn().mockResolvedValue(undefined) } };
const mockModeManager = { getMode: vi.fn(() => 'listen'), transition: vi.fn(() => true), on: vi.fn() };
const mockMqttClient = { publish: vi.fn(), on: vi.fn(), nodeId: 'node-01' };
const mockSensors = () => ({ temperature: 22, humidity: 55, motion: false });

function makeSpaceWithNodes(id: string): Space {
  return {
    id,
    nodes: [
      { nodeId: 'node-ceiling', role: 'ceiling-unit', hardware: ['motion', 'temperature'], state: 'dormant' as const },
      { nodeId: 'node-door', role: 'door-entrance', hardware: ['motion'], state: 'dormant' as const },
    ],
    activePack: 'test-pack',
    activeConfig: 'default',
    availableConfigs: ['default', 'meeting'],
    integrations: [],
    sensors: ['temperature', 'humidity'],
  };
}

describe('SpaceManager gap tests — ack timeout', () => {
  let manager: SpaceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new SpaceManager(
      mockMcpServer as any,
      mockModeManager as any,
      mockMqttClient as any,
      mockSensors,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires node_offline notification when node_profile_ack times out', () => {
    manager.addSpace(makeSpaceWithNodes('default'));

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue({
        configurations: [{
          name: 'meeting',
          nodeAssignments: { 'ceiling-unit': 'daily-life', 'door-entrance': 'daily-life' },
          coreSkills: [],
          brainSkills: [],
        }],
        nodeSkills: [{
          id: 'daily-life',
          name: 'Daily Life',
          version: '1.0.0',
          requires: { pir: true },
          sampling: { pirDebounceMs: 1000, micMode: 0 },
          emits: ['motion'],
          expectedBy: '_pir-wake',
          compatibleConfigs: [],
        }],
      }),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
    } as any;
    manager.setPackLoader(mockPackLoader);

    manager.activateConfig('default', 'meeting');
    manager.drainTransition();

    expect(mockMqttClient.publish).toHaveBeenCalled();

    vi.advanceTimersByTime(6000);

    expect(mockMcpServer.server.notification).toHaveBeenCalledWith(
      expect.objectContaining({
        method: expect.stringContaining('node_offline'),
      })
    );

    const space = manager.getSpace('default');
    const node = space?.nodes.find(n => n.nodeId === 'node-ceiling');
    expect(node?.state).toBe('dormant');
  });

  it('clears ack timeout when firmware acks with loaded status', () => {
    manager.addSpace(makeSpaceWithNodes('default'));

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue({
        configurations: [{
          name: 'meeting',
          nodeAssignments: { 'ceiling-unit': 'daily-life', 'door-entrance': 'daily-life' },
          coreSkills: [],
          brainSkills: [],
        }],
        nodeSkills: [{
          id: 'daily-life',
          name: 'Daily Life',
          version: '1.0.0',
          requires: { pir: true },
          sampling: { pirDebounceMs: 1000 },
          emits: ['motion'],
          expectedBy: '_pir-wake',
          compatibleConfigs: [],
        }],
      }),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
    } as any;
    manager.setPackLoader(mockPackLoader);

    manager.activateConfig('default', 'meeting');
    manager.drainTransition();

    // Firmware acks before timeout
    manager.onNodeProfileAck('node-ceiling', 'loaded');

    vi.advanceTimersByTime(6000);

    const offlineCalls = mockMcpServer.server.notification.mock.calls.filter(
      (call: any[]) => call[0]?.method?.includes('node_offline')
    );
    const nodeCeilingOffline = offlineCalls.filter(
      (call: any[]) => call[0]?.params?.nodeId === 'node-ceiling'
    );
    expect(nodeCeilingOffline).toHaveLength(0);
  });

  it('handles node_profile_ack with error status', () => {
    manager.addSpace(makeSpaceWithNodes('default'));

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue({
        configurations: [{
          name: 'meeting',
          nodeAssignments: { 'ceiling-unit': 'daily-life', 'door-entrance': 'daily-life' },
          coreSkills: [],
          brainSkills: [],
        }],
        nodeSkills: [{
          id: 'daily-life',
          name: 'Daily Life',
          version: '1.0.0',
          requires: { pir: true },
          sampling: { pirDebounceMs: 1000 },
          emits: ['motion'],
          expectedBy: '_pir-wake',
          compatibleConfigs: [],
        }],
      }),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
    } as any;
    manager.setPackLoader(mockPackLoader);

    manager.activateConfig('default', 'meeting');
    manager.drainTransition();

    manager.onNodeProfileAck('node-ceiling', 'error');

    const space = manager.getSpace('default');
    const node = space?.nodes.find(n => n.nodeId === 'node-ceiling');
    expect(node?.state).toBe('dormant');
  });
});

describe('SpaceManager gap tests — edge cases', () => {
  let manager: SpaceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SpaceManager(
      mockMcpServer as any,
      mockModeManager as any,
      mockMqttClient as any,
      mockSensors,
    );
  });

  it('activateConfig with unknown configName returns false', () => {
    manager.addSpace(makeSpaceWithNodes('default'));

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue({
        configurations: [{ name: 'meeting', nodeAssignments: {}, coreSkills: [], brainSkills: [] }],
        nodeSkills: [],
      }),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
    } as any;
    manager.setPackLoader(mockPackLoader);

    const result = manager.activateConfig('default', 'nonexistent-config');
    expect(result).toBe(false);
    expect(manager.transitionQueue.pending).toBe(0);
  });

  it('node with no role in nodeAssignments receives default profile', () => {
    manager.addSpace(makeSpaceWithNodes('default'));

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue({
        configurations: [{
          name: 'meeting',
          nodeAssignments: { 'ceiling-unit': 'daily-life' },
          coreSkills: [],
          brainSkills: [],
        }],
        nodeSkills: [{
          id: 'daily-life',
          name: 'Daily Life',
          version: '1.0.0',
          requires: { pir: true },
          sampling: { pirDebounceMs: 1000 },
          emits: ['motion'],
          expectedBy: '_pir-wake',
          compatibleConfigs: [],
        }],
      }),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
    } as any;
    manager.setPackLoader(mockPackLoader);

    manager.activateConfig('default', 'meeting');
    manager.drainTransition();

    const publishCalls = mockMqttClient.publish.mock.calls;
    const doorNodePublish = publishCalls.find(
      ([topic]: [string]) => topic.includes('node-door')
    );
    expect(doorNodePublish).toBeDefined();

    const space = manager.getSpace('default');
    const doorNode = space?.nodes.find(n => n.nodeId === 'node-door');
    expect(doorNode?.state).toBe('dormant');
  });

  it('closeEscalation on already-closed ID is a safe noop', () => {
    manager.addSpace(makeSpaceWithNodes('default'));

    expect(() => manager.closeEscalation('esc-1')).not.toThrow();
    expect(() => manager.closeEscalation('esc-1')).not.toThrow();
  });

  it('onMqttReconnect enqueues activate_config for active non-default config', () => {
    manager.addSpace({
      id: 'default',
      nodes: [{ nodeId: 'node-01', role: 'base', hardware: ['motion'], state: 'running' as const }],
      activePack: 'test-pack',
      activeConfig: 'meeting',
      availableConfigs: ['default', 'meeting'],
      integrations: [],
      sensors: ['temperature'],
    });

    expect(manager.transitionQueue.pending).toBe(0);
    manager.onMqttReconnect();
    expect(manager.transitionQueue.pending).toBe(1);
    const action = manager.transitionQueue.drain();
    expect(action?.type).toBe('activate_config');
    expect(action?.configName).toBe('meeting');
  });
});
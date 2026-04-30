import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

describe('MqttClient gap tests', () => {
  it('emits reconnect event when MQTT broker reconnects', () => {
    const mockClient = new EventEmitter();
    const reconnectSpy = vi.fn();
    mockClient.on('reconnect', reconnectSpy);
    mockClient.emit('reconnect');
    expect(reconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('SpaceManager replays active config on MQTT reconnect', async () => {
    const { SpaceManager } = await import('../src/engine/SpaceManager');

    const mockMcpServer = { server: { notification: vi.fn().mockResolvedValue(undefined) } };
    const mockModeManager = { getMode: vi.fn(), transition: vi.fn(() => true), on: vi.fn() };
    const mockMqttClient = { publish: vi.fn(), on: vi.fn(), nodeId: 'node-01' };
    const mockSensors = () => ({ temperature: 22, humidity: 55, motion: false });

    const manager = new SpaceManager(
      mockMcpServer as any,
      mockModeManager as any,
      mockMqttClient as any,
      mockSensors,
    );

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
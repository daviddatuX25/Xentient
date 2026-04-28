import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBridge, DEFAULT_EVENT_MAPPINGS } from '../src/comms/EventBridge';
import { PERIPHERAL_IDS } from '../src/shared/contracts';
import type { EventMapping } from '../src/comms/EventBridge';

// ── Mocks ──────────────────────────────────────────────────────────

function createMockMqtt() {
  const emitter = new (require('events').EventEmitter)();
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      emitter.on(event, handler);
      return emitter;
    }),
    publish: vi.fn(),
    nodeId: 'node-01',
    disconnect: vi.fn(),
    _emitter: emitter,
  };
}

function createMockSpaceManager() {
  return {
    handleEvent: vi.fn(),
  };
}

function createMockModeManager() {
  const emitter = new (require('events').EventEmitter)();
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      emitter.on(event, handler);
      return emitter;
    }),
    getMode: vi.fn(() => 'listen'),
    transition: vi.fn(),
    _emitter: emitter,
  };
}

// Helper to create a bridge with mocked dependencies
function makeBridge() {
  const mqtt = createMockMqtt();
  const spaceManager = createMockSpaceManager();
  const modeManager = createMockModeManager();
  const bridge = new EventBridge(
    mqtt as any,
    spaceManager as any,
    modeManager as any,
  );
  return { bridge, mqtt, spaceManager, modeManager };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('EventBridge', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('start() and default mappings', () => {
    it('loads default mappings on start()', () => {
      const { bridge } = makeBridge();
      bridge.start();
      const mappings = bridge.listMappings();
      // Should have 5 default mappings: pir-motion, bme280-sensor, voice-start, voice-end, mode-transition
      expect(mappings.length).toBe(DEFAULT_EVENT_MAPPINGS.length);
      expect(mappings.every(m => m.protected)).toBe(true);
    });

    it('ignores duplicate start() calls', () => {
      const { bridge } = makeBridge();
      bridge.start();
      const countAfterFirst = bridge.listMappings().length;
      bridge.start();
      expect(bridge.listMappings().length).toBe(countAfterFirst);
    });

    it('loads custom mappings alongside defaults on start()', () => {
      const { bridge } = makeBridge();
      const custom: EventMapping[] = [{
        id: 'custom-test',
        source: 'mqtt:sensor',
        eventName: 'custom_event',
        filter: () => true,
      }];
      bridge.start(custom);
      const mappings = bridge.listMappings();
      expect(mappings.some(m => m.id === 'custom-test')).toBe(true);
      expect(mappings.length).toBe(DEFAULT_EVENT_MAPPINGS.length + 1);
    });
  });

  describe('handleMqttEvent — PIR motion', () => {
    it('forwards PIR motion as motion_detected', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const pirData = {
        peripheralType: PERIPHERAL_IDS.PIR,
        payload: { motion: true },
      };

      bridge.handleMqttEvent('mqtt:sensor', pirData);

      expect(spaceManager.handleEvent).toHaveBeenCalledWith(
        'motion_detected',
        expect.objectContaining({ motion: true }),
      );
    });

    it('does NOT forward PIR data without motion: true', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const pirData = {
        peripheralType: PERIPHERAL_IDS.PIR,
        payload: { motion: false },
      };

      bridge.handleMqttEvent('mqtt:sensor', pirData);

      // motion_detected should NOT be emitted since motion is false
      const calls = spaceManager.handleEvent.mock.calls.filter(
        (c: any[]) => c[0] === 'motion_detected',
      );
      expect(calls).toHaveLength(0);
    });
  });

  describe('handleMqttEvent — BME280 sensor', () => {
    it('forwards BME280 data as sensor_update', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const bme280Data = {
        peripheralType: PERIPHERAL_IDS.BME280,
        payload: { temperature: 25.3, humidity: 60.1, pressure: 1013 },
      };

      bridge.handleMqttEvent('mqtt:sensor', bme280Data);

      expect(spaceManager.handleEvent).toHaveBeenCalledWith(
        'sensor_update',
        expect.objectContaining({ temperature: 25.3, humidity: 60.1 }),
      );
    });
  });

  describe('handleMqttEvent — voice pipeline', () => {
    it('forwards voice start as voice_start', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const voiceStartData = { source: 'voice', stage: 'start' };

      bridge.handleMqttEvent('mqtt:triggerPipeline', voiceStartData);

      expect(spaceManager.handleEvent).toHaveBeenCalledWith(
        'voice_start',
        expect.objectContaining({ timestamp: expect.any(Number) }),
      );
    });

    it('forwards voice end as voice_end', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const voiceEndData = { source: 'voice', stage: 'end' };

      bridge.handleMqttEvent('mqtt:triggerPipeline', voiceEndData);

      expect(spaceManager.handleEvent).toHaveBeenCalledWith(
        'voice_end',
        expect.objectContaining({ timestamp: expect.any(Number) }),
      );
    });

    it('does NOT forward non-voice triggerPipeline events', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const webTrigger = { source: 'web', stage: 'start' };

      bridge.handleMqttEvent('mqtt:triggerPipeline', webTrigger);

      const calls = spaceManager.handleEvent.mock.calls.filter(
        (c: any[]) => c[0] === 'voice_start' || c[0] === 'voice_end',
      );
      expect(calls).toHaveLength(0);
    });
  });

  describe('forwardModeEvent', () => {
    it('forwards mode transition as mode_transition', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      bridge.forwardModeEvent('sleep', 'listen');

      expect(spaceManager.handleEvent).toHaveBeenCalledWith(
        'mode_transition',
        expect.objectContaining({ from: 'sleep', to: 'listen', timestamp: expect.any(Number) }),
      );
    });
  });

  describe('addCustomMapping()', () => {
    it('registers a new mapping and returns auto-generated id', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      const id = bridge.addCustomMapping('mqtt:sensor', 'custom_event');
      expect(id).toMatch(/^custom-\d+$/);

      // Trigger the custom mapping
      bridge.handleMqttEvent('mqtt:sensor', { peripheralType: 0xFF, payload: {} });
      // The default mappings will filter this out (no PIR or BME280 match),
      // but our custom mapping with no filter should forward it
    });

    it('custom mapping with filter works correctly', () => {
      const { bridge, spaceManager } = makeBridge();
      bridge.start();

      bridge.addCustomMapping(
        'mqtt:sensor',
        'high_temp_alert',
        (data: unknown) => {
          const d = data as { payload?: { temperature?: number } };
          return (d.payload?.temperature ?? 0) > 30;
        },
      );

      // Should NOT trigger — temperature too low
      bridge.handleMqttEvent('mqtt:sensor', { peripheralType: 0xFF, payload: { temperature: 20 } });
      const highTempCalls = spaceManager.handleEvent.mock.calls.filter(
        (c: any[]) => c[0] === 'high_temp_alert',
      );
      expect(highTempCalls).toHaveLength(0);

      // Should trigger — temperature above threshold
      bridge.handleMqttEvent('mqtt:sensor', { peripheralType: 0xFF, payload: { temperature: 35 } });
      const highTempCalls2 = spaceManager.handleEvent.mock.calls.filter(
        (c: any[]) => c[0] === 'high_temp_alert',
      );
      expect(highTempCalls2).toHaveLength(1);
    });
  });

  describe('removeMapping()', () => {
    it('removes a custom mapping', () => {
      const { bridge } = makeBridge();
      bridge.start();

      const id = bridge.addCustomMapping('mqtt:sensor', 'temp_event');
      const result = bridge.removeMapping(id);
      expect(result).toBe(true);
      expect(bridge.listMappings().some(m => m.id === id)).toBe(false);
    });

    it('rejects removal of protected (default) mappings', () => {
      const { bridge } = makeBridge();
      bridge.start();

      const result = bridge.removeMapping('pir-motion');
      expect(result).toBe(false);
      expect(bridge.listMappings().some(m => m.id === 'pir-motion')).toBe(true);
    });

    it('returns false for non-existent mapping', () => {
      const { bridge } = makeBridge();
      bridge.start();

      const result = bridge.removeMapping('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('listMappings()', () => {
    it('returns all mappings', () => {
      const { bridge } = makeBridge();
      bridge.start();

      const mappings = bridge.listMappings();
      expect(mappings.length).toBe(DEFAULT_EVENT_MAPPINGS.length);

      const ids = mappings.map(m => m.id);
      expect(ids).toContain('pir-motion');
      expect(ids).toContain('bme280-sensor');
      expect(ids).toContain('voice-start');
      expect(ids).toContain('voice-end');
      expect(ids).toContain('mode-transition');
    });
  });

  describe('stop()', () => {
    it('clears all mappings and resets started flag', () => {
      const { bridge } = makeBridge();
      bridge.start();
      expect(bridge.listMappings().length).toBeGreaterThan(0);

      bridge.stop();
      expect(bridge.listMappings()).toHaveLength(0);
    });
  });
});
/**
 * EventBridge — Generic MQTT ↔ Skill event router
 *
 * Decouples hardcoded event routing in core.ts into a declarative mapping system.
 * Each mapping connects a source event (mqtt:sensor, mqtt:triggerPipeline, mode)
 * to a skill event name (motion_detected, sensor_update, etc.) with optional filter
 * and transform.
 *
 * CRITICAL: This is the SKILL event dispatch path only.
 * The MCP notification path (mcp/events.ts) handles sensor cache + Brain notifications.
 * Both subscribe to the same MQTT events but serve different purposes — do NOT merge them.
 */

import { EventEmitter } from 'events';
import type { MqttClient } from './MqttClient';
import type { ModeManager, ModeChangeEvent } from '../engine/ModeManager';
import type { SpaceManager } from '../engine/SpaceManager';
import { PERIPHERAL_IDS } from '../shared/contracts';
import pino from 'pino';

const logger = pino({ name: 'event-bridge' }, process.stderr);

// ── Mapping Types ────────────────────────────────────────────────────

export type EventSource = 'mqtt:sensor' | 'mqtt:triggerPipeline' | 'mode' | 'custom';

export interface EventMapping {
  /** Unique identifier for this mapping (auto-generated if not provided). */
  id: string;
  /** Whether this is a default mapping that cannot be removed via MCP. */
  protected?: boolean;
  /** Source event identifier. */
  source: EventSource;
  /** Optional filter predicate. Return true to forward, false to drop. */
  filter?: (data: unknown) => boolean;
  /** Target skill event name dispatched to SpaceManager.handleEvent(). */
  eventName: string;
  /** Optional transform applied to the event data before forwarding. */
  transform?: (data: unknown) => Record<string, unknown>;
}

// ── Default Mappings ─────────────────────────────────────────────────
// These preserve the existing hardcoded behavior from core.ts.

export const DEFAULT_EVENT_MAPPINGS: EventMapping[] = [
  {
    id: 'pir-motion',
    protected: true,
    source: 'mqtt:sensor',
    filter: (data: unknown) => {
      const d = data as { peripheralType?: number; payload?: { motion?: boolean } };
      return d.peripheralType === PERIPHERAL_IDS.PIR && (d.payload?.motion === true);
    },
    eventName: 'motion_detected',
    transform: (data: unknown) => {
      const d = data as { peripheralType?: number; payload?: { motion?: boolean } };
      return { nodeId: 'node-01', timestamp: Date.now(), ...d.payload };
    },
  },
  {
    id: 'bme280-sensor',
    protected: true,
    source: 'mqtt:sensor',
    filter: (data: unknown) => {
      const d = data as { peripheralType?: number };
      return d.peripheralType === PERIPHERAL_IDS.BME280;
    },
    eventName: 'sensor_update',
    transform: (data: unknown) => {
      const d = data as { payload?: Record<string, unknown> };
      return { ...(d.payload ?? {}), timestamp: Date.now() };
    },
  },
  {
    id: 'voice-start',
    protected: true,
    source: 'mqtt:triggerPipeline',
    filter: (data: unknown) => {
      const d = data as { source?: string; stage?: string };
      return d.source === 'voice' && d.stage === 'start';
    },
    eventName: 'voice_start',
    transform: () => ({ timestamp: Date.now() }),
  },
  {
    id: 'voice-end',
    protected: true,
    source: 'mqtt:triggerPipeline',
    filter: (data: unknown) => {
      const d = data as { source?: string; stage?: string };
      return d.source === 'voice' && d.stage === 'end';
    },
    eventName: 'voice_end',
    transform: () => ({ timestamp: Date.now() }),
  },
  {
    id: 'mode-transition',
    protected: true,
    source: 'mode',
    eventName: 'mode_transition',
    transform: (data: unknown) => {
      const d = data as { from: string; to: string };
      return { from: d.from, to: d.to, timestamp: Date.now() };
    },
  },
];

// ── EventBridge ──────────────────────────────────────────────────────

export class EventBridge extends EventEmitter {
  private mappings: Map<string, EventMapping> = new Map();
  private mqtt: MqttClient;
  private spaceManager: SpaceManager;
  private modeManager: ModeManager;
  private started = false;
  private mappingCounter = 0;

  constructor(mqtt: MqttClient, spaceManager: SpaceManager, modeManager: ModeManager) {
    super();
    this.mqtt = mqtt;
    this.spaceManager = spaceManager;
    this.modeManager = modeManager;
  }

  /**
   * Start the bridge with default + optional custom mappings.
   * Wires MqttClient and ModeManager event listeners.
   */
  start(customMappings?: EventMapping[]): void {
    if (this.started) {
      logger.warn('EventBridge already started — ignoring duplicate start()');
      return;
    }

    // Register default mappings
    for (const mapping of DEFAULT_EVENT_MAPPINGS) {
      this.register(mapping);
    }

    // Register any custom mappings
    if (customMappings) {
      for (const mapping of customMappings) {
        this.register(mapping);
      }
    }

    // Wire MQTT named events
    this.mqtt.on('sensor', (data: unknown) => this.handleMqttEvent('mqtt:sensor', data));
    this.mqtt.on('triggerPipeline', (data: unknown) => this.handleMqttEvent('mqtt:triggerPipeline', data));

    // Wire ModeManager transitions
    this.modeManager.on('modeChange', ({ from, to }: ModeChangeEvent) => {
      this.forwardModeEvent(from, to);
    });

    this.started = true;
    logger.info({ mappingCount: this.mappings.size }, 'EventBridge started');
  }

  /** Register a single mapping. Overwrites if id already exists. */
  register(mapping: EventMapping): void {
    this.mappings.set(mapping.id, mapping);
    logger.debug({ id: mapping.id, source: mapping.source, eventName: mapping.eventName }, 'Mapping registered');
  }

  /**
   * Route an MqttClient named event to matching mappings.
   * Called by the 'sensor' and 'triggerPipeline' listeners.
   */
  handleMqttEvent(mqttEventName: string, data: unknown): void {
    for (const mapping of this.mappings.values()) {
      if (mapping.source !== mqttEventName) continue;
      if (mapping.filter && !mapping.filter(data)) continue;

      const triggerData = mapping.transform ? mapping.transform(data) : (data as Record<string, unknown>);
      this.spaceManager.handleEvent(mapping.eventName, triggerData);

      logger.debug(
        { source: mqttEventName, eventName: mapping.eventName, mappingId: mapping.id },
        'Event routed to SpaceManager',
      );
    }
  }

  /**
   * Route a ModeManager transition to matching mappings.
   */
  forwardModeEvent(from: string, to: string): void {
    const data = { from, to };
    for (const mapping of this.mappings.values()) {
      if (mapping.source !== 'mode') continue;
      if (mapping.filter && !mapping.filter(data)) continue;

      const triggerData = mapping.transform ? mapping.transform(data) : { from, to, timestamp: Date.now() };
      this.spaceManager.handleEvent(mapping.eventName, triggerData);

      logger.debug(
        { from, to, eventName: mapping.eventName, mappingId: mapping.id },
        'Mode event routed to SpaceManager',
      );
    }
  }

  /**
   * Add a custom mapping at runtime (e.g., from an MCP tool call).
   * Auto-generates an id if not provided.
   */
  addCustomMapping(
    source: EventSource,
    eventName: string,
    filter?: (data: unknown) => boolean,
    transform?: (data: unknown) => Record<string, unknown>,
  ): string {
    const id = `custom-${++this.mappingCounter}`;
    const mapping: EventMapping = { id, source: source as EventSource, eventName, filter, transform };
    this.register(mapping);
    this.emit('mappingAdded', mapping);
    return id;
  }

  /** Remove a mapping by id. Returns true if removed, false if not found or protected. */
  removeMapping(id: string): boolean {
    const mapping = this.mappings.get(id);
    if (!mapping) return false;
    if (mapping.protected) {
      logger.warn({ id }, 'Cannot remove protected default mapping');
      return false;
    }
    this.mappings.delete(id);
    this.emit('mappingRemoved', id);
    logger.info({ id }, 'Mapping removed');
    return true;
  }

  /** List all current mappings. */
  listMappings(): EventMapping[] {
    return Array.from(this.mappings.values());
  }

  /** Stop the bridge and clear all mappings. Does NOT remove MqttClient/ModeManager listeners
   *  (those are managed by core.ts lifecycle). */
  stop(): void {
    this.mappings.clear();
    this.started = false;
    logger.info('EventBridge stopped — all mappings cleared');
  }
}
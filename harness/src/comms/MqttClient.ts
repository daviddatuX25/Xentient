import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'mqtt-client' }, process.stderr); // GAP-11/T-22: stderr for MCP stdio safety

export interface SensorData { temp: number; humidity: number; nodeId: string; }
export interface HeartbeatData { nodeId: string; uptime: number; peripherals: string[]; }

export class MqttClient extends EventEmitter {
  private client: mqtt.MqttClient;
  public readonly nodeId: string;

  constructor(brokerUrl: string, nodeId: string) {
    super();
    this.nodeId = nodeId;
    this.client = mqtt.connect(brokerUrl, {
      clientId: `xentient-${nodeId}-${randomBytes(4).toString('hex')}`,
      reconnectPeriod: 2000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      logger.info({ brokerUrl }, 'MQTT connected');
      // Subscribe to control + status topics per CONTRACTS.md
      const topics = [
        'xentient/control/mode',
        'xentient/control/trigger',
        'xentient/control/space',
        'xentient/control/pack',
        'xentient/sensors/env',
        'xentient/sensors/motion',
        'xentient/status/mode',
        'xentient/pipeline/state',
        'xentient/session/complete',
        'xentient/session/error',
        'xentient/display',
      ];
      this.client.subscribe(topics, { qos: 1 }, (err) => {
        if (err) logger.error({ err }, 'Failed to subscribe');
        else logger.info({ topics }, 'Subscribed to topics');
      });
      this.emit('connected');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (err) => {
      logger.error({ err }, 'MQTT error');
      this.emit('error', err);
    });
  }

  /** Publish a JSON payload to a topic. Validates against contracts if type is known. */
  publish(topic: string, payload: object): void {
    const data = JSON.stringify(payload);
    this.client.publish(topic, data, { qos: 1 });
    logger.debug({ topic, size: data.length }, 'Published');
  }

  /** Check if MQTT client is currently connected. */
  get connected(): boolean {
    return this.client.connected;
  }

  private handleMessage(topic: string, payload: Buffer): void {
    try {
      const data = JSON.parse(payload.toString());
      logger.debug({ topic, type: data.type }, 'Message received');

      if (topic === 'xentient/sensors/env' || topic === 'xentient/sensors/motion') {
        this.emit('sensor', data);
      } else if (topic === 'xentient/pipeline/state') {
        this.emit('pipelineState', data);
      } else if (topic === 'xentient/status/mode') {
        this.emit('modeStatus', data);
      } else if (topic === 'xentient/session/complete') {
        this.emit('sessionComplete', data);
      } else if (topic === 'xentient/session/error') {
        this.emit('sessionError', data);
      } else if (topic === 'xentient/display') {
        this.emit('displayUpdate', data);
      } else if (topic === 'xentient/control/mode') {
        this.emit('modeCommand', data);
      } else if (topic === 'xentient/control/trigger') {
        this.emit('triggerPipeline', data);
      } else {
        logger.warn({ topic }, 'Unhandled topic');
      }
    } catch (err) {
      logger.error({ err, topic }, 'Failed to parse MQTT message');
    }
  }

  disconnect(): void {
    this.client.end();
  }
}
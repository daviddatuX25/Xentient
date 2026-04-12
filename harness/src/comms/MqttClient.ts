import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import pino from 'pino';

const logger = pino({ name: 'mqtt-client' });

export interface VADEvent { type: 'start' | 'end'; nodeId: string; timestamp: number; }
export interface SensorData { temp: number; humidity: number; nodeId: string; }
export interface HeartbeatData { nodeId: string; uptime: number; peripherals: string[]; }

export class MqttClient extends EventEmitter {
  private client: mqtt.MqttClient;
  private nodeId: string;

  constructor(brokerUrl: string, nodeId: string) {
    super();
    this.nodeId = nodeId;
    this.client = mqtt.connect(brokerUrl, {
      clientId: `harness-${Date.now()}`,
      reconnectPeriod: 2000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      logger.info({ brokerUrl }, 'MQTT connected');
      // Subscribe to telemetry topics (NOT audio — that goes over WebSocket)
      const topics = [
        `xentient/${nodeId}/audio/vad`,
        `xentient/${nodeId}/sensors/env`,
        `xentient/${nodeId}/status/heartbeat`,
        `xentient/${nodeId}/camera/frame`,
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

  private handleMessage(topic: string, payload: Buffer): void {
    try {
      const nodePrefix = `xentient/${this.nodeId}`;
      if (topic === `${nodePrefix}/audio/vad`) {
        const event: VADEvent = JSON.parse(payload.toString());
        logger.debug({ event }, 'VAD event received');
        this.emit('vad', event);
      } else if (topic === `${nodePrefix}/sensors/env`) {
        const data: SensorData = JSON.parse(payload.toString());
        this.emit('sensor', data);
      } else if (topic === `${nodePrefix}/status/heartbeat`) {
        const data: HeartbeatData = JSON.parse(payload.toString());
        this.emit('heartbeat', data);
      } else if (topic === `${nodePrefix}/camera/frame`) {
        this.emit('cameraFrame', payload); // Raw JPEG bytes
      }
    } catch (err) {
      logger.error({ err, topic }, 'Failed to parse MQTT message');
    }
  }

  /** Send control command to Node Base */
  sendCommand(command: string, params: Record<string, unknown> = {}): void {
    const topic = `xentient/${this.nodeId}/control/cmd`;
    const payload = JSON.stringify({ command, params, timestamp: Date.now() });
    this.client.publish(topic, payload, { qos: 1 });
    logger.debug({ command }, 'Control command sent');
  }

  disconnect(): void { this.client.end(); }
}

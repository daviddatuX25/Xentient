import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockMqtt(nodeId = "node-01") {
  const mqtt = Object.create(EventEmitter.prototype) as EventEmitter & {
    nodeId: string;
    connected: boolean;
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  EventEmitter.call(mqtt);
  mqtt.nodeId = nodeId;
  mqtt.connected = true;
  mqtt.publish = vi.fn();
  mqtt.subscribe = vi.fn();
  mqtt.disconnect = vi.fn();
  return mqtt;
}
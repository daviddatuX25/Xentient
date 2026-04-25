import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockMqtt(nodeId = "node-01") {
  const mqtt = new EventEmitter();
  return {
    ...mqtt,
    nodeId,
    connected: true,
    publish: vi.fn(),
    subscribe: vi.fn(),
    disconnect: vi.fn(),
  };
}
import { EventEmitter } from "events";

export function createMockAudioServer() {
  return new EventEmitter() as any;
}
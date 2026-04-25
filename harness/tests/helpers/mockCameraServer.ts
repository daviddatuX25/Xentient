import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockCameraServer() {
  return {
    ...new EventEmitter(),
    getLatestJpeg: vi.fn().mockReturnValue(null),
    getStats: vi.fn().mockReturnValue({ lastFrameId: 0, fps: 0 }),
    handleFrame: vi.fn(),
    close: vi.fn(),
  };
}
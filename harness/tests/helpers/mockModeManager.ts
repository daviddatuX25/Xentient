import { EventEmitter } from "events";
import { vi } from "vitest";

export function createMockModeManager() {
  const mgr = new EventEmitter();
  let currentMode = "sleep";
  return {
    ...mgr,
    getMode: () => currentMode,
    transition: (mode: string) => { const from = currentMode; currentMode = mode; mgr.emit("modeChange", { from, to: mode }); return true; },
    forceSet: vi.fn(),
    handleModeCommand: vi.fn(),
    handleSensorEvent: vi.fn(),
    clearIdleTimer: vi.fn(),
    reconfigureHardware: vi.fn(),
  };
}
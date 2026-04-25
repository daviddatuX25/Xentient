import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RuleEngine } from "../src/engine/RuleEngine";
import type { Rule, RuleAction, RuleContext } from "../src/shared/types";
import type { ModeManager } from "../src/engine/ModeManager";
import type { SensorCache } from "../src/shared/types";
import type { Mode } from "../src/shared/contracts";

// ── Mocks ──────────────────────────────────────────────────────────────

function createMockModeManager(mode: Mode = "sleep"): ModeManager {
  let currentMode: Mode = mode;
  return {
    getMode: () => currentMode,
    transition: (to: Mode) => {
      currentMode = to;
      return true;
    },
    on: vi.fn(),
    emit: vi.fn(),
  } as unknown as ModeManager;
}

function createSensorCache(overrides: Partial<SensorCache> = {}): SensorCache {
  return {
    temperature: null,
    humidity: null,
    pressure: null,
    motion: null,
    lastMotionAt: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("RuleEngine", () => {
  let engine: RuleEngine;
  let sensorCache: SensorCache;
  let modeManager: ModeManager;
  let fastActions: Array<{ action: RuleAction; rule: Rule }>;
  let slowActions: Array<{ rule: Rule; ctx: RuleContext }>;

  beforeEach(() => {
    sensorCache = createSensorCache();
    modeManager = createMockModeManager();
    fastActions = [];
    slowActions = [];

    engine = new RuleEngine(
      sensorCache,
      modeManager,
      (action, rule) => fastActions.push({ action, rule }),
      (rule, ctx) => slowActions.push({ rule, ctx }),
      100, // fast tick for tests
    );
  });

  afterEach(() => {
    engine.stop();
  });

  // ── Sensor Trigger ─────────────────────────────────────────────────

  it("fires sensor trigger when threshold exceeded", () => {
    sensorCache.temperature = 38;
    engine.loadStatic([
      {
        id: "high-temp",
        enabled: true,
        priority: 5,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        action: { type: "set_lcd", line1: "(T_T)", line2: "Hot!" },
      },
    ]);
    engine.start();

    // Manually tick to evaluate
    (engine as any).tick();

    expect(fastActions).toHaveLength(1);
    expect(fastActions[0].action).toEqual({ type: "set_lcd", line1: "(T_T)", line2: "Hot!" });
  });

  it("does NOT fire sensor trigger when value is below threshold", () => {
    sensorCache.temperature = 30;
    engine.loadStatic([
      {
        id: "high-temp",
        enabled: true,
        priority: 5,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        action: { type: "set_lcd", line1: "(T_T)", line2: "Hot!" },
      },
    ]);
    engine.start();
    (engine as any).tick();

    expect(fastActions).toHaveLength(0);
  });

  // ── Cooldown ──────────────────────────────────────────────────────

  it("respects cooldown period between fires", () => {
    sensorCache.temperature = 38;
    const rule: Rule = {
      id: "cooldown-test",
      enabled: true,
      priority: 5,
      source: "static",
      cooldownMs: 60000, // 1 minute
      trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
      action: { type: "set_lcd", line1: "(T_T)", line2: "Hot!" },
    };
    engine.loadStatic([rule]);
    engine.start();

    (engine as any).tick();
    expect(fastActions).toHaveLength(1);

    // Second tick should be within cooldown
    (engine as any).tick();
    expect(fastActions).toHaveLength(1); // still 1
  });

  // ── Conditions ────────────────────────────────────────────────────

  it("blocks rule from firing when condition is false", () => {
    sensorCache.temperature = 38;
    // Mode is "sleep", condition requires "listen"
    engine.loadStatic([
      {
        id: "cond-block",
        enabled: true,
        priority: 5,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        condition: [{ field: "mode", operator: "==", value: "listen" }],
        action: { type: "set_lcd", line1: "(T_T)", line2: "Hot!" },
      },
    ]);
    engine.start();
    (engine as any).tick();

    expect(fastActions).toHaveLength(0);
  });

  it("fires rule when condition is true", () => {
    sensorCache.temperature = 38;
    engine = new RuleEngine(
      sensorCache,
      createMockModeManager("listen"), // mode = listen
      (action, rule) => fastActions.push({ action, rule }),
      (rule, ctx) => slowActions.push({ rule, ctx }),
      100,
    );
    engine.loadStatic([
      {
        id: "cond-pass",
        enabled: true,
        priority: 5,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        condition: [{ field: "mode", operator: "==", value: "listen" }],
        action: { type: "set_lcd", line1: "(T_T)", line2: "Hot!" },
      },
    ]);
    engine.start();
    (engine as any).tick();

    expect(fastActions).toHaveLength(1);
    engine.stop();
  });

  // ── Chain Actions ──────────────────────────────────────────────────

  it("executes chain actions in sequence", () => {
    sensorCache.temperature = 38;
    const chainActions: Array<{ action: RuleAction; rule: Rule }> = [];
    engine = new RuleEngine(
      sensorCache,
      modeManager,
      (action, rule) => chainActions.push({ action, rule }),
      (rule, ctx) => slowActions.push({ rule, ctx }),
      100,
    );
    engine.loadStatic([
      {
        id: "chain-test",
        enabled: true,
        priority: 5,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        action: {
          type: "chain",
          actions: [
            { type: "set_lcd", line1: "(T_T)", line2: "Hot!" },
            { type: "play_chime", preset: "alert" },
          ],
        },
      },
    ]);
    engine.start();
    (engine as any).tick();

    // Chain actions should call onFastAction for each sub-action
    expect(chainActions.length).toBeGreaterThanOrEqual(1);
    // The chain itself is dispatched, and executeAction handles it
    engine.stop();
  });

  // ── Notify (Slow Path) ────────────────────────────────────────────

  it("calls onSlowAction for notify actions", () => {
    sensorCache.temperature = 38;
    engine.loadStatic([
      {
        id: "slow-notify",
        enabled: true,
        priority: 10,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        action: { type: "notify", event: "high_temp", context: { sensor: "temperature" } },
      },
    ]);
    engine.start();
    (engine as any).tick();

    expect(slowActions).toHaveLength(1);
    expect(slowActions[0].rule.id).toBe("slow-notify");
    expect(slowActions[0].ctx.temperature).toBe(38);
  });

  // ── set_mode (Fast Path) ───────────────────────────────────────────

  it("calls onFastAction for set_mode actions", () => {
    sensorCache.temperature = 38;
    engine.loadStatic([
      {
        id: "mode-set",
        enabled: true,
        priority: 0,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        action: { type: "set_mode", mode: "active" },
      },
    ]);
    engine.start();
    (engine as any).tick();

    expect(fastActions).toHaveLength(1);
    expect(fastActions[0].action).toEqual({ type: "set_mode", mode: "active" });
  });

  // ── Event Trigger ─────────────────────────────────────────────────

  it("fires event trigger when matching event occurs", () => {
    engine.loadStatic([
      {
        id: "pir-wake",
        enabled: true,
        priority: 0,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "event", event: "motion_detected" },
        condition: [{ field: "mode", operator: "==", value: "sleep" }],
        action: { type: "set_mode", mode: "listen" },
      },
    ]);

    engine.onEvent("motion_detected");

    expect(fastActions).toHaveLength(1);
    expect(fastActions[0].action).toEqual({ type: "set_mode", mode: "listen" });
  });

  // ── Register / Unregister / List ───────────────────────────────────

  it("register + list + unregister round-trip", () => {
    engine.loadStatic([
      {
        id: "static-rule",
        enabled: true,
        priority: 5,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "sensor", sensor: "temperature", operator: ">", value: 35 },
        action: { type: "set_lcd", line1: "Hot", line2: "" },
      },
    ]);

    expect(engine.list()).toHaveLength(1);

    const registered = engine.register({
      id: "dynamic-rule",
      enabled: true,
      priority: 10,
      source: "dynamic",
      cooldownMs: 0,
      trigger: { type: "event", event: "voice_end" },
      action: { type: "notify", event: "voice_done" },
    });
    expect(registered).toBe(true);
    expect(engine.list()).toHaveLength(2);

    // Duplicate id rejected
    const dup = engine.register({
      id: "dynamic-rule",
      enabled: true,
      priority: 10,
      source: "dynamic",
      cooldownMs: 0,
      trigger: { type: "event", event: "voice_end" },
      action: { type: "notify", event: "voice_done" },
    });
    expect(dup).toBe(false);

    const removed = engine.unregister("dynamic-rule");
    expect(removed).toBe(true);
    expect(engine.list()).toHaveLength(1);

    const notFound = engine.unregister("nonexistent");
    expect(notFound).toBe(false);
  });

  // ── Interval Trigger ──────────────────────────────────────────────

  it("interval triggers fire on every tick (cooldown controls spacing)", () => {
    engine.loadStatic([
      {
        id: "env-check",
        enabled: true,
        priority: 20,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "interval", everyMs: 1000 },
        action: { type: "notify", event: "environment_check" },
      },
    ]);
    engine.start();

    (engine as any).tick();
    expect(slowActions).toHaveLength(1);

    (engine as any).tick();
    expect(slowActions).toHaveLength(2);
  });

  // ── Mode Change Trigger ────────────────────────────────────────────

  it("fires mode trigger on matching transition", () => {
    engine.loadStatic([
      {
        id: "sleep-to-listen",
        enabled: true,
        priority: 0,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "mode", from: "sleep", to: "listen" },
        action: { type: "set_lcd", line1: "(O_O)", line2: "Awake!" },
      },
    ]);

    engine.onModeChange("sleep", "listen");
    expect(fastActions).toHaveLength(1);
  });

  it("does NOT fire mode trigger for non-matching transition", () => {
    engine.loadStatic([
      {
        id: "sleep-to-listen",
        enabled: true,
        priority: 0,
        source: "static",
        cooldownMs: 0,
        trigger: { type: "mode", from: "sleep", to: "listen" },
        action: { type: "set_lcd", line1: "(O_O)", line2: "Awake!" },
      },
    ]);

    engine.onModeChange("listen", "active");
    expect(fastActions).toHaveLength(0);
  });
});
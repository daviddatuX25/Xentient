import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillExecutor } from '../src/engine/SkillExecutor';
import { SkillLog } from '../src/engine/SkillLog';
import { BUILTIN_SKILL_IDS } from '../src/shared/contracts';
import { ALL_BUILTINS } from '../src/engine/builtins';
import type { CoreSkill, ObservabilityEvent } from '../src/shared/types';

// ── Minimal mocks ──────────────────────────────────────────────────

const mockModeManager = {
  getMode: vi.fn(() => 'listen'),
  setMode: vi.fn(),
  transition: vi.fn(() => true),
  on: vi.fn(),
  clearIdleTimer: vi.fn(),
  handleModeCommand: vi.fn(),
  handleSensorEvent: vi.fn(),
};

const mockMqttClient = { publish: vi.fn(), on: vi.fn(), nodeId: 'node-01', disconnect: vi.fn() };
const mockMcpServer = { notification: vi.fn().mockResolvedValue(undefined) };
const mockSensors = () => ({ temperature: 25, humidity: 60, motion: false });

function makeExecutor(spaceId = 'test-space') {
  const log = new SkillLog();
  const events: ObservabilityEvent[] = [];
  const executor = new SkillExecutor({
    spaceId,
    modeManager: mockModeManager as any,
    mqttClient: mockMqttClient as any,
    mcpServer: mockMcpServer as any,
    skillLog: log,
    getSensorSnapshot: mockSensors,
    onObservabilityEvent: (e) => events.push(e),
    tickMs: 99999,
  });
  return { executor, log, events };
}

function makeSkill(overrides: Partial<CoreSkill> = {}): CoreSkill {
  return {
    id: 'test-skill',
    displayName: 'Test Skill',
    enabled: true,
    spaceId: 'test-space',
    trigger: { type: 'event', event: 'motion_detected' },
    priority: 10,
    actions: [{ type: 'log', message: 'test' }],
    source: 'brain',
    cooldownMs: 0,
    fireCount: 0,
    escalationCount: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// G1 — Mode trigger evaluation
// ═══════════════════════════════════════════════════════════════════

describe('G1 — Mode trigger evaluation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires on matching mode transition (from → to)', () => {
    const { executor, events } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'wake-on-mode',
      trigger: { type: 'mode', from: 'sleep', to: 'listen' },
    }));

    executor.handleEvent('mode_transition', { from: 'sleep', to: 'listen' });

    const fired = events.filter(e => e.type === 'skill_fired' && (e as any).skillId === 'wake-on-mode');
    expect(fired).toHaveLength(1);
  });

  it('does NOT fire on non-matching mode transition', () => {
    const { executor, events } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'wake-on-mode',
      trigger: { type: 'mode', from: 'sleep', to: 'listen' },
    }));

    executor.handleEvent('mode_transition', { from: 'listen', to: 'active' });

    const fired = events.filter(e => e.type === 'skill_fired' && (e as any).skillId === 'wake-on-mode');
    expect(fired).toHaveLength(0);
  });

  it('wildcard from:* matches any transition to target mode', () => {
    const { executor, events } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'any-to-listen',
      trigger: { type: 'mode', from: '*', to: 'listen' },
    }));

    executor.handleEvent('mode_transition', { from: 'active', to: 'listen' });

    const fired = events.filter(e => e.type === 'skill_fired' && (e as any).skillId === 'any-to-listen');
    expect(fired).toHaveLength(1);
  });

  it('wildcard to:* matches any transition from source mode', () => {
    const { executor, events } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'any-from-sleep',
      trigger: { type: 'mode', from: 'sleep', to: '*' },
    }));

    executor.handleEvent('mode_transition', { from: 'sleep', to: 'active' });

    const fired = events.filter(e => e.type === 'skill_fired' && (e as any).skillId === 'any-from-sleep');
    expect(fired).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 — Composite trigger evaluation
// ═══════════════════════════════════════════════════════════════════

// Helper to create an executor with custom sensor snapshot for tick-based tests
function makeExecutorWithSensors(sensors: () => Record<string, unknown>, spaceId = 'test-space') {
  const log = new SkillLog();
  const events: ObservabilityEvent[] = [];
  const executor = new SkillExecutor({
    spaceId,
    modeManager: mockModeManager as any,
    mqttClient: mockMqttClient as any,
    mcpServer: mockMcpServer as any,
    skillLog: log,
    getSensorSnapshot: sensors as any,
    onObservabilityEvent: (e) => events.push(e),
    tickMs: 99999,
  });
  return { executor, log, events };
}

describe('G2 — Composite trigger evaluation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('single sensor sub-trigger evaluates correctly via tick', () => {
    const { executor } = makeExecutorWithSensors(() => ({ temperature: 35, humidity: 60, motion: false }));

    executor.registerSkill(makeSkill({
      id: 'hot-skill',
      trigger: { type: 'composite', all: [{ type: 'sensor', sensor: 'temperature', operator: '>', value: 30 }] },
    }));

    (executor as any).tick();

    const skill = executor.listSkills('test-space').find(s => s.id === 'hot-skill');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(1);
  });

  it('composite trigger with multiple sensor sub-triggers (AND logic)', () => {
    const { executor } = makeExecutorWithSensors(() => ({ temperature: 35, humidity: 80, motion: true }));

    executor.registerSkill(makeSkill({
      id: 'hot-humid',
      trigger: {
        type: 'composite',
        all: [
          { type: 'sensor', sensor: 'temperature', operator: '>', value: 30 },
          { type: 'sensor', sensor: 'humidity', operator: '>', value: 70 },
        ],
      },
    }));

    (executor as any).tick();

    const skill = executor.listSkills('test-space').find(s => s.id === 'hot-humid');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(1);
  });

  it('composite trigger fails when one sub-trigger is false', () => {
    const { executor } = makeExecutorWithSensors(() => ({ temperature: 35, humidity: 50, motion: false }));

    executor.registerSkill(makeSkill({
      id: 'hot-humid',
      trigger: {
        type: 'composite',
        all: [
          { type: 'sensor', sensor: 'temperature', operator: '>', value: 30 },
          { type: 'sensor', sensor: 'humidity', operator: '>', value: 70 },
        ],
      },
    }));

    (executor as any).tick();

    const skill = executor.listSkills('test-space').find(s => s.id === 'hot-humid');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(0);
  });

  it('nested composite trigger (depth 2) evaluates correctly', () => {
    const { executor } = makeExecutorWithSensors(() => ({ temperature: 35, humidity: 80, motion: true }));

    executor.registerSkill(makeSkill({
      id: 'nested-composite',
      trigger: {
        type: 'composite',
        all: [
          {
            type: 'composite',
            all: [
              { type: 'sensor', sensor: 'temperature', operator: '>', value: 30 },
            ],
          },
          { type: 'sensor', sensor: 'humidity', operator: '>', value: 70 },
        ],
      },
    }));

    (executor as any).tick();

    const skill = executor.listSkills('test-space').find(s => s.id === 'nested-composite');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(1);
  });

  it('depth limit >5 returns false with warning', () => {
    const { executor } = makeExecutorWithSensors(() => ({ temperature: 35, humidity: 80, motion: true }));

    // Build a depth-7 composite trigger (exceeds the >5 limit check)
    // Depth values: outermost=0, then 1..6 — depth 6 > 5 triggers the limit
    let trigger: any = { type: 'sensor', sensor: 'temperature', operator: '>', value: 30 };
    for (let i = 0; i < 7; i++) {
      trigger = { type: 'composite', all: [trigger] };
    }

    executor.registerSkill(makeSkill({
      id: 'deep-nested',
      trigger,
    }));

    (executor as any).tick();

    const skill = executor.listSkills('test-space').find(s => s.id === 'deep-nested');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(0); // depth exceeded, should not fire
  });

  it('empty composite array returns false (no vacuously true)', () => {
    const { executor } = makeExecutorWithSensors(() => ({ temperature: 25, humidity: 60, motion: false }));

    executor.registerSkill(makeSkill({
      id: 'empty-composite',
      trigger: { type: 'composite', all: [] },
    }));

    (executor as any).tick();

    const skill = executor.listSkills('test-space').find(s => s.id === 'empty-composite');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 — modeFilter enforcement
// ═══════════════════════════════════════════════════════════════════

describe('G3 — modeFilter enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skill with modeFilter fires when activeMode matches', () => {
    const { executor } = makeExecutor();
    executor.switchMode('student');
    executor.registerSkill(makeSkill({
      id: 'student-skill',
      modeFilter: 'student',
    }));

    executor.handleEvent('motion_detected', { source: 'pir' });

    const skills = executor.listSkills('test-space');
    const skill = skills.find(s => s.id === 'student-skill');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(1);
  });

  it('skill with modeFilter does NOT fire when activeMode differs', () => {
    const { executor } = makeExecutor();
    executor.switchMode('family');
    executor.registerSkill(makeSkill({
      id: 'student-skill',
      modeFilter: 'student',
    }));

    executor.handleEvent('motion_detected', { source: 'pir' });

    const skills = executor.listSkills('test-space');
    const skill = skills.find(s => s.id === 'student-skill');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(0);
  });

  it('skill without modeFilter fires in all modes', () => {
    const { executor } = makeExecutor();
    executor.switchMode('family');
    executor.registerSkill(makeSkill({
      id: 'universal-skill',
      // no modeFilter
    }));

    executor.handleEvent('motion_detected', { source: 'pir' });

    const skills = executor.listSkills('test-space');
    const skill = skills.find(s => s.id === 'universal-skill');
    expect(skill).toBeDefined();
    expect(skill!.fireCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 — _idle-sleep removed
// ═══════════════════════════════════════════════════════════════════

describe('G4 — _idle-sleep removed', () => {
  it('BUILTIN_SKILL_IDS does not contain _idle-sleep', () => {
    expect(BUILTIN_SKILL_IDS).not.toContain('_idle-sleep');
  });

  it('ALL_BUILTINS has exactly 3 entries', () => {
    expect(ALL_BUILTINS).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 — DataCollector auto-collect + auto-reset
// ═══════════════════════════════════════════════════════════════════

describe('G5 — DataCollector auto-collect + auto-reset', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => vi.useRealTimers());

  it('counter auto-increments on fire', () => {
    const { executor } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'counter-skill',
      actions: [{ type: 'increment_counter', name: 'motionCount' }],
    }));

    executor.handleEvent('motion_detected');
    executor.handleEvent('motion_detected');

    const skills = executor.listSkills('test-space');
    const skill = skills.find(s => s.id === 'counter-skill');
    expect(skill!.fireCount).toBe(2);
  });

  it('resetAfterMs schedules auto-reset', () => {
    vi.useFakeTimers();
    const { executor } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'reset-skill',
      trigger: { type: 'event', event: 'motion_detected' },
      actions: [{ type: 'log', message: 'fired' }],
      collect: [{ type: 'counter', name: 'motionCount', resetAfterMs: 5000 }],
    }));

    executor.handleEvent('motion_detected');
    // Counter should be 1
    expect((executor as any).counters.get('motionCount')).toBe(1);

    // Advance past resetAfterMs
    vi.advanceTimersByTime(5000);

    // Counter should be reset to 0
    expect((executor as any).counters.get('motionCount')).toBe(0);
  });

  it('debouncing: timer restarts if skill fires again before reset', () => {
    vi.useFakeTimers();
    const { executor } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'debounce-skill',
      trigger: { type: 'event', event: 'motion_detected' },
      actions: [{ type: 'log', message: 'fired' }],
      collect: [{ type: 'counter', name: 'motionCount', resetAfterMs: 5000 }],
    }));

    executor.handleEvent('motion_detected');
    expect((executor as any).counters.get('motionCount')).toBe(1);

    vi.advanceTimersByTime(3000); // 3s of 5s — not yet reset

    executor.handleEvent('motion_detected');
    expect((executor as any).counters.get('motionCount')).toBe(2);

    // Advance 3s more — would be 6s from first fire but only 3s from second
    vi.advanceTimersByTime(3000);
    // Timer was restarted, so only 3s since last fire — counter should still be 2
    expect((executor as any).counters.get('motionCount')).toBe(2);

    // Advance remaining 2s to hit 5s since last fire
    vi.advanceTimersByTime(2000);
    expect((executor as any).counters.get('motionCount')).toBe(0);
  });

  it('removeSkill() clears counter reset timers for that skill', () => {
    vi.useFakeTimers();
    const { executor } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'removable-skill',
      trigger: { type: 'event', event: 'motion_detected' },
      actions: [{ type: 'log', message: 'fired' }],
      collect: [{ type: 'counter', name: 'motionCount', resetAfterMs: 5000 }],
    }));

    executor.handleEvent('motion_detected');
    expect((executor as any).counterResetTimers.size).toBeGreaterThanOrEqual(1);

    const removed = executor.removeSkill('removable-skill');
    expect(removed).toBe(true);
    // Counter reset timers for this skill should be cleared
    for (const key of (executor as any).counterResetTimers.keys()) {
      expect(key).not.toStartWith('removable-skill:');
    }
  });

  it('SkillExecutor.stop() clears all counter reset timers', () => {
    vi.useFakeTimers();
    const { executor } = makeExecutor();
    executor.registerSkill(makeSkill({
      id: 'timer-skill',
      trigger: { type: 'event', event: 'motion_detected' },
      actions: [{ type: 'log', message: 'fired' }],
      collect: [{ type: 'counter', name: 'motionCount', resetAfterMs: 10000 }],
    }));

    executor.handleEvent('motion_detected');
    expect((executor as any).counterResetTimers.size).toBeGreaterThanOrEqual(1);

    executor.stop();
    expect((executor as any).counterResetTimers.size).toBe(0);
  });
});
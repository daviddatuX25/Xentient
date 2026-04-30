import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillExecutor } from '../src/engine/SkillExecutor';
import { SkillLog } from '../src/engine/SkillLog';
import type { CoreSkill, ObservabilityEvent } from '../src/shared/types';

// Minimal mocks
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
const mockMcpServer = {
  server: { notification: vi.fn().mockResolvedValue(undefined) },
};
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
    tickMs: 99999, // disable auto-tick in tests
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

describe('SkillExecutor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers and lists skills (including builtins)', () => {
    const { executor } = makeExecutor();
    executor.registerSkill(makeSkill());
    const skills = executor.listSkills('test-space');
    expect(skills.some(s => s.id === 'test-skill')).toBe(true);
    expect(skills.some(s => s.id === '_pir-wake')).toBe(true);
  });

  it('fires skill on matching event and increments fireCount', () => {
    const { executor, log } = makeExecutor();
    executor.registerSkill(makeSkill());
    executor.handleEvent('motion_detected', { source: 'pir' });
    const fired = log.query({ skillId: 'test-skill' });
    expect(fired).toHaveLength(1);
    const skills = executor.listSkills('test-space');
    expect(skills.find(s => s.id === 'test-skill')!.fireCount).toBe(1);
  });

  it('does not fire disabled skills', () => {
    const { executor, log } = makeExecutor();
    const skill = makeSkill({ enabled: false });
    executor.registerSkill(skill);
    executor.handleEvent('motion_detected');
    expect(log.query({ skillId: 'test-skill' })).toHaveLength(0);
  });

  it('respects cooldown — does not re-fire before cooldown expires', () => {
    const { executor, log } = makeExecutor();
    const skill = makeSkill({ cooldownMs: 60_000 });
    executor.registerSkill(skill);
    executor.handleEvent('motion_detected');
    executor.handleEvent('motion_detected');
    expect(log.query({ skillId: 'test-skill' })).toHaveLength(1);
  });

  it('executes set_lcd action and emits lcd event', () => {
    const { executor } = makeExecutor();
    const lcdEvents: any[] = [];
    executor.on('lcd', (e) => lcdEvents.push(e));
    const skill = makeSkill({ actions: [{ type: 'set_lcd', line1: 'Hello', line2: 'World' }] });
    executor.registerSkill(skill);
    executor.handleEvent('motion_detected');
    expect(lcdEvents).toHaveLength(1);
    expect(lcdEvents[0].line1).toBe('Hello');
  });

  it('increments counter via increment_counter action', () => {
    const { executor } = makeExecutor();
    const skill = makeSkill({ actions: [{ type: 'increment_counter', name: 'motionCount' }] });
    executor.registerSkill(skill);
    executor.handleEvent('motion_detected');
    executor.handleEvent('motion_detected');
    expect(executor.listSkills('test-space').find(s => s.id === 'test-skill')!.fireCount).toBe(2);
  });

  it('escalates when conditions met and sends MCP notification', () => {
    const { executor } = makeExecutor();
    const skill = makeSkill({
      actions: [{ type: 'increment_counter', name: 'motionCount' }],
      escalation: {
        conditions: [{ field: 'motionCount', operator: '>=', value: 1 }],
        event: 'guest_detected',
        contextBuilder: 'minimal',
        priority: 'normal',
        cooldownMs: 0,
      },
    });
    executor.registerSkill(skill);
    executor.handleEvent('motion_detected');
    expect(mockMcpServer.server.notification).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'xentient/skill_escalated' })
    );
  });

  it('does not escalate when conditions not met', () => {
    const { executor } = makeExecutor();
    const skill = makeSkill({
      escalation: {
        conditions: [{ field: 'motionCount', operator: '>=', value: 5 }],
        event: 'alert',
        contextBuilder: 'minimal',
        priority: 'low',
        cooldownMs: 0,
      },
    });
    executor.registerSkill(skill);
    executor.handleEvent('motion_detected'); // motionCount is 0 (no increment_counter action)
    expect(mockMcpServer.server.notification).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'xentient/skill_escalated' })
    );
  });

  it('cannot remove builtin skills', () => {
    const { executor } = makeExecutor();
    const removed = executor.removeSkill('_pir-wake');
    expect(removed).toBe(false);
    expect(executor.listSkills().some(s => s.id === '_pir-wake')).toBe(true);
  });

  it('disables and re-enables a skill', () => {
    const { executor, log } = makeExecutor();
    executor.registerSkill(makeSkill());
    executor.disableSkill('test-skill', false);
    executor.handleEvent('motion_detected');
    expect(log.query({ skillId: 'test-skill' })).toHaveLength(0);
    executor.disableSkill('test-skill', true);
    executor.handleEvent('motion_detected');
    expect(log.query({ skillId: 'test-skill' })).toHaveLength(1);
  });

  it('switches active configuration', () => {
    const { executor } = makeExecutor();
    executor.setActiveConfig('student');
    expect(executor.getActiveConfig()).toBe('student');
  });

  it('emits skill_fired observability event', () => {
    const { executor, events } = makeExecutor();
    executor.registerSkill(makeSkill());
    executor.handleEvent('motion_detected');
    const fired = events.filter(e => e.type === 'skill_fired' && (e as any).skillId === 'test-skill');
    expect(fired).toHaveLength(1);
    expect((fired[0] as any).skillId).toBe('test-skill');
  });
});
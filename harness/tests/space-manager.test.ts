import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpaceManager } from '../src/engine/SpaceManager';
import type { Space, CoreSkill } from '../src/shared/types';

const mockModeManager = { getMode: vi.fn(() => 'listen'), setMode: vi.fn(), transition: vi.fn(() => true), on: vi.fn(), clearIdleTimer: vi.fn() };
const mockMcpServer = {
  server: { notification: vi.fn().mockResolvedValue(undefined) },
};
const mockMqttClient = { publish: vi.fn(), on: vi.fn(), nodeId: 'node-01', disconnect: vi.fn() };
const mockSensors = () => ({ temperature: 22, humidity: 55, motion: false });

function makeSpace(id: string): Space {
  return {
    id,
    nodes: [{ nodeId: `node-${id}`, role: 'base', hardware: ['motion', 'temperature'], state: 'dormant' as const }],
    activePack: 'default',
    activeConfig: 'default',
    availableConfigs: ['default'],
    integrations: [],
    sensors: ['temperature', 'humidity'],
  };
}

function makeSkill(id: string, spaceId: string): CoreSkill {
  return {
    id, displayName: id, enabled: true, spaceId,
    trigger: { type: 'event', event: 'test_event' },
    priority: 10, actions: [], source: 'brain',
    cooldownMs: 0, fireCount: 0, escalationCount: 0,
  };
}

describe('SpaceManager', () => {
  let manager: SpaceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SpaceManager(
      mockMcpServer as any,
      mockModeManager as any,
      mockMqttClient as any,
      mockSensors,
    );
  });

  it('adds a space and starts its executor', () => {
    manager.addSpace(makeSpace('study'));
    const skills = manager.listSkills('study');
    // Builtins should be registered
    expect(skills.some(s => s.id === '_pir-wake')).toBe(true);
  });

  it('removes a space', () => {
    manager.addSpace(makeSpace('study'));
    const removed = manager.removeSpace('study');
    expect(removed).toBe(true);
    expect(manager.listSkills('study')).toHaveLength(0);
  });

  it('registers skill in correct space', () => {
    manager.addSpace(makeSpace('study'));
    manager.addSpace(makeSpace('living'));
    manager.registerSkill(makeSkill('class-reminder', 'study'));
    expect(manager.listSkills('study').some(s => s.id === 'class-reminder')).toBe(true);
    expect(manager.listSkills('living').some(s => s.id === 'class-reminder')).toBe(false);
  });

  it('activates config: queues transition, drains it, and broadcasts config_changed', () => {
    manager.addSpace(makeSpace('study'));

    // activateConfig queues a transition (does NOT execute immediately)
    const result = manager.activateConfig('study', 'student');
    expect(result).toBe(true);

    // Before drain, space should still be on 'default'
    expect(manager.listSkills('study')).toBeDefined();

    // Drain the transition
    const drained = manager.drainTransition();
    expect(drained).toBe(true);

    // After drain, the config_changed notification should have been sent
    expect(mockMcpServer.server.notification).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'xentient/config_changed' })
    );
  });

  it('activateConfig returns false for nonexistent space', () => {
    const result = manager.activateConfig('nonexistent', 'student');
    expect(result).toBe(false);
  });

  it('drainTransition returns false when queue is empty', () => {
    manager.addSpace(makeSpace('study'));
    expect(manager.drainTransition()).toBe(false);
  });

  it('forward events to correct space executor', () => {
    manager.addSpace(makeSpace('study'));
    const studySkill = makeSkill('motion-log', 'study');
    studySkill.trigger = { type: 'event', event: 'motion_detected' };
    manager.registerSkill(studySkill);
    manager.handleEvent('motion_detected', {}, 'study');
    const log = manager.skillLog.query({ skillId: 'motion-log' });
    expect(log).toHaveLength(1);
  });

  it('routes global skills (*) to all spaces', () => {
    manager.addSpace(makeSpace('study'));
    manager.addSpace(makeSpace('living'));
    const globalSkill = makeSkill('global-chime', '*');
    manager.registerSkill(globalSkill);
    const studySkills = manager.listSkills('study');
    const livingSkills = manager.listSkills('living');
    expect(studySkills.some(s => s.id === 'global-chime')).toBe(true);
    expect(livingSkills.some(s => s.id === 'global-chime')).toBe(true);
  });

  it('cannot remove builtin skills from any space', () => {
    manager.addSpace(makeSpace('study'));
    const removed = manager.removeSkill('_pir-wake');
    expect(removed).toBe(false);
  });

  describe('TransitionQueue integration', () => {
    it('queues and drains activate_config transitions in order', () => {
      manager.addSpace(makeSpace('study'));

      manager.activateConfig('study', 'student');
      manager.activateConfig('study', 'focused');

      // Two items in queue
      expect(manager.transitionQueue.pending).toBe(2);

      // Drain first
      manager.drainTransition();
      // Still one pending
      expect(manager.transitionQueue.pending).toBe(1);

      // Drain second
      manager.drainTransition();
      expect(manager.transitionQueue.pending).toBe(0);
    });

    it('tick() drains one transition after all executor ticks', () => {
      manager.addSpace(makeSpace('study'));
      manager.activateConfig('study', 'student');

      // tick should process one transition
      manager.tick();
      expect(manager.transitionQueue.pending).toBe(0);
    });
  });
});
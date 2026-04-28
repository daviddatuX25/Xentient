import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpaceManager } from '../src/engine/SpaceManager';
import type { Space, CoreSkill } from '../src/shared/types';

const mockModeManager = { getMode: vi.fn(() => 'listen'), setMode: vi.fn(), on: vi.fn(), clearIdleTimer: vi.fn() };
const mockMcpServer = {
  notification: vi.fn().mockResolvedValue(undefined),
};
const mockMqttClient = { publish: vi.fn(), on: vi.fn(), nodeId: 'node-01', disconnect: vi.fn() };
const mockSensors = () => ({ temperature: 22, humidity: 55, motion: false });

function makeSpace(id: string): Space {
  return {
    id,
    nodeBaseId: `node-${id}`,
    activePack: 'default',
    spaceMode: 'listen',
    activeMode: 'default',
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

  it('switches mode and broadcasts xentient/mode_switched', () => {
    manager.addSpace(makeSpace('study'));
    manager.switchMode('study', 'student');
    expect(mockMcpServer.notification).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'xentient/mode_switched' })
    );
  });

  it('forwards events to correct space executor', () => {
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
});
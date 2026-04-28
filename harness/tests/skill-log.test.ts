import { describe, it, expect } from 'vitest';
import { SkillLog } from '../src/engine/SkillLog';
import type { SkillLogEntry } from '../src/shared/types';

function makeEntry(skillId: string, spaceId: string, firedAt: number): SkillLogEntry {
  return {
    skillId, spaceId, mode: 'default', firedAt,
    triggerData: {}, actionsExecuted: ['set_lcd'], escalated: false,
  };
}

describe('SkillLog', () => {
  it('appends and queries entries', () => {
    const log = new SkillLog(100);
    log.append(makeEntry('s1', 'sp1', 1000));
    log.append(makeEntry('s2', 'sp1', 2000));
    expect(log.query({})).toHaveLength(2);
  });

  it('evicts oldest when capacity exceeded', () => {
    const log = new SkillLog(3);
    log.append(makeEntry('s1', 'sp1', 1));
    log.append(makeEntry('s2', 'sp1', 2));
    log.append(makeEntry('s3', 'sp1', 3));
    log.append(makeEntry('s4', 'sp1', 4)); // evicts s1
    const results = log.query({});
    expect(results).toHaveLength(3);
    expect(results.find(e => e.skillId === 's1')).toBeUndefined();
  });

  it('filters by spaceId', () => {
    const log = new SkillLog(100);
    log.append(makeEntry('s1', 'sp1', 1000));
    log.append(makeEntry('s2', 'sp2', 2000));
    expect(log.query({ spaceId: 'sp1' })).toHaveLength(1);
    expect(log.query({ spaceId: 'sp1' })[0].skillId).toBe('s1');
  });

  it('filters by skillId', () => {
    const log = new SkillLog(100);
    log.append(makeEntry('water', 'sp1', 1000));
    log.append(makeEntry('alarm', 'sp1', 2000));
    expect(log.query({ skillId: 'water' })).toHaveLength(1);
  });

  it('filters by since timestamp', () => {
    const log = new SkillLog(100);
    log.append(makeEntry('s1', 'sp1', 1000));
    log.append(makeEntry('s2', 'sp1', 5000));
    expect(log.query({ since: 3000 })).toHaveLength(1);
    expect(log.query({ since: 3000 })[0].skillId).toBe('s2');
  });

  it('respects limit', () => {
    const log = new SkillLog(100);
    for (let i = 0; i < 20; i++) log.append(makeEntry(`s${i}`, 'sp1', i * 1000));
    expect(log.query({ limit: 5 })).toHaveLength(5);
  });

  it('attaches escalation response by approximate firedAt', () => {
    const log = new SkillLog(100);
    log.append(makeEntry('guest', 'sp1', 10000));
    log.attachEscalationResponse('guest', 10000, { brainType: 'hermes', responseMs: 1200, actions: ['greet'] });
    const entry = log.query({ skillId: 'guest' })[0];
    expect(entry.escalationResponse?.brainType).toBe('hermes');
  });
});
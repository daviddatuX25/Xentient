import { describe, it, expect } from 'vitest';
import { TransitionQueue } from '../src/engine/TransitionQueue';

describe('TransitionQueue', () => {
  it('enqueues and drains actions in FIFO order', () => {
    const q = new TransitionQueue();
    q.enqueue({ type: 'activate_config', configName: 'student', spaceId: 'default' });
    q.enqueue({ type: 'set_node_state', nodeId: 'node-01', state: 'running' });

    expect(q.pending).toBe(2);

    const first = q.drain();
    expect(first).toEqual({ type: 'activate_config', configName: 'student', spaceId: 'default' });

    const second = q.drain();
    expect(second).toEqual({ type: 'set_node_state', nodeId: 'node-01', state: 'running' });

    expect(q.pending).toBe(0);
  });

  it('drain returns null when queue is empty', () => {
    const q = new TransitionQueue();
    expect(q.drain()).toBeNull();
  });

  it('clear empties the queue', () => {
    const q = new TransitionQueue();
    q.enqueue({ type: 'activate_config', configName: 'a', spaceId: 'default' });
    q.enqueue({ type: 'activate_config', configName: 'b', spaceId: 'default' });
    expect(q.pending).toBe(2);

    q.clear();
    expect(q.pending).toBe(0);
    expect(q.drain()).toBeNull();
  });

  it('handles skill registration and removal actions', () => {
    const q = new TransitionQueue();
    const skill: import('../src/shared/types').CoreSkill = {
      id: 'test-skill', displayName: 'Test', enabled: true, spaceId: 'default',
      trigger: { type: 'event', event: 'test' }, priority: 10, actions: [],
      source: 'brain', cooldownMs: 0, fireCount: 0, escalationCount: 0,
    };

    q.enqueue({ type: 'register_skill', skill, spaceId: 'default' });
    q.enqueue({ type: 'remove_skill', skillId: 'test-skill', spaceId: 'default' });

    expect(q.pending).toBe(2);

    const regAction = q.drain();
    expect(regAction!.type).toBe('register_skill');

    const remAction = q.drain();
    expect(remAction!.type).toBe('remove_skill');
  });
});
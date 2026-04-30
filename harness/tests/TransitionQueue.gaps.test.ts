import { describe, it, expect } from 'vitest';
import { TransitionQueue } from '../src/engine/TransitionQueue';

describe('TransitionQueue gap tests', () => {
  it('drain after clear returns null', () => {
    const q = new TransitionQueue();
    q.enqueue({ type: 'activate_config', configName: 'x', spaceId: 's' });
    q.clear();
    expect(q.drain()).toBeNull();
    expect(q.pending).toBe(0);
  });

  it('clear then enqueue then drain works correctly', () => {
    const q = new TransitionQueue();
    q.enqueue({ type: 'activate_config', configName: 'a', spaceId: 's' });
    q.clear();
    q.enqueue({ type: 'activate_config', configName: 'b', spaceId: 's' });
    const result = q.drain();
    expect(result?.configName).toBe('b');
    expect(q.pending).toBe(0);
  });

  it('pending count is accurate after interleaved enqueue/drain/clear', () => {
    const q = new TransitionQueue();
    q.enqueue({ type: 'activate_config', configName: 'a', spaceId: 's' });
    q.enqueue({ type: 'activate_config', configName: 'b', spaceId: 's' });
    q.enqueue({ type: 'activate_config', configName: 'c', spaceId: 's' });
    q.drain(); // removes 'a'
    q.clear(); // removes 'b' and 'c'
    q.enqueue({ type: 'activate_config', configName: 'd', spaceId: 's' });
    expect(q.pending).toBe(1);
    expect(q.drain()?.configName).toBe('d');
    expect(q.pending).toBe(0);
  });
});
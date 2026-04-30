import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventSubscriptionManager } from '../src/engine/EventSubscriptionManager';
import type { EventSubscription } from '../src/shared/types';

describe('EventSubscriptionManager gap tests', () => {
  let manager: EventSubscriptionManager;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    callback = vi.fn();
    manager = new EventSubscriptionManager(callback);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeSubscription(overrides: Partial<EventSubscription> = {}): EventSubscription {
    return {
      id: 'sub-1',
      eventTypes: ['motion_detected'],
      maxRateMs: 1000,
      buffer: [],
      lastFlushAt: 0,
      flushTimer: null,
      ...overrides,
    };
  }

  it('does not fire notification after unsubscribe (timer leak)', () => {
    const sub = makeSubscription({ id: 'sub-1', maxRateMs: 1000, lastFlushAt: Date.now() });
    manager.subscribe(sub);

    // Buffer an event (starts the flush timer)
    manager.onEvent('motion_detected', { motion: true });

    // Unsubscribe BEFORE timer fires
    manager.unsubscribe('sub-1');

    // Advance past the timer
    vi.advanceTimersByTime(1500);

    // Callback should NOT have been called for the orphaned timer
    expect(callback).not.toHaveBeenCalled();
  });

  it('Brain disconnect removes all subscriptions and cancels all timers', () => {
    manager.subscribe(makeSubscription({ id: 'sub-a', maxRateMs: 1000, lastFlushAt: Date.now() }));
    manager.subscribe(makeSubscription({ id: 'sub-b', maxRateMs: 2000, lastFlushAt: Date.now() }));

    // Fire events to start timers
    manager.onEvent('motion_detected', {});
    manager.onEvent('motion_detected', {});

    // Clear all (Brain disconnect)
    manager.clearAll();

    // Advance past both timers
    vi.advanceTimersByTime(3000);

    // No orphaned callbacks
    expect(callback).not.toHaveBeenCalled();
  });

  it('maxRateMs=0 delivers events immediately', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const sub = makeSubscription({ id: 'sub-1', maxRateMs: 0 });
    manager.subscribe(sub);

    manager.onEvent('motion_detected', { index: 0 });
    manager.onEvent('motion_detected', { index: 1 });
    manager.onEvent('motion_detected', { index: 2 });

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('broadcastSSE with zero subscribers is a silent noop', () => {
    manager.onEvent('motion_detected', {});
    manager.onEvent('sensor_update', { temp: 25 });

    expect(callback).not.toHaveBeenCalled();
    expect(manager.getSubscriptionCount()).toBe(0);
  });
});
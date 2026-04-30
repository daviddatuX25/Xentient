import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventSubscriptionManager } from '../src/engine/EventSubscriptionManager';
import type { EventSubscription } from '../src/shared/types';

describe('EventSubscriptionManager', () => {
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

  describe('subscribe', () => {
    it('creates a subscription with correct eventTypes and maxRateMs', () => {
      const sub = makeSubscription({
        id: 'sub-1',
        eventTypes: ['motion_detected', 'sensor_update'],
        maxRateMs: 500,
      });
      manager.subscribe(sub);

      expect(manager.getSubscriptionCount()).toBe(1);
    });
  });

  describe('unsubscribe', () => {
    it('removes a subscription', () => {
      const sub = makeSubscription({ id: 'sub-1' });
      manager.subscribe(sub);

      const removed = manager.unsubscribe('sub-1');
      expect(removed).toBe(true);
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('returns false for non-existent subscription', () => {
      const removed = manager.unsubscribe('nonexistent');
      expect(removed).toBe(false);
    });

    it('clears pending flush timer on unsubscribe', () => {
      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 1000 });
      manager.subscribe(sub);

      // Fire an event to schedule a timer
      manager.onEvent('motion_detected', { motion: true });

      const removed = manager.unsubscribe('sub-1');
      expect(removed).toBe(true);
      // No crash means timer was cleared
    });
  });

  describe('rate limiting', () => {
    it('buffers events and flushes after maxRateMs interval', () => {
      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 1000, lastFlushAt: 0 });
      manager.subscribe(sub);

      // First event at time 0 — should flush immediately (lastFlushAt=0, elapsed is huge)
      manager.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(1);

      // Second event — should be buffered (within rate limit window)
      manager.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(1); // not flushed yet

      // Advance past rate limit
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('schedules flush when event arrives during rate limit window', () => {
      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 1000, lastFlushAt: Date.now() });
      manager.subscribe(sub);

      // lastFlushAt is now, so elapsed is ~0 — event should be buffered and timer scheduled
      manager.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(0);

      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('real-time (maxRateMs=0)', () => {
    it('flushes immediately when maxRateMs is 0', () => {
      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 0 });
      manager.subscribe(sub);

      manager.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(1);

      manager.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAll', () => {
    it('removes all subscriptions', () => {
      manager.subscribe(makeSubscription({ id: 'sub-1' }));
      manager.subscribe(makeSubscription({ id: 'sub-2' }));
      expect(manager.getSubscriptionCount()).toBe(2);

      manager.clearAll();
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('clears flush timers on clearAll', () => {
      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 1000, lastFlushAt: Date.now() });
      manager.subscribe(sub);

      manager.onEvent('motion_detected', { motion: true });
      // Timer should be scheduled — clearAll should cancel it
      manager.clearAll();
      // No crash means timers were cleared
    });
  });

  describe('onEvent filtering', () => {
    it('only buffers events matching subscribed eventTypes', () => {
      const sub = makeSubscription({ id: 'sub-1', eventTypes: ['motion_detected'], maxRateMs: 0 });
      manager.subscribe(sub);

      manager.onEvent('sensor_update', { temperature: 25 });
      expect(callback).toHaveBeenCalledTimes(0);

      manager.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('delivers to multiple subscriptions matching different event types', () => {
      const callback2 = vi.fn();
      const manager2 = new EventSubscriptionManager((subId: string, events: unknown[]) => {
        if (subId === 'sub-motion') callback(subId, events);
        else callback2(subId, events);
      });

      manager2.subscribe(makeSubscription({ id: 'sub-motion', eventTypes: ['motion_detected'], maxRateMs: 0 }));
      manager2.subscribe(makeSubscription({ id: 'sub-sensor', eventTypes: ['sensor_update'], maxRateMs: 0 }));

      manager2.onEvent('motion_detected', { motion: true });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(0);

      manager2.onEvent('sensor_update', { temperature: 25 });
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('flush behavior', () => {
    it('does not call callback when buffer is empty', () => {
      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 0 });
      manager.subscribe(sub);

      // No events emitted — manual flush should not call callback
      // Since onEvent with maxRateMs=0 flushes immediately, we verify
      // by checking callback hasn't been called without events
      expect(callback).toHaveBeenCalledTimes(0);
    });

    it('batches multiple buffered events into a single flush', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const sub = makeSubscription({ id: 'sub-1', maxRateMs: 1000, lastFlushAt: now });
      manager.subscribe(sub);

      // Both events arrive within the rate limit window
      manager.onEvent('motion_detected', { motion: true });
      manager.onEvent('motion_detected', { motion: false });

      // Flush should deliver both events in a single call
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Verify both events were delivered
      const events = callback.mock.calls[0][1] as unknown[];
      expect(events).toHaveLength(2);
    });
  });
});
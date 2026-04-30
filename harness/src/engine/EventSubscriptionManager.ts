import pino from 'pino';
import type { EventSubscription } from '../shared/types';

const logger = pino({ name: 'event-subscription' }, process.stderr);

export class EventSubscriptionManager {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private notificationCallback: (subscriptionId: string, events: unknown[]) => void;

  constructor(notificationCallback: (subscriptionId: string, events: unknown[]) => void) {
    this.notificationCallback = notificationCallback;
  }

  subscribe(subscription: EventSubscription): void {
    this.subscriptions.set(subscription.id, subscription);
    logger.info({ subscriptionId: subscription.id, eventTypes: subscription.eventTypes, maxRateMs: subscription.maxRateMs }, 'Event subscription created');
  }

  unsubscribe(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    if (sub.flushTimer) clearTimeout(sub.flushTimer);
    this.subscriptions.delete(subscriptionId);
    logger.info({ subscriptionId }, 'Event subscription removed');
    return true;
  }

  /** Called by Core whenever an event is emitted. Buffers matching events and flushes if rate limit allows. */
  onEvent(eventType: string, eventData: unknown): void {
    for (const [, sub] of this.subscriptions) {
      if (!sub.eventTypes.includes(eventType)) continue;

      sub.buffer.push({ type: eventType, data: eventData, timestamp: Date.now() });

      const now = Date.now();
      const elapsed = now - sub.lastFlushAt;

      if (sub.maxRateMs === 0 || elapsed >= sub.maxRateMs) {
        // Flush immediately — real-time or rate limit window has passed
        this.flush(sub);
      } else if (!sub.flushTimer) {
        // Schedule flush for remaining rate limit window
        const remainingMs = sub.maxRateMs - elapsed;
        sub.flushTimer = setTimeout(() => this.flush(sub), remainingMs);
      }
    }
  }

  /** Flush buffered events to the notification callback */
  private flush(sub: EventSubscription): void {
    // Guard: subscription may have been removed between timer scheduling and firing
    if (!this.subscriptions.has(sub.id)) return;

    if (sub.buffer.length === 0) return;

    const events = [...sub.buffer];
    sub.buffer = [];
    sub.lastFlushAt = Date.now();

    if (sub.flushTimer) {
      clearTimeout(sub.flushTimer);
      sub.flushTimer = null;
    }

    this.notificationCallback(sub.id, events);
  }

  /** Remove all subscriptions (called on Brain disconnect) */
  clearAll(): void {
    for (const [, sub] of this.subscriptions) {
      if (sub.flushTimer) clearTimeout(sub.flushTimer);
    }
    this.subscriptions.clear();
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
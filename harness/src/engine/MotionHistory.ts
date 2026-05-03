/**
 * MotionHistory — Ring buffer for PIR motion events (30min window)
 *
 * Records motion detected/cleared transitions for the telemetry
 * motion timeline. Each event stores a timestamp and active state.
 * Expansion 5.4 from 08-05.
 */

export interface MotionEvent {
  timestamp: number;
  /** true = motion detected, false = motion cleared */
  active: boolean;
}

const DEFAULT_MAX_ENTRIES = 180; // 30 minutes at 10s intervals

export class MotionHistory {
  private buffer: MotionEvent[] = [];
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Push a motion event into the ring buffer. */
  push(active: boolean): void {
    this.buffer.push({ timestamp: Date.now(), active });
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }
  }

  /** Query events since a given timestamp (Unix ms). Returns all if omitted. */
  query(sinceMs?: number): MotionEvent[] {
    if (sinceMs === undefined) return [...this.buffer];
    const cutoff = Date.now() - sinceMs;
    return this.buffer.filter((e) => e.timestamp >= cutoff);
  }
}
/**
 * ModeHistory — Ring buffer for mode transition intervals
 *
 * Records mode transitions as time intervals for the mode timeline
 * rendering in the telemetry panel. Each interval has a start and end
 * time, with the current mode represented as an open-ended interval.
 * Expansion 5.5 from 08-05.
 */

export interface ModeInterval {
  mode: string;
  startTime: number;
  /** null = current mode (still active) */
  endTime: number | null;
}

const DEFAULT_MAX_INTERVALS = 100;

export class ModeHistory {
  private intervals: ModeInterval[] = [];
  private maxIntervals: number;
  private currentMode: string | null = null;
  private currentStart: number = 0;

  constructor(maxIntervals = DEFAULT_MAX_INTERVALS) {
    this.maxIntervals = maxIntervals;
  }

  /** Record a mode transition. Closes the previous interval and opens a new one. */
  recordTransition(mode: string): void {
    const now = Date.now();
    // Close previous interval
    if (this.currentMode) {
      this.intervals.push({
        mode: this.currentMode,
        startTime: this.currentStart,
        endTime: now,
      });
    }
    // Start new interval
    this.currentMode = mode;
    this.currentStart = now;
    // Trim old entries
    if (this.intervals.length > this.maxIntervals) {
      this.intervals.shift();
    }
  }

  /** Query intervals since a given millisecond ago. Returns all if no arg. */
  query(sinceMs?: number): ModeInterval[] {
    const result = sinceMs
      ? this.intervals.filter(
          (i) => i.endTime === null || i.endTime >= Date.now() - sinceMs,
        )
      : [...this.intervals];
    // Add current mode as open interval
    if (this.currentMode) {
      result.push({
        mode: this.currentMode,
        startTime: this.currentStart,
        endTime: null,
      });
    }
    return result;
  }
}
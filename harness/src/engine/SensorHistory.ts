/**
 * SensorHistory — Ring buffer for sensor readings (5min window)
 *
 * Stores timestamped sensor snapshots for sparkline rendering.
 * Throttled to 1 entry/second to avoid ring buffer overflow on
 * high-frequency sensor bursts. H8 / Expansion 5.2.
 */

import type { SensorCache } from "../shared/types";

export interface SensorReading {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  timestamp: number;
}

const DEFAULT_CAPACITY = 300; // 5min at 1 reading/sec
const DEFAULT_INTERVAL_MS = 1000; // Throttle: 1 entry per second

export class SensorHistory {
  private readings: SensorReading[] = [];
  private capacity: number;
  private intervalMs: number;
  private lastPushTime = 0;

  constructor(capacity = DEFAULT_CAPACITY, intervalMs = DEFAULT_INTERVAL_MS) {
    this.capacity = capacity;
    this.intervalMs = intervalMs;
  }

  /** Push a sensor cache snapshot into the ring buffer. Throttled to 1 entry/second. */
  push(snapshot: SensorCache): void {
    const now = Date.now();
    if (now - this.lastPushTime < this.intervalMs) return; // Throttle
    this.lastPushTime = now;
    this.readings.push({
      temperature: snapshot.temperature,
      humidity: snapshot.humidity,
      pressure: snapshot.pressure,
      timestamp: now,
    });
    if (this.readings.length > this.capacity) {
      this.readings.shift();
    }
  }

  /** Query readings since a given timestamp. Returns all if no timestamp given. */
  query(since?: number): SensorReading[] {
    if (since === undefined) return [...this.readings];
    return this.readings.filter((r) => r.timestamp >= since);
  }

  /** Clear all readings. */
  clear(): void {
    this.readings = [];
  }
}
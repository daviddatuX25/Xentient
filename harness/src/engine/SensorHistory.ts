/**
 * SensorHistory — Ring buffer for sensor readings (5min window)
 *
 * Stores timestamped sensor snapshots for sparkline rendering.
 * Full implementation in 08-05 (Live Telemetry). This is a minimal
 * stub that satisfies the ControlServerDeps interface so core.ts compiles.
 */

import type { SensorCache } from "../shared/types";

export interface SensorReading {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  timestamp: number;
}

const DEFAULT_CAPACITY = 300; // 5min at 1 reading/sec

export class SensorHistory {
  private readings: SensorReading[] = [];
  private capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  /** Push a sensor cache snapshot into the ring buffer. */
  push(snapshot: SensorCache): void {
    this.readings.push({
      temperature: snapshot.temperature,
      humidity: snapshot.humidity,
      pressure: snapshot.pressure,
      timestamp: Date.now(),
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
}
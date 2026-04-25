/**
 * HealthMonitor — tracks Brain connection state via implicit heartbeat.
 *
 * Every MCP tool call from the Brain updates lastActivityAt.
 * No activity for 60s = warning; 120s = disconnected (failover activates).
 * On reconnection, emits "connected" status.
 */

import type { BrainHealth } from "../shared/types";
import pino from "pino";

const logger = pino({ name: "health-monitor" }, process.stderr);

export type HealthCallback = () => void;

export class HealthMonitor {
  private health: BrainHealth;
  private intervalHandle: NodeJS.Timeout | null = null;
  private warningFired = false;

  constructor(
    private onWarning: HealthCallback,
    private onDisconnect: HealthCallback,
    private onReconnect: HealthCallback,
    private warningMs: number = 60_000,
    private disconnectMs: number = 120_000,
    private checkIntervalMs: number = 10_000,
  ) {
    this.health = {
      connected: false,
      brainType: null,
      lastActivityAt: 0,
      reconnectCount: 0,
    };
  }

  /** Record Brain activity (called on every MCP tool invocation). */
  recordActivity(brainType: "basic" | "hermes"): void {
    const wasDisconnected = !this.health.connected;
    this.health.lastActivityAt = Date.now();
    this.health.brainType = brainType;
    this.health.connected = true;
    this.warningFired = false;

    if (wasDisconnected) {
      this.health.reconnectCount++;
      logger.info({ brainType }, "Brain connected");
      this.onReconnect();
    }
  }

  /** Record Brain disconnection (called on MCP transport close). */
  recordDisconnect(): void {
    if (this.health.connected) {
      this.health.connected = false;
      this.health.brainType = null;
      logger.warn("Brain disconnected (explicit)");
      this.onDisconnect();
    }
  }

  /** Get current health status. */
  getHealth(): BrainHealth {
    return { ...this.health };
  }

  /** Start periodic health checks. */
  start(): void {
    this.intervalHandle = setInterval(() => this.check(), this.checkIntervalMs);
    logger.info({ checkIntervalMs: this.checkIntervalMs, warningMs: this.warningMs, disconnectMs: this.disconnectMs }, "HealthMonitor started");
  }

  /** Stop health checks. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info("HealthMonitor stopped");
  }

  private check(): void {
    if (!this.health.connected || this.health.lastActivityAt === 0) return;

    const elapsed = Date.now() - this.health.lastActivityAt;

    if (elapsed > this.disconnectMs) {
      this.health.connected = false;
      this.health.brainType = null;
      logger.warn({ elapsedMs: elapsed }, "Brain disconnected (timeout)");
      this.onDisconnect();
    } else if (elapsed > this.warningMs && !this.warningFired) {
      this.warningFired = true;
      logger.warn({ elapsedMs: elapsed }, "Brain unresponsive");
      this.onWarning();
    }
  }
}
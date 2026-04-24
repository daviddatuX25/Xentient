/**
 * Mode Manager — implements the mode state machine per SPACES.md.
 *
 * Transitions:
 *   sleep   → listen     (PIR trigger / web button)
 *   listen  → active      (VAD open)
 *   listen  → sleep       (idle timeout, default 60s)
 *   listen  → record      (explicit record command)
 *   active  → listen      (VAD close + idle timeout, default 5min)
 *   record  → listen      (stop command)
 *   active  → sleep       (explicit sleep command)
 *   active  → record      (explicit record command)
 *   record  → sleep       (explicit sleep command)
 *
 * Invalid transitions are rejected with {error: "invalid_transition"}.
 * Publishes xentient/status/mode and xentient/display on every valid transition.
 * Emits "modeChange" event with {from, to} for Pipeline integration.
 */

import { EventEmitter } from "events";
import { MqttClient } from "../comms/MqttClient";
import {
  MODE_TRANSITIONS,
  LCD_FACES,
  PERIPHERAL_IDS,
  ModeSet,
  SensorData,
  validateMessage,
  type Mode,
} from "../shared/contracts";
import pino from "pino";

const logger = pino({ name: "mode-manager" });

const IDLE_TIMEOUTS: Record<Mode, number | null> = {
  sleep: null,
  listen: 60_000,
  active: 300_000,
  record: null,
};

export interface ModeChangeEvent {
  from: Mode;
  to: Mode;
}

export class ModeManager extends EventEmitter {
  private current: Mode = "sleep";
  private mqtt: MqttClient;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(mqtt: MqttClient, initialMode: Mode = "sleep") {
    super();
    this.current = initialMode;
    this.mqtt = mqtt;
  }

  /** Attempt a mode transition. Returns true if valid, false if rejected. */
  transition(to: Mode): boolean {
    const allowed = MODE_TRANSITIONS[this.current];
    if (!allowed.includes(to)) {
      logger.warn({ from: this.current, to }, "Invalid mode transition rejected");
      return false;
    }

    const from = this.current;
    this.current = to;
    logger.info({ from, to }, "Mode transition");

    this.publishModeStatus();
    this.publishDisplayUpdate(to);
    this.resetIdleTimer();
    this.emit("modeChange", { from, to } satisfies ModeChangeEvent);

    return true;
  }

  /** Get current mode. */
  getMode(): Mode {
    return this.current;
  }

  /** Force set mode (for web override). Logs warning. Bypasses transition rules. */
  forceSet(mode: Mode): void {
    logger.warn({ from: this.current, to: mode }, "Forced mode override");
    const from = this.current;
    this.current = mode;

    this.publishModeStatus();
    this.publishDisplayUpdate(mode);
    this.resetIdleTimer();
    this.emit("modeChange", { from, to: mode } satisfies ModeChangeEvent);
  }

  /** Handle inbound mode_set command (MQTT). Validates and applies transition. */
  handleModeCommand(data: unknown): void {
    try {
      const parsed = validateMessage("mode_set", data);
      this.transition(parsed.mode);
    } catch (err) {
      logger.error({ err, data }, "Invalid mode_set command rejected");
    }
  }

  /** Handle inbound sensor event. PIR (peripheralType 0x11) triggers sleep → listen. */
  handleSensorEvent(data: unknown): void {
    try {
      const parsed = validateMessage("sensor_data", data);
      if (parsed.peripheralType === PERIPHERAL_IDS.PIR && this.current === "sleep") {
        logger.info("PIR motion detected — waking from sleep");
        this.transition("listen");
      }
    } catch (err) {
      logger.error({ err, data }, "Invalid sensor data rejected");
    }
  }

  /** Reset the idle timer on activity. Call on any audio/VAD event. */
  resetIdleTimer(): void {
    this.clearIdleTimer();

    const timeout = IDLE_TIMEOUTS[this.current];
    if (timeout === null) return;

    this.idleTimer = setTimeout(() => {
      const target: Mode = this.current === "active" ? "listen" : "sleep";
      logger.info({ from: this.current, to: target, idleMs: timeout }, "Idle timeout — transitioning");
      this.transition(target);
    }, timeout);
  }

  /** Clear idle timer (e.g. on shutdown). */
  clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private publishModeStatus(): void {
    this.mqtt.publish("xentient/status/mode", {
      v: 1,
      type: "mode_status",
      nodeBaseId: this.mqtt.nodeId,
      mode: this.current,
    });
  }

  private publishDisplayUpdate(mode: Mode): void {
    const face = LCD_FACES[mode];
    this.mqtt.publish("xentient/display", {
      v: 1,
      type: "display_update",
      mode: "expression",
      line1: face.line1,
      line2: face.line2,
      duration: 0,
    });
  }
}
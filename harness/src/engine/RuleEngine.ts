/**
 * RuleEngine — evaluates deterministic rules on a heartbeat loop.
 *
 * FAST-path actions (set_mode, set_lcd, play_chime, mqtt_publish) execute immediately.
 * SLOW-path actions (notify) delegate to the Brain via MCP notification.
 * Cron triggers use node-cron; event triggers fire on Core internal events.
 */

import { EventEmitter } from "events";
import cron, { type ScheduledTask } from "node-cron";
import type { ModeManager } from "./ModeManager";
import type { SensorCache } from "../shared/types";
import type { Rule, Trigger, Condition, RuleAction, RuleContext } from "../shared/types";
import type { Mode } from "../shared/contracts";
import pino from "pino";

const logger = pino({ name: "rule-engine" }, process.stderr);

export type FastAction = (action: RuleAction, rule: Rule) => void;
export type SlowAction = (rule: Rule, ctx: RuleContext) => void;

export class RuleEngine extends EventEmitter {
  private rules: Rule[] = [];
  private intervalHandle: NodeJS.Timeout | null = null;
  private cronHandles: Map<string, ScheduledTask> = new Map();
  private lastTick: number = 0;

  constructor(
    private sensorCache: SensorCache,
    private modeManager: ModeManager,
    private onFastAction: FastAction,
    private onSlowAction: SlowAction,
    private tickMs: number = 2000,
  ) {
    super();
  }

  /** Load static rules from config. Replaces all existing static rules. */
  loadStatic(rules: Rule[]): void {
    const existing = this.rules.filter((r) => r.source !== "static");
    this.rules = [...rules.map((r) => ({ ...r, source: "static" as const })), ...existing];
    this.sortRules();
    this.syncCronJobs();
    logger.info({ count: rules.length }, "Static rules loaded");
  }

  /** Register a dynamic rule (from MCP). Returns false if id already exists. */
  register(rule: Rule): boolean {
    if (this.rules.some((r) => r.id === rule.id)) {
      logger.warn({ id: rule.id }, "Rule already exists — registration rejected");
      return false;
    }
    this.rules.push({ ...rule, source: "dynamic" });
    this.sortRules();
    this.syncCronJobs();
    logger.info({ id: rule.id }, "Dynamic rule registered");
    return true;
  }

  /** Unregister a rule by id. Returns true if found and removed. */
  unregister(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    const cronJob = this.cronHandles.get(id);
    if (cronJob) {
      cronJob.stop();
      this.cronHandles.delete(id);
    }
    logger.info({ id }, "Rule unregistered");
    return true;
  }

  /** Return all rules with their current state. */
  list(): Rule[] {
    return this.rules.map((r) => ({ ...r }));
  }

  /** Handle an internal Core event (motion_detected, voice_end, etc). */
  onEvent(eventName: string): void {
    const now = Date.now();
    const ctx = this.buildContext(now);

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.cooldownMs && rule.lastFiredAt && (now - rule.lastFiredAt < rule.cooldownMs)) continue;

      if (rule.trigger.type === "event" && rule.trigger.event === eventName) {
        if (this.evaluateConditions(rule.condition ?? [], ctx)) {
          this.executeAction(rule, ctx);
          this.updateLastFired(rule, now);
        }
      }
    }
  }

  /** Handle a mode transition event. */
  onModeChange(from: Mode, to: Mode): void {
    const now = Date.now();
    const ctx = this.buildContext(now);

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.cooldownMs && rule.lastFiredAt && (now - rule.lastFiredAt < rule.cooldownMs)) continue;

      if (rule.trigger.type === "mode" && rule.trigger.from === from && rule.trigger.to === to) {
        if (this.evaluateConditions(rule.condition ?? [], ctx)) {
          this.executeAction(rule, ctx);
          this.updateLastFired(rule, now);
        }
      }
    }
  }

  /** Start the heartbeat evaluation loop + cron jobs. */
  start(): void {
    this.syncCronJobs();
    this.intervalHandle = setInterval(() => this.tick(), this.tickMs);
    logger.info({ tickMs: this.tickMs }, "RuleEngine started");
  }

  /** Stop the heartbeat loop + all cron jobs. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    for (const [, task] of this.cronHandles) {
      task.stop();
    }
    this.cronHandles.clear();
    logger.info("RuleEngine stopped");
  }

  // ── Private ────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    const ctx = this.buildContext(now);
    this.lastTick = now;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.cooldownMs && rule.lastFiredAt && (now - rule.lastFiredAt < rule.cooldownMs)) continue;
      // Cron and mode/event triggers are handled separately — skip them in tick
      if (rule.trigger.type === "cron" || rule.trigger.type === "mode" || rule.trigger.type === "event") continue;

      if (this.evaluateTrigger(rule.trigger, ctx)) {
        if (this.evaluateConditions(rule.condition ?? [], ctx)) {
          this.executeAction(rule, ctx);
          this.updateLastFired(rule, now);
        }
      }
    }
  }

  private buildContext(now: number): RuleContext {
    return {
      mode: this.modeManager.getMode(),
      temperature: this.sensorCache.temperature,
      humidity: this.sensorCache.humidity,
      pressure: this.sensorCache.pressure,
      motion: this.sensorCache.motion,
      lastMotionAgoMs: this.sensorCache.lastMotionAt ? now - this.sensorCache.lastMotionAt : null,
      time: now,
      dayOfWeek: new Date(now).getDay(),
      hour: new Date(now).getHours(),
      minute: new Date(now).getMinutes(),
    };
  }

  private evaluateTrigger(trigger: Trigger, ctx: RuleContext): boolean {
    switch (trigger.type) {
      case "interval": {
        // Interval triggers are evaluated every tick; cooldown handles spacing
        return true;
      }
      case "sensor": {
        const value = ctx[trigger.sensor as keyof RuleContext];
        if (value === null || value === undefined) return false;
        return this.compareValues(value as number, trigger.operator, trigger.value);
      }
      case "mode":
      case "event":
      case "cron":
        // These are handled via callbacks (onModeChange, onEvent) or node-cron
        return false;
      case "composite":
        return trigger.all.every((t) => this.evaluateTrigger(t, ctx));
      default:
        return false;
    }
  }

  private compareValues(left: number, operator: string, right: number): boolean {
    switch (operator) {
      case ">": return left > right;
      case "<": return left < right;
      case "==": return left === right;
      case ">=": return left >= right;
      case "<=": return left <= right;
      default: return false;
    }
  }

  private evaluateConditions(conditions: Condition[], ctx: RuleContext): boolean {
    return conditions.every((cond) => this.evaluateCondition(cond, ctx));
  }

  private evaluateCondition(cond: Condition, ctx: RuleContext): boolean {
    const raw = ctx[cond.field as keyof RuleContext];

    switch (cond.operator) {
      case "==": return raw == cond.value;
      case "!=": return raw != cond.value;
      case ">": return typeof raw === "number" && raw > (cond.value as number);
      case "<": return typeof raw === "number" && raw < (cond.value as number);
      case ">=": return typeof raw === "number" && raw >= (cond.value as number);
      case "<=": return typeof raw === "number" && raw <= (cond.value as number);
      case "in": return Array.isArray(cond.value) && cond.value.includes(String(raw));
      default: return false;
    }
  }

  private executeAction(rule: Rule, ctx: RuleContext): void {
    if (rule.action.type === "notify") {
      this.onSlowAction(rule, ctx);
    } else {
      this.onFastAction(rule.action, rule);
    }
    this.emit("ruleFired", { ruleId: rule.id, trigger: rule.trigger.type, action: rule.action.type });
  }

  private updateLastFired(rule: Rule, now: number): void {
    const idx = this.rules.findIndex((r) => r.id === rule.id);
    if (idx !== -1) {
      this.rules[idx] = { ...this.rules[idx], lastFiredAt: now };
    }
  }

  private sortRules(): void {
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  private syncCronJobs(): void {
    // Stop all existing cron jobs
    for (const [, task] of this.cronHandles) {
      task.stop();
    }
    this.cronHandles.clear();

    // Create new cron jobs for cron-type rules
    for (const rule of this.rules) {
      if (!rule.enabled || rule.trigger.type !== "cron") continue;

      const task = cron.schedule(rule.trigger.schedule, () => {
        const now = Date.now();
        const ctx = this.buildContext(now);

        if (rule.cooldownMs && rule.lastFiredAt && (now - rule.lastFiredAt < rule.cooldownMs)) return;

        if (this.evaluateConditions(rule.condition ?? [], ctx)) {
          this.executeAction(rule, ctx);
          this.updateLastFired(rule, now);
        }
      });

      this.cronHandles.set(rule.id, task);
      logger.info({ id: rule.id, schedule: rule.trigger.schedule }, "Cron rule scheduled");
    }
  }
}
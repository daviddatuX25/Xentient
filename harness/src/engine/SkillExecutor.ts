import { EventEmitter } from 'events';
import pino from 'pino';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CoreSkill, CoreAction, SkillLogEntry,
  SkillFireEvent, SkillEscalationEvent, SkillConflictEvent,
  ConflictResolution, PendingConflict, ObservabilityEvent,
} from '../shared/types';
import { SKILL_EVENTS, BUILTIN_SKILL_IDS, CONFLICT_TIMEOUT_MS } from '../shared/contracts';
import { ModeManager } from './ModeManager';
import { MqttClient } from '../comms/MqttClient';
import { SkillLog } from './SkillLog';
import { buildContext, SensorSnapshot } from './contextBuilders';
import { ALL_BUILTINS } from './builtins';
import type { SkillPersistence } from './SkillPersistence';

const logger = pino({ name: 'skill-executor' }, process.stderr);

export interface SkillExecutorOptions {
  spaceId: string;
  tickMs?: number;
  modeManager: ModeManager;
  mqttClient: MqttClient;
  mcpServer: McpServer;
  skillLog: SkillLog;
  getSensorSnapshot: () => SensorSnapshot;
  getCameraFrame?: () => string | undefined;
  onObservabilityEvent: (event: ObservabilityEvent) => void;
  persistence?: SkillPersistence;
  getBrainConnected?: () => boolean;
}

export class SkillExecutor extends EventEmitter {
  private skills: Map<string, CoreSkill> = new Map();
  private counters: Map<string, number> = new Map();
  private modeHistory: string[] = [];
  private cronHandles: Map<string, ScheduledTask> = new Map();
  private intervalHandles: Map<string, NodeJS.Timeout> = new Map();
  private pendingConflicts: Map<string, PendingConflict> = new Map();
  private counterResetTimers: Map<string, NodeJS.Timeout> = new Map();
  private tickHandle: NodeJS.Timeout | null = null;
  private opts: SkillExecutorOptions;
  private activeMode: string = 'default';

  constructor(opts: SkillExecutorOptions) {
    super();
    this.opts = opts;
    for (const builtin of ALL_BUILTINS) {
      this.skills.set(builtin.id, { ...builtin });
    }
  }

  start(): void {
    this.tickHandle = setInterval(() => this.tick(), this.opts.tickMs ?? 5000);
    this.setupScheduledSkills();
    logger.info({ spaceId: this.opts.spaceId }, 'SkillExecutor started');
  }

  stop(): void {
    // Flush any pending persistence writes before shutdown
    if (this.opts.persistence) {
      const allSkills = Array.from(this.skills.values());
      this.opts.persistence.flush(allSkills);
    }
    if (this.tickHandle) clearInterval(this.tickHandle);
    for (const [, task] of this.cronHandles) task.stop();
    for (const [, handle] of this.intervalHandles) clearInterval(handle);
    for (const [, handle] of this.counterResetTimers) clearTimeout(handle);
    this.cronHandles.clear();
    this.intervalHandles.clear();
    this.counterResetTimers.clear();
    logger.info({ spaceId: this.opts.spaceId }, 'SkillExecutor stopped');
  }

  switchMode(newMode: string): void {
    const prev = this.activeMode;
    this.activeMode = newMode;
    this.modeHistory.push(newMode);
    if (this.modeHistory.length > 20) this.modeHistory.shift();
    logger.info({ spaceId: this.opts.spaceId, prev, newMode }, 'Behavioral mode switched');
  }

  getMode(): string { return this.activeMode; }

  /** Return a snapshot of all counter values. */
  getCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  registerSkill(skill: CoreSkill): void {
    this.skills.set(skill.id, { ...skill, fireCount: 0, escalationCount: 0 });
    this.setupSkillSchedule(skill);
    logger.info({ skillId: skill.id }, 'Skill registered');
    this.persist();
  }

  updateSkill(id: string, patch: Partial<CoreSkill>): boolean {
    const existing = this.skills.get(id);
    if (!existing) return false;
    const updated = { ...existing, ...patch };
    this.skills.set(id, updated);
    this.teardownSkillSchedule(id);
    this.setupSkillSchedule(updated);
    this.persist();
    return true;
  }

  disableSkill(id: string, enabled: boolean): boolean {
    const skill = this.skills.get(id);
    if (!skill) return false;
    skill.enabled = enabled;
    return true;
  }

  removeSkill(id: string): boolean {
    if ((BUILTIN_SKILL_IDS as readonly string[]).includes(id)) {
      logger.warn({ id }, 'Cannot remove builtin skill');
      return false;
    }
    this.teardownSkillSchedule(id);
    for (const [key, handle] of this.counterResetTimers) {
      if (key.startsWith(`${id}:`)) {
        clearTimeout(handle);
        this.counterResetTimers.delete(key);
      }
    }
    const deleted = this.skills.delete(id);
    this.persist();
    return deleted;
  }

  listSkills(spaceId?: string): CoreSkill[] {
    const all = Array.from(this.skills.values());
    if (!spaceId) return all;
    return all.filter(s => s.spaceId === spaceId || s.spaceId === '*');
  }

  handleEvent(eventName: string, triggerData: Record<string, unknown> = {}): void {
    const eventMatching = Array.from(this.skills.values()).filter(s =>
      s.enabled &&
      this.matchesSpace(s) &&
      s.trigger.type === 'event' &&
      (s.trigger as { type: 'event'; event: string }).event === eventName
    );
    if (eventMatching.length > 0) {
      this.executeSkillSet(eventMatching, { type: 'event', event: eventName }, triggerData);
    }

    if (eventName === 'mode_transition') {
      const modeMatching = Array.from(this.skills.values()).filter(s => {
        if (!s.enabled || !this.matchesSpace(s) || s.trigger.type !== 'mode') return false;
        const t = s.trigger as { type: 'mode'; from: string; to: string };
        const fromMatch = t.from === '*' || t.from === triggerData.from;
        const toMatch = t.to === '*' || t.to === triggerData.to;
        return fromMatch && toMatch;
      });
      if (modeMatching.length > 0) {
        this.executeSkillSet(modeMatching, { type: 'mode' }, triggerData);
      }
    }
  }

  resolveConflict(resolution: ConflictResolution & { conflictGroup: string }): void {
    const pending = this.pendingConflicts.get(resolution.conflictGroup);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    this.pendingConflicts.delete(resolution.conflictGroup);

    for (const skillId of resolution.execute) {
      const skill = this.skills.get(skillId);
      if (skill) this.executeL1Actions(skill, pending.triggerData);
    }
    logger.info({ resolution }, 'Conflict resolved by Brain');
  }

  private tick(): void {
    const sensors = this.opts.getSensorSnapshot();
    const ctx = { mode: this.opts.modeManager.getMode(), sensors, now: Date.now() };

    const candidates: CoreSkill[] = [];
    for (const skill of this.skills.values()) {
      if (!skill.enabled || !this.matchesSpace(skill)) continue;
      if (skill.trigger.type !== 'sensor' && skill.trigger.type !== 'composite') continue;
      if (this.evaluateTrigger(skill.trigger, { ...ctx, _skillId: skill.id })) candidates.push(skill);
    }

    if (candidates.length > 0) {
      this.executeSkillSet(candidates, { type: 'tick' } as Record<string, unknown>, {});
    }
  }

  private setupScheduledSkills(): void {
    for (const skill of this.skills.values()) {
      this.setupSkillSchedule(skill);
    }
  }

  private setupSkillSchedule(skill: CoreSkill): void {
    if (skill.trigger.type === 'cron') {
      const task = cron.schedule(skill.trigger.schedule, () => {
        if (!skill.enabled || !this.matchesSpace(skill)) return;
        this.executeSkillSet([skill], skill.trigger, {});
      });
      this.cronHandles.set(skill.id, task);
    } else if (skill.trigger.type === 'interval') {
      const handle = setInterval(() => {
        if (!skill.enabled || !this.matchesSpace(skill)) return;
        const now = Date.now();
        if (skill.cooldownMs && skill.lastFiredAt && (now - skill.lastFiredAt < skill.cooldownMs)) return;
        this.executeSkillSet([skill], skill.trigger, {});
      }, skill.trigger.everyMs);
      this.intervalHandles.set(skill.id, handle);
    }
  }

  private teardownSkillSchedule(id: string): void {
    this.cronHandles.get(id)?.stop();
    this.cronHandles.delete(id);
    const h = this.intervalHandles.get(id);
    if (h) clearInterval(h);
    this.intervalHandles.delete(id);
  }

  private executeSkillSet(skills: CoreSkill[], trigger: Record<string, unknown>, triggerData: Record<string, unknown>): void {
    const byGroup = new Map<string, CoreSkill[]>();
    const noGroup: CoreSkill[] = [];

    for (const skill of skills) {
      if (skill.escalation?.conflictGroup) {
        const g = skill.escalation.conflictGroup;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(skill);
      } else {
        noGroup.push(skill);
      }
    }

    for (const skill of noGroup) {
      this.fireSkill(skill, triggerData);
    }

    for (const [group, groupSkills] of byGroup) {
      if (groupSkills.length === 1) {
        this.fireSkill(groupSkills[0], triggerData);
      } else {
        this.handleConflict(group, groupSkills, triggerData);
      }
    }
  }

  private fireSkill(skill: CoreSkill, triggerData: Record<string, unknown>): void {
    const now = Date.now();
    if (skill.cooldownMs && skill.lastFiredAt && (now - skill.lastFiredAt < skill.cooldownMs)) {
      logger.debug({ skillId: skill.id, remainingMs: skill.cooldownMs - (now - skill.lastFiredAt) }, 'Skill skipped (cooldown)');
      return;
    }

    skill.lastFiredAt = now;
    skill.fireCount++;

    if (skill.collect) {
      for (const dc of skill.collect) {
        if (dc.type === 'counter') {
          const cur = this.counters.get(dc.name) ?? 0;
          this.counters.set(dc.name, cur + 1);
          if (dc.resetAfterMs) {
            const timerKey = `${skill.id}:${dc.name}`;
            const existing = this.counterResetTimers.get(timerKey);
            if (existing) clearTimeout(existing);
            const handle = setTimeout(() => {
              this.counters.set(dc.name, 0);
              this.counterResetTimers.delete(timerKey);
            }, dc.resetAfterMs);
            this.counterResetTimers.set(timerKey, handle);
          }
        }
      }
    }

    const actionsExecuted = this.executeL1Actions(skill, triggerData);
    const shouldEscalate = this.checkEscalation(skill, triggerData);

    const logEntry: SkillLogEntry = {
      skillId: skill.id,
      spaceId: this.opts.spaceId,
      mode: this.activeMode,
      firedAt: now,
      triggerData,
      actionsExecuted,
      escalated: shouldEscalate,
    };
    this.opts.skillLog.append(logEntry);

    const event: SkillFireEvent = {
      type: 'skill_fired',
      skillId: skill.id,
      spaceId: this.opts.spaceId,
      mode: this.activeMode,
      trigger: skill.trigger.type,
      actionsExecuted,
      escalated: shouldEscalate,
      timestamp: now,
    };
    this.opts.onObservabilityEvent(event);

    if (shouldEscalate) this.escalate(skill, triggerData, now);
  }

  private executeL1Actions(skill: CoreSkill, triggerData: Record<string, unknown>): string[] {
    const executed: string[] = [];
    for (const action of skill.actions) {
      try {
        this.runAction(action, triggerData);
        executed.push(action.type);
      } catch (err) {
        logger.error({ err, action, skillId: skill.id }, 'L1 action error');
      }
    }
    return executed;
  }

  private runAction(action: CoreAction, _triggerData: Record<string, unknown>): void {
    switch (action.type) {
      case 'set_mode':
        this.opts.modeManager.transition(action.mode);
        break;
      case 'set_lcd':
        this.emit('lcd', { line1: action.line1, line2: action.line2 });
        break;
      case 'play_chime':
        this.emit('chime', { preset: action.preset });
        break;
      case 'mqtt_publish':
        this.opts.mqttClient.publish(action.topic, action.payload);
        break;
      case 'increment_counter': {
        const cur = this.counters.get(action.name) ?? 0;
        this.counters.set(action.name, cur + 1);
        break;
      }
      case 'log':
        logger.info({ message: action.message, spaceId: this.opts.spaceId }, 'Skill log action');
        break;
    }
  }

  private checkEscalation(skill: CoreSkill, triggerData: Record<string, unknown>): boolean {
    if (!skill.escalation) return false;
    const { conditions, cooldownMs } = skill.escalation;
    const now = Date.now();
    if (cooldownMs && skill.lastEscalatedAt && (now - skill.lastEscalatedAt < cooldownMs)) return false;

    return conditions.every(cond => {
      const val = this.resolveConditionField(cond.field, triggerData);
      return this.compare(val, cond.operator, cond.value);
    });
  }

  private escalate(skill: CoreSkill, triggerData: Record<string, unknown>, firedAt: number): void {
    skill.lastEscalatedAt = firedAt;
    skill.escalationCount++;

    const context = buildContext(
      skill.escalation!.contextBuilder,
      skill,
      triggerData,
      this.opts.getSensorSnapshot(),
      Object.fromEntries(this.counters),
      this.modeHistory,
      this.opts.getCameraFrame,
    );

    const event: SkillEscalationEvent = {
      type: 'skill_escalated',
      skillId: skill.id,
      spaceId: this.opts.spaceId,
      event: skill.escalation!.event,
      priority: skill.escalation!.priority,
      brainConnected: this.opts.getBrainConnected?.() ?? true,
      timestamp: firedAt,
    };
    this.opts.onObservabilityEvent(event);

    // @ts-expect-error McpServer.notification() exists at runtime but is not on the high-level type
    this.opts.mcpServer.notification({
      method: SKILL_EVENTS.SKILL_ESCALATED,
      params: {
        skillId: skill.id,
        spaceId: this.opts.spaceId,
        event: skill.escalation!.event,
        context,
        priority: skill.escalation!.priority,
      },
    }).catch((err: Error) => logger.error({ err, skillId: skill.id }, 'Failed to send skill_escalated notification'));

    logger.info({ skillId: skill.id, spaceId: this.opts.spaceId }, 'Skill escalated to Brain');
  }

  private handleConflict(group: string, skills: CoreSkill[], triggerData: Record<string, unknown>): void {
    const now = Date.now();
    logger.warn({ group, skills: skills.map(s => s.id) }, 'Skill conflict detected');

    const conflictEvent: SkillConflictEvent = {
      type: 'skill_conflict',
      conflictingSkills: skills.map(s => s.id),
      spaceId: this.opts.spaceId,
      resolution: 'pending',
      timestamp: now,
    };
    this.opts.onObservabilityEvent(conflictEvent);

    const timeoutHandle = setTimeout(() => {
      const alive = skills.filter(s => this.skills.has(s.id));
      if (alive.length === 0) {
        logger.info({ group }, 'Conflict timeout — all conflicting skills removed, skipping');
        this.pendingConflicts.delete(group);
        return;
      }
      logger.warn({ group }, 'Conflict timeout — falling back to priority ordering');
      this.pendingConflicts.delete(group);
      const sorted = [...alive].sort((a, b) => a.priority - b.priority);
      this.fireSkill(sorted[0], triggerData);
    }, CONFLICT_TIMEOUT_MS);

    this.pendingConflicts.set(group, {
      conflictingSkills: skills.map(s => s.id),
      spaceId: this.opts.spaceId,
      triggerData,
      startedAt: now,
      timeoutHandle,
    });

    // @ts-expect-error McpServer.notification() exists at runtime but is not on the high-level type
    this.opts.mcpServer.notification({
      method: SKILL_EVENTS.SKILL_CONFLICT,
      params: {
        conflictingSkills: skills.map(s => s.id),
        spaceId: this.opts.spaceId,
        triggerData,
        conflictGroup: group,
      },
    }).catch((err: Error) => logger.error({ err, group }, 'Failed to send skill_conflict notification'));
  }

  private matchesSpace(skill: CoreSkill): boolean {
    const spaceMatch = skill.spaceId === '*' || skill.spaceId === this.opts.spaceId;
    const modeMatch = !skill.modeFilter || skill.modeFilter === this.activeMode;
    return spaceMatch && modeMatch;
  }

  private evaluateTrigger(trigger: Record<string, unknown>, ctx: Record<string, unknown>): boolean {
    if (trigger.type === 'sensor') {
      const val = (ctx.sensors as Record<string, unknown>)?.[trigger.sensor as string] as number ?? 0;
      return this.compare(val, trigger.operator as string, trigger.value as number);
    }
    if (trigger.type === 'composite') {
      const depth = (ctx._compositeDepth as number | undefined) ?? 0;
      if (depth > 5) {
        logger.warn({ skillId: ctx._skillId, depth }, 'Composite trigger depth limit exceeded');
        return false;
      }
      const subTriggers = trigger.all as Record<string, unknown>[];
      if (!subTriggers || subTriggers.length === 0) return false;
      return subTriggers.every(sub => this.evaluateTrigger(sub, { ...ctx, _compositeDepth: depth + 1 }));
    }
    return false;
  }

  private resolveConditionField(field: string, triggerData: Record<string, unknown>): number {
    if (triggerData[field] !== undefined) return Number(triggerData[field]);
    return this.counters.get(field) ?? 0;
  }

  private compare(actual: number, op: string, expected: number): boolean {
    switch (op) {
      case '>': return actual > expected;
      case '<': return actual < expected;
      case '>=': return actual >= expected;
      case '<=': return actual <= expected;
      case '==': return actual === expected;
      case '!=': return actual !== expected;
      default: return false;
    }
  }

  private persist(): void {
    if (!this.opts.persistence) return;
    const allSkills = Array.from(this.skills.values());
    this.opts.persistence.debouncedSave(allSkills);
  }
}
import { EventEmitter } from 'events';
import pino from 'pino';
import cron from 'node-cron';
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
}

export class SkillExecutor extends EventEmitter {
  private skills: Map<string, CoreSkill> = new Map();
  private counters: Map<string, number> = new Map();
  private modeHistory: string[] = [];
  private cronHandles: Map<string, cron.ScheduledTask> = new Map();
  private intervalHandles: Map<string, NodeJS.Timeout> = new Map();
  private pendingConflicts: Map<string, PendingConflict> = new Map();
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
    if (this.tickHandle) clearInterval(this.tickHandle);
    for (const [, task] of this.cronHandles) task.stop();
    for (const [, handle] of this.intervalHandles) clearInterval(handle);
    this.cronHandles.clear();
    this.intervalHandles.clear();
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

  registerSkill(skill: CoreSkill): void {
    this.skills.set(skill.id, { ...skill, fireCount: 0, escalationCount: 0 });
    this.setupSkillSchedule(skill);
    logger.info({ skillId: skill.id }, 'Skill registered');
  }

  updateSkill(id: string, patch: Partial<CoreSkill>): boolean {
    const existing = this.skills.get(id);
    if (!existing) return false;
    const updated = { ...existing, ...patch };
    this.skills.set(id, updated);
    this.teardownSkillSchedule(id);
    this.setupSkillSchedule(updated);
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
    return this.skills.delete(id);
  }

  listSkills(spaceId?: string): CoreSkill[] {
    const all = Array.from(this.skills.values());
    if (!spaceId) return all;
    return all.filter(s => s.spaceId === spaceId || s.spaceId === '*');
  }

  handleEvent(eventName: string, triggerData: Record<string, unknown> = {}): void {
    const matching = Array.from(this.skills.values()).filter(s =>
      s.enabled &&
      this.matchesSpace(s) &&
      s.trigger.type === 'event' &&
      (s.trigger as { type: 'event'; event: string }).event === eventName
    );
    if (matching.length > 0) {
      this.executeSkillSet(matching, { type: 'event', event: eventName }, triggerData);
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
      if (skill.trigger.type !== 'sensor') continue;
      if (this.evaluateTrigger(skill.trigger, ctx)) candidates.push(skill);
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
      brainConnected: true,
      timestamp: firedAt,
    };
    this.opts.onObservabilityEvent(event);

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
      logger.warn({ group }, 'Conflict timeout — falling back to priority ordering');
      this.pendingConflicts.delete(group);
      const sorted = [...skills].sort((a, b) => a.priority - b.priority);
      this.fireSkill(sorted[0], triggerData);
    }, CONFLICT_TIMEOUT_MS);

    this.pendingConflicts.set(group, {
      conflictingSkills: skills.map(s => s.id),
      spaceId: this.opts.spaceId,
      triggerData,
      startedAt: now,
      timeoutHandle,
    });

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
    return skill.spaceId === '*' || skill.spaceId === this.opts.spaceId;
  }

  private evaluateTrigger(trigger: Record<string, unknown>, ctx: Record<string, unknown>): boolean {
    if (trigger.type === 'sensor') {
      const val = (ctx.sensors as Record<string, unknown>)?.[trigger.sensor as string] as number ?? 0;
      return this.compare(val, trigger.operator as string, trigger.value as number);
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
}
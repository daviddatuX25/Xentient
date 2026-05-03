import { EventEmitter } from 'events';
import pino from 'pino';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Space, CoreSkill, ObservabilityEvent } from '../shared/types';
import { SKILL_EVENTS } from '../shared/contracts';
import { SkillExecutor } from './SkillExecutor';
import { SkillLog } from './SkillLog';
import { ModeManager } from './ModeManager';
import { MqttClient } from '../comms/MqttClient';

const logger = pino({ name: 'space-manager' }, process.stderr);

export class SpaceManager extends EventEmitter {
  private spaces: Map<string, Space> = new Map();
  private executors: Map<string, SkillExecutor> = new Map();
  readonly skillLog: SkillLog;

  constructor(
    private mcpServer: McpServer,
    private modeManager: ModeManager,
    private mqttClient: MqttClient,
    private getSensorSnapshot: () => Record<string, unknown>,
    private getCameraFrame?: () => string | undefined,
  ) {
    super();
    this.skillLog = new SkillLog();
  }

  /** Create or replace a Space and start its executor */
  addSpace(space: Space): void {
    const existing = this.executors.get(space.id);
    if (existing) {
      existing.stop();
    }

    this.spaces.set(space.id, space);

    const executor = new SkillExecutor({
      spaceId: space.id,
      modeManager: this.modeManager,
      mqttClient: this.mqttClient,
      mcpServer: this.mcpServer,
      skillLog: this.skillLog,
      getSensorSnapshot: this.getSensorSnapshot,
      getCameraFrame: this.getCameraFrame,
      onObservabilityEvent: (event) => this.broadcastObservabilityEvent(event),
    });

    // Wire LCD/chime emission from executor to MCP notifications
    executor.on('lcd', ({ line1, line2 }: { line1: string; line2: string }) => {
      // @ts-expect-error McpServer.notification() exists at runtime via Protocol
      this.mcpServer.notification({
        method: 'xentient/internal_lcd',
        params: { spaceId: space.id, line1, line2 },
      }).catch((err: Error) => logger.error({ err }, 'Failed to send internal_lcd notification'));
    });

    executor.on('chime', ({ preset }: { preset: string }) => {
      // @ts-expect-error McpServer.notification() exists at runtime via Protocol
      this.mcpServer.notification({
        method: 'xentient/internal_chime',
        params: { spaceId: space.id, preset },
      }).catch((err: Error) => logger.error({ err }, 'Failed to send internal_chime notification'));
    });

    this.executors.set(space.id, executor);
    executor.start();
    logger.info({ spaceId: space.id, mode: space.activeMode }, 'Space added and executor started');
  }

  removeSpace(id: string): boolean {
    this.executors.get(id)?.stop();
    this.executors.delete(id);
    return this.spaces.delete(id);
  }

  // ---- Skill operations (routed to correct executor) ----

  registerSkill(skill: CoreSkill): void {
    // Global builtins registered on all executors; others on their Space
    if (skill.spaceId === '*') {
      for (const [, ex] of this.executors) ex.registerSkill(skill);
    } else {
      this.getExecutor(skill.spaceId)?.registerSkill(skill);
    }
  }

  updateSkill(skillId: string, patch: Partial<CoreSkill>, spaceId?: string): boolean {
    if (spaceId) return this.getExecutor(spaceId)?.updateSkill(skillId, patch) ?? false;
    let changed = false;
    for (const [, ex] of this.executors) {
      if (ex.updateSkill(skillId, patch)) changed = true;
    }
    return changed;
  }

  disableSkill(skillId: string, enabled: boolean, spaceId?: string): boolean {
    if (spaceId) return this.getExecutor(spaceId)?.disableSkill(skillId, enabled) ?? false;
    let changed = false;
    for (const [, ex] of this.executors) {
      if (ex.disableSkill(skillId, enabled)) changed = true;
    }
    return changed;
  }

  removeSkill(skillId: string, spaceId?: string): boolean {
    if (spaceId) return this.getExecutor(spaceId)?.removeSkill(skillId) ?? false;
    let changed = false;
    for (const [, ex] of this.executors) {
      if (ex.removeSkill(skillId)) changed = true;
    }
    return changed;
  }

  listSkills(spaceId?: string): CoreSkill[] {
    if (spaceId) return this.getExecutor(spaceId)?.listSkills(spaceId) ?? [];
    const all: CoreSkill[] = [];
    const seen = new Set<string>();
    for (const [, ex] of this.executors) {
      for (const skill of ex.listSkills()) {
        if (!seen.has(skill.id)) { all.push(skill); seen.add(skill.id); }
      }
    }
    return all;
  }

  switchMode(spaceId: string, newMode: string): boolean {
    const executor = this.getExecutor(spaceId);
    if (!executor) return false;
    const space = this.spaces.get(spaceId);
    if (space) space.activeMode = newMode;
    const prev = executor.getMode();
    executor.switchMode(newMode);
    // @ts-expect-error McpServer.notification() exists at runtime via Protocol
    this.mcpServer.notification({
      method: SKILL_EVENTS.MODE_SWITCHED,
      params: {
        spaceId,
        previousMode: prev,
        newMode,
        activeSkills: executor.listSkills(spaceId).filter(s => s.enabled).map(s => s.id),
      },
    }).catch((err: Error) => logger.error({ err, spaceId }, 'Failed to send mode_switched notification'));
    return true;
  }

  resolveConflict(resolution: { execute: string[]; skip: string[]; reason: string; conflictGroup: string }): void {
    // Route to all executors (conflict group is unique)
    for (const [, ex] of this.executors) {
      ex.resolveConflict(resolution);
    }
  }

  /** Forward MQTT/MCP events to relevant executors */
  handleEvent(eventName: string, triggerData: Record<string, unknown> = {}, spaceId?: string): void {
    if (spaceId) {
      this.getExecutor(spaceId)?.handleEvent(eventName, triggerData);
    } else {
      for (const [, ex] of this.executors) ex.handleEvent(eventName, triggerData);
    }
  }

  stopAll(): void {
    for (const [, ex] of this.executors) ex.stop();
  }

  private getExecutor(spaceId: string): SkillExecutor | undefined {
    const ex = this.executors.get(spaceId);
    if (!ex) logger.warn({ spaceId }, 'No executor for space');
    return ex;
  }

  private broadcastObservabilityEvent(event: ObservabilityEvent): void {
    // @ts-expect-error McpServer.notification() exists at runtime via Protocol
    this.mcpServer.notification({
      method: SKILL_EVENTS[event.type === 'skill_fired' ? 'SKILL_FIRED'
        : event.type === 'skill_escalated' ? 'SKILL_ESCALATED' : 'SKILL_CONFLICT'],
      params: event,
    }).catch((err: Error) => logger.error({ err, eventType: event.type }, 'Failed to broadcast observability event'));

    // SpaceManager extends EventEmitter — emit directly for local consumers
    this.emit(event.type, event);
  }
}
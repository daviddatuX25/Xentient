import { EventEmitter } from 'events';
import pino from 'pino';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Space, CoreSkill, ObservabilityEvent, SpaceNode } from '../shared/types';
import { SKILL_EVENTS } from '../shared/contracts';
import { SkillExecutor } from './SkillExecutor';
import { SkillLog } from './SkillLog';
import { ModeManager } from './ModeManager';
import { MqttClient } from '../comms/MqttClient';
import { PackLoader } from './PackLoader';
import { TransitionQueue } from './TransitionQueue';
import { toNodeProfile, DEFAULT_NODE_PROFILE } from './nodeProfileCompiler';
import type { SkillPersistence } from './SkillPersistence';

const logger = pino({ name: 'space-manager' }, process.stderr);

const ACK_TIMEOUT_MS = 5000;

export class SpaceManager extends EventEmitter {
  private spaces: Map<string, Space> = new Map();
  private executors: Map<string, SkillExecutor> = new Map();
  readonly skillLog: SkillLog;
  private persistence?: SkillPersistence;
  readonly transitionQueue: TransitionQueue;
  private packLoader?: PackLoader;
  private pendingAcks = new Map<string, { nodeId: string; timeout: ReturnType<typeof setTimeout> }>();

  constructor(
    private mcpServer: McpServer,
    private modeManager: ModeManager,
    private mqttClient: MqttClient,
    private getSensorSnapshot: () => Record<string, unknown>,
    private getCameraFrame?: () => string | undefined,
  ) {
    super();
    this.skillLog = new SkillLog();
    this.transitionQueue = new TransitionQueue();
  }

  /** Inject persistence instance (called from core after construction) */
  setPersistence(persistence: SkillPersistence): void {
    this.persistence = persistence;
  }

  /** Inject PackLoader for config validation and NodeProfile compilation */
  setPackLoader(packLoader: PackLoader): void {
    this.packLoader = packLoader;
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
      persistence: this.persistence,
      getBrainConnected: () => true,  // v1: stdio transport is always connected while process runs
    });

    // Wire LCD/chime emission from executor to MCP notifications
    executor.on('lcd', ({ line1, line2 }: { line1: string; line2: string }) => {
        this.mcpServer.server.notification({
        method: 'xentient/internal_lcd',
        params: { spaceId: space.id, line1, line2 },
      } as any).catch((err: Error) => logger.error({ err }, 'Failed to send internal_lcd notification'));
    });

    executor.on('chime', ({ preset }: { preset: string }) => {
        this.mcpServer.server.notification({
        method: 'xentient/internal_chime',
        params: { spaceId: space.id, preset },
      } as any).catch((err: Error) => logger.error({ err }, 'Failed to send internal_chime notification'));
    });

    this.executors.set(space.id, executor);
    executor.start();
    logger.info({ spaceId: space.id, activeConfig: space.activeConfig }, 'Space added and executor started');
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
    this.emit('skill_registered', { skillId: skill.id, source: skill.source, triggerType: skill.trigger.type });
  }

  updateSkill(skillId: string, patch: Partial<CoreSkill>, spaceId?: string): boolean {
    if (spaceId) {
      const updated = this.getExecutor(spaceId)?.updateSkill(skillId, patch) ?? false;
      if (updated) this.emit('skill_updated', { skillId, patch });
      return updated;
    }
    let changed = false;
    for (const [, ex] of this.executors) {
      if (ex.updateSkill(skillId, patch)) changed = true;
    }
    if (changed) this.emit('skill_updated', { skillId, patch });
    return changed;
  }

  disableSkill(skillId: string, enabled: boolean, spaceId?: string): boolean {
    if (spaceId) {
      const disabled = this.getExecutor(spaceId)?.disableSkill(skillId, enabled) ?? false;
      if (disabled) this.emit('skill_updated', { skillId, patch: { enabled } });
      return disabled;
    }
    let changed = false;
    for (const [, ex] of this.executors) {
      if (ex.disableSkill(skillId, enabled)) changed = true;
    }
    if (changed) this.emit('skill_updated', { skillId, patch: { enabled } });
    return changed;
  }

  removeSkill(skillId: string, spaceId?: string): boolean {
    if (spaceId) {
      const removed = this.getExecutor(spaceId)?.removeSkill(skillId) ?? false;
      if (removed) this.emit('skill_removed', { skillId });
      return removed;
    }
    let changed = false;
    for (const [, ex] of this.executors) {
      if (ex.removeSkill(skillId)) changed = true;
    }
    if (changed) this.emit('skill_removed', { skillId });
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

  /** Return counter snapshot from the first (or specified) executor. */
  getCounters(spaceId?: string): Record<string, number> {
    const executor = spaceId
      ? this.getExecutor(spaceId)
      : this.executors.values().next().value;
    return executor?.getCounters() ?? {};
  }

  /** @deprecated Use activateConfig instead */
  switchMode(spaceId: string, newMode: string): boolean {
    return this.activateConfig(spaceId, newMode);
  }

  /**
   * Activate a named configuration for a Space.
   * Queues the transition for execution on the next heartbeat tick drain.
   * Returns true if the transition was queued (valid config), false otherwise.
   */
  activateConfig(spaceId: string, configName: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) {
      logger.warn({ spaceId }, 'No space found for activateConfig');
      return false;
    }

    // Validate config exists in the active pack (if packLoader is available)
    if (this.packLoader) {
      const manifest = this.packLoader.getLoadedPackManifest();
      if (manifest) {
        const config = manifest.configurations.find(c => c.name === configName);
        if (!config) {
          logger.error({ configName, pack: this.packLoader.getLoadedPack() }, 'Configuration not found in active pack');
          return false;
        }
      }
    }

    this.transitionQueue.enqueue({ type: 'activate_config', configName, spaceId });
    logger.info({ spaceId, configName, queueDepth: this.transitionQueue.pending }, 'Config transition queued');
    return true;
  }

  /** @deprecated Use activateConfig instead — kept for ModeManager bridge compat */
  updateSpaceMode(spaceId: string, mode: string): void {
    // Sync the first node's state with the mode transition
    const space = this.spaces.get(spaceId);
    if (!space) return;
    const prev = space.activeConfig;
    if (prev === mode) return;
    space.activeConfig = mode;
    this.emit('spaceModeChanged', { spaceId, from: prev, to: mode });
  }

  /**
   * Execute a queued config transition.
   * Called by the heartbeat tick after all skill evaluations complete.
   */
  private executeConfigTransition(spaceId: string, configName: string): void {
    const space = this.spaces.get(spaceId);
    if (!space) {
      logger.warn({ spaceId }, 'No space found for config transition');
      return;
    }

    const previousConfig = space.activeConfig;

    // 1. Update space state
    space.activeConfig = configName;

    // 2. Compile and push NodeProfiles for each node (if packLoader available)
    if (this.packLoader) {
      const manifest = this.packLoader.getLoadedPackManifest();
      const config = manifest?.configurations.find(c => c.name === configName);
      if (manifest && config) {
        for (const node of space.nodes) {
          const nodeSkillId = config.nodeAssignments[node.role];
          if (!nodeSkillId) {
            // No assignment for this role in the new config — reset to default
            this.pushDefaultProfile(node);
            node.state = 'dormant';
            logger.info({ nodeId: node.nodeId, role: node.role, configName }, 'No NodeSkill assignment for role — pushed default profile');
            continue;
          }

          const nodeSkill = manifest.nodeSkills.find(ns => ns.id === nodeSkillId);
          if (!nodeSkill) {
            logger.warn({ nodeSkillId, role: node.role }, 'NodeSkill not found in pack');
            this.pushDefaultProfile(node);
            continue;
          }

          const profile = toNodeProfile(nodeSkill, node);
          if (profile) {
            this.mqttClient.publish(
              `xentient/node/${node.nodeId}/profile/set`,
              { v: 1, type: 'node_profile_set', ...profile },
            );
            node.state = 'running';
            // Register ack timeout for this node
            const ackTimeout = setTimeout(() => {
              this.pendingAcks.delete(node.nodeId);
              logger.warn({ nodeId: node.nodeId }, 'NodeProfile ack timeout — node may be offline');
              node.state = 'dormant';
              this.mcpServer.server.notification({
                method: 'xentient/node_offline',
                params: { nodeId: node.nodeId, reason: 'ack_timeout' },
              } as any).catch((err: Error) => logger.error({ err }, 'Failed to send node_offline notification'));
            }, ACK_TIMEOUT_MS);
            this.pendingAcks.set(node.nodeId, { nodeId: node.nodeId, timeout: ackTimeout });
          } else {
            this.pushDefaultProfile(node);
            logger.warn({ configName, nodeId: node.nodeId, role: node.role }, 'NodeSkill hardware mismatch, pushed default profile');
          }
        }
      }
    }

    // 3. Enable config-scoped CoreSkills
    const executor = this.executors.get(spaceId);
    if (executor) {
      executor.setActiveConfig(configName);
    }

    // 4. Notify Brain via MCP
    this.mcpServer.server.notification({
      method: SKILL_EVENTS.CONFIG_CHANGED,
      params: {
        spaceId,
        previousConfig,
        newConfig: configName,
        activeSkills: executor?.listSkills(spaceId).filter(s => s.enabled).map(s => s.id) ?? [],
      },
    } as any).catch((err: Error) => logger.error({ err, spaceId }, 'Failed to send config_changed notification'));

    // 5. Observability event
    this.broadcastObservabilityEvent({
      type: 'config_changed',
      spaceId,
      previousConfig,
      newConfig: configName,
      timestamp: Date.now(),
    } as any);

    logger.info({ spaceId, previousConfig, newConfig: configName }, 'Config transition executed');
  }

  /** Push default NodeProfile to a node (used when NodeSkill is missing or incompatible) */
  private pushDefaultProfile(node: { nodeId: string }): void {
    this.mqttClient.publish(
      `xentient/node/${node.nodeId}/profile/set`,
      { v: 1, type: 'node_profile_set', ...DEFAULT_NODE_PROFILE },
    );
    logger.info({ nodeId: node.nodeId }, 'Default NodeProfile pushed');
  }

  /**
   * Process one queued transition. Called after each heartbeat tick cycle.
   * Returns true if a transition was processed, false if queue was empty.
   */
  drainTransition(): boolean {
    const action = this.transitionQueue.drain();
    if (!action) return false;

    switch (action.type) {
      case 'activate_config':
        this.executeConfigTransition(action.spaceId, action.configName);
        break;
      case 'set_node_state': {
        const space = this.spaces.get(action.spaceId);
        if (space) {
          const node = space.nodes.find(n => n.nodeId === action.nodeId);
          if (node) node.state = action.state;
        }
        break;
      }
      case 'register_skill':
        this.registerSkill(action.skill);
        break;
      case 'remove_skill':
        this.removeSkill(action.skillId, action.spaceId);
        break;
    }

    return true;
  }

  /** Handle firmware ack for a node profile set command */
  onNodeProfileAck(nodeId: string, status: 'loaded' | 'error'): void {
    const pending = this.pendingAcks.get(nodeId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(nodeId);
    }

    if (status === 'error') {
      logger.warn({ nodeId }, 'NodeProfile ack received with error status');
      for (const [, space] of this.spaces) {
        const node = space.nodes.find(n => n.nodeId === nodeId);
        if (node) {
          node.state = 'dormant';
          this.pushDefaultProfile(node);
          this.mcpServer.server.notification({
            method: 'xentient/node_error',
            params: { nodeId, status: 'error' },
          } as any).catch((err: Error) => logger.error({ err }, 'Failed to send node_error notification'));
          break;
        }
      }
    } else {
      logger.info({ nodeId }, 'NodeProfile ack received — profile loaded');
    }
  }

  /** Handle firmware birth message — node is online and ready */
  onNodeBirth(nodeId: string, spaceId?: string): void {
    for (const [sid, space] of this.spaces) {
      const node = space.nodes.find(n => n.nodeId === nodeId);
      if (node) {
        if (node.status !== 'pending' && node.status !== 'active') {
          logger.warn({ nodeId, nodeStatus: node.status }, 'Birth from unregistered node — ignoring');
          break;
        }
        if (spaceId && sid !== spaceId) {
          logger.warn({ nodeId, expectedSpace: sid, claimedSpace: spaceId }, 'Birth spaceId mismatch — ignoring');
          break;
        }
        if (node.state === 'dormant') {
          node.state = 'running';
          node.lastSeen = Date.now();
          logger.info({ nodeId }, 'Node birth received — transitioning to running');
          this.pushDefaultProfile(node);
        }
        break;
      }
    }
  }

  /** Register a new node in a space (called by NodeProvisioner) */
  registerNode(spaceId: string, node: SpaceNode): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    if (space.nodes.some(n => n.nodeId === node.nodeId)) return false;
    space.nodes.push(node);
    logger.info({ nodeId: node.nodeId, spaceId }, 'Node registered');
    return true;
  }

  /** Update a node's status (pending → active) (called by NodeProvisioner) */
  updateNodeStatus(spaceId: string, nodeId: string, status: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    const node = space.nodes.find(n => n.nodeId === nodeId);
    if (!node) return false;
    node.status = status as 'pending' | 'active';
    node.lastSeen = Date.now();
    return true;
  }

  /** Remove a node from a space (called by NodeProvisioner cleanup) */
  removeNode(spaceId: string, nodeId: string): boolean {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    const idx = space.nodes.findIndex(n => n.nodeId === nodeId);
    if (idx < 0) return false;
    space.nodes.splice(idx, 1);
    logger.info({ nodeId, spaceId }, 'Node removed');
    return true;
  }

  /** Called when MQTT reconnects — replay active configurations */
  onMqttReconnect(): void {
    logger.info('MQTT reconnected — replaying active configurations');
    for (const [spaceId, space] of this.spaces) {
      if (space.activeConfig && space.activeConfig !== 'default') {
        this.transitionQueue.enqueue({
          type: 'activate_config',
          configName: space.activeConfig,
          spaceId,
        });
      }
    }
  }

  /**
   * Tick: evaluate all skills, then drain one transition.
   * Called by the main loop or externally.
   */
  tick(): void {
    // Evaluate skills on each executor
    for (const [, executor] of this.executors) {
      executor.tick();
    }

    // After all ticks complete, drain one transition
    this.drainTransition();
  }

  resolveConflict(resolution: { execute: string[]; skip: string[]; reason: string; conflictGroup: string }): void {
    // Route to all executors (conflict group is unique)
    for (const [, ex] of this.executors) {
      ex.resolveConflict(resolution);
    }
  }

  /** Close an escalation (called by brain stream on escalation_complete) */
  closeEscalation(escalationId: string): void {
    logger.info({ escalationId }, "Escalation closed (brain stream)");
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

  /** Retrieve a Space by ID. Returns undefined if not found. */
  getSpace(spaceId: string): Space | undefined {
    return this.spaces.get(spaceId);
  }

  /** Retrieve a SkillExecutor by space ID. Returns undefined if not found. */
  getExecutor(spaceId: string): SkillExecutor | undefined {
    const ex = this.executors.get(spaceId);
    if (!ex) logger.warn({ spaceId }, 'No executor for space');
    return ex;
  }

  private broadcastObservabilityEvent(event: ObservabilityEvent): void {
    this.mcpServer.server.notification({
      method: SKILL_EVENTS[event.type === 'skill_fired' ? 'SKILL_FIRED'
        : event.type === 'skill_escalated' ? 'SKILL_ESCALATED' : 'SKILL_CONFLICT'],
      params: event,
    } as any).catch((err: Error) => logger.error({ err, eventType: event.type }, 'Failed to broadcast observability event'));

    // SpaceManager extends EventEmitter — emit directly for local consumers
    this.emit(event.type, event);
  }
}
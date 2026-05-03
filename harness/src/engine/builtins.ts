import { CoreSkill } from '../shared/types';

/** PIR motion → wake from sleep to listen */
export const PIR_WAKE: CoreSkill = {
  id: '_pir-wake',
  displayName: 'PIR Wake',
  enabled: true,
  spaceId: '*',
  trigger: { type: 'event', event: 'motion_detected' },
  priority: 0,
  actions: [{ type: 'set_mode', mode: 'listen' }],
  source: 'builtin',
  cooldownMs: 0,
  fireCount: 0,
  escalationCount: 0,
};

/** Idle timer → return to sleep */
export const IDLE_SLEEP: CoreSkill = {
  id: '_idle-sleep',
  displayName: 'Idle Sleep',
  enabled: true,
  spaceId: '*',
  trigger: { type: 'interval', everyMs: 60_000 },
  priority: 50,
  actions: [{ type: 'set_mode', mode: 'sleep' }],
  source: 'builtin',
  cooldownMs: 0,
  fireCount: 0,
  escalationCount: 0,
};

/** Sensor telemetry — log readings every 30s */
export const SENSOR_TELEMETRY: CoreSkill = {
  id: '_sensor-telemetry',
  displayName: 'Sensor Telemetry',
  enabled: true,
  spaceId: '*',
  trigger: { type: 'interval', everyMs: 30_000 },
  priority: 100,
  actions: [{ type: 'log', message: 'sensor-telemetry' }],
  source: 'builtin',
  cooldownMs: 0,
  fireCount: 0,
  escalationCount: 0,
};

/** Conflict arbiter — escalates skill conflicts to Brain */
export const DETERMINE_SKILL: CoreSkill = {
  id: '_determine-skill',
  displayName: 'Skill Conflict Arbitrator',
  enabled: true,
  spaceId: '*',
  trigger: { type: 'internal', event: 'skill_conflict' },
  priority: 0,
  actions: [],
  escalation: {
    conditions: [{ field: 'conflictCount', operator: '>=', value: 2 }],
    event: 'skill_conflict',
    contextBuilder: 'full-context',
    priority: 'urgent',
    cooldownMs: 0,
  },
  source: 'builtin',
  cooldownMs: 0,
  fireCount: 0,
  escalationCount: 0,
};

export const ALL_BUILTINS: CoreSkill[] = [PIR_WAKE, IDLE_SLEEP, SENSOR_TELEMETRY, DETERMINE_SKILL];
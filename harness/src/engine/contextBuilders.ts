import { ContextBuilderType, CoreSkill } from '../shared/types';

export interface SensorSnapshot {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  motion?: boolean;
  lastMotionAt?: number;
}

export interface ContextPayload {
  skillId: string;
  spaceId: string;
  triggerData: Record<string, unknown>;
  sensors?: SensorSnapshot;
  cameraFrameB64?: string;
  counters?: Record<string, number>;
  modeHistory?: string[];
}

export function buildContext(
  type: ContextBuilderType,
  skill: CoreSkill,
  triggerData: Record<string, unknown>,
  sensors: SensorSnapshot,
  counters: Record<string, number>,
  modeHistory: string[],
  getCameraFrame?: () => string | undefined,
): ContextPayload {
  const base: ContextPayload = {
    skillId: skill.id,
    spaceId: skill.spaceId,
    triggerData,
  };

  switch (type) {
    case 'minimal':
      return base;
    case 'sensor-snapshot':
      return { ...base, sensors };
    case 'camera-snapshot': {
      const frame = getCameraFrame?.();
      return { ...base, cameraFrameB64: frame };
    }
    case 'full-context':
      return {
        ...base,
        sensors,
        cameraFrameB64: getCameraFrame?.(),
        counters,
        modeHistory,
      };
    default:
      return base;
  }
}
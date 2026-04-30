import { describe, it, expect } from 'vitest';
import { toNodeProfile, DEFAULT_NODE_PROFILE } from '../src/engine/nodeProfileCompiler';
import type { NodeSkill, SpaceNode } from '../src/shared/types';
import { EVENT_MASK_BITS } from '../src/shared/contracts';

function makeNodeSkill(overrides: Partial<NodeSkill> = {}): NodeSkill {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    requires: { pir: true },
    sampling: { pirDebounceMs: 1000, micMode: 0 },
    emits: ['motion'],
    expectedBy: '_pir-wake',
    compatibleConfigs: ['default'],
    ...overrides,
  };
}

function makeNode(overrides: Partial<SpaceNode> = {}): SpaceNode {
  return {
    nodeId: 'node-01',
    role: 'base',
    hardware: ['motion', 'temperature'],
    state: 'dormant',
    ...overrides,
  };
}

describe('nodeProfileCompiler gap tests', () => {
  it('unknown emit type does not corrupt eventMask — only known bits set', () => {
    const skill = makeNodeSkill({ emits: ['motion', 'UNKNOWN_TYPE'] });
    const node = makeNode({ hardware: ['motion'] });
    const profile = toNodeProfile(skill, node);

    expect(profile).not.toBeNull();
    expect(profile!.eventMask & EVENT_MASK_BITS.MOTION).toBe(EVENT_MASK_BITS.MOTION);
    expect(profile!.eventMask & EVENT_MASK_BITS.PRESENCE).toBe(0);
  });

  it('micMode=2 (always-on) produces correct eventMask with AUDIO_CHUNK bit', () => {
    const skill = makeNodeSkill({
      requires: { pir: true, mic: true },
      sampling: { pirDebounceMs: 1000, micMode: 2 },
      emits: ['motion', 'audio_chunk'],
    });
    const node = makeNode({ hardware: ['motion', 'audio'] });
    const profile = toNodeProfile(skill, node);

    expect(profile).not.toBeNull();
    expect(profile!.micMode).toBe(2);
    expect(profile!.eventMask & EVENT_MASK_BITS.AUDIO_CHUNK).toBe(EVENT_MASK_BITS.AUDIO_CHUNK);
    expect(profile!.eventMask & EVENT_MASK_BITS.MOTION).toBe(EVENT_MASK_BITS.MOTION);
  });

  it('hardware mismatch returns null', () => {
    const skill = makeNodeSkill({
      requires: { pir: true, mic: true, camera: true },
      emits: ['motion'],
    });
    const node = makeNode({ hardware: ['motion'] }); // missing audio and camera
    const profile = toNodeProfile(skill, node);

    expect(profile).toBeNull();
  });
});
import pino from 'pino';
import { NodeProfile, EVENT_MASK_BITS } from '../shared/contracts';
import type { SpaceNode, NodeSkill } from '../shared/types';

const logger = pino({ name: 'node-profile-compiler' }, process.stderr);

/**
 * Compiles a Core-level NodeSkill into a firmware-level NodeProfile.
 * Validates hardware requirements against the specific node's hardware list.
 * Returns null if requirements not met (caller handles fallback).
 */
export function toNodeProfile(
  nodeSkill: NodeSkill,
  node: SpaceNode,
): NodeProfile | null {
  // Hardware check — against this specific node's hardware
  if (nodeSkill.requires.pir && !node.hardware.includes('motion')) return null;
  if (nodeSkill.requires.mic && !node.hardware.includes('audio')) return null;
  if (nodeSkill.requires.bme && !node.hardware.includes('temperature')) return null;
  if (nodeSkill.requires.camera && !node.hardware.includes('camera')) return null;

  // Compile event mask from emits array
  let eventMask = 0;
  for (const eventType of nodeSkill.emits) {
    const bit = EVENT_MASK_BITS[eventType.toUpperCase() as keyof typeof EVENT_MASK_BITS];
    if (bit) {
      eventMask |= bit;
    } else {
      logger.warn({ eventType }, 'Unknown event type in NodeSkill emits — skipped from eventMask');
    }
  }

  return {
    profileId: nodeSkill.id,
    pirIntervalMs: nodeSkill.sampling.pirDebounceMs ?? 1000,
    micMode: nodeSkill.sampling.micMode ?? 0,  // explicit: 0=off, 1=vad-only, 2=always-on
    bmeIntervalMs: nodeSkill.sampling.bmeIntervalMs ?? 5000,
    cameraMode: nodeSkill.sampling.cameraMode ?? 0,
    lcdFace: 0,    // v1: calm default, LCD managed by set_lcd action
    eventMask,
  };
}

export const DEFAULT_NODE_PROFILE: NodeProfile = {
  profileId: 'default',
  pirIntervalMs: 1000,
  micMode: 0,
  bmeIntervalMs: 5000,
  cameraMode: 0,
  lcdFace: 0,
  // Enable PRESENCE | MOTION | ENV so BME280 reports on boot without needing profile swap
  eventMask: EVENT_MASK_BITS.PRESENCE | EVENT_MASK_BITS.MOTION | EVENT_MASK_BITS.ENV,
};
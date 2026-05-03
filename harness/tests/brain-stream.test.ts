import { describe, it, expect } from 'vitest';
import type { BrainStreamEvent, BrainStreamSubtype } from '../src/shared/types';

describe('BrainStreamEvent', () => {
  it('has all required fields', () => {
    const event: BrainStreamEvent = {
      type: 'brain_event',
      source: 'brain',
      escalation_id: 'esc-001',
      subtype: 'reasoning_token',
      payload: { token: 'I think...' },
      timestamp: Date.now(),
    };
    expect(event.type).toBe('brain_event');
    expect(event.escalation_id).toBe('esc-001');
    expect(event.subtype).toBe('reasoning_token');
  });

  it('all subtypes are valid strings', () => {
    const subtypes: BrainStreamSubtype[] = [
      'escalation_received', 'reasoning_token', 'tool_call_fired',
      'tool_call_result', 'tts_queued', 'escalation_complete',
    ];
    expect(subtypes).toHaveLength(6);
  });
});

describe('xentient_brain_stream validation', () => {
  const valid: BrainStreamSubtype[] = [
    'escalation_received', 'reasoning_token', 'tool_call_fired',
    'tool_call_result', 'tts_queued', 'escalation_complete',
  ];

  it('rejects invalid subtypes', () => {
    ['invalid', 'random', ''].forEach(s => {
      expect(valid.includes(s as BrainStreamSubtype)).toBe(false);
    });
  });

  it('builds correct event shape', () => {
    const event: BrainStreamEvent = {
      type: 'brain_event', source: 'brain',
      escalation_id: 'esc-123', subtype: 'tool_call_fired',
      payload: { tool: 'xentient_read_sensors' }, timestamp: Date.now(),
    };
    expect(event.subtype).toBe('tool_call_fired');
  });
});
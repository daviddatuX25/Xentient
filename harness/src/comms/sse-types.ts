/**
 * SSE Event Type Definitions (Expansion 2.4)
 *
 * Every SSE event type has a documented TypeScript type so the frontend
 * can type-check its EventSource message handler. The SSEEventMap maps
 * event type strings to their payload shapes; SSEEvent is the union of
 * all payloads (discriminated union on the `type` field).
 */

export interface SSEEventMap {
  // ── Connection ────────────────────────────────────────────────────
  connected: { type: 'connected' };

  // ── MQTT relay (existing) ─────────────────────────────────────────
  mode_status: { type: 'mode_status'; mode: string };
  pipeline_state: { type: 'pipeline_state'; state: string };
  session_complete: { type: 'session_complete'; [key: string]: unknown };
  session_error: { type: 'session_error'; message: string; recoverable: boolean };

  // ── Transcript ────────────────────────────────────────────────────
  transcript: { type: 'transcript'; text: string };

  // ── Skill observability (existing) ────────────────────────────────
  skill_fired: { type: 'skill_fired'; skillId: string; triggerType: string; actions: string[] };
  skill_escalated: { type: 'skill_escalated'; skillId: string; escalationLevel: string; context: unknown };
  skill_conflict: { type: 'skill_conflict'; skillIds: string[]; winner: string; resolution: string };

  // ── Skill lifecycle (new in 08-02) ────────────────────────────────
  skill_registered: { type: 'skill_registered'; skillId: string; source: string; triggerType: string };
  skill_removed: { type: 'skill_removed'; skillId: string };
  skill_updated: { type: 'skill_updated'; skillId: string; patch: Record<string, unknown> };

  // ── Pack lifecycle (new in 08-02) ─────────────────────────────────
  pack_loaded: { type: 'pack_loaded'; packName: string; skillCount: number };
  pack_unloaded: { type: 'pack_unloaded'; packName: string };

  // ── Event mapping lifecycle (new in 08-02) ────────────────────────
  event_mapping_added: { type: 'event_mapping_added'; mappingId: string; source: string; eventName: string };
  event_mapping_removed: { type: 'event_mapping_removed'; mappingId: string };

  // ── Throttled sensor data (new in 08-02) ──────────────────────────
  sensor_update: { type: 'sensor_update'; temperature: number | null; humidity: number | null; pressure: number | null };

  // ── Counter snapshot (new in 08-02) ───────────────────────────────
  counter_update: { type: 'counter_update'; counters: Record<string, number> };

  // ── Mode transition history (new in 08-02, Expansion 5.5) ─────────
  mode_change: { type: 'mode_change'; from: string; to: string; timestamp: number };
}

/** Discriminated union of all SSE event payloads. */
export type SSEEvent = SSEEventMap[keyof SSEEventMap];
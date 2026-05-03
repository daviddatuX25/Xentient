# Phase 6: Xentient Layers — Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Source:** PRD Express Path (docs/SPEC-xentient-layers.md) + docs/SPEC-heartbeat-rule-engine.md

---

<domain>
## Phase Boundary

Implement the **two-layer execution model** (CoreSkill/L1 + BrainSkill/L2) from SPEC-xentient-layers.md on top of the existing Core (`harness/src/`).

This phase does NOT ship the Brain (Hermes/Archon). It ships the **Core side** of the contract:
- `CoreSkill` type system (evolution of the `Rule` type from SPEC-heartbeat-rule-engine.md)
- `SkillExecutor` (extends RuleEngine: adds L1 actions + data collection + escalation pipeline)
- Escalation pipeline (`xentient/skill_escalated` MCP notification)
- Conflict resolver + `_determine-skill` builtin
- Observability SSE bus (`skill_fired`, `skill_escalated`, `skill_conflict`)
- MCP skill management tools (`xentient_register_skill`, `xentient_update_skill`, `xentient_disable_skill`, `xentient_remove_skill`, `xentient_list_skills`, `xentient_get_skill_log`, `xentient_switch_mode`, `xentient_resolve_conflict`)
- Mode switcher (mode-aware skill activation, `xentient_switch_mode`)
- Skill execution log (persistent ring buffer, 1000 entries)
- Multi-Space architecture (each Space has its own heartbeat evaluation, all share one Brain)

**Does NOT include** in this phase:
- Pack integration (`skills.json`/`modes` in manifest) — deferred to Phase 7
- Web Dashboard skill panels (Livewire components) — deferred to Phase 8
- Brain skill registration flow (Hermes dynamically registers Core Skills) — deferred to Phase 9
- Any Hermes/Archon/Mem0 Brain-side code
</domain>

<decisions>
## Implementation Decisions

### Type System
- `CoreSkill` replaces `Rule` as the primary type. See SPEC §4.1 for full schema.
- `Rule` and `RuleEngine` still exist as lower-level primitives; `SkillExecutor` wraps/extends `RuleEngine`.
- `Mode` is a named behavioral profile (`"student"`, `"family"`, `"developer"`) — NOT the same as `SpaceMode` (hardware state: sleep/listen/active/record).
- `Space` type added to `shared/types.ts` per SPEC §3.1.
- `SpaceMode` = existing ModeManager mode state. `Mode` = new behavioral profile.

### SkillExecutor Architecture
- `SkillExecutor` extends (or wraps) `RuleEngine` — don't replace it, build on top.
- Each Space gets its own `SkillExecutor` instance. All share one `McpServer`.
- Skill evaluation is tick-based (1–5s interval per Space, configurable).
- Only skills where `skill.spaceId === space.id` (or `"*"` for global builtins) are evaluated per Space.

### L1 Actions (FAST path — no LLM, <1ms)
| Action | Implementation |
|--------|---------------|
| `set_lcd` | Calls existing `xentient_set_lcd` MCP tool handler directly |
| `play_chime` | Calls existing `xentient_play_audio` with preset WAV |
| `set_mode` | Calls `ModeManager.setMode()` (SpaceMode transition) |
| `mqtt_publish` | Calls `MqttClient.publish()` |
| `increment_counter` | Updates in-memory counter map |
| `log` | Writes to Pino logger + SSE observability event |

### Escalation Pipeline (SLOW path — Core → Brain)
- When escalation conditions met → build context (via `ContextBuilderType`) → send `xentient/skill_escalated` MCP notification.
- `ContextBuilderType`:
  - `"sensor-snapshot"` — all sensor readings from SensorCache
  - `"camera-snapshot"` — latest JPEG from CameraServer
  - `"full-context"` — sensors + camera + mode history + counters
  - `"minimal"` — just skillId + trigger info
- Escalation has its own `cooldownMs` separate from skill fire cooldown.
- `escalated: boolean` tracked in `SkillLogEntry`.

### Conflict Resolver
- Tier 1: Priority ordering (deterministic) — default for all cases.
- Tier 2: `conflictGroup` arbitration — when skills share a group, pause both, send `xentient/skill_conflict`, await Brain's `xentient_resolve_conflict` tool call.
- Tier 3: Handled by Brain (skill-improver, out of scope for this phase).
- `_determine-skill` builtin: global, `spaceId: "*"`, handles internal `skill_conflict` events.
- Fallback when Brain not connected: fall back to Tier 1 (priority ordering).

### Observability SSE Bus
- Every skill fire → `SkillFireEvent` emitted on `ControlServer` SSE stream.
- Every escalation → `SkillEscalationEvent` emitted.
- Every conflict → `SkillConflictEvent` emitted.
- SSE event type prefix: `"skill_fired"`, `"skill_escalated"`, `"skill_conflict"`.
- These piggyback on the existing `ControlServer` SSE infrastructure.

### Skill Execution Log
- Ring buffer: last 1000 entries, in-memory (default).
- Queryable via `xentient_get_skill_log` MCP tool (filterable by spaceId, skillId, time range).
- `SkillLogEntry` stores Brain's response if escalated (filled in when Brain replies).
- File: `harness/src/engine/SkillLog.ts`.

### MCP Tool Naming Convention
All new tools follow `xentient_<verb>_skill` pattern per SPEC §8.1:
- `xentient_register_skill` — Brain creates a new CoreSkill
- `xentient_update_skill` — Brain modifies a CoreSkill
- `xentient_disable_skill` — Brain enables/disables
- `xentient_remove_skill` — Brain deletes (builtin skills: reject)
- `xentient_list_skills` — Query all CoreSkills + state (per space or all)
- `xentient_get_skill_log` — Read skill execution log
- `xentient_switch_mode` — Change active Mode for a Space
- `xentient_resolve_conflict` — Brain responds to `skill_conflict`

Existing MCP tools (`xentient_register_rule`, `xentient_list_rules`, `xentient_unregister_rule`) from the heartbeat spec are **replaced** by the new skill tools. They will be removed from `mcp/tools.ts`.

### Multi-Space Management
- `SpaceManager` class: holds `Map<spaceId, Space>` + `Map<spaceId, SkillExecutor>`.
- Wired into `core.ts` alongside existing components.
- For v1 (single node): default Space `{ id: "default", nodeBaseId: process.env.NODE_ID }` created on startup.
- Multi-node in future: additional Spaces registered via config or MCP.

### Mode vs SpaceMode Disambiguation
- `SpaceMode` (hardware): `sleep | listen | active | record` — owned by `ModeManager`. Unchanged.
- `Mode` (behavioral): `"student" | "family" | "developer" | "default"` — new, owned by `SpaceManager`.
- `activeMode` on a Space determines which `CoreSkill`s are active.
- Skills with `spaceId` matching AND `mode` matching (or no mode filter = all modes) are evaluated.

### Builtin Skills
Four builtins (prefixed `_`) ship with Core, always available, cannot be removed:
1. `_pir-wake`: PIR motion → set_mode (listen). Wraps existing ModeManager logic.
2. `_idle-sleep`: interval (configurable) → set_mode (sleep).
3. `_sensor-telemetry`: interval 30s → log sensor readings.
4. `_determine-skill`: internal conflict event → escalate to Brain (conflict arbiter).

### File Structure (new files)
```
harness/src/
├── engine/
│   ├── SkillExecutor.ts      # NEW — extends RuleEngine, adds L1 actions + escalation
│   ├── SkillLog.ts           # NEW — ring buffer skill execution log
│   ├── SpaceManager.ts       # NEW — manages Spaces + per-Space SkillExecutors
│   ├── builtins.ts           # NEW — builtin CoreSkill definitions (_pir-wake, etc.)
│   ├── contextBuilders.ts    # NEW — builds escalation context payloads
│   └── conflictResolver.ts   # NEW — Tier 1/2 conflict resolution
├── mcp/
│   ├── tools.ts              # MODIFY — add 8 new skill tools, remove old rule tools
│   └── events.ts             # MODIFY — add skill_fired, skill_escalated, skill_conflict
├── shared/
│   └── types.ts              # MODIFY — add CoreSkill, Space, Mode, SkillLogEntry types
└── core.ts                   # MODIFY — wire SpaceManager + SkillExecutor into startup
```

### the agent's Discretion
- Cron scheduling for CoreSkills: use `node-cron` (already in package.json or add if missing).
- Counter storage: simple in-memory `Map<string, number>` per Space — no persistence needed for v1.
- Conflict await timeout: 10s. If Brain doesn't respond in 10s, fall back to priority ordering.
- `play_chime` preset mapping: define `CHIME_PRESETS` map to WAV file paths in `config/default.json`.
- TypeScript strict mode is already on — all types must be complete.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary Spec (THE LAW for this phase)
- `docs/SPEC-xentient-layers.md` — Full CoreSkill type, escalation pipeline, conflict resolution, observability, MCP interface. All type names and tool signatures come from here.

### Foundation Spec (what RuleEngine was)
- `docs/SPEC-heartbeat-rule-engine.md` — RuleEngine design, RuleAction types, connection health. SkillExecutor builds on this.

### Existing Code (MUST READ before touching)
- `harness/src/core.ts` — Entry point, see what's already wired
- `harness/src/engine/ModeManager.ts` — SpaceMode state machine (do not break)
- `harness/src/mcp/tools.ts` — Existing 7 MCP tools (additive change)
- `harness/src/mcp/events.ts` — Existing 5 MCP notifications
- `harness/src/shared/contracts.ts` — MODE_VALUES, MQTT topics, wire contracts
- `harness/src/shared/types.ts` — Existing type definitions

### Architecture Context
- `docs/ARCHITECTURE-REFINEMENT-core-as-mcp.md` — Core-as-MCP-shell design rationale
- `docs/SPACES.md` — Space model (SpaceMode = hardware state)
- `docs/VISION.md` — Bridge model, three-tier architecture, what Core is NOT
</canonical_refs>

<specifics>
## Specific Implementation Details

### CoreSkill Trigger Types (from SPEC §4.1)
These extend/replace Rule triggers — cron, interval, mode (SpaceMode transition), sensor, event, composite.
Sensor operator adds `">="` and `"<="` vs old Rule which only had `">"`, `"<"`, `"=="`.

### Escalation Conditions (EscalationCondition from SPEC §4.1)
```typescript
interface EscalationCondition {
  field: string;         // e.g. "motionCount", "temperature"
  operator: ">=" | "<=" | ">" | "<" | "==" | "!=";
  value: number;
}
```
Multiple conditions: ALL must be true for escalation to fire.

### SkillFireEvent payload (SPEC §7.1)
```typescript
interface SkillFireEvent {
  type: "skill_fired";
  skillId: string;
  spaceId: string;
  mode: string;
  trigger: string;
  actionsExecuted: string[];
  escalated: boolean;
  timestamp: number;
}
```

### xentient/skill_escalated notification payload (SPEC §8.2)
```json
{ "skillId": "...", "spaceId": "...", "event": "...", "context": {...}, "priority": "normal" }
```

### _determine-skill builtin (SPEC §6.3 — exact definition)
```typescript
{
  id: "_determine-skill",
  displayName: "Skill Conflict Arbitrator",
  enabled: true,
  spaceId: "*",
  trigger: { type: "internal", event: "skill_conflict" },
  actions: [],
  escalation: {
    conditions: [{ field: "conflictCount", operator: ">=", value: 2 }],
    event: "skill_conflict",
    contextBuilder: "full-context",
    priority: "urgent",
    cooldownMs: 0,
  },
  source: "builtin",
  priority: 0,
  cooldownMs: 0,
  fireCount: 0,
  escalationCount: 0,
}
```

### xentient_resolve_conflict tool (SPEC §8.1)
Brain responds with:
```json
{ "execute": ["skill-id-1"], "skip": ["skill-id-2"], "reason": "explanation" }
```
Core must hold conflicting skills in pending state while awaiting this.

### Default Space (v1 single-node)
On startup if no spaces configured:
```json
{
  "id": "default",
  "nodeBaseId": "<NODE_ID env>",
  "activePack": "default",
  "spaceMode": "listen",
  "activeMode": "default",
  "integrations": [],
  "sensors": ["temperature", "humidity", "motion"]
}
```
</specifics>

<deferred>
## Deferred Ideas

- **Pack integration** (`skills.json` + `modes` in manifest): Deferred to Phase 7. Packs will define CoreSkills; SpaceManager loads them.
- **Web Dashboard skill panels**: Deferred to Phase 8 (Livewire components consuming SSE).
- **Brain skill registration flow** (Hermes registers Core Skills dynamically): Deferred to Phase 9.
- **Cross-Space queries** from Brain: Supported via existing `xentient_read_sensors(spaceId)` — no new work needed now.
- **Multi-node hardware** (multiple physical Node Bases): Architecture supports it; deployment of second node deferred.
- **Skill persistence across restarts**: In-memory only for v1. Brain re-registers on reconnect.
- **Skill-improver (Tier 3 conflict resolution)**: Brain-side, deferred.
- **`record` SpaceMode trigger**: Existing ModeManager supports it; no new CoreSkill needed now.
</deferred>

---

*Phase: 06-xentient-layers*
*Context gathered: 2026-04-26 via PRD Express Path (SPEC-xentient-layers.md)*

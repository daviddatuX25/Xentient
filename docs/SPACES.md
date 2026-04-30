# Xentient Spaces & Modes

> L2 Spec — Space model, Mode state machine, integration tiers, and memory scoping. Referenced by CONTEXT.md and implemented by SpaceManager/ModeManager.

---

## What is a Space?

A **Space** is an identity context — like a user account on a computer. It defines who Xentient is being, what it can access, and what mode it's in. Spaces are not just rooms; they're identity contexts.

```
Space = Identity (who am I?)
      + Pack (how do I behave?)
      + Mode (what state am I in?)
      + Permissions (what can I access?)
      + Memory scope (what do I remember?)
```

The same physical hardware can be a simple room assistant in one Space and a full developer workstation in another. Switching Spaces changes the personality, the capabilities, and the memory scope — without moving any hardware.

---

## Space Interface

```typescript
interface SpaceNode {
  nodeId: string;            // MQTT client ID of the physical Node Base
  role: string;              // role within this space: "ceiling-unit", "teacher-desk", etc.
  hardware: string[];        // available peripherals: ["motion", "temperature", "audio"]
  state: CoreNodeState;      // dormant | running
}

interface Space {
  id: string;                // kebab-case: "living-room", "study-desk"
  nodes: SpaceNode[];        // physical nodes assigned to this space
  activePack: string;        // which pack is loaded
  activeConfig: string;      // which configuration is active (e.g., "classroom", "idle")
  availableConfigs: string[];// configurations available in the active pack
  integrations: Integration[];// which AI brains are available
  role?: string;             // optional context: "student", "family", "dev"
  sensors: string[];         // available peripherals (from peripheral ID registry)
}

type CoreNodeState = "dormant" | "running";
```

**Field rules:**
- `id`: `[a-z0-9-]{1,32}` kebab-case. Unique across all Spaces.
- `nodes`: Array of physical Node Bases assigned to this space. Each has a role, hardware capabilities, and state.
- `activePack`: Must reference a pack that exists in `packs/`. Validated at Space creation time.
- `activeConfig`: The currently active configuration name. Defaults to `"default"`. Changed via `activateConfig()` which transitions through `TransitionQueue`.
- `integrations`: Ordered array. First entry is the primary integration for default routing.
- `role`: Optional string that affects memory scoping and persona behavior.
- `sensors`: Array of peripheral type names from the ID registry in CONTRACTS.md.

---

## CoreNodeState Type

```typescript
type CoreNodeState =
  | "dormant"    // node is offline, ack timeout, or not yet configured
  | "running"    // node is actively running a NodeProfile
```

Node states are managed by `SpaceManager`. A node transitions to `running` when it acks a `node_profile_set`. It transitions to `dormant` on ack timeout or explicit `set_dormant`. The `ModeManager` still handles the hardware state machine (sleep/listen/active/record) for the overall room mode, but `CoreNodeState` tracks whether individual nodes are operational.

---

## Integration Type

```typescript
type Integration =
  | "basic"          // direct LLM call (always available)
  | "hermes"         // Hermes Agent with full brain capabilities
  | "hermes+mem0"    // Hermes + Mem0 enhanced memory
  | "openclaw"       // computer use (terminal, browser, files)
  | "archon"         // coding workflows
```

Integration types are hierarchical:
- `basic` is always available (hardcoded fallback)
- `hermes` implies `basic` is also available as fallback
- `hermes+mem0` implies `hermes` is available
- `openclaw` and `archon` are additive — they can be combined with any `hermes` tier

See INTEGRATIONS/hermes.md, INTEGRATIONS/mem0.md, INTEGRATIONS/openclaw.md for adapter contracts.

---

## Mode State Machine

```
                    PIR motion
    ┌─────────┐  or wake word   ┌─────────┐  user speaks   ┌────────┐
    │  SLEEP  │───────────────► │  LISTEN  │─────────────► │ ACTIVE │
    │         │                 │         │                 │        │
    └─────────┘                 └─────────┘                 └────────┘
         ▲                           │  ▲                        │
         │                    timeout │  │               idle timeout│
         │                           │  │ record cmd         │
         │                           ▼  │                     │
         │                      ┌────────┐                     │
         └──────────────────────│ RECORD │◄────────────────────┘
          sleep cmd              └────────┘   explicit sleep cmd
```

### Mode Behaviors

| Mode  | Audio Processing | LLM Calls | LCD Display       | Power Usage |
|-------|------------------|-----------|-------------------|-------------|
| **SLEEP** | PIR interrupts only | None | `(_ _) Zzz` | Minimal — WiFi on, audio off |
| **LISTEN** | VAD active, wake word detection | None until triggered | `(O_O) listening` | Low — audio capture on, processing off |
| **ACTIVE** | Full pipeline (STT → LLM → TTS) | Available per Space integrations | Context-dependent (thinking/speaking faces) | Full — all hardware active |
| **RECORD** | Audio capture to file | None | `(_ _) REC` | Medium — audio capture on, no response |

### Transition Rules

| From | To | Trigger | Notes |
|------|----|---------|-------|
| SLEEP | LISTEN | PIR motion or wake word | Hardware wakes audio pipeline |
| LISTEN | ACTIVE | User speaks (VAD trigger) | Full pipeline engagement |
| LISTEN | RECORD | MQTT `mode_set` command | Audio-only capture mode |
| ACTIVE | SLEEP | Idle timeout or MQTT `mode_set` | Timeout configured per Space (default: 5 min) |
| ACTIVE | RECORD | MQTT `mode_set` command | Switch from conversation to recording |
| RECORD | SLEEP | MQTT `mode_set` command | End recording session |
| LISTEN | SLEEP | Timeout (no wake event) | Default timeout: 60 seconds |

**Invalid transitions are rejected** with `{error: "invalid_transition", from: "sleep", to: "active"}`. The Mode Manager enforces this at runtime.

### Mode Manager

The Mode Manager is a core component. It:
1. Persists the current mode in Space state
2. Manages transitions according to the state machine above
3. Routes audio/processing based on mode (e.g., drops audio in SLEEP, buffers in LISTEN)
4. Emits mode transitions on `xentient/status/mode` for telemetry
5. Integrates with the Pipeline — pauses/resumes STT/TTS based on mode

---

## Configurations (Behavioral Profiles)

A **Configuration** is a named bundle of node assignments and skill activations. While `ModeManager` handles the hardware state machine (sleep/listen/active/record), configurations define *which skills are active and which NodeProfiles are pushed to each node*.

```typescript
interface Configuration {
  name: string                    // kebab-case: "classroom", "idle", "deep-focus"
  displayName: string             // "Classroom Mode", "Idle"
  nodeAssignments: Record<string, string>  // role → NodeSkill ID
  coreSkills: string[]            // CoreSkill IDs to activate
  brainSkills?: string[]           // BrainSkill IDs to activate (optional)
}
```

When a configuration is activated:
1. The `TransitionQueue` enqueues an `activate_config` action.
2. `SpaceManager.executeConfigTransition()` compiles each node's assigned NodeSkill into a `NodeProfile` via `toNodeProfile()`.
3. Profiles are pushed to nodes via MQTT `xentient/node/{nodeId}/profile/set`.
4. A 5-second ack timer starts for each node. Timeout → node marked `dormant`, Brain notified via `xentient/node_offline`.
5. CoreSkills are activated/filtered based on `configFilter`.

On MQTT reconnect, `onMqttReconnect()` replays the active configuration for all spaces.

---

## Space Examples

| Space | Nodes | Pack | Config (default) | Integrations | Role |
|-------|-------|------|------------------|---------------|------|
| `living-room` | node-01 (ceiling-unit), node-02 (sofa-unit) | `family-companion` | default | hermes+mem0 | family |
| `study-desk` | node-03 (desk-unit) | `study-buddy` | classroom | hermes+mem0, openclaw | student |
| `workshop` | node-04 (bench-unit) | `dev-assistant` | idle | hermes+mem0, openclaw, archon | developer |
| `bedroom` | node-05 (nightstand-unit) | `prayer-companion` | default | hermes+mem0 | personal |

Each Space demonstrates the flexibility principle: same hardware architecture, different identity and capability set. The `living-room` Space is a family-friendly assistant; the `workshop` Space is a developer workstation with coding workflows.

---

## Memory Scoping (via Mem0)

Mem0 supports multi-level memory natively. The Space concept maps directly to Mem0's scoping system, replacing the flat `facts` table in current MemoryDB with a dimensionally richer model.

### Scoping Levels

| Level | Mem0 Tag | Example | Visibility |
|-------|----------|---------|------------|
| **Space-scoped** | `space_id` | "living-room temperature is usually 24C" | Only in that Space |
| **User-scoped** | `user_id` | "my name is David" | Shared across all Spaces for this user |
| **Role-scoped** | `role` | "I'm studying for midterms" | Activates in Spaces with matching role |
| **Global** | _(none)_ | "Philippines uses 220V outlets" | Available everywhere |

### How Scoping Works

Every Mem0 call from the harness includes context tags matching the active Space:

```typescript
// Mem0Adapter call with Space context
mem0.search(query, {
  space_id: space.id,       // Space-scoped facts
  user_id: space.userId,    // User-scoped facts (if configured)
  role: space.role,          // Role-scoped facts (if set)
});
```

Facts are automatically scoped at write time by the same tags. When the user says "my name is David" in the `living-room` Space, Mem0 stores it with `user_id: "david"` — and it's available in `study-desk` too because user-scoped facts cross Space boundaries.

When the user says "living-room temperature is usually 24C", Mem0 stores it with `space_id: "living-room"` — and it's NOT available in `study-desk` because Space-scoped facts don't leak.

### Migration from MemoryDB

Current `memory/MemoryDB.ts` uses a flat `facts` table with no scoping. After Mem0 integration (P2):
- All existing facts migrate as global-scoped (no tag)
- New facts are automatically scoped by the active Space context
- The `memory/` directory is deleted — Mem0 handles all storage and retrieval

---

## Space + MQTT Contract

Control messages follow the CONTRACTS.md versioning and envelope rules.

### Status Message (published on `xentient/status/space`)

```json
{ "v": 1, "type": "space_status", "spaces": [
  {
    "id": "living-room",
    "nodes": [
      { "nodeId": "node-01", "role": "ceiling-unit", "hardware": ["motion", "temperature"], "state": "running" },
      { "nodeId": "node-02", "role": "sofa-unit", "hardware": ["motion", "audio"], "state": "dormant" }
    ],
    "activePack": "family-companion",
    "activeConfig": "default",
    "availableConfigs": ["default", "movie-night"],
    "integrations": ["hermes+mem0"],
    "online": true
  },
  {
    "id": "study-desk",
    "nodes": [
      { "nodeId": "node-03", "role": "desk-unit", "hardware": ["motion", "audio", "temperature"], "state": "running" }
    ],
    "activePack": "study-buddy",
    "activeConfig": "classroom",
    "availableConfigs": ["default", "classroom", "deep-focus"],
    "integrations": ["hermes+mem0", "openclaw"],
    "online": false
  }
]}
```

### Control Messages (sent to `xentient/control/space`)

| Message Type | Schema | Description |
|--------------|--------|-------------|
| `space_switch` | `{v:1, type:"space_switch", spaceId:"study-desk"}` | Change active Space |
| `mode_set` | `{v:1, type:"mode_set", mode:"sleep"}` | Change operational mode |
| `role_set` | `{v:1, type:"role_set", role:"student"}` | Set role within current Space |
| `integration_enable` | `{v:1, type:"integration_enable", name:"openclaw"}` | Enable an integration for this Space |

### Control Messages (sent to `xentient/control/mode`)

Same `mode_set` schema as above. Dual-topic support: `xentient/control/space` for Space-scoped commands, `xentient/control/mode` for mode-only commands (Web Control Panel convenience).

---

## Platform Track Mapping

| Phase | Component | Description | LOC Estimate | Dependency |
|-------|-----------|-------------|-------------|------------|
| P3 | `ModeManager.ts` | Sleep/listen/active/record state machine, wired into Pipeline | +60 LOC | None |
| P4 | `SpaceManager.ts` | Space context, MQTT contract, space-scoped permissions, Mem0 tag mapping | +100 LOC | P3 complete |

Both phases are post-demo (see NON_GOALS.md). The current harness ships with neither Mode Manager nor Space Manager for Apr 24.

---

*Cross-references: CONTEXT.md (Space concept, integration tiers, skill continuum), CONTRACTS.md (MQTT space/mode topics, message schemas), PACKS.md (one pack per space), HARDWARE.md (peripheral ID registry for sensors field), NODE-SKILLS.md (L0 Node Skills per Space)*
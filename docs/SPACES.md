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
interface Space {
  id: string;                // kebab-case: "living-room", "study-desk"
  nodeBaseId: string;        // MQTT node ID of the physical hardware
  activePack: string;        // which pack is loaded
  mode: SpaceMode;           // current operational mode
  integrations: Integration[];// which AI brains are available
  role?: string;             // optional context: "student", "family", "dev"
  sensors: string[];         // available peripherals (from peripheral ID registry)
}
```

**Field rules:**
- `id`: `[a-z0-9-]{1,32}` kebab-case. Unique across all Spaces.
- `nodeBaseId`: References a physical Node Base by MQTT client ID. One Node Base per Space (v1).
- `activePack`: Must reference a pack that exists in `packs/`. Validated at Space creation time.
- `mode`: Current operational mode (see Mode State Machine below).
- `integrations`: Ordered array. First entry is the primary integration for default routing.
- `role`: Optional string that affects memory scoping and persona behavior.
- `sensors`: Array of peripheral type names from the ID registry in CONTRACTS.md.

---

## SpaceMode Type

```typescript
type SpaceMode =
  | "sleep"      // low power, PIR wake only, no audio processing
  | "listen"     // listening for wake word / sound triggers, passive
  | "active"     // full conversation, all integrations available
  | "record"     // recording mode, audio capture only, no response
```

Modes are not arbitrary states — they correspond to hardware power and processing states. The Mode Manager enforces valid transitions (see below).

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

## Space Examples

| Space | Node Base | Pack | Mode (default) | Integrations | Role |
|-------|-----------|------|----------------|-------------|------|
| `living-room` | node-01 | `family-companion` | listen | hermes+mem0 | family |
| `study-desk` | node-02 | `study-buddy` | active | hermes+mem0, openclaw | student |
| `workshop` | node-03 | `dev-assistant` | active | hermes+mem0, openclaw, archon | developer |
| `bedroom` | node-04 | `prayer-companion` | listen | hermes+mem0 | personal |

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
    "nodeBaseId": "node-01",
    "activePack": "family-companion",
    "mode": "listen",
    "integrations": ["hermes+mem0"],
    "online": true
  },
  {
    "id": "study-desk",
    "nodeBaseId": "node-02",
    "activePack": "study-buddy",
    "mode": "active",
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
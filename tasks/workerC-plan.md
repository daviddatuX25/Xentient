# Worker C Plan — Default Pack Manifest + NodeSkill Contract

**Track:** Data layer (medium risk — touches Zod schemas and SpaceManager)  
**Estimated time:** 2 hours  
**Primary files touched:** `harness/packs/default/skills.json`, `harness/src/shared/contracts.ts`, `harness/src/engine/PackLoader.ts`, `harness/src/engine/SpaceManager.ts`, `harness/src/engine/nodeProfileCompiler.ts` (NEW if missing), `harness/src/comms/ControlServer.ts`, `harness/src/core.ts`

**References — read these before starting:**
- Full manifest spec & JSON: `@[c:\Users\sarmi\.gemini\antigravity\brain\0ed0b401-85b2-4cec-8dee-2f95f3718027\artifacts\xentient_mega_plan.md.resolved]` — "Worker C" sections (Hours 1, 2, 3)
- Ground-truth audit findings: `@[tasks/XENTIENT-SPRINT-ANCHOR.md]` — "Worker C" section, and finding F6 re Zod schema issue

---

## Philosophy

The default pack is currently an empty shell — `{ pack: { name: "default" }, skills: [] }`.  
This means every dashboard widget that depends on "what hardware is active" shows nothing.

Worker C's job is to make the pack **real**: two configurations, two nodeSkill profiles, two skills.
Then ensure that when a pack loads, Core pushes the correct hardware profile to the ESP32 firmware
via MQTT — so the firmware knows what sampling mode to run.

The end state: load default pack → `/api/spaces` shows real config data → `/api/status` shows which
peripherals are active → Dashboard pills light up correctly → ESP32 receives `node_profile_set` MQTT message.

---

## TRAPS — Internalize Before Writing Any Code

| Trap | Impact |
|------|--------|
| **TRAP 4** (Mega Plan): `PackSkillManifestSchema` in `contracts.ts` validates `configurations` and `nodeSkills`. If they're required (not `.default([])`), the current empty manifest already crashes at load time. **Fix the schema first.** | Must fix before replacing the manifest |
| **TRAP 5** (Mega Plan): Mode system is deprecated but still referenced everywhere. Do NOT try to remove modes. New configs coexist with old modes. | Don't touch ModeManager |
| **TRAP 1** (Mega Plan): Two Pipeline.ts files exist. You don't touch either one — just documenting for awareness | Safe to ignore |

---

## Hour 1 — Fix Zod Schema + Build Real Pack Manifest

### Step 1: Audit `PackSkillManifestSchema` in `contracts.ts`

**File:** `harness/src/shared/contracts.ts`

Search for `PackSkillManifestSchema`. Check whether `configurations` and `nodeSkills` fields are:
- **Required** (e.g., `z.array(ConfigurationSchema)`) → **MUST** add `.default([])`
- **Optional** (e.g., `z.array(ConfigurationSchema).optional()`) → safe, but `.default([])` is still better

Fix to:
```ts
configurations: z.array(ConfigurationSchema).default([]),
nodeSkills: z.array(NodeSkillSchema).default([]),
```

> **NOTE:** Also verify that `ConfigurationSchema` and `NodeSkillSchema` exist in `contracts.ts`.
> Search for them. If they don't exist yet, you must define them based on the manifest JSON below.
> Minimum `ConfigurationSchema`:
> ```ts
> const ConfigurationSchema = z.object({
>   name: z.string(),
>   displayName: z.string(),
>   nodeAssignments: z.record(z.string()).default({}),
>   coreSkills: z.array(z.string()).default([]),
> });
> ```
> Minimum `NodeSkillSchema`:
> ```ts
> const NodeSkillSchema = z.object({
>   id: z.string(),
>   name: z.string(),
>   version: z.string().default('1.0.0'),
>   requires: z.object({
>     pir: z.boolean().optional(),
>     bme: z.boolean().optional(),
>     mic: z.boolean().optional(),
>     camera: z.boolean().optional(),
>     lcd: z.boolean().optional(),
>   }).default({}),
>   sampling: z.object({
>     bmeIntervalMs: z.number().optional(),
>     pirDebounceMs: z.number().optional(),
>     micMode: z.number().default(0),
>     audioRate: z.number().optional(),
>     audioChunkMs: z.number().optional(),
>     vadThreshold: z.number().optional(),
>     cameraMode: z.number().default(0),
>   }).default({}),
>   emits: z.array(z.string()).default([]),
>   expectedBy: z.string().optional(),
>   compatibleConfigs: z.array(z.string()).default([]),
> });
> ```
> If schemas already exist, match the manifest JSON to the existing schema shape — don't fight the schema.

### Step 2: Verify `PackLoader.loadPack()` uses Zod `.parse()`

**File:** `harness/src/engine/PackLoader.ts`

Search for `.parse(` or `.safeParse(`. Confirm it parses the manifest JSON against `PackSkillManifestSchema`.

- If it uses `.parse()` — the `.default([])` fix in Step 1 is mandatory (parse throws on missing fields)
- If it uses `.safeParse()` — still add `.default([])` so downstream code never sees `undefined` for these arrays

> **NOTE:** If PackLoader catches errors and falls back silently, add a log warning when optional fields
> are missing — helps debugging in the future.

### Step 3: Replace `harness/packs/default/skills.json`

Replace the empty manifest with the full manifest from the Mega Plan ("Worker C Hour 1" section).
The full JSON is in the Mega Plan — copy it exactly. Summary of what it contains:

**2 configurations:**
- `ambient` — uses `ambient-sense` nodeSkill, requires PIR + BME + LCD
- `voice-ready` — uses `voice-listen` nodeSkill, requires PIR + MIC + BME + LCD

**2 nodeSkills:**
- `ambient-sense` — `micMode: 0`, `cameraMode: 0`, emits `presence` + `env`
- `voice-listen` — `micMode: 1`, `audioRate: 16000`, `vadThreshold: 0.3`, emits `presence` + `env` + `vad` + `audio_chunk`

**2 pack skills:**
- `env-logger` — interval trigger every 60s, logs env snapshot
- `motion-alert` — event trigger on `motion_detected`, sets LCD + increments counter, escalates on >10 motions/hour

> **NOTE:** After writing the JSON, run:
> ```bash
> cd harness && bun run core
> ```
> Watch logs — look for "pack loaded" or Zod validation errors. Fix any schema mismatches before moving on.

---

## Hour 2 — NodeProfile Push + Spaces Endpoint

### Step 4: Check/Create `nodeProfileCompiler.ts`

**File:** `harness/src/engine/nodeProfileCompiler.ts`

Check if this file exists. If YES, verify it can compile a `NodeSkill` into a `NodeProfileSet` MQTT payload.

If NO, create it. Full implementation is in Mega Plan "Worker C Hour 2" section:

```ts
export function compileNodeProfile(nodeSkill: NodeSkill, nodeId: string): NodeProfileSet {
  return {
    v: 1,
    type: 'node_profile_set',
    profileId: nodeSkill.id,
    pirIntervalMs: nodeSkill.sampling.pirDebounceMs ?? 1000,
    micMode: nodeSkill.sampling.micMode ?? 0,
    bmeIntervalMs: nodeSkill.sampling.bmeIntervalMs ?? 5000,
    cameraMode: nodeSkill.sampling.cameraMode ?? 0,
    lcdFace: 0,
    eventMask: computeEventMask(nodeSkill.emits),
  };
}
```

> **NOTE — `NodeProfileSet` type:** Search `contracts.ts` for `NodeProfileSet`. If it doesn't exist, define it:
> ```ts
> export interface NodeProfileSet {
>   v: number;
>   type: 'node_profile_set';
>   profileId: string;
>   pirIntervalMs: number;
>   micMode: number;
>   bmeIntervalMs: number;
>   cameraMode: number;
>   lcdFace: number;
>   eventMask: number;
> }
> ```
>
> **NOTE — `computeEventMask`:** This maps emitted event names to bitmask values the firmware expects.
> Check `contracts.ts` for any existing `EVENT_MASK_*` constants. If none exist, use a simple mapping:
> ```ts
> const EVENT_BIT: Record<string, number> = {
>   presence: 1 << 0,
>   env: 1 << 1,
>   vad: 1 << 2,
>   audio_chunk: 1 << 3,
> };
> function computeEventMask(emits: string[]): number {
>   return emits.reduce((mask, e) => mask | (EVENT_BIT[e] ?? 0), 0);
> }
> ```
> If the firmware uses a different scheme, match it. This is a best-effort based on current contracts.

> **NOTE — MQTT topic for profile push:** Check `MQTT_TOPICS` in `contracts.ts` for the correct topic string.
> Do NOT create a new topic string inline — add it to `MQTT_TOPICS` if it doesn't exist.
> Expected topic pattern: `xentient/node/{nodeId}/profile/set`

### Step 5: Wire NodeProfile push in `SpaceManager.ts`

**File:** `harness/src/engine/SpaceManager.ts`

Find `executeConfigTransition()` (or equivalent method called when a config activates).

After setting `activeConfig`, for each node in the space, compile and push the profile:
```ts
const manifest = this.deps.packLoader.getLoadedPackManifest();
const config = manifest?.configurations.find(c => c.name === newConfigName);
const nodeSkillId = config?.nodeAssignments?.['base'];
const nodeSkill = manifest?.nodeSkills.find(ns => ns.id === nodeSkillId);

if (nodeSkill) {
  for (const node of space.nodes) {
    const profile = compileNodeProfile(nodeSkill, node.id);
    const topic = MQTT_TOPICS.NODE_PROFILE_SET.replace('{nodeId}', node.id);
    this.deps.mqtt.publish(topic, JSON.stringify(profile));
  }
}
```

Also find `pushDefaultProfile()` — it's already called on `onNodeBirth` and `onMqttReconnect`.
It should now also call the above profile push logic. Refactor so both paths reuse the same function.

> **NOTE — `packLoader` in SpaceManager deps:** Verify `SpaceManager` has access to `packLoader`.
> If not, pass it in from `core.ts` as a dep. Check `SpaceManagerDeps` type in `contracts.ts` or
> at the top of `SpaceManager.ts`.

> **NOTE — empty node list:** If `space.nodes` is empty (no ESP32 has registered yet), the loop runs
> zero times — that's correct behavior. The profile will be pushed on `onNodeBirth` anyway.

### Step 6: Upgrade `handleListSpaces` in `ControlServer.ts`

**File:** `harness/src/comms/ControlServer.ts`

Find `handleListSpaces` (around line 503 per Mega Plan — verify actual line).

Replace with real data. Full implementation is in Mega Plan "Worker C Hour 3":
```ts
const space = this.deps.spaceManager.getSpace('default');
const manifest = this.deps.packLoader.getLoadedPackManifest();
const config = manifest?.configurations.find(c => c.name === space?.activeConfig);
const nodeSkill = manifest?.nodeSkills.find(ns => ns.id === config?.nodeAssignments?.['base']);

this.sendJSON(res, 200, [{
  id: space?.id ?? 'default',
  activeConfig: space?.activeConfig ?? null,
  activePack: space?.activePack ?? null,
  availableConfigs: manifest?.configurations.map(c => c.name) ?? [],
  nodes: space?.nodes ?? [],
  nodeSkill: nodeSkill ? {
    id: nodeSkill.id,
    requires: nodeSkill.requires,
    emits: nodeSkill.emits,
  } : null,
}]);
```

> **NOTE:** `this.deps.spaceManager` may not be available if SpaceManager isn't in `ControlServerDeps`.
> Check the interface. If missing, check how the current code gets space info — it may use a `getSpaces()`
> function injected as a callback. Follow the existing pattern.

### Step 7: Broadcast `nodeFunctions` on `pack_loaded` in `core.ts`

**File:** `harness/src/core.ts`

Find the `packLoader.on('pack_loaded', ...)` handler.

Add `nodeFunctions` derivation and broadcast to the existing `broadcastSSE` call:
```ts
packLoader.on('pack_loaded', (data) => {
  const manifest = packLoader.getLoadedPackManifest();
  const ns = manifest?.nodeSkills?.[0];
  controlServer.broadcastSSE({
    type: 'pack_loaded',
    ...data,
    nodeFunctions: {
      core: true,
      cam: ns?.requires?.camera === true,
      mic: ns?.requires?.mic === true,
      speaker: manifest?.skills?.some(s => s.actions?.some(a => a.type === 'play_chime')) ?? false,
      tempHumid: ns?.requires?.bme === true,
      pir: ns?.requires?.pir === true,
    },
  });
});
```

> **NOTE — shared logic:** The `deriveNodeFunctions(manifest)` helper may also be defined in Worker A's
> changes to `ControlServer.ts`. If so, extract it to a shared location (e.g., a local function in
> `core.ts`, or a utility in `engine/packUtils.ts`) so both paths use the same logic. Do NOT duplicate it.

---

## Done Criteria Checklist

### Schema & Pack Loading
- [ ] `PackLoader.loadPack('default')` succeeds — no Zod validation errors in logs
- [ ] `configurations` and `nodeSkills` fields are never `undefined` in loaded manifest (`.default([])` works)
- [ ] `bun run core` starts, loads default pack, no crash

### API Endpoints
- [ ] `GET /api/spaces` returns array with `availableConfigs`, `nodeSkill`, `nodes`
- [ ] `GET /api/status` returns `nodeFunctions` with correct values from loaded manifest
- [ ] When `voice-ready` config is active: `mic: true`, `pir: true`, `tempHumid: true`
- [ ] When `ambient` config is active: `mic: false`, `pir: true`, `tempHumid: true`

### SSE Events
- [ ] `pack_loaded` SSE event includes `nodeFunctions` object
- [ ] Dashboard Node Function pills update when pack loads (Worker A consumes this)

### NodeProfile Push
- [ ] On config transition, MQTT message published to `xentient/node/{nodeId}/profile/set`
- [ ] Profile payload includes correct `micMode` (0 for ambient, 1 for voice-ready)
- [ ] If no nodes are registered, no MQTT error — graceful empty loop

### Code Quality
- [ ] `cd harness && npx tsc --noEmit` — zero new TypeScript errors
- [ ] No new MQTT topics created outside `MQTT_TOPICS` in `contracts.ts`
- [ ] `nodeProfileCompiler.ts` uses types from `contracts.ts` — no inline type definitions duplicating existing ones

---

## Integration Points with Other Workers

| Worker | What you provide | When |
|--------|-----------------|------|
| **Worker A** | `nodeFunctions` in `/api/status` and `pack_loaded` SSE | Hour 2 Step 7 |
| **Worker A** | Real config data in `/api/spaces` | Hour 2 Step 6 |
| **Worker B** | Schema compatibility — Zod `.default([])` fix prevents runtime crashes that would break Worker B's core startup | Hour 1 Step 1 — do this FIRST |

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `harness/src/shared/contracts.ts` | Edit | Add `.default([])` to `configurations` and `nodeSkills`; add `ConfigurationSchema`, `NodeSkillSchema`, `NodeProfileSet` if missing |
| `harness/packs/default/skills.json` | Replace | Full manifest with 2 configs, 2 nodeSkills, 2 skills |
| `harness/src/engine/PackLoader.ts` | Verify only | No changes expected — just confirm it uses Zod parse |
| `harness/src/engine/nodeProfileCompiler.ts` | Create if missing | Compile NodeSkill → NodeProfileSet MQTT payload |
| `harness/src/engine/SpaceManager.ts` | Edit | Push NodeProfile on config transition; fix `closeEscalation` stub (coordinate with Worker B) |
| `harness/src/comms/ControlServer.ts` | Edit | Upgrade `handleListSpaces` to return real data |
| `harness/src/core.ts` | Edit | Add `nodeFunctions` to `pack_loaded` SSE broadcast |

> **Coordination note on `SpaceManager.closeEscalation()`:** Worker B also needs to modify this stub.
> Agree with Worker B on who makes the change — Worker B should own it since they own `EscalationSupervisor`.
> Worker C should leave a TODO comment if Worker B hasn't landed yet.

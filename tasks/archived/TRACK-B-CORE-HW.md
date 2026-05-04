# Track B — Core Runtime + Hardware (You)

> **Owner:** sarmi
> **Stack:** ESP32 firmware (PlatformIO, C++), Core runtime (TS/Bun, see `harness/`), Mosquitto, pre-recorded fixtures
> **Target:** Demo 2026-04-24
> **Working dirs:** `firmware/`, `harness/`, `tasks/`
> **Parallel to:** [TRACK-A-WEB.md](./TRACK-A-WEB.md) — Web Console
> **Source of truth for wire formats:** [../docs/CONTRACTS.md](../docs/CONTRACTS.md)
> **Source of truth for hardware:** [../docs/HARDWARE.md](../docs/HARDWARE.md), [../docs/WIRING.md](../docs/WIRING.md)

---

## 0. Why this order

Track A (Web) blocks on **fixtures + simulators**, not on Core or hardware. Your Day 1 job is therefore to **unblock the teammate**: ship the sim kit + contract docs + DB schema **before** you touch firmware. Only after that do you go head-down on the real Node Base. This inverts the obvious order, but it's right — a 1-day sim-kit investment buys 4 days of parallel Track-A work.

Mental model: you are shipping a **replaceable fake** (the sim kit) whose contract is identical to the real Core. Track A codes against the fake; you replace the fake with the real on Apr 24.

---

## 1. Day-by-Day Plan (Apr 19 → Apr 24)

### Day 1 — Mon Apr 20 AM: Sim kit + contract freeze (UNBLOCKS TRACK A)

**Hard deadline: ship to `main` by 12:00 Mon.**

1. `docs/03-06-CONTRACT.md` — writes the DB schema SQL, MQTT topic table (demo-cut subset), artifact layout, and error codes. This is the single document both tracks import from. Commit and ping teammate.
2. `harness/fixtures/sessions/` — record 10 fixture sessions per [TRACK-A §3.3](./TRACK-A-WEB.md#33-harnessfixturessessionsjson--golden-session-data). Pre-generate `user.wav` (16kHz S16LE mono) with TTS from canned prompts; `assistant.wav` same; `transcript.txt`; `meta.json`. Match exactly the artifact layout in `TRACK-A §4.4`.
3. `harness/fixtures/schemas/` — JSON-Schema export of every Zod schema in `harness/src/shared/contracts.ts`. Use `zod-to-json-schema`. Track A uses these to validate inbound messages without touching TS.
4. `harness/sim/node-base.ts` — per [TRACK-A §3.1](./TRACK-A-WEB.md#31-harnesssimnode-basets--fake-esp32). Profiles `quiet|chatty|flaky`. Uses `mqtt` npm pkg + `ws` for audio stream.
5. `harness/sim/brain.ts` — per [TRACK-A §3.2](./TRACK-A-WEB.md#32-harnesssimbrainst--fake-coreBrain). Listens for triggers, selects random fixture, emits state transitions + writes artifacts + publishes `session_complete`.
6. `harness/sim/README.md` — 10-line quickstart: `bun install && bun run sim:node` / `bun run sim:brain`.

**Checkpoint Mon noon:** Track A `bun run sim:node` + `bun run sim:brain` produces live MQTT traffic. Teammate starts coding. `git push`. New bead `Xentient-SIMKIT` closed.

### Day 1 PM / Day 2 — Firmware: Node Base base (beads `Xentient-abs`, `Xentient-cg9`)

1. `Xentient-abs` — PlatformIO env, I2C peripheral enumeration. LCD + BME280 + PIR detected on boot. LCD shows "boot ok".
2. `Xentient-cg9` — MQTT pub/sub. Publish BME280 every 5s on `xentient/sensors/env`. Publish PIR events on `xentient/sensors/motion`. Subscribe `xentient/control/mode` → display mode on LCD.
3. **Sanity-swap:** stop `sim:node`, keep `sim:brain`. Real board should feed Track A's `/telemetry` page over the same Mosquitto. If the page breaks, contract drift — fix in firmware, not in web.

### Day 3 — Audio pipeline (beads `Xentient-n8e`, `Xentient-azp`)

1. `Xentient-n8e` — RMS VAD on ESP32, audio chunking over WebSocket to harness. Verify audio arrives at `harness/audio-server`.
2. `Xentient-azp` — LCD face state machine. Receive `display_update` via MQTT → render face within 100ms. See `HARDWARE.md` B7 face table.

### Day 4 — Real Core brain + end-to-end (beads `Xentient-qm0`, `Xentient-p5v`, `Xentient-u1w`)

1. `Xentient-qm0` — shared contract runtime (TS + C++). Both sides actually parse/emit only through the schema.
2. `Xentient-p5v` — assembly: enclosure, JST adapter, speaker, PIR, power path. No loose wires.
3. Real brain: wire a minimum LLM path (OpenAI API or local) through `harness/src/brain/*`. Write artifacts in **exactly** the layout §4.4 defined, publish `session_complete` with real sessionId/paths. **This is the sim-brain's replacement — byte-for-byte identical wire format.**
4. `Xentient-u1w` — ESP-CAM UART frame forwarding (nice-to-have; demo survives without it).

### Day 5 — Fri Apr 24: Hardware final + integration

1. `Xentient-kyv` — final assembly, ESP-CAM UART, power path validation. Run for 30 min continuous to catch brown-outs.
2. Walk through [TRACK-A §6 Integration Checklist](./TRACK-A-WEB.md#6-integration-checklist-the-switchover) with teammate.
3. `Xentient-g90` — audio round-trip latency audit: clap → LCD face "listen" → asst audio within <3s target. Log p50/p95 over 20 trials.
4. `Xentient-1vh` — demo narrative + slide deck. Rehearse twice.

---

## 2. The Sim Kit (your deliverable for Track A)

See [TRACK-A §3](./TRACK-A-WEB.md#3-the-sim-kit-what-track-b-ships-you-on-day-1) for consumer-side detail. Your side:

### 2.1 `harness/sim/node-base.ts`

```typescript
// Accepts --profile=quiet|chatty|flaky
// Publishes to xentient/sensors/env every 5s
// Emits PIR every 60-120s (chatty: 20s)
// On mode=listen|record: streams a looped WAV over WS at xentient/audio/in
// On 'flaky': drops MQTT connection every 3min for 10s
// Subscribes xentient/control/mode → echoes xentient/status/mode after 200ms
// Subscribes xentient/display → logs but does not render (LCD is a real device concern)
```

Must validate every outbound payload against `contracts.ts` — if the sim emits something the real board wouldn't, integration day will burn.

### 2.2 `harness/sim/brain.ts`

```typescript
// Subscribes xentient/control/trigger, xentient/sensors/motion, xentient/audio/in
// On trigger:
//   1. pick fixture
//   2. publish xentient/pipeline/state listening (t+0), thinking (t+500ms), speaking (t+1500ms), idle (t+3000ms)
//   3. copy fixture artifacts to $artifacts/{newSessionId}/
//   4. fsync, THEN publish xentient/session/complete with real paths
// On xentient/control/mode: route through sim-node's echo
```

Fixture-selection heuristic: honor the `--scenario` flag so the demo can be driven deterministically ("always return happy-path-short"). Default: round-robin.

### 2.3 `harness/fixtures/`

- `sessions/*.json` — 10 fixtures covering the edge-case matrix in TRACK-A §5.
- `artifacts/{sessionId}/*` — the actual WAV/txt/json files each fixture's `session_complete` points at.
- `schemas/*.json` — auto-generated. Re-run `bun run fixtures:regen-schemas` whenever `contracts.ts` changes.

### 2.4 Drift detection

`harness/sim/drift-check.ts` — subscribes to every MQTT topic, validates each message against the schema, and writes violations to `harness/logs/drift.log`. **Run this during both sim phase and real-Core phase.** Empty log = contracts held.

---

## 3. Contract Surface You Own

### 3.1 Core → Web (outbound)

| Topic | Schema | Who publishes |
|---|---|---|
| `xentient/sensors/env` | `sensor_data` BME280 | Firmware (real) / `sim:node` (fake) |
| `xentient/sensors/motion` | `sensor_data` PIR | same |
| `xentient/pipeline/state` | `pipeline_state` | Core / `sim:brain` |
| `xentient/status/mode` | `mode_status` | Core (echo) / `sim:node` |
| `xentient/session/complete` | `session_complete` | Core / `sim:brain` |
| `xentient/session/error` | `session_error` | Core / `sim:brain` |
| `xentient/status/space` | `space_status` | Core |

### 3.2 Web → Core (inbound)

| Topic | Schema | Handler |
|---|---|---|
| `xentient/control/mode` | `mode_set` | Core Mode Manager → validates transition, echoes on `status/mode` |
| `xentient/control/trigger` | `trigger_pipeline` | Core pipeline kick-off |
| `xentient/control/space` | `space_switch` | post-demo |

### 3.3 The session_complete message (the critical one)

```json
{
  "v": 1,
  "type": "session_complete",
  "sessionId": "01HXJ...",
  "nodeBaseId": "node-01",
  "spaceId": "living-room",
  "startedAt": 1713400000000,
  "endedAt": 1713400008200,
  "mode": "listen",
  "status": "done",
  "turns": [
    { "role": "user", "text": "what's the temperature", "startedAt": 1713400001000, "durationMs": 2100 },
    { "role": "assistant", "text": "24.5 degrees", "startedAt": 1713400004200, "durationMs": 1400 }
  ],
  "artifacts": {
    "userAudio": "01HXJ.../user.wav",
    "asstAudio": "01HXJ.../assistant.wav",
    "transcript": "01HXJ.../transcript.txt",
    "meta": "01HXJ.../meta.json"
  }
}
```

**Paths are relative to `$XENTIENT_ARTIFACTS_PATH`.** Web resolves absolute path at read time. If you put an absolute `D:\...` path here, Track A breaks.

### 3.4 DB schema (owned jointly with Track A)

See [TRACK-A §4.3](./TRACK-A-WEB.md#43-db-schema--the-03-06-contract). You do **not** write to this DB. You emit MQTT; Track A's bridge writes to DB. This keeps Core process-isolated from Web per `WEB_CONTROL.md` §Key Constraints.

---

## 4. Hardware Assembly Edge Cases (beads `Xentient-p5v`, `Xentient-kyv`)

| # | Case | Guard |
|---|---|---|
| H1 | ESP32 brown-out when speaker peaks | 1000µF cap across VIN/GND on MAX98357A, separate 5V rail if possible |
| H2 | I2S/I2C pin conflict | Pin map frozen in `firmware/config/pins.h` — if it's not in that file, it's not wired |
| H3 | PIR false-triggers during boot | Disarm PIR for first 30s (sensor warmup per HC-SR501 datasheet) |
| H4 | MQTT reconnect storms at broker | Exponential backoff 1s/2s/4s/8s, cap 30s (per `CONTRACTS.md` §session_error) |
| H5 | LCD ghosting at >5 updates/sec | Rate-limit `display_update` to 2Hz; `duration>=2000ms` per contract |
| H6 | Audio WS disconnect mid-chunk | `sessionId` byte in audio header lets harness discard stale frames on reconnect |
| H7 | NTP not yet synced on boot | `millis()` fallback; timestamp field uint32, clamp to 0 if pre-NTP |
| H8 | ESP32-CAM UART baud mismatch | Pin to 921600 both sides; 115200 falls behind on JPEG frames |
| H9 | Strain relief at JST | Heatshrink + hot-glue at every JST connector (per docs/WIRING.md) |
| H10 | 5V USB supply noisy | Prefer a 2A phone charger; avoid PC USB for the final demo |

---

## 5. Core Runtime Edge Cases

| # | Case | Guard |
|---|---|---|
| C1 | LLM timeout mid-pipeline | Publish `session_error` recoverable=true, retry 1/3 with 1s/2s/4s backoff, then fatal |
| C2 | Artifact fsync race (`session_complete` before files flushed) | `await fsync` on every file handle before publishing |
| C3 | Session ID collision on concurrent triggers | ULID (monotonic) not UUIDv4 |
| C4 | Mode_set during active pipeline | Mode Manager returns `{error:"invalid_transition"}` on `xentient/status/mode` — don't kill the pipeline |
| C5 | Broker connection lost | Core refuses to start pipeline if broker disconnected; shows "offline" on LCD |
| C6 | Transcript contains a null byte from STT | Sanitize before write; drop the session if post-sanitize empty |
| C7 | WAV sample rate drift (ESP32 I2S ≠ 16k exactly) | Resample in harness, not on ESP32 |
| C8 | Artifact disk fills | Nightly prune >7 days; alert on `events` table if <1GB free |
| C9 | Schema bump (v:1 → v:2) | Forbid during demo window; freeze contracts.ts on Apr 20 12:00 |
| C10 | Cross-process clock skew PC vs ESP32 | Clamp `recorded_at = min(payload.timestamp, now)`; log drift >10s |

---

## 6. Integration Checklist — your side

Complete before joining Track A's §6 call.

- [ ] Sim-kit MQTT drift log empty for a full chatty-profile run
- [ ] Real-board drift log empty for a 10-minute run
- [ ] `session_complete` from real brain parses identically to sim fixtures (diff JSON shape)
- [ ] Artifact paths are **relative**, never drive-letter absolute
- [ ] All 10 fixtures still pass validation after any `contracts.ts` edit (`bun run fixtures:verify`)
- [ ] Core cold-start < 10s (so you can restart mid-demo without anyone noticing)
- [ ] `pm2` or `nssm` service wraps Core + Mosquitto + Reverb on operator PC (no bare terminals during demo)
- [ ] Mosquitto config: `persistence true`, `retain_available false` for telemetry topics (stale retain messes with Track A's live charts)

---

## 7. Deliverables & Definition of Done

| # | Deliverable | Beads | Done when |
|---|---|---|---|
| S1 | Sim kit (node + brain + fixtures + schemas) | new `Xentient-SIMKIT` | Track A can develop offline with `bun run sim:*` |
| 1 | Contract doc | `Xentient-x44` | `docs/03-06-CONTRACT.md` merged, Track A imports it |
| 2 | PlatformIO + peripherals | `Xentient-abs` | LCD/BME/PIR enumerated on boot |
| 3 | MQTT client | `Xentient-cg9` | Real board telemetry feeds Track A dashboard |
| 4 | VAD + audio WS | `Xentient-n8e` | Audio frames arrive at harness, playable |
| 5 | LCD face SM | `Xentient-azp` | `display_update` renders within 100ms |
| 6 | Shared contract runtime | `Xentient-qm0` | TS + C++ both parse via schema |
| 7 | Camera UART | `Xentient-u1w` | JPEG frames forward to harness (nice-to-have) |
| 8 | Final assembly | `Xentient-p5v`, `Xentient-kyv` | 30-min continuous run, no brown-outs |
| 9 | Latency audit | `Xentient-g90` | p95 < 3s over 20 trials, logged |
| 10 | Demo deck + script | `Xentient-1vh` | 2 rehearsals done |

**New beads to file before starting Day 1:**

- `Xentient-SIMKIT` (P0) — "Sim kit: sim:node + sim:brain + 10 session fixtures + JSON-Schema export", blocks `Xentient-gin`, `Xentient-dkv`, `Xentient-z98`, `Xentient-ej6`.
- Update `Xentient-x44` to reference this doc and set its deadline to Mon Apr 20 12:00.

**Work is not done until `git push` succeeds and beads are closed.**

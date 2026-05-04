# Track A — Web Console (Teammate)

> **Owner:** Teammate
> **Stack:** Laravel 12 + Livewire 3 + Reverb + php-mqtt/client + SQLite + Chart.js/ApexCharts
> **Target:** Demo 2026-04-24
> **Working dir:** `D:\Projects\Xentient\web\` (new sibling of `harness/`, `firmware/`)
> **Parallel to:** [TRACK-B-CORE-HW.md](./TRACK-B-CORE-HW.md) — Core + Hardware
> **Source of truth for wire formats:** [../docs/CONTRACTS.md](../docs/CONTRACTS.md)
> **Source of truth for UI scope:** [../docs/WEB_CONTROL.md](../docs/WEB_CONTROL.md) §Demo Cut

---

## 0. What You Need to Start (Day 0, first hour)

You do **not** need the ESP32 hardware or the Core runtime to start. You will work against simulators and fixtures that Track B ships to you on Day 1 (see §3 below). Everything is designed so that **flipping the MQTT broker host and the artifact directory path at the end is the entire integration step**.

### Install on your PC (Laragon)

```
php -v            # 8.2+
composer -V       # 2.x
node -v           # 20+
mosquitto -V      # any recent; we pin 2.x
```

If `mosquitto` is missing, install from https://mosquitto.org/download/ (Windows installer) and add `C:\Program Files\mosquitto` to PATH. Default port 1883, no TLS, no auth for demo (LAN-only + tunnel).

### Clone + branch

```bash
git pull
git checkout -b track-a-web
cd D:/Projects/Xentient
mkdir web
cd web
composer create-project laravel/laravel:^12 .
php artisan install:broadcasting   # installs Reverb + Echo
composer require livewire/livewire php-mqtt/client
npm i && npm run build
```

### Seed demo config

- `.env`: `BROADCAST_CONNECTION=reverb`, `DB_CONNECTION=sqlite`, `DB_DATABASE=${PWD}/database/database.sqlite`
- `.env`: add `XENTIENT_MQTT_HOST=127.0.0.1`, `XENTIENT_MQTT_PORT=1883`, `XENTIENT_ARTIFACTS_PATH=D:/Projects/Xentient/var/artifacts`
- `touch database/database.sqlite && php artisan migrate`

---

## 1. Scope (Demo Cut)

From `WEB_CONTROL.md` §Demo Cut. Anything marked **Out of Scope** is explicitly deferred.

### In scope — 3 pages + 2 controls

| Route | Livewire component | Beads |
|---|---|---|
| `/` Dashboard | `NodeBaseCard` per Node Base: mode badge, online dot, last BME280 reading, last interaction snippet | `Xentient-gin` |
| `/sessions` | `SessionFeed` (paginated), `SessionCard` (timestamp, transcript, response, audio ▶) | `Xentient-dkv` |
| `/telemetry` | `TelemetryBoard` (RMS sparkline, BME temp/humidity sparklines, PIR event ticker) | `Xentient-z98` |

| Control | Behavior | Beads |
|---|---|---|
| Mode switch buttons (4 per Node Base) | Publish MQTT `xentient/control/mode` with `{v:1,type:"mode_set",mode:...}` | `Xentient-ej6` |
| "Run pipeline now" button | Publish MQTT `xentient/control/trigger` with `{v:1,type:"trigger_pipeline",source:"web"}` | `Xentient-ej6` |

### Out of scope (do NOT build)

Pack management, Space CRUD, Integration toggles, Audit log, Auth/RBAC, Brain-adapter panels, multi-user, VPS. Spaces are hardcoded in `config/spaces.php`. A single hardcoded `.env` password gates the app if any gate is needed.

---

## 2. Day-by-Day Plan (Apr 19 → Apr 24)

Five working days. Each day ends with a **pushable checkpoint** and a **demo-able screen** so Track B can sanity-check integration surface early.

### Day 1 — Mon Apr 20: Scaffold + schema + fixtures wired

**Goal:** App boots, DB has demo data, home page renders 1 hardcoded Node Base card. No live data yet.

1. Scaffold per §0. Commit the empty Laravel app.
2. Pull `harness/fixtures/` and `harness/sim/` from Track B (see §3). These land on `main` Day 1 AM.
3. Create migrations (match `docs/03-06-CONTRACT.md` — bead `Xentient-x44`):
   - `node_bases` (id, mqtt_client_id, name, online_last_seen_at)
   - `sessions` (id, node_base_id, space_id, started_at, ended_at, mode_during, status enum[running|done|error])
   - `turns` (id, session_id, role enum[user|assistant|system], text, audio_path nullable, started_at, duration_ms)
   - `artifacts` (id, session_id, kind enum[audio_user|audio_asst|transcript|meta_json|camera_snapshot], path, bytes, sha256)
   - `telemetry_samples` (id, node_base_id, peripheral_type, payload_json, recorded_at) — write-only ring buffer, prune >24h nightly
   - `events` (id, node_base_id, kind, payload_json, occurred_at) — PIR, mode changes, errors
4. `config/spaces.php` — hardcode 1 space: `living-room` / node `node-01` / pack `default` / mode `listen`.
5. `DemoSessionsSeeder` — seed 20 sessions from `harness/fixtures/sessions/*.json` so the feed page has data on fresh clone.
6. `/` renders a dashboard reading **from DB only** (no MQTT yet). Use `Xentient-gin`.

**Checkpoint:** `php artisan serve` → `/` shows node card with "last seen" from seeded data. `git push`.

### Day 2 — Tue Apr 21: MQTT publish + subscribe working

**Goal:** Mode buttons actually publish; telemetry sim drives live charts.

1. `app/Services/MqttPublisher.php` — wraps `php-mqtt/client`. Single connection, auto-reconnect, logs to `storage/logs/mqtt.log`. Publishes must pass Zod-parity validation (see §4.2) before hitting the wire — bad payloads throw, never silently drop.
2. `app/Console/Commands/MqttBridge.php` — long-running `php artisan mqtt:listen` that subscribes to:
   - `xentient/sensors/env`, `xentient/sensors/motion`, `xentient/pipeline/state`, `xentient/status/mode`, `xentient/session/error`, `xentient/session/complete`
   - On each message: validate → write to `telemetry_samples`/`events`/`sessions` → broadcast Reverb event `telemetry.updated` / `mode.changed` / `session.started` / `session.completed`.
3. Start Mosquitto + Reverb + bridge + Track B's `bun run sim:node` (§3). Open `/telemetry` — charts tick. `Xentient-z98` done.
4. Mode buttons on `/` call `$this->publisher->modeSet($nodeBaseId, $mode)` → publishes `xentient/control/mode`. Sim echoes `xentient/status/mode` back → dashboard badge updates via Reverb. `Xentient-ej6` done.

**Checkpoint:** Click "active" → node card mode badge flips within 1s. BME temp sparkline drifts live. `git push`.

### Day 3 — Wed Apr 22: Sessions feed + audio playback

**Goal:** Recorded interactions appear as cards with working ▶ playback.

1. Brain sim (§3) writes an artifact bundle every time a trigger lands. Watch `XENTIENT_ARTIFACTS_PATH` with `spatie/laravel-filesystem-watch` OR (simpler) rely on the `session.complete` MQTT message as the signal — that message carries the artifact paths.
2. `SessionFeed` component: cursor-paginated (20/page), newest first, Livewire `wire:poll.30s` fallback + Reverb live append on `session.completed`.
3. `SessionCard`: timestamp (relative + absolute tooltip), mode badge, user transcript, assistant transcript, ▶ plays `audio_asst.wav` via `<audio>` tag backed by `/artifacts/{session}/{kind}` Laravel route that streams from disk (Range requests supported — iOS Safari needs it).
4. Handle the edge cases called out in §5 (empty session, error session, stale audio path, file missing).

**Checkpoint:** Trigger sim 3x via "Run pipeline now" → 3 new cards appear live; each plays audio. `git push`. `Xentient-dkv` done.

### Day 4 — Thu Apr 23: Polish + tunnel + error UX

**Goal:** No-data empty states, loading skeletons, reconnect UX, cloudflared tunnel working.

1. Empty states: "No sessions yet — press **Run pipeline now** to record one."
2. Offline Node Base: gray badge, `last seen Xm ago`, buttons disabled with tooltip "node offline".
3. MQTT disconnect banner at top of layout: "⚠ Broker disconnected — retrying" driven by `MqttPublisher::isConnected()`. Auto-clears on reconnect.
4. Session error state: card turns amber, shows recoverable/fatal from `session_error` payload, "Reset conversation" button publishes `xentient/control/mode` `sleep` then `listen`.
5. `cloudflared tunnel --url http://localhost:8000` → public HTTPS URL. Reverb also needs a tunnel on its port (8080 default) — add second tunnel or put Reverb behind `/app/reverb` reverse-proxy via Laragon. **Test from a phone on cellular** (not WiFi) to confirm. `Xentient-776` done.
6. Write `web/README.md` with 5-line startup: mosquitto → reverb → bridge → sim-node → `php artisan serve`.

**Checkpoint:** Demo URL reachable from your phone's LTE, full loop works. `git push`.

### Day 5 — Fri Apr 24 AM: Integration with real Core

**Goal:** Swap sim → real Core/hardware. Should be a 15-minute operation if contracts held.

Work through [§6 Integration Checklist](#6-integration-checklist-the-switchover) with the Track-B owner on a call. Demo that afternoon.

---

## 3. The Sim Kit (what Track B ships you on Day 1)

These land in `harness/sim/` and `harness/fixtures/` before Day 1 standup. If they are not in `main` by then, **escalate immediately** — Track A cannot start without them.

### 3.1 `harness/sim/node-base.ts` — fake ESP32

```
bun run sim:node --broker=127.0.0.1:1883 --client=node-01 --profile=quiet|chatty|flaky
```

Publishes on a timer:
- `xentient/sensors/env` every 5s — temp 24–26°C sinusoidal, humidity 55–70, pressure 1012–1014
- `xentient/sensors/motion` every 60–120s (profile `chatty`: every 20s)
- `xentient/audio/in` WS stream of a looped WAV when in `listen` or `record` mode
- Subscribes `xentient/control/mode` → echoes `xentient/status/mode` 200ms later
- Profile `flaky` drops connection every 3min for 10s (to exercise your reconnect UX)

### 3.2 `harness/sim/brain.ts` — fake Core/Brain

```
bun run sim:brain --broker=127.0.0.1:1883 --artifacts=D:/Projects/Xentient/var/artifacts
```

On receipt of `xentient/control/trigger` or PIR event (via sim-node):
1. Picks a random fixture from `harness/fixtures/sessions/*.json` (see §3.3).
2. Emits `xentient/pipeline/state` transitions (`listening` → `thinking` → `speaking` → `idle`) at realistic cadence.
3. Writes artifacts to `$artifacts/{sessionId}/` — `user.wav`, `assistant.wav`, `transcript.txt`, `meta.json`.
4. Publishes `xentient/session/complete` with `{v:1,type:"session_complete",sessionId,startedAt,endedAt,mode,artifacts:{userAudio,asstAudio,transcript,meta}}`.

This is the message your `MqttBridge` consumes to create the session + turns + artifact rows. **Do not watch the filesystem.** The MQTT message is authoritative.

### 3.3 `harness/fixtures/sessions/*.json` — golden session data

10 pre-recorded interactions covering:
- `happy-path-short.json` — 3s user, 2s asst, clean transcript
- `happy-path-long.json` — 15s user, 12s asst
- `user-silence.json` — VAD opened then no speech; no asst turn; status=error recoverable
- `brain-timeout.json` — status=error recoverable, "Network timeout — retrying 1/3"
- `brain-fatal.json` — status=error fatal, "quota exceeded"
- `multi-turn.json` — 3 user + 3 asst turns in one session
- `non-english.json` — Tagalog transcript (tests UTF-8 in your UI)
- `long-transcript.json` — 2000-char transcript (tests truncation/scroll)
- `camera-trigger.json` — includes a `camera_snapshot` artifact (JPG)
- `pir-trigger.json` — triggered by motion not voice

Each fixture has both the `session_complete` MQTT message **and** the artifact bundle. Use `harness/fixtures/schemas/*.json` (JSON Schema mirror of `contracts.ts`) in your feature tests to guarantee drift-free parsing.

---

## 4. Contract Surface You Own / Consume

### 4.1 MQTT topics

| Direction | Topic | Type | Your role |
|---|---|---|---|
| Sub | `xentient/sensors/env` | `sensor_data` BME280 | store + chart |
| Sub | `xentient/sensors/motion` | `sensor_data` PIR | ticker + badge pulse |
| Sub | `xentient/pipeline/state` | `pipeline_state` | dashboard pipeline dot |
| Sub | `xentient/status/mode` | `mode_status` | update node card badge |
| Sub | `xentient/session/complete` | `session_complete` | insert session + turns + artifacts rows |
| Sub | `xentient/session/error` | `session_error` | card amber + banner |
| Pub | `xentient/control/mode` | `mode_set` | button click |
| Pub | `xentient/control/trigger` | `trigger_pipeline` | button click |

**Every outbound message must include `v:1`.** Core rejects mismatched versions. See `CONTRACTS.md` §Versioning.

### 4.2 Schema validation (Zod-parity in PHP)

You won't have Zod. Build a thin PHP validator that mirrors the Zod schemas:

```
app/Contracts/
  MessageEnvelope.php      # v: 1 required, type: string
  ModeSet.php              # mode in [sleep,listen,active,record]
  SensorData.php           # peripheralType in PERIPHERAL_IDS, payload shape per type
  SessionComplete.php      # sessionId, artifacts.{userAudio,asstAudio,transcript,meta} paths exist
```

Run outbound payloads through the matching validator before `publish()`. On inbound, validate-then-persist; log validation failures to `storage/logs/contract-drift.log` — this log is what you and Track-B diff on integration day.

### 4.3 DB schema — the `03-06` contract

This is **owned jointly** with Track B. Changes require both sides to agree. Write the migrations Day 1, publish the schema SQL to `docs/03-06-CONTRACT.md`, and both tracks import from there. Bead `Xentient-x44`.

### 4.4 Artifact filesystem layout

```
$XENTIENT_ARTIFACTS_PATH/
  {sessionId}/
    user.wav          # S16LE 16kHz mono
    assistant.wav     # same format
    transcript.txt    # UTF-8
    meta.json         # { sessionId, startedAt, endedAt, mode, turns[] }
    camera.jpg        # optional
```

Never `fopen()` these paths from a public route. Always serve through `/artifacts/{session}/{kind}` with the controller validating `session` belongs to the logged-in scope and `kind` ∈ allowed set.

---

## 5. Edge Cases — catch these before demo day

| # | Case | What breaks | Required handling |
|---|---|---|---|
| E1 | MQTT broker down at Laravel startup | `MqttPublisher` throws on boot | Lazy-connect on first publish; health endpoint returns 503 if disconnected >30s |
| E2 | Reverb not running | Livewire components never update | Banner "live updates offline"; `wire:poll.10s` fallback |
| E3 | Bridge command dies silently | Data stops flowing, UI looks frozen on old data | Supervisor/pm2 keeps it up; heartbeat row in `events` every 30s; "last bridge heartbeat Xs ago" on dashboard |
| E4 | `session_complete` arrives before artifacts are fully written | `<audio>` 404s | Sim writes artifacts → fsync → THEN publishes; Web retries artifact GET once after 500ms before showing "audio missing" |
| E5 | Session fixture with missing `assistant.wav` (error case) | Player crashes | Check `artifact.path` file exists in controller; return 404 + card shows "no audio" |
| E6 | Non-ASCII in transcript (Tagalog / emoji) | Livewire mangles bytes | SQLite `PRAGMA encoding='UTF-8'`; blade `{!! e($text) !!}`; tested with `non-english.json` fixture |
| E7 | 3KB MQTT cap exceeded on publish | Firmware drops your message | Pre-flight size check in `MqttPublisher`; throw before publish |
| E8 | Timestamp is epoch-millis uint32, NOT seconds | Sparkline x-axis explodes | Wrap in Carbon with `createFromTimestampMs`; unit-test this one-liner |
| E9 | LCD strings >16 chars in outbound `display_update` | Firmware truncates silently | Validator rejects before publish |
| E10 | Camera snapshot is ~50KB JPG | MQTT payload cap | Camera path goes through WS/REST, not MQTT — only the path string is in the session_complete event |
| E11 | Cloudflared URL changes every restart | Demo link goes stale | Use named tunnel (`cloudflared tunnel create xentient-demo`) so URL is stable |
| E12 | Reverb WS URL hardcoded to localhost | Tunnel exposes the app but WS connects to localhost from client | Use `VITE_REVERB_HOST` from request host, or reverse-proxy Reverb through Laragon at `/reverb` |
| E13 | Clock skew between ESP32 (NTP) and PC | Session `started_at` in the future | Bridge clamps `recorded_at` to `min(payload.timestamp, now)` and logs drift |
| E14 | Two clicks on "Run pipeline now" within 1s | Two overlapping sessions | Livewire `wire:loading.attr=disabled` + 2s cooldown in component |
| E15 | `session_error` fatal with no session row yet | Banner with no context | Bridge creates stub session row on first `pipeline/state` for that sessionId |
| E16 | User mode-switches during active pipeline | State machine refuses transition | Core returns `invalid_transition`; surface as toast, button stays in previous state |
| E17 | Mic returns 0 audio / VAD never opens | User presses button, nothing happens | "Run pipeline now" is the fallback — always works |
| E18 | Artifact file path is absolute with drive letter (D:\) | `/artifacts/...` route can't resolve | Store relative path from `$XENTIENT_ARTIFACTS_PATH`; resolve at serve time |
| E19 | Phone browser (Safari iOS) blocks mixed-content WS | Reverb connection refused | Tunnel must be HTTPS + WSS end-to-end |
| E20 | Git case-sensitivity (Windows → Linux VPS later) | Post-demo surprise | `git config core.ignorecase false` in `web/` |

---

## 6. Integration Checklist (the switchover)

Run this with Track-B owner on a call, Fri Apr 24 morning. Target: ≤30 min.

- [ ] Stop `sim:node` and `sim:brain`. Track B starts real Core + real Node Base.
- [ ] `.env` unchanged — same broker host, same artifact path.
- [ ] Open `/telemetry` — confirm BME280 and PIR tick in from the real board.
- [ ] Click "active" mode → confirm LCD face on the physical Node Base changes.
- [ ] Clap/speak near mic → confirm a session card appears with **real** user audio.
- [ ] Playback the assistant audio — confirm audible.
- [ ] Kill Wi-Fi on the Node Base for 15s → confirm offline badge + recovery.
- [ ] Reload tunnel URL on phone → all pages load over LTE.
- [ ] Run each of the 10 fixtures one more time by pointing `MQTT_HOST` back at sim, confirm no schema drift (checks `contract-drift.log` is empty).
- [ ] Tag `git tag demo-apr24` and push.

---

## 7. Deliverables & Definition of Done

| # | Deliverable | Beads | Done when |
|---|---|---|---|
| 1 | Laravel+Livewire+Reverb scaffold | `Xentient-gin` | `php artisan serve` boots; Livewire sample works; Reverb echoes a ping |
| 2 | Shared DB migrations | `Xentient-x44` | SQL published in `docs/03-06-CONTRACT.md`, Track B signs off |
| 3 | MQTT bridge + publisher | `Xentient-ej6` | Mode buttons round-trip through sim in <1s |
| 4 | Live telemetry charts | `Xentient-z98` | 3 sparklines + PIR ticker updating from sim |
| 5 | Session feed + playback | `Xentient-dkv` | 10 fixtures each render + play correctly |
| 6 | Cloudflared tunnel + smoke test | `Xentient-776` | Reachable from LTE phone, full loop works |
| 7 | README + edge-case coverage | — | All 20 edge cases in §5 either handled or explicitly noted "accepted risk" |

**Work is not done until `git push` succeeds and the bead is closed via `bd close`.**

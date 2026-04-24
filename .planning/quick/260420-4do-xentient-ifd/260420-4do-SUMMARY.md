---
mode: quick
quick_id: 260420-4do
slug: xentient-ifd
date: 2026-04-20
tech_stack:
  added:
    - EventEmitter (Node.js built-in, used by ModeManager)
  patterns:
    - Mode state machine with idle timeouts
    - Event-driven mode change propagation (EventEmitter)
    - Zod validation on inbound MQTT messages
key_files:
  created: []
  modified:
    - harness/src/engine/ModeManager.ts
    - harness/src/engine/Pipeline.ts
    - harness/src/index.ts
    - harness/src/shared/contracts.ts
decisions:
  - ModeManager extends EventEmitter for mode change propagation
  - MODE_TRANSITIONS expanded to allow active->sleep, active->record, record->sleep per SPACES.md MQTT mode_set commands
  - LCD_FACES constant map in contracts.ts for mode-to-face mapping
  - Pipeline uses optional ModeManager reference (setModeManager) for mode-aware audio gating
  - Idle timeouts: listen 60s->sleep, active 300s->listen; sleep and record have no idle timeout
metrics:
  duration: 5 min
  completed: 2026-04-20
---

# Quick Task 260420-4do: Mode Manager (wired into Core) Summary

ModeManager wired into Core runtime with MQTT event subscriptions, idle timeouts, PIR wake, Pipeline mode gating, and LCD display publishing.

## What Changed

### ModeManager.ts — Full rewrite to EventEmitter pattern
- Extends `EventEmitter` for mode change propagation
- Emits `"modeChange"` event with `{from, to}` detail on every transition
- `handleModeCommand(data)` — validates inbound MQTT mode_set via Zod, calls transition()
- `handleSensorEvent(data)` — validates inbound sensor_data via Zod, PIR (0x11) triggers sleep->listen
- `resetIdleTimer()` / `clearIdleTimer()` — listen mode auto-transitions to sleep after 60s, active to listen after 300s
- `forceSet()` — preserved for web overrides, logs warning, resets idle timer
- `publishDisplayUpdate(mode)` — publishes LCD face to xentient/display on every transition
- `publishModeStatus()` — publishes mode status to xentient/status/mode on every transition

### Pipeline.ts — Mode-aware audio gating
- Added `modeManager: ModeManager | null` field and `setModeManager(mm)` injection method
- Audio chunk handler: drops all audio when mode is `sleep`; passes through for `listen`, `active`, `record`
- VAD handler: ignores VAD in `sleep`; VAD start in `listen` triggers `transition('active')` and resets idle timer; ignores VAD in `record`; full pipeline runs in `active`

### index.ts — Runtime wiring
- ModeManager instantiated with mqtt reference
- `mqtt.on('modeCommand')` wired to `modeManager.handleModeCommand()`
- `mqtt.on('sensor')` wired to `modeManager.handleSensorEvent()`
- `pipeline.setModeManager(modeManager)` called once after construction
- `modeManager.on('modeChange')` logs mode transitions
- Shutdown handler clears idle timer before disconnect

### contracts.ts — LCD faces and expanded transitions
- `LCD_FACES` constant map: sleep `(_ _) Zzz`, listen `(O_O) listening...`, active `(^_^)`, record `(_ _) REC`
- `MODE_TRANSITIONS` expanded: `active` now allows `listen`, `sleep`, `record`; `record` now allows `listen`, `sleep`
- Matches SPACES.md state machine including MQTT mode_set override paths

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All modified files exist on disk. Commit d21750b found in git log. No unexpected deletions.
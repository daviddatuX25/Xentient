---
phase: 8
plan: 08-04
subsystem: frontend
tags: [skill-manager, crud, sortable-table, drawer, form-validation, pack-management, event-mappings, sse-realtime]

# Dependency graph
requires:
  - phase: 08-01
    provides: [Skill/Pack/EventMapping REST endpoints, 409 collision, 403 pack protection]
  - phase: 08-02
    provides: [skill_registered/removed/updated/fired SSE events, pack_loaded/unloaded events]
  - phase: 08-03
    provides: [SPA shell, CSS design system, api.js REST client, sse.js client, main.js routing, components.js]
provides:
  - SkillManagerPanel class (927 lines) with full CRUD, sorting, drawer, form, packs, mappings
  - CSS for skill table, source badges, toggle switches, detail drawer, skill form, pack section, event mappings
  - SSE-driven real-time updates: skill list refresh, flash-on-fire, pack refresh
  - Register skill form with Simple/Advanced mode, dynamic trigger fields, inline validation
  - Detail drawer with slide-in animation, Escape/overlay/close dismiss
  - Inline delete confirmation (3s timeout) with 403 protection for pack/builtin skills
  - Pack management: active pack display, switch/reload controls
  - Event mapping CRUD with protected default badges
affects: [08-05, 08-06, 08-08]

# Tech tracking
tech-stack:
  added: [sortable-table-headers, slide-in-drawer, dynamic-form-fields]
  patterns: [inline-delete-confirmation, per-trigger-type-form-fields, err.status-http-code-checking, sse-driven-refresh-on-lifecycle-events]

key-files:
  created:
    - harness/public/js/skills.js (full SkillManagerPanel replacing placeholder)
  modified:
    - harness/public/dashboard.css (+520 lines for skill panel CSS)
    - harness/public/js/api.js (added err.status and err.data to error object)
    - harness/public/js/main.js (added flashSkillRow, refreshSkillList, refreshSkillPack imports and SSE dispatch)

key-decisions:
  - "Single SkillManagerPanel class manages all skill panel state (sort, drawer, form, packs, mappings) rather than splitting into multiple modules -- cohesive feature ownership"
  - "Dynamic trigger fields rendered via TRIGGER_FIELDS config map rather than per-type conditional branches -- declarative and extensible"
  - "SSE dispatch stays in main.js (flashSkillRow, refreshSkillList, refreshSkillPack exports) -- skills.js does not attach SSE listeners directly since DashboardSSE uses callback pattern"

patterns-established:
  - "Drawer pattern: fixed overlay + slide-in panel from right, Escape/overlay/close dismiss, requestAnimationFrame for animation trigger"
  - "Inline confirmation: dataset.confirming flag on button, 3s timeout reset, btn-danger class toggle"
  - "Form validation: validateSkillForm returns errors map, renderFormErrors adds .has-error class + .form-field-error spans"
  - "err.status checking: API errors expose .status (HTTP code) and .data (parsed body) for type-safe error handling"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-04-28
---

# Phase 8 Plan 04: Skill Manager Panel Summary

**Full CRUD Skill Manager with sortable table, slide-in detail drawer, register form with dynamic trigger fields and validation, pack management, event mapping management, and SSE-driven real-time updates**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-28T21:39:16Z
- **Completed:** 2026-04-28T21:44:42Z
- **Tasks:** 1 (single atomic commit with interconnected panel components)
- **Files modified:** 4 (1 new, 3 modified)

## Accomplishments
- SkillManagerPanel class (927 lines) with complete CRUD for skills, pack management, and event mapping management
- Sortable skill table with 8 columns (ID, Name, Trigger, Priority, Source, Enabled, FireCount, LastFired) and sort indicator arrows
- Source badges: Built-in (gray), Pack (blue), Brain (purple) with correct CRUD restrictions per source type
- Detail drawer slides in from right with animation (translateX 100% -> 0), closes on Escape key, overlay click, or close button
- Register skill form with Simple mode (dynamic trigger fields per type) and Advanced mode (JSON textarea with CoreSkill template)
- Dynamic trigger fields: event, interval, sensor (key/operator/value), mode (from/to), cron, internal, composite (advances to Advanced mode)
- Form validation with inline errors: red border + error text per field, per-trigger-type requirements
- 409 collision handling on register (toast: "already exists, use edit instead"), 403 protection on pack/builtin delete
- Toggle enable/disable per skill with immediate SSE feedback
- Inline delete confirmation: click transforms button to "Confirm Delete" with red background for 3 seconds
- Live fire flash: skill_fired SSE event flashes matching row with accent-blue background for 500ms
- Pack section: active pack name display, pack skill count, Switch Pack dropdown, Reload button
- Event mappings table: ID, Source, EventName, Status (Default/Custom badge), Remove button for non-protected mappings
- Add custom mapping form: source input + event name input + Add Mapping button
- Responsive CSS: drawer goes full-width on mobile, form rows stack vertically, table shrinks font/padding

## Task Commits

Each task was committed atomically:

1. **Skill Manager Panel implementation** - `2e5c522` (feat)
2. **Fix 409 collision check: use err.status instead of string matching** - `cdf8ce3` (fix)

## Files Created/Modified
- `harness/public/js/skills.js` - Full SkillManagerPanel class replacing placeholder: sortable table, detail drawer, register form (Simple/Advanced), dynamic trigger fields, validation, toggle/delete, pack management, event mappings
- `harness/public/dashboard.css` - +520 lines: skill table CSS (sortable headers, sticky header, flash-accent, empty state), source badges, toggle switch, detail drawer (overlay, panel, header, body, close), skill form (rows, groups, labels, inputs, selects, textarea, errors, mode toggle), pack section, event mappings table, responsive breakpoints
- `harness/public/js/api.js` - Added err.status and err.data to error object in request() method for type-safe HTTP code checking
- `harness/public/js/main.js` - Added flashSkillRow, refreshSkillList, refreshSkillPack imports; SSE dispatch for skill_fired flash, skill lifecycle list refresh, pack_loaded/unloaded pack refresh

## Decisions Made
- Single SkillManagerPanel class manages all skill panel state (sort, drawer, form, packs, mappings) rather than splitting into multiple modules. The panel is cohesive with a single render() cycle, making state management simpler.
- Dynamic trigger fields rendered via TRIGGER_FIELDS config map (key/label/type/options) rather than per-type conditional branches. Adding a new trigger type requires only a new entry in the map.
- SSE dispatch stays in main.js via exported flashSkillRow/refreshSkillList/refreshSkillPack functions, because DashboardSSE uses a callback pattern rather than individual event listeners. skills.js does not attach SSE listeners directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 409 collision check to use err.status instead of string matching**
- **Found during:** Post-implementation review of registerSkill/registerSkillAdvanced
- **Issue:** Both functions checked `err.message.includes('409')` which is fragile -- the message string could contain "409" in unrelated contexts (e.g., "Error fetching skill 409-data"). The api.js error object was updated in the same commit to expose `err.status`, but the skills.js code did not use it.
- **Fix:** Changed both checks to `err.status === 409`, matching the pattern already used in requestRemoveSkill (`err.status === 403`).
- **Files modified:** harness/public/js/skills.js
- **Commit:** cdf8ce3

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fix ensuring correct HTTP status code matching for 409 collision detection.

## Issues Encountered

None -- plan executed cleanly with no blockers.

## Known Stubs

| File | Stub | Reason | Resolution |
|------|------|--------|------------|
| `harness/public/js/skills.js` | AVAILABLE_MODES hardcoded array | Config availableModes may have more modes | Future: populate from state.config.availableModes when available |

## Threat Flags

No new threat surface. The skill panel reads from and writes to existing REST endpoints. Pack switching calls the same loadPack endpoint. Event mapping CRUD uses existing /api/event-mappings routes. The 64KB body size limit from 08-07 applies to POST requests. No new authentication or data exposure.

## Self-Check: PASSED

- All 4 created/modified files verified on disk
- Commit `2e5c522` verified in git log (feat: Skill Manager panel)
- Commit `cdf8ce3` verified in git log (fix: 409 collision check)
- skills.js: 927 lines, dashboard.css: 1144 lines (including +520 from this plan)
- main.js: flashSkillRow, refreshSkillList, refreshSkillPack imports present
- api.js: err.status and err.data fields present in error object

## Next Phase Readiness
- 08-05 (Live Telemetry Panel) can proceed: api.js has sensor history endpoint, sse.js handles sensor_update/counter_update
- 08-06 (Mode & Space Controls) can proceed: api.js has mode/space endpoints, sse.js handles mode_change events
- All CSS design tokens and component patterns (card, toast, action-btn, toggle, badge) are reusable by downstream panels
- Skill panel drawer pattern established and reusable for 08-05/08-06 detail views

---
*Phase: 08-web-console-dashboard*
*Completed: 2026-04-28*
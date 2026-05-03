# Phase 6 Completion Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 low-severity issues from the Phase 6 completion audit: ROADMAP checkbox updates, test mock `transition()` method, and STATE/ROADMAP alignment.

**Architecture:** Three small, independent fixes — two documentation updates and one test mock fix. No production code changes.

**Tech Stack:** Vitest, TypeScript, Markdown

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `.planning/ROADMAP.md` | Modify | Mark 06-03/04/05 complete, update progress table |
| `harness/tests/skill-executor.test.ts` | Modify | Add `transition` to `mockModeManager` |
| `harness/tests/space-manager.test.ts` | Modify | Add `transition` to `mockModeManager` |
| `.planning/STATE.md` | Modify | No changes needed — already correct |

---

### Task 1: Fix test mocks — add `transition()` method

**Files:**
- Modify: `harness/tests/skill-executor.test.ts:17-23`
- Modify: `harness/tests/space-manager.test.ts:7`

- [ ] **Step 1: Add `transition` to `mockModeManager` in skill-executor.test.ts**

In `harness/tests/skill-executor.test.ts`, change the `mockModeManager` object (lines 17-23) from:

```typescript
const mockModeManager = {
  getMode: vi.fn(() => 'listen'),
  setMode: vi.fn(),
  on: vi.fn(),
  clearIdleTimer: vi.fn(),
  handleModeCommand: vi.fn(),
  handleSensorEvent: vi.fn(),
};
```

to:

```typescript
const mockModeManager = {
  getMode: vi.fn(() => 'listen'),
  setMode: vi.fn(),
  transition: vi.fn(() => true),
  on: vi.fn(),
  clearIdleTimer: vi.fn(),
  handleModeCommand: vi.fn(),
  handleSensorEvent: vi.fn(),
};
```

- [ ] **Step 2: Add `transition` to `mockModeManager` in space-manager.test.ts**

In `harness/tests/space-manager.test.ts`, change line 7 from:

```typescript
const mockModeManager = { getMode: vi.fn(() => 'listen'), setMode: vi.fn(), on: vi.fn(), clearIdleTimer: vi.fn() };
```

to:

```typescript
const mockModeManager = { getMode: vi.fn(() => 'listen'), setMode: vi.fn(), transition: vi.fn(() => true), on: vi.fn(), clearIdleTimer: vi.fn() };
```

- [ ] **Step 3: Run tests to verify no regressions and no noisy errors**

Run: `cd harness && npx vitest run`
Expected: All 26 tests pass. No `TypeError: transition is not a function` errors in output.

- [ ] **Step 4: Commit test fix**

```bash
git add harness/tests/skill-executor.test.ts harness/tests/space-manager.test.ts
git commit -m "fix: add transition() to test mocks to match ModeManager API"
```

---

### Task 2: Update ROADMAP.md — mark Phase 6 plans complete

**Files:**
- Modify: `.planning/ROADMAP.md`

- [ ] **Step 1: Mark 06-03, 06-04, 06-05 as complete**

In `.planning/ROADMAP.md`, find these lines in the Phase 6 section:

```
- [ ] 06-03: SpaceManager + 8 MCP skill management tools (register/update/disable/remove/list/log/switch_mode/resolve_conflict)
- [ ] 06-04: Wire SpaceManager into `core.ts` — default Space, MQTT forwarding, SSE relay
- [ ] 06-05: Vitest tests for SkillLog, SkillExecutor, SpaceManager
```

Change them to:

```
- [x] 06-03: SpaceManager + 8 MCP skill management tools (register/update/disable/remove/list/log/switch_mode/resolve_conflict)
- [x] 06-04: Wire SpaceManager into `core.ts` — default Space, MQTT forwarding, SSE relay
- [x] 06-05: Vitest tests for SkillLog, SkillExecutor, SpaceManager
```

- [ ] **Step 2: Update progress table**

Find the progress table row for Phase 6:

```
| 6. Xentient Layers | 2/5 | In progress | 06-01, 06-02 |
```

Change to:

```
| 6. Xentient Layers | 5/5 | Complete | 06-01 through 06-05 |
```

- [ ] **Step 3: Update the last-updated line**

Find:

```
*Last updated: 2026-04-28 — Demo scope reduced (breadboard prototype, no casing). Phase 5 complete. Phase 6 Waves 1-2 done. Beads aligned.*
```

Change to:

```
*Last updated: 2026-04-28 — Phase 6 complete (all 5 waves). Demo scope reduced (breadboard prototype, no casing).*
```

- [ ] **Step 4: Commit ROADMAP update**

```bash
git add .planning/ROADMAP.md
git commit -m "docs: mark Phase 6 plans 06-03/04/05 complete, update progress table"
```

---

### Task 3: Verify STATE.md and ROADMAP.md alignment

**Files:**
- Read-only: `.planning/STATE.md`
- Read-only: `.planning/ROADMAP.md`

- [ ] **Step 1: Confirm STATE.md already says Phase 6 complete**

Read `.planning/STATE.md` and verify it contains `Phase 6 complete` or equivalent language. No changes needed — STATE.md is already correct.

- [ ] **Step 2: Confirm ROADMAP.md now agrees with STATE.md**

After Task 2 edits, both files should say Phase 6 is complete. No additional changes needed.

---

### Task 4: Push and close

- [ ] **Step 1: Push all commits to remote**

```bash
git pull --rebase
git push
```

- [ ] **Step 2: Close any related beads**

```bash
bd list --status=in_progress
# Close any Phase 6 related beads
bd close <id> --reason="Phase 6 completion audit fixes done"
```

- [ ] **Step 3: Verify clean state**

```bash
git status
bd dolt push
```

Expected: Working tree clean, remote up to date.
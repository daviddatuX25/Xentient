# Xentient Heartbeat & Rule Engine — Executive Summary

> **Full spec:** `docs/SPEC-heartbeat-rule-engine.md`
> **For:** Senior developer review
> **Date:** 2026-04-25

---

## The Problem

Every event currently requires LLM inference. That's wasteful. A 7AM Saturday alarm doesn't need GPT to say "good morning." The system needs a **fast deterministic path** (Core rules, no LLM) alongside the **slow reasoning path** (Brain/LLM).

## The Solution

### Heartbeat = Rule Evaluation Loop (in Core)

Every 1-5 seconds, Core evaluates registered rules against current state (mode, sensors, time). No LLM involved.

- **FAST path** → execute immediately (set LCD, play chime, change mode)
- **SLOW path** → send MCP notification to Brain (LLM decides)

### Brain Layering

| Brain | Role | LLM? | Connect via |
|-------|------|------|-------------|
| brain-basic | Voice fallback (STT→LLM→TTS) | Yes, per utterance | stdio (child process) |
| brain-hermes | Situational agent (reason, memory, tools) | Yes, on SLOW path only | SSE (remote OK) |
| No brain | Rule-only mode | No | N/A — Core runs autonomously |

### Key Architecture: Brain registers rules, Core evaluates them

Hermes (the Brain) creates rules during conversation like: "Remind me every Saturday at 7AM." It calls `xentient_register_rule` MCP tool. Core stores and evaluates that rule every tick without asking the Brain again. Only when a rule says `action.type === "notify"` does Core wake the Brain.

## New MCP Tools (3)

| Tool | Purpose |
|------|---------|
| `xentient_register_rule` | Brain installs a rule (cron, sensor, event, interval trigger) |
| `xentient_unregister_rule` | Brain removes a rule |
| `xentient_list_rules` | Brain queries current rules |

## New MCP Notifications (3)

| Notification | When |
|-------------|------|
| `xentient/rule_triggered` | A SLOW-path rule fires (Brain needs to decide) |
| `xentient/brain_connected` | Brain connects (dashboard awareness) |
| `xentient/brain_disconnected` | Brain disconnects (dashboard awareness) |

## New Core Modules (2)

| Module | File | Purpose |
|--------|------|---------|
| RuleEngine | `src/engine/RuleEngine.ts` | Tick loop, evaluate rules, dispatch actions |
| HealthMonitor | `src/engine/HealthMonitor.ts` | Track Brain connection, trigger failover |

## Connection Health = Implicit Heartbeat

No explicit `xentient_heartbeat` tool. The Brain naturally calls MCP tools (read_sensors, read_mode, capture_frame). Core tracks `lastActivityAt`. No activity for 60s = warning. 120s = disconnected → failover.

## Decision Points (7)

See full spec §9. Key ones:
- **D3**: Failover mode → configurable, default rule-only
- **D4**: Dual transport (stdio + SSE simultaneously) → yes
- **D7**: brain-basic stays standalone → yes, spawned on failover

## What Does NOT Change

All wire contracts, hardware decisions, mode state machine, existing 7 MCP tools, ControlServer API. This is purely additive.

## Implementation Phases

1. **Phase 1** (demo-blocking): Fix PIR, fix 0xA0 prefix, fix dead VAD sub
2. **Phase 2** (rule engine): RuleEngine, static rules, MCP tools for registration, unit tests
3. **Phase 3** (health + transport): HealthMonitor, SSE transport, brain_status events
4. **Phase 4** (Hermes integration): brain-hermes entry point, SkillRegistry, ContextBuilder, e2e test
# Xentient Brain Interface

> The three-channel spec for connecting any AI process to Xentient Core.
> Anyone building a Brain reads this document first.

---

## What a Brain Is

A Brain is **any MCP client that implements the three channels.** Not a fixed process, not a specific framework. The interface is the contract, not the implementation.

- **brain-basic** is the minimal working Brain (Channel 1 + 3, no streaming).
- **Hermes** is the full Brain (all three channels + memory + LLM reasoning).
- **A custom script** that connects, listens for escalations, and calls tools is also a valid Brain.

The Brain runs where the power is — a workstation, a VPS, a powerful local server. Its reach is bounded by the machine it runs on. Core intentionally has no reach beyond the room. The Brain has whatever reach its host machine allows.

---

## Channel 1: Escalation Inbox

Core pushes escalations when a CoreSkill detects a condition that requires Brain reasoning. Every escalation gets a unique `escalation_id`.

### Escalation Payload Schema

```typescript
interface EscalationPayload {
  escalation_id: string        // unique per escalation, used to group Brain Feed events
  skill_id: string             // the CoreSkill that triggered this escalation
  space_id: string             // which Space this escalation belongs to
  mode: SpaceMode              // current mode at time of escalation
  timestamp: number            // epoch-millis uint32
  audio?: string               // base64-encoded PCM audio (S16LE, 16kHz, mono)
  sensor_snapshot?: SensorSnapshot
  context?: Record<string, unknown>
}

interface SensorSnapshot {
  temperature?: number
  humidity?: number
  pressure?: number
  motion?: boolean
  timestamp: number
}
```

### How Escalations Are Sent

1. CoreSkill fires on heartbeat tick and evaluates its trigger condition.
2. If the condition is met AND the skill has `escalate: true`, SkillExecutor packages the context into an `EscalationPayload`.
3. The payload is sent to all connected MCP clients via `xentient/skill_escalated` notification.
4. Any Brain that is connected receives it. If no Brain is connected, the escalation is logged but not acted upon (Core continues running).

### Escalation Flow

```
CoreSkill fires → SkillExecutor packages EscalationPayload →
  MCP notification (xentient/skill_escalated) →
    Brain receives → Brain decides what to do
```

---

## Channel 2: Stream Out

The Brain pushes its reasoning stream back to Core via the `xentient_brain_stream` MCP tool. Core relays these events to the SSE observability bus with `source: "brain"`. The Dashboard renders them in real time.

### Brain Stream Event Schema

```typescript
interface BrainStreamEvent {
  escalation_id: string        // always present, ties event to its escalation
  subtype: BrainStreamSubtype
  payload: unknown
  timestamp: number
}

type BrainStreamSubtype =
  | "reasoning_token"      // LLM is generating text
  | "tool_call_fired"      // Brain called an xentient_* tool
  | "tool_call_result"     // result of an xentient_* tool call
  | "tts_queued"           // TTS audio has been queued for playback
  | "escalation_received"  // Brain acknowledged the escalation
  | "escalation_complete"  // Brain finished processing this escalation
```

### How Streaming Works

1. Brain calls `xentient_brain_stream` with each `BrainStreamEvent`.
2. Core receives the event, adds `source: "brain"` and `escalation_id`.
3. Core relays to all SSE subscribers via the existing observability bus.
4. Dashboard renders the Brain Feed — grouped by `escalation_id`.

### Why `escalation_id` Matters

Without `escalation_id`, the Brain Feed is an unordered stream of events with no grouping. With it, the Dashboard can render a clean per-escalation timeline:

```
[esc_abc123] escalation_received  → "Hey Xentient" detected
[esc_abc123] reasoning_token      → "The"
[esc_abc123] reasoning_token      → " temperature"
[esc_abc123] reasoning_token      → " is 24°C"
[esc_abc123] tool_call_fired      → xentient_play_audio
[esc_abc123] tool_call_result    → audio_id: "au_456"
[esc_abc123] escalation_complete  → done
```

### SSE Event Format

```typescript
// Core relays Brain stream events to SSE subscribers like this:
{
  type: "brain_event",
  source: "brain",
  escalation_id: "esc_abc123",
  subtype: "reasoning_token",
  payload: { text: "The" },
  timestamp: 1714400000
}
```

Dashboard developers need this `source: "brain"` field to distinguish Core events from Brain relay events in the SSE stream.

---

## Channel 3: Tool Calls Back to Core

The Brain calls `xentient_*` MCP tools to act on the room. These are the same tools available to any MCP client.

### Available Tools

| Tool | Purpose | Safe from Brain |
|------|---------|-----------------|
| `xentient_play_audio` | Play TTS audio through Node Base speaker | Yes |
| `xentient_set_mode` | Change SpaceMode (sleep/listen/active/record) | Yes |
| `xentient_register_skill` | Register a new L2 Brain Skill | Yes |
| `xentient_update_skill` | Update skill parameters (self-optimization loop) | Yes |
| `xentient_disable_skill` | Disable a skill temporarily | Yes |
| `xentient_list_skills` | List all registered skills with state | Yes |
| `xentient_get_skill_log` | Get fire history for a skill | Yes |
| `xentient_switch_mode` | Switch operational mode | Yes |
| `xentient_resolve_conflict` | Resolve a skill conflict | Yes |
| `xentient_brain_stream` | Push reasoning events to SSE bus | Yes |

### Tool Call Flow

```
Brain decides action → calls xentient_* tool via MCP →
  Core receives tool call → executes action →
    returns result to Brain
```

All tool calls are synchronous from the Brain's perspective — the Brain waits for the result before proceeding.

---

## Building a Custom Brain

The minimum viable Brain is a script that:

1. **Connects** to Core's MCP server (stdio or SSE transport).
2. **Subscribes** to `xentient/skill_escalated` notifications.
3. **Responds** by calling Core MCP tools.

That's it. Streaming is optional. Memory is optional. Tool use is optional.

### Minimal Brain Example (pseudocode)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client";

const client = new Client({ name: "my-brain", version: "1.0" });
await client.connect(new StdioClientTransport());

// Channel 1: Listen for escalations
client.onNotification("xentient/skill_escalated", async (payload) => {
  const { escalation_id, audio, sensor_snapshot, context } = payload;

  // Channel 2 (optional): Stream reasoning
  await client.callTool("xentient_brain_stream", {
    escalation_id,
    subtype: "escalation_received",
    payload: { message: "Processing..." }
  });

  // Do your reasoning here (STT, LLM, etc.)
  const response = await processEscalation(payload);

  // Channel 3: Act on the room
  await client.callTool("xentient_play_audio", {
    audio_base64: response.audio,
    space_id: payload.space_id
  });

  // Channel 2: Mark complete
  await client.callTool("xentient_brain_stream", {
    escalation_id,
    subtype: "escalation_complete",
    payload: {}
  });
});
```

---

## Reference Implementations

### brain-basic.ts

Location: `brain-basic/index.ts`

The minimal Brain. Implements Channel 1 (receives escalations) and Channel 3 (calls tools). No streaming. Suitable for testing and simple voice-response loops.

### brain/hermes/HermesAdapter.ts

Location: `brain/hermes/HermesAdapter.ts` (to be built in Phase 14)

The full Brain. Implements all three channels. Memory recall (Mem0), LLM reasoning, skill execution, and live streaming of reasoning back to the Dashboard.

---

## Hosting Model

| Setup | Core Location | Brain Location | Notes |
|-------|--------------|----------------|-------|
| **Minimal** | Raspberry Pi | Cloud VPS | Core on cheap hardware, Brain where the GPUs are |
| **Standard** | Home server | Same server (co-located) | One machine, two processes |
| **Developer** | Workstation | Same workstation | Full dev sandbox, Brain has workspace access |
| **Distributed** | VPS | Local + VPS | Route coding tasks to local Brain, ambient tasks to VPS |

Core does not care where Brain runs. It only cares that it can connect. Multiple Brains can connect to one Core (e.g., Hermes for voice, Archon for code tasks), but v1 supports one active Brain per escalation.
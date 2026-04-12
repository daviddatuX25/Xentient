---
status: issues_found
phase: 02
depth: standard
files_reviewed: 16
reviewed_at: 2026-04-13T07:51:00Z
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
files:
  - harness/.env.example
  - harness/config/default.json
  - harness/package.json
  - harness/src/comms/AudioServer.ts
  - harness/src/comms/MqttClient.ts
  - harness/src/engine/Pipeline.ts
  - harness/src/index.ts
  - harness/src/providers/llm/AnthropicProvider.ts
  - harness/src/providers/llm/GeminiProvider.ts
  - harness/src/providers/llm/OpenAIProvider.ts
  - harness/src/providers/stt/DeepgramProvider.ts
  - harness/src/providers/stt/WhisperProvider.ts
  - harness/src/providers/tts/ElevenLabsProvider.ts
  - harness/src/providers/tts/GoogleTTSProvider.ts
  - harness/src/providers/types.ts
  - harness/tsconfig.json
---

# Code Review — Phase 02: Harness & Intelligence Layer

**Depth:** Standard | **Files:** 16 | **Reviewed:** 2026-04-13

---

## CRITICAL

### CR-001 — `index.ts`: `extractAfterTurn` called with `.catch()` but method is no longer async

**File:** `harness/src/index.ts:408`
**Severity:** CRITICAL
**Category:** Bug — TypeError at runtime

**Problem:**
The `onTurnComplete` callback calls `factExtractor.extractAfterTurn(...)` chained with `.catch(...)`. After the last code review fix, `FactExtractor.extractAfterTurn` was changed from `async` to **synchronous** (it now queues internally and returns `void`). Calling `.catch()` on a plain `void` return value produces a `TypeError: Cannot read properties of undefined (reading 'catch')` at runtime.

```typescript
// harness/src/index.ts:408 — BROKEN
factExtractor.extractAfterTurn(userMessage, aiResponse).catch(err => {
  logger.debug({ err }, 'Fact extraction error (non-fatal)');
});
```

**Fix:**
Remove `.catch()` — the method is now fire-and-forget and its internal errors are handled internally in `flushPendingTurns()`.

```typescript
// Fixed
factExtractor.extractAfterTurn(userMessage, aiResponse);
```

---

## WARNINGS

### WR-001 — `AudioServer.ts`: No limit on number of concurrent WebSocket connections

**File:** `harness/src/comms/AudioServer.ts:194-225`
**Severity:** WARNING
**Category:** Security / Stability

**Problem:**
The server accepts any incoming WebSocket connection and silently replaces `this.activeConnection`. If a second ESP32 (or a rogue device on the LAN) connects while one is already active, the first connection is orphaned but still receives events from the `mqtt` listener. This could lead to phantom audio processing. There is also no authentication — any device on the same Wi-Fi segment can connect.

**Fix:**
Reject new connections while one is already active:
```typescript
this.wss.on('connection', (ws, req) => {
  if (this.activeConnection) {
    logger.warn('Rejecting second WS connection — already have active ESP32');
    ws.close(1008, 'Already connected');
    return;
  }
  // ... rest of handler
});
```

---

### WR-002 — `DeepgramProvider.ts`: `transcribeStream` accumulates then yields — defeats streaming purpose

**File:** `harness/src/providers/stt/DeepgramProvider.ts:227-254`
**Severity:** WARNING
**Category:** Logic / Latency

**Problem:**
`transcribeStream` opens a live Deepgram connection, accumulates all `TranscriptChunk` objects into an in-memory `chunks[]` array, waits for the audio stream to finish, THEN yields all chunks sequentially. This completely defeats the purpose of a streaming transcription — the pipeline receives no data until the entire audio is consumed. The current implementation is functionally identical to the batch `transcribe()` method with extra overhead.

The root cause is that Deepgram live events (`connection.on(Transcript, ...)`) are not `await`able — they arrive on a different event-loop tick than the `for await (const chunk of audioStream)` loop.

**Fix:**
Use a proper event-to-async-iterator bridge (e.g., a `PassThrough` or an async queue):
```typescript
async *transcribeStream(audioStream: Readable): AsyncIterable<TranscriptChunk> {
  const queue: TranscriptChunk[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  const connection = this.client.listen.live({ model: 'nova-2', ... });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data.channel?.alternatives?.[0];
    if (alt?.transcript && data.is_final) {
      queue.push({ text: alt.transcript, is_final: true, confidence: alt.confidence });
      resolve?.();
    }
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    done = true;
    resolve?.();
  });

  for await (const chunk of audioStream) {
    connection.send(chunk as Buffer);
  }
  connection.requestClose();

  while (!done || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else {
      await new Promise<void>(r => { resolve = r; });
      resolve = null;
    }
  }
}
```

---

### WR-003 — `GoogleTTSProvider.ts`: Unhandled exception in `synthesizeStreaming`

**File:** `harness/src/providers/tts/GoogleTTSProvider.ts:381-398`
**Severity:** WARNING
**Category:** Bug / Crash

**Problem:**
The async IIFE in `synthesizeStreaming` has NO `.catch()` handler — unlike `ElevenLabsProvider` which correctly calls `.catch(err => readable.destroy(err))`. Any error thrown inside (e.g., network error from `synthesize()`) will be an unhandled promise rejection, which in Node.js 15+ terminates the process.

```typescript
// GoogleTTSProvider.ts:397 — missing .catch()
})(); // NO .catch() — process crash risk
```

**Fix:**
Add `.catch()` matching ElevenLabsProvider's pattern:
```typescript
})().catch(err => readable.destroy(err));
```

---

### WR-004 — `MqttClient.ts`: MQTT `clientId` uses `Date.now()` — not collision-safe in cluster

**File:** `harness/src/comms/MqttClient.ts:268`
**Severity:** WARNING
**Category:** Reliability

**Problem:**
```typescript
clientId: `harness-${Date.now()}`,
```
`Date.now()` has millisecond resolution. If two harness processes boot within the same millisecond (e.g., container restart), they get the same `clientId`. MQTT brokers disconnect the first client when a new one connects with the same ID, causing an immediate reconnect loop.

**Fix:**
Use a combination of hostname + random suffix for collision safety:
```typescript
import { randomBytes } from 'crypto';
clientId: `harness-${randomBytes(4).toString('hex')}`,
```

---

## INFO

### IN-001 — `AnthropicProvider.ts`: Model name `claude-sonnet-4-20250514` appears to be future-dated

**File:** `harness/src/providers/llm/AnthropicProvider.ts:75`
**Severity:** INFO
**Category:** Compatibility

The default model `claude-sonnet-4-20250514` may not be resolvable in current Anthropic API. At time of review, the latest stable is `claude-3-5-sonnet-20241022`. This defaults to a model that will throw a 404 if called. Recommend using `claude-3-5-sonnet-20241022` as the safe default with a config override for future models.

---

### IN-002 — `GeminiProvider.ts`: System prompt injected as first `model` turn — semantically incorrect

**File:** `harness/src/providers/llm/GeminiProvider.ts:149-155`
**Severity:** INFO
**Category:** Quality

Gemini's Content API treats the first `model` turn as an assistant response in history, not a system instruction. While this works functionally, it muddies the semantics and may cause odd behavior if the conversation history grows long. Use `systemInstruction` parameter in `getGenerativeModel()` for proper system prompt injection:
```typescript
const model = this.client.getGenerativeModel({
  model: this.model,
  systemInstruction: systemPrompt,
});
```

---

### IN-003 — `index.ts`: `SIGTERM` not handled — container/PM2 stopping will not flush memory

**File:** `harness/src/index.ts:425`
**Severity:** INFO
**Category:** Ops

Only `SIGINT` (Ctrl+C) is handled. Docker `stop`, PM2 restart, and Kubernetes pod eviction send `SIGTERM` first. The harness will terminate without flushing the `FactExtractor` queue or closing the SQLite WAL, risking data corruption on next boot.

**Fix:** Add a SIGTERM handler mirroring the SIGINT one:
```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully...');
  await factExtractor.flush();
  memoryDb.endSession(turnCount);
  mqtt.disconnect();
  audioServer.close();
  process.exit(0);
});
```

---

## Summary

| Severity | Count | Files Affected |
|---|---|---|
| CRITICAL | 1 | `index.ts` |
| WARNING  | 4 | `AudioServer.ts`, `DeepgramProvider.ts`, `GoogleTTSProvider.ts`, `MqttClient.ts` |
| INFO     | 3 | `AnthropicProvider.ts`, `GeminiProvider.ts`, `index.ts` |

**Recommended action before shipping:**
1. Fix CR-001 immediately (runtime TypeError).
2. Apply WR-003 (GoogleTTSProvider crash risk) — low effort, high impact.
3. Apply WR-004 (MQTT clientId) — one-line fix.
4. WR-001 (WS connection limit) and WR-002 (Deepgram streaming) are architectural improvements — target Phase 3 hardening unless V1 demo handles multiple connections.
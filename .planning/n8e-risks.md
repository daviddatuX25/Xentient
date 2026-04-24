# n8e — RMS VAD + Audio Chunking — Pre-Work Risk Notes
> Captured before starting firmware implementation. Review before writing I2S/VAD code.

## Firmware (ESP32 C++)

| # | Risk | Detail | Mitigation |
|---|------|--------|------------|
| R1 | **INMP441 bit-depth trap** | I2S delivers 32-bit DMA frames; audio sits in the **upper 24 bits** (MSB-justified). Raw cast to int32_t then right-shift >>8 to get 16-bit PCM. Miss this = silence/noise. | Cast `int32_t`, shift right 8, cast to `int16_t` |
| R2 | **RMS VAD threshold calibration** | No universal value — room noise varies. Start 800–1200 for 16-bit PCM. Must use **hysteresis** (enter_thresh ≠ exit_thresh) or ambient noise causes constant voice_active chatter. | Two thresholds: `VAD_ENTER=1000`, `VAD_EXIT=600` |
| R3 | **Chunk size tradeoff** | 512 samples = 32ms @ 16kHz (low latency); 1024 = 64ms (better WiFi throughput). Decision affects harness DeepgramProvider buffer assumptions. | Start 512. Document in contracts. |
| R4 | **DMA buffer underrun** | If DMA buffer < WiFi TX time, samples silently drop. No error thrown. | DMA size ≥ 2× chunk_size. I2S task on Core 1 (higher prio than WiFi). |
| R5 | **WiFi + I2S + MQTT concurrency** | All three on one chip. WiFi handler runs on Core 0. I2S DMA on Core 1. MQTT `mqtt_loop()` on Core 0 (current). Conflicts if you block main loop. | Use `xTaskCreatePinnedToCore()` for I2S capture. FreeRTOS queue → Core 0 sends over WS. |
| R6 | **WebSocket library choice** | `links2004/WebSockets` = stable, widely used in PlatformIO. `gilmaimon/ArduinoWebsockets` = lighter. Both use TCP; large binary frames can block `mqtt_loop()`. | Use `links2004/WebSockets`. Call `webSocket.loop()` inside the WiFi task, not blocking main loop. |

## Harness (verify before calling done)

| # | Risk | Detail |
|---|------|--------|
| H1 | **AudioServer → Pipeline wire** | `AudioServer.ts` emits `audioChunk` — confirm `index.ts` (from last session) actually subscribes to it and passes to Pipeline. Don't assume. |
| H2 | **Format contract** | Harness expects S16LE 16kHz mono. Firmware must send exactly this. Add JSON handshake on WS connect: `{ "type": "audio_format", "rate": 16000, "bits": 16, "ch": 1 }`. |

## Hardware blocker (1xi)

- n8e is formally blocked by `Xentient-1xi` (BB-I2S loopback on breadboard)
- **Strategy:** Write firmware code now (parallel unblocking), validate pin config on breadboard when hardware is ready
- The I2S GPIO map from WIRING.md: BCLK=GPIO26, LRCK=GPIO25, DIN(mic)=GPIO35 — lock these in code, flag them clearly for hardware validation

## Open questions to resolve during implementation

1. `I2S_NUM_0` vs `I2S_NUM_1` — which I2S peripheral to use (avoid conflict if DOUT reuses same peripheral)
2. UART0 vs UART2 for ESP32-CAM (separate issue `02i`, but don't use GPIO16/17 for anything in n8e)
3. Confirm `deepgramProvider` chunk expectations vs 512-sample chunks

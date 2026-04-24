#include <Arduino.h>
#include "cam_relay.h"
#include "pins.h"
#include "messages.h"
#include "ws_audio.h"

// --- UART2 to ESP32-CAM ---
static HardwareSerial CamSerial(2);
static constexpr uint32_t CAM_BAUD = 115200;

// --- Reassembly buffer ---
// QQVGA q10 max ~5KB; 16KB gives comfortable headroom for QVGA+ if needed later.
static constexpr size_t CAM_BUF_SIZE = 16384;
static uint8_t s_camBuf[CAM_BUF_SIZE];
static size_t   s_camBufLen      = 0;
static uint16_t s_curFrameId    = 0;
static uint8_t  s_curChunkTotal = 0;
static uint8_t  s_nextChunkIdx  = 0;  // expected next chunk index
static bool     s_reassembling  = false;
static unsigned long s_reasmStartMs = 0;

// --- Stats ---
static uint32_t s_framesRx      = 0;  // complete frames received from CAM
static uint32_t s_framesTx      = 0;  // complete frames forwarded to WS
static uint32_t s_crcDrops      = 0;
static uint32_t s_timeoutDrops  = 0;
static uint32_t s_gapDrops      = 0;  // frames dropped due to chunk sequence gaps

// --- CRC-8/ITU (polynomial 0x07, init 0x00, no final XOR) ---
// Matches ESP-CAM sender implementation exactly.
static uint8_t crc8_update(uint8_t crc, const uint8_t *data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            if (crc & 0x80)
                crc = (crc << 1) ^ UART_CRC8_POLY;
            else
                crc <<= 1;
        }
    }
    return crc;
}

// --- Discard current partial reassembly ---
static void discard_reassembly() {
    s_reassembling = false;
    s_camBufLen = 0;
    s_curFrameId = 0;
    s_curChunkTotal = 0;
    s_nextChunkIdx = 0;
}

// --- Forward reassembled JPEG over shared WebSocket ---
// Format per CONTRACTS.md:
//   [0xCA][frame_id:uint16 LE][total_size:uint32 LE][data...]
static void forward_frame(uint16_t frameId, const uint8_t *jpeg, size_t len) {
    if (!ws_audio_connected()) {
        Serial.printf("[CAM-RELAY] WS not connected — dropping frame %u (%u bytes)\n",
                      frameId, (unsigned)len);
        return;
    }

    // Build WS binary message: prefix(1) + frameId(2) + totalSize(4) + jpeg(len)
    size_t msgLen = 1 + 2 + 4 + len;
    if (msgLen > 20480) {  // sanity cap at 20KB
        Serial.printf("[CAM-RELAY] Frame %u too large (%u bytes) — dropping\n",
                      frameId, (unsigned)msgLen);
        return;
    }

    uint8_t *msg = (uint8_t *)malloc(msgLen);
    if (!msg) {
        Serial.printf("[CAM-RELAY] malloc failed (%u bytes) — dropping frame %u\n",
                      (unsigned)msgLen, frameId);
        return;
    }

    size_t off = 0;
    msg[off++] = CAMERA_WS_PREFIX;                         // 0xCA
    msg[off++] = frameId & 0xFF;                            // frame_id LE low
    msg[off++] = (frameId >> 8) & 0xFF;                    // frame_id LE high
    uint32_t totalSize = (uint32_t)len;
    msg[off++] = totalSize & 0xFF;                          // total_size LE byte 0
    msg[off++] = (totalSize >> 8) & 0xFF;                   // total_size LE byte 1
    msg[off++] = (totalSize >> 16) & 0xFF;                  // total_size LE byte 2
    msg[off++] = (totalSize >> 24) & 0xFF;                  // total_size LE byte 3
    memcpy(msg + off, jpeg, len);

    bool ok = ws_audio_send_raw(msg, msgLen);
    free(msg);

    if (ok) {
        s_framesTx++;
        Serial.printf("[CAM-RELAY] → WS frame %u (%u bytes)\n", frameId, (unsigned)len);
    } else {
        Serial.printf("[CAM-RELAY] WS send failed for frame %u\n", frameId);
    }
}

// --- Process one complete chunk from UART ---
static void process_chunk(uint16_t frameId, uint8_t chunkIdx, uint8_t chunkTotal,
                          const uint8_t *data, uint16_t dataLen) {
    // --- New frame starts ---
    if (chunkIdx == 0) {
        // If we were reassembling a different frame, that one is lost (CAM moved on)
        if (s_reassembling && s_curFrameId != frameId) {
            Serial.printf("[CAM-RELAY] Mid-frame loss: discarding partial frame %u (%u bytes)\n",
                          s_curFrameId, (unsigned)s_camBufLen);
        }
        s_reassembling    = true;
        s_curFrameId      = frameId;
        s_curChunkTotal   = chunkTotal;
        s_nextChunkIdx    = 0;
        s_camBufLen       = 0;
        s_reasmStartMs    = millis();
    }

    // --- Validate chunk belongs to current reassembly ---
    if (!s_reassembling || frameId != s_curFrameId) {
        // Stray chunk without a chunk_idx==0 start — discard
        return;
    }

    // chunk_total consistency check
    if (chunkTotal != s_curChunkTotal) {
        Serial.printf("[CAM-RELAY] chunk_total mismatch: expected %u got %u — discarding frame %u\n",
                      s_curChunkTotal, chunkTotal, frameId);
        discard_reassembly();
        return;
    }

    // Sequence gap detection
    if (chunkIdx != s_nextChunkIdx) {
        s_gapDrops++;
        Serial.printf("[CAM-RELAY] Chunk gap: expected %u got %u — discarding frame %u\n",
                      s_nextChunkIdx, chunkIdx, frameId);
        discard_reassembly();
        return;
    }
    s_nextChunkIdx++;

    // Buffer overflow protection
    if (s_camBufLen + dataLen > CAM_BUF_SIZE) {
        Serial.printf("[CAM-RELAY] Buffer overflow (%u + %u > %u) — discarding frame %u\n",
                      (unsigned)s_camBufLen, (unsigned)dataLen,
                      (unsigned)CAM_BUF_SIZE, frameId);
        discard_reassembly();
        return;
    }

    // Append data
    memcpy(s_camBuf + s_camBufLen, data, dataLen);
    s_camBufLen += dataLen;

    // --- Frame complete? ---
    if (chunkIdx == chunkTotal - 1) {
        s_framesRx++;

        // Validate JPEG magic bytes (FF D8)
        if (s_camBufLen < 2 || s_camBuf[0] != 0xFF || s_camBuf[1] != 0xD8) {
            Serial.printf("[CAM-RELAY] Invalid JPEG header (%02X %02X) — discarding frame %u\n",
                          s_camBuf[0], s_camBuf[1], frameId);
            discard_reassembly();
            return;
        }

        Serial.printf("[CAM-RELAY] Reassembled frame %u: %u bytes, %u chunks\n",
                      frameId, (unsigned)s_camBufLen, chunkTotal);

        forward_frame(frameId, s_camBuf, s_camBufLen);
        discard_reassembly();
    }
}

// --- UART state machine ---
enum class RxState : uint8_t {
    WAIT_SYNC1,     // waiting for 0xAA
    WAIT_SYNC2,     // got 0xAA, waiting for 0x55
    HEADER,         // reading 6-byte header after sync
    DATA,           // reading chunk payload
    CRC             // reading CRC-8 byte
};

static RxState      s_rxState      = RxState::WAIT_SYNC1;
static uint8_t      s_rxHeader[6];  // frame_id(2) + chunk_idx(1) + chunk_total(1) + chunk_len(2)
static uint8_t      s_rxHeaderIdx  = 0;
static uint16_t     s_rxDataLen    = 0;
static uint8_t      s_rxData[UART_CHUNK_MAX_PAYLOAD];
static uint16_t     s_rxDataIdx    = 0;
static uint8_t      s_rxCrc        = 0;

static void reset_rx() {
    s_rxState     = RxState::WAIT_SYNC1;
    s_rxHeaderIdx = 0;
    s_rxDataIdx   = 0;
    s_rxDataLen   = 0;
}

void cam_relay_init() {
    CamSerial.begin(CAM_BAUD, SERIAL_8N1, PIN_CAM_RX, PIN_CAM_TX);
    reset_rx();
    discard_reassembly();
    Serial.printf("[CAM-RELAY] UART2 initialized: RX=GPIO%d TX=GPIO%d @ %u baud\n",
                  PIN_CAM_RX, PIN_CAM_TX, CAM_BAUD);
}

void cam_relay_loop() {
    // --- Reassembly timeout ---
    if (s_reassembling && (millis() - s_reasmStartMs >= CAM_REASSEMBLY_TIMEOUT_MS)) {
        unsigned long elapsed = (millis() - s_reasmStartMs) / 1000;
        Serial.printf("[CAM-RELAY] Timeout: discarding partial frame %u (%u bytes after %lus)\n",
                      s_curFrameId, (unsigned)s_camBufLen, elapsed);
        s_timeoutDrops++;
        discard_reassembly();
    }

    // --- Read available UART bytes ---
    while (CamSerial.available()) {
        uint8_t b = CamSerial.read();

        switch (s_rxState) {
        case RxState::WAIT_SYNC1:
            if (b == UART_SYNC_BYTE_1) {
                s_rxState = RxState::WAIT_SYNC2;
            }
            break;

        case RxState::WAIT_SYNC2:
            if (b == UART_SYNC_BYTE_2) {
                s_rxState = RxState::HEADER;
                s_rxHeaderIdx = 0;
            } else if (b == UART_SYNC_BYTE_1) {
                // Stay in WAIT_SYNC2 — might be AA AA 55
            } else {
                s_rxState = RxState::WAIT_SYNC1;
            }
            break;

        case RxState::HEADER:
            s_rxHeader[s_rxHeaderIdx++] = b;
            if (s_rxHeaderIdx >= 6) {
                // Parse header
                uint16_t frameId    = s_rxHeader[0] | (s_rxHeader[1] << 8);
                uint8_t  chunkIdx   = s_rxHeader[2];
                uint8_t  chunkTotal = s_rxHeader[3];
                s_rxDataLen         = s_rxHeader[4] | (s_rxHeader[5] << 8);

                if (chunkTotal == 0 || s_rxDataLen > UART_CHUNK_MAX_PAYLOAD) {
                    Serial.printf("[CAM-RELAY] Bad header: chunkTotal=%u dataLen=%u — resync\n",
                                  chunkTotal, s_rxDataLen);
                    reset_rx();
                    break;
                }

                s_rxDataIdx = 0;
                s_rxState = RxState::DATA;
            }
            break;

        case RxState::DATA:
            if (s_rxDataIdx < s_rxDataLen) {
                s_rxData[s_rxDataIdx++] = b;
            }
            if (s_rxDataIdx >= s_rxDataLen) {
                s_rxState = RxState::CRC;
            }
            break;

        case RxState::CRC:
            s_rxCrc = b;
            {
                // CRC over: sync(2) + header(6) + data(dataLen)
                uint8_t crc = 0;
                uint8_t sync[2] = {UART_SYNC_BYTE_1, UART_SYNC_BYTE_2};
                crc = crc8_update(crc, sync, 2);
                crc = crc8_update(crc, s_rxHeader, 6);
                crc = crc8_update(crc, s_rxData, s_rxDataLen);

                uint16_t frameId    = s_rxHeader[0] | (s_rxHeader[1] << 8);
                uint8_t  chunkIdx   = s_rxHeader[2];
                uint8_t  chunkTotal = s_rxHeader[3];

                if (crc != s_rxCrc) {
                    s_crcDrops++;
                    Serial.printf("[CAM-RELAY] CRC mismatch on frame %u chunk %u — dropping\n",
                                  frameId, chunkIdx);
                } else {
                    process_chunk(frameId, chunkIdx, chunkTotal, s_rxData, s_rxDataLen);
                }
            }
            reset_rx();
            break;
        }
    }
}

uint32_t cam_relay_frames_rx()      { return s_framesRx; }
uint32_t cam_relay_frames_tx()      { return s_framesTx; }
uint32_t cam_relay_crc_drops()      { return s_crcDrops; }
uint32_t cam_relay_timeout_drops()  { return s_timeoutDrops; }
uint32_t cam_relay_gap_drops()      { return s_gapDrops; }
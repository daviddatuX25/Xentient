import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import pino from 'pino';
import { AUDIO_WS_PREFIX, CAMERA_WS_PREFIX } from '../shared/contracts';

const logger = pino({ name: 'audio-server' }, process.stderr); // GAP-11/T-22: stderr for MCP stdio safety

const MAX_CAMERA_FRAME_SIZE = 32 * 1024; // 32KB ceiling (QQVGA q10 ~3KB)

export interface CameraFrameEvent {
  frameId: number;
  size: number;
  data: Buffer;
}

export class AudioServer extends EventEmitter {
  private wss: WebSocketServer;
  private activeConnection: WebSocket | null = null;

  constructor(port: number) {
    super();
    this.wss = new WebSocketServer({ port });

    this.wss.on('listening', () => {
      logger.info({ port }, 'WebSocket audio server listening');
    });

    this.wss.on('connection', (ws, req) => {
      const remoteAddr = req.socket.remoteAddress;

      // WR-001: Reject second connection while one is already active
      if (this.activeConnection) {
        logger.warn({ remoteAddr }, 'Rejecting duplicate WS connection — ESP32 already connected');
        ws.close(1008, 'Another node is already connected');
        return;
      }

      logger.info({ remoteAddr }, 'ESP32 audio connection established');
      this.activeConnection = ws;
      this.emit('clientConnected', remoteAddr);

      ws.on('message', (data: Buffer, isBinary) => {
        if (isBinary) {
          this.handleBinary(data);
        } else {
          try {
            const msg = JSON.parse(data.toString());
            this.emit('controlMessage', msg);
          } catch {
            logger.warn('Non-binary non-JSON message received, ignoring');
          }
        }
      });

      ws.on('close', () => {
        logger.info({ remoteAddr }, 'ESP32 audio connection closed');
        this.activeConnection = null;
        this.emit('clientDisconnected');
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'WebSocket error');
        this.activeConnection = null;
        this.emit('clientDisconnected');
      });
    });
  }

  /** Route binary WS frames by prefix byte */
  private handleBinary(data: Buffer): void {
    if (data.length < 1) {
      logger.warn('Empty binary frame, dropping');
      return;
    }

    const prefix = data[0];

    // Camera JPEG frame: [0xCA][frameId:u16LE][totalSize:u32LE][jpeg...]
    if (prefix === CAMERA_WS_PREFIX) {
      if (data.length < 7) {
        logger.warn({ len: data.length }, 'Camera frame too short, dropping');
        return;
      }
      const frameId = data.readUInt16LE(1);
      const size = data.readUInt32LE(3);

      // Guard: reject frames claiming sizes beyond reasonable bounds
      if (size > MAX_CAMERA_FRAME_SIZE) {
        logger.warn({ frameId, size }, 'Camera frame claims size exceeding limit — dropping');
        return;
      }

      const jpeg = data.subarray(7);

      // Guard: drop frames where header size doesn't match actual payload
      if (jpeg.length !== size) {
        logger.warn({ frameId, expected: size, actual: jpeg.length }, 'Camera frame size mismatch — dropping');
        return;
      }

      // Guard: validate JPEG SOI marker (0xFF 0xD8)
      if (jpeg.length < 2 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) {
        logger.warn({ frameId, firstBytes: jpeg.subarray(0, Math.min(4, jpeg.length)).toString('hex') },
          'Camera frame missing JPEG SOI marker — dropping');
        return;
      }

      logger.debug({ frameId, size }, 'Camera frame received');
      this.emit('cameraFrame', { frameId, size, data: jpeg } satisfies CameraFrameEvent);
      return;
    }

    // Prefixed audio: [0xA0][pcm...]
    if (prefix === AUDIO_WS_PREFIX) {
      this.emit('audioChunk', data.subarray(1));
      return;
    }

    // Backward compat: raw PCM with no prefix byte
    logger.debug({ firstByte: `0x${prefix.toString(16).toUpperCase()}` }, 'Received unprefixed PCM (legacy format)');
    this.emit('audioChunk', data);
  }

  /** Send TTS audio back to ESP32 as binary frames with 0xA0 prefix */
  sendAudio(audioBuffer: Buffer): void {
    if (this.activeConnection?.readyState === WebSocket.OPEN) {
      const prefixed = Buffer.alloc(1 + audioBuffer.length);
      prefixed[0] = AUDIO_WS_PREFIX;
      audioBuffer.copy(prefixed, 1);
      this.activeConnection.send(prefixed, { binary: true });
    } else {
      logger.warn('No active WebSocket connection to send audio to');
    }
  }

  /** Send JSON control message to ESP32 */
  sendControl(message: Record<string, unknown>): void {
    if (this.activeConnection?.readyState === WebSocket.OPEN) {
      this.activeConnection.send(JSON.stringify(message));
    }
  }

  close(): void { this.wss.close(); }
}
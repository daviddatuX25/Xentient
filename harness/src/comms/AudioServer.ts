import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import pino from 'pino';

const logger = pino({ name: 'audio-server' });

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
          // Raw PCM 16-bit mono 16kHz audio chunk from ESP32
          this.emit('audioChunk', data);
        } else {
          // JSON control message
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
      });
    });
  }

  /** Send TTS audio back to ESP32 as binary frames */
  sendAudio(audioBuffer: Buffer): void {
    if (this.activeConnection?.readyState === WebSocket.OPEN) {
      this.activeConnection.send(audioBuffer, { binary: true });
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

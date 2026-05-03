import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import pino from 'pino';
import type { CameraFrameEvent } from './AudioServer';

const logger = pino({ name: 'camera-server' }, process.stderr); // GAP-11/T-22: stderr for MCP stdio safety

const MAX_DASHBOARD_CLIENTS = 10;

interface CameraStats {
  received: number;
  dropped: number;
  lastFrameId: number;
  lastTimestamp: number;
}

export class CameraServer extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private latestJpeg: Buffer | null = null;
  private latestFrameId: number = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs: number;
  private online: boolean = false;
  private stats: CameraStats = {
    received: 0,
    dropped: 0,
    lastFrameId: 0,
    lastTimestamp: 0,
  };

  constructor(port: number, idleTimeoutMs: number = 10_000) {
    super();
    this.idleTimeoutMs = idleTimeoutMs;
    this.wss = new WebSocketServer({ port });

    this.wss.on('listening', () => {
      logger.info({ port }, 'Camera WebSocket server listening for dashboard clients');
    });

    this.wss.on('connection', (ws, req) => {
      const remoteAddr = req.socket.remoteAddress;

      if (this.clients.size >= MAX_DASHBOARD_CLIENTS) {
        logger.warn({ max: MAX_DASHBOARD_CLIENTS, remoteAddr }, 'Max dashboard clients reached — rejecting');
        ws.close(1008, 'Max clients reached');
        return;
      }

      logger.info({ remoteAddr }, 'Dashboard client connected to camera stream');
      this.clients.add(ws);

      // Send latest frame immediately on connect so the client isn't blank
      if (this.latestJpeg) {
        this.sendFrame(ws, this.latestFrameId, this.latestJpeg);
      }

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info({ remoteAddr }, 'Dashboard client disconnected from camera stream');
      });

      ws.on('error', (err) => {
        logger.error({ err, remoteAddr }, 'Dashboard client WS error');
        this.clients.delete(ws);
      });
    });
  }

  /** Called by AudioServer when a camera frame arrives */
  handleFrame(frame: CameraFrameEvent): void {
    this.latestJpeg = frame.data;
    this.latestFrameId = frame.frameId;
    this.stats.received++;
    this.stats.lastFrameId = frame.frameId;
    this.stats.lastTimestamp = Date.now();

    // Mark camera online and reset idle timer
    if (!this.online) {
      this.online = true;
      this.emit('cameraOnline');
    }
    this.resetIdleTimer();

    // Forward to all connected dashboard clients
    const packet = CameraServer.buildFramePacket(frame.frameId, frame.data);

    let sent = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(packet, { binary: true }, (err) => {
          if (err) logger.warn({ err, frameId: frame.frameId }, 'Failed to send camera frame to client');
        });
        sent++;
      }
    }

    logger.debug({ frameId: frame.frameId, size: frame.data.length, clients: sent }, 'Camera frame forwarded');
  }

  /** HTTP fallback: return latest JPEG for <img src="/camera/latest.jpg"> polling */
  getLatestJpeg(): Buffer | null {
    return this.latestJpeg;
  }

  /** Get frame statistics */
  getStats(): Readonly<CameraStats> & { online: boolean } {
    return { ...this.stats, online: this.online };
  }

  private sendFrame(ws: WebSocket, frameId: number, jpeg: Buffer): void {
    ws.send(CameraServer.buildFramePacket(frameId, jpeg), { binary: true });
  }

  /** Build [0xCA][frameId:u16LE][size:u32LE][jpeg...] binary packet */
  private static buildFramePacket(frameId: number, jpeg: Buffer): Buffer {
    const header = Buffer.alloc(7);
    header[0] = 0xCA;
    header.writeUInt16LE(frameId, 1);
    header.writeUInt32LE(jpeg.length, 3);
    return Buffer.concat([header, jpeg]);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.online) {
        this.online = false;
        logger.warn({ idleTimeoutMs: this.idleTimeoutMs }, 'Camera idle timeout — no frames received');
        this.emit('cameraOffline');
      }
    }, this.idleTimeoutMs);
  }

  close(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.latestJpeg = null;
    this.latestFrameId = 0;
    this.online = false;
    this.wss.close();
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
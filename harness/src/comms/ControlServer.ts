import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, stat, readdir } from "fs/promises";
import { join, extname } from "path";
import { EventEmitter } from "events";
import { MqttClient } from "./MqttClient";
import { CameraServer } from "./CameraServer";
import { ModeManager } from "../engine/ModeManager";
import type { SensorCache } from "../shared/types";
import pino from "pino";

const logger = pino({ name: "control-server" }, process.stderr); // GAP-11/T-22: stderr for MCP stdio safety

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export class ControlServer extends EventEmitter {
  private mqtt: MqttClient;
  private modeManager: ModeManager;
  private cameraServer: CameraServer;
  private sensorCache: SensorCache;
  private sseClients: Set<ServerResponse> = new Set();
  private port: number;
  private publicDir: string;
  private server: InstanceType<typeof import("http").Server> | null = null;

  constructor(
    port: number,
    mqtt: MqttClient,
    modeManager: ModeManager,
    cameraServer: CameraServer,
    sensorCache: SensorCache,
  ) {
    super();
    this.port = port;
    this.mqtt = mqtt;
    this.modeManager = modeManager;
    this.cameraServer = cameraServer;
    this.sensorCache = sensorCache;
    this.publicDir = join(__dirname, "../../public");

    // Wire MQTT mode status → SSE clients
    this.mqtt.on("modeStatus", (data: unknown) => {
      const d = data as { mode: string };
      this.broadcastSSE({ type: "mode_status", mode: d.mode });
    });

    this.mqtt.on("pipelineState", (data: unknown) => {
      const d = data as { state: string };
      this.broadcastSSE({ type: "pipeline_state", state: d.state });
    });

    this.mqtt.on("sessionComplete", (data: unknown) => {
      this.broadcastSSE({ type: "session_complete", ...(data as object) });
    });

    this.mqtt.on("sessionError", (data: unknown) => {
      const d = data as { message: string; recoverable: boolean };
      this.broadcastSSE({ type: "session_error", message: d.message, recoverable: d.recoverable });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err) {
          logger.error({ err, url: req.url }, "Request handler error");
          this.sendJSON(res, 500, { error: "Internal server error" });
        }
      });

      this.server.listen(this.port, () => {
        logger.info({ port: this.port }, "Control server listening");
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        try { client.end(); } catch { /* ignore */ }
      }
      this.sseClients.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // CORS headers for API requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── API Routes ────────────────────────────────────────────────
    if (url === "/api/vad" && method === "POST") {
      const body = await this.readBody(req);
      this.mqtt.publish("xentient/sensors/vad", {
        v: 1,
        type: "sensor_data",
        peripheralType: 0x13, // INMP441 (mic) — VAD is from audio processing
        payload: { type: body.type ?? "start", nodeId: body.nodeId ?? "test-browser", timestamp: Date.now() },
        timestamp: Date.now(),
      });
      // Also directly emit VAD event for local pipeline
      if (body.type === "start" || body.type === "end") {
        this.mqtt.emit("vad" as never, { type: body.type, nodeId: body.nodeId ?? "test-browser", timestamp: Date.now() });
      }
      this.sendJSON(res, 200, { ok: true, vad: body.type });
      return;
    }

    if (url === "/api/mode" && method === "POST") {
      const body = await this.readBody(req);
      const mode = body.mode as string | undefined;
      if (mode && ["sleep", "listen", "active", "record"].includes(mode)) {
        this.mqtt.publish("xentient/control/mode", {
          v: 1, type: "mode_set", mode,
        });
        this.modeManager.forceSet(mode as never);
        this.sendJSON(res, 200, { ok: true, mode });
      } else {
        this.sendJSON(res, 400, { error: "Invalid mode. Use: sleep, listen, active, record" });
      }
      return;
    }

    if (url === "/api/trigger" && method === "POST") {
      const body = await this.readBody(req);
      const source = body.source as string | undefined;
      if (source && ["voice", "pir", "web"].includes(source)) {
        this.mqtt.publish("xentient/control/trigger", {
          v: 1, type: "trigger_pipeline", source,
        });
        this.sendJSON(res, 200, { ok: true, source });
      } else {
        this.sendJSON(res, 400, { error: "Invalid source. Use: voice, pir, web" });
      }
      return;
    }

    if (url === "/api/text" && method === "POST") {
      const body = await this.readBody(req);
      const text = body.text as string | undefined;
      if (text) {
        // Broadcast text to SSE clients (Pipeline removed — text injection now via MCP)
        this.broadcastSSE({ type: "transcript", text });
        this.sendJSON(res, 200, { ok: true, text });
      } else {
        this.sendJSON(res, 400, { error: "Missing text field" });
      }
      return;
    }

    if (url === "/api/sensors" && method === "GET") {
      this.sendJSON(res, 200, {
        temperature: this.sensorCache.temperature,
        humidity: this.sensorCache.humidity,
        pressure: this.sensorCache.pressure,
        motion: this.sensorCache.motion,
        lastMotionAt: this.sensorCache.lastMotionAt,
      });
      return;
    }

    if (url === "/api/mode" && method === "GET") {
      this.sendJSON(res, 200, { mode: this.modeManager.getMode() });
      return;
    }

    if (url === "/api/camera" && method === "GET") {
      const jpeg = this.cameraServer.getLatestJpeg();
      if (jpeg) {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-cache" });
        res.end(jpeg);
      } else {
        this.sendJSON(res, 404, { error: "No camera frame available" });
      }
      return;
    }

    if (url === "/api/status" && method === "GET") {
      this.sendJSON(res, 200, {
        mode: this.modeManager.getMode(),
        mqtt: this.mqtt.connected,
        camera: this.cameraServer.getStats(),
        sensors: this.sensorCache,
      });
      return;
    }

    // ── SSE Endpoint ───────────────────────────────────────────────
    if (url === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: {\"type\":\"connected\"}\n\n");
      this.sseClients.add(res);
      req.on("close", () => this.sseClients.delete(res));
      return;
    }

    // ── Static Files ───────────────────────────────────────────────
    let filePath = url === "/" ? "/test.html" : url;
    // Security: prevent directory traversal
    filePath = filePath.replace(/\.\./g, "");
    const fullPath = join(this.publicDir, filePath);

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    } catch {
      this.sendJSON(res, 404, { error: "Not found" });
    }
  }

  private broadcastSSE(data: object): void {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", reject);
    });
  }

  private sendJSON(res: ServerResponse, status: number, data: object): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}
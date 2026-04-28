import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, stat, readdir } from "fs/promises";
import { join, extname } from "path";
import { EventEmitter } from "events";
import { MqttClient } from "./MqttClient";
import { CameraServer } from "./CameraServer";
import { ModeManager } from "../engine/ModeManager";
import { SpaceManager } from "../engine/SpaceManager";
import { EventBridge } from "./EventBridge";
import { PackLoader } from "../engine/PackLoader";
import { SkillLog } from "../engine/SkillLog";
import { MicroRouter } from "./MicroRouter";
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
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

/** All ControlServer dependencies injected through a single object (same pattern as McpToolDeps). */
export interface ControlServerDeps {
  mqtt: MqttClient;
  modeManager: ModeManager;
  cameraServer: CameraServer;
  sensorCache: SensorCache;
  sensorHistory: SensorHistory;
  spaceManager: SpaceManager;
  eventBridge: EventBridge;
  packLoader: PackLoader;
  skillLog: SkillLog;
  getBrainConnected: () => boolean;
}

/**
 * Ring buffer interface for sensor/mode/motion history.
 * Injected so ControlServer doesn't own the data lifecycle.
 */
export interface SensorHistory {
  query(since?: number): { temperature: number; humidity: number; pressure: number; timestamp: number }[];
}

export class ControlServer extends EventEmitter {
  private deps: ControlServerDeps;
  private router = new MicroRouter();
  private sseClients: Set<ServerResponse> = new Set();
  private port: number;
  private publicDir: string;
  private server: InstanceType<typeof import("http").Server> | null = null;

  private static MAX_BODY_SIZE = 64 * 1024; // 64KB max request body

  constructor(deps: ControlServerDeps, port: number) {
    super();
    this.deps = deps;
    this.port = port;
    this.publicDir = join(__dirname, "../../public");
    this.registerRoutes();

    // Wire MQTT mode status → SSE clients
    this.deps.mqtt.on("modeStatus", (data: unknown) => {
      const d = data as { mode: string };
      this.broadcastSSE({ type: "mode_status", mode: d.mode });
    });

    this.deps.mqtt.on("pipelineState", (data: unknown) => {
      const d = data as { state: string };
      this.broadcastSSE({ type: "pipeline_state", state: d.state });
    });

    this.deps.mqtt.on("sessionComplete", (data: unknown) => {
      this.broadcastSSE({ type: "session_complete", ...(data as object) });
    });

    this.deps.mqtt.on("sessionError", (data: unknown) => {
      const d = data as { message: string; recoverable: boolean };
      this.broadcastSSE({ type: "session_error", message: d.message, recoverable: d.recoverable });
    });
  }

  // IMPORTANT: All handlers MUST be .bind(this)'d — MicroRouter calls them detached from `this`
  private registerRoutes(): void {
    this.router
      .add("GET", "/api/status", this.handleGetStatus.bind(this))
      .add("GET", "/api/sensors", this.handleGetSensors.bind(this))
      .add("GET", "/api/mode", this.handleGetMode.bind(this))
      .add("POST", "/api/mode", this.handleSetMode.bind(this))
      .add("POST", "/api/trigger", this.handleTrigger.bind(this))
      .add("POST", "/api/vad", this.handleVad.bind(this))
      .add("POST", "/api/text", this.handleText.bind(this))
      .add("GET", "/api/camera", this.handleGetCamera.bind(this));
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

  // ── Request Pipeline ────────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";

    // 1. CORS headers for API requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // 2. CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 3. SSE endpoint — long-lived connection, bypass router
    if (url.split("?")[0] === "/api/events") {
      this.handleSSE(req, res);
      return;
    }

    // 4. API routes — resolve through MicroRouter
    const result = this.router.resolve(method, url);
    if ("handler" in result) {
      try {
        await result.handler(req, res, result.params);
      } catch (err) {
        const message = (err as Error).message;
        if (message === "Body too large") {
          this.sendJSON(res, 413, { error: "Request body too large (max 64KB)" });
        } else {
          logger.error({ err, url }, "Handler error");
          this.sendJSON(res, 500, { error: "Internal server error" });
        }
      }
      return;
    }

    // 5. Static files — only for non-API paths
    const pathname = url.split("?")[0];
    if (!pathname.startsWith("/api/")) {
      this.serveStatic(req, res);
      return;
    }

    // 6. API path that didn't match any route
    const msgs: Record<number, string> = { 404: "Not found", 405: "Method not allowed" };
    this.sendJSON(res, result.status, { error: msgs[result.status] ?? "Bad request" });
  }

  // ── SSE ─────────────────────────────────────────────────────────────

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");
    this.sseClients.add(res);
    req.on("close", () => this.sseClients.delete(res));
  }

  // ── Route Handlers ──────────────────────────────────────────────────

  private async handleGetStatus(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    this.sendJSON(res, 200, {
      mode: this.deps.modeManager.getMode(),
      mqtt: this.deps.mqtt.connected,
      camera: this.deps.cameraServer.getStats(),
      sensors: this.deps.sensorCache,
    });
  }

  private async handleGetSensors(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    this.sendJSON(res, 200, {
      temperature: this.deps.sensorCache.temperature,
      humidity: this.deps.sensorCache.humidity,
      pressure: this.deps.sensorCache.pressure,
      motion: this.deps.sensorCache.motion,
      lastMotionAt: this.deps.sensorCache.lastMotionAt,
    });
  }

  private async handleGetMode(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    this.sendJSON(res, 200, { mode: this.deps.modeManager.getMode() });
  }

  private async handleSetMode(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const body = await this.parseBody(req);
    const mode = body.mode as string | undefined;
    if (mode && ["sleep", "listen", "active", "record"].includes(mode)) {
      this.deps.mqtt.publish("xentient/control/mode", {
        v: 1, type: "mode_set", mode,
      });
      this.deps.modeManager.forceSet(mode as never);
      this.sendJSON(res, 200, { ok: true, mode });
    } else {
      this.sendJSON(res, 400, { error: "Invalid mode. Use: sleep, listen, active, record" });
    }
  }

  private async handleTrigger(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const body = await this.parseBody(req);
    const source = body.source as string | undefined;
    if (source && ["voice", "pir", "web"].includes(source)) {
      this.deps.mqtt.publish("xentient/control/trigger", {
        v: 1, type: "trigger_pipeline", source,
      });
      this.sendJSON(res, 200, { ok: true, source });
    } else {
      this.sendJSON(res, 400, { error: "Invalid source. Use: voice, pir, web" });
    }
  }

  private async handleVad(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const body = await this.parseBody(req);
    const vadType = (body.type as string) ?? "start";
    this.deps.mqtt.publish("xentient/control/trigger", {
      v: 1,
      type: "trigger_pipeline",
      source: "web",
      ...(vadType === "end" ? { stage: "end" } : {}),
    });
    this.sendJSON(res, 200, { ok: true, vad: vadType });
  }

  private async handleText(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const body = await this.parseBody(req);
    const text = body.text as string | undefined;
    if (text) {
      this.broadcastSSE({ type: "transcript", text });
      this.sendJSON(res, 200, { ok: true, text });
    } else {
      this.sendJSON(res, 400, { error: "Missing text field" });
    }
  }

  private async handleGetCamera(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const jpeg = this.deps.cameraServer.getLatestJpeg();
    if (jpeg) {
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-cache" });
      res.end(jpeg);
    } else {
      this.sendJSON(res, 404, { error: "No camera frame available" });
    }
  }

  // ── Static File Serving ─────────────────────────────────────────────

  private async serveStatic(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = _req.url ?? "/";
    let filePath = url === "/" ? "/index.html" : url;
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

  // ── SSE Broadcasting ────────────────────────────────────────────────

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

  /** Push skill observability events to SSE dashboard clients */
  broadcastSkillEvent(data: object): void {
    this.broadcastSSE(data);
  }

  // ── Body Parsing ────────────────────────────────────────────────────

  private parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      req.on("data", (c: Buffer) => {
        totalSize += c.length;
        if (totalSize > ControlServer.MAX_BODY_SIZE) {
          reject(new Error("Body too large"));
          req.destroy(); // Abort the connection to stop receiving data
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        if (!body) { resolve({}); return; }
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error("Invalid JSON")); }
      });
      req.on("error", reject);
    });
  }

  private sendJSON(res: ServerResponse, status: number, data: object): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}
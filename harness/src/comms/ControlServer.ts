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
import type { CoreSkill, SensorCache } from "../shared/types";
import { MODE_TRANSITIONS, PERIPHERAL_IDS } from "../shared/contracts";
import type { EventMapping } from "./EventBridge";
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

/** Structural type for SensorHistory dependency (decoupled from concrete class). */
export interface SensorHistoryLike {
  query(since?: number): { temperature: number | null; humidity: number | null; pressure: number | null; timestamp: number }[];
}

/** Structural type for MotionHistory dependency. */
export interface MotionHistoryLike {
  query(sinceMs?: number): { timestamp: number; active: boolean }[];
}

/** Structural type for ModeHistory dependency. */
export interface ModeHistoryLike {
  query(sinceMs?: number): { mode: string; startTime: number; endTime: number | null }[];
}

/** All ControlServer dependencies injected through a single object (same pattern as McpToolDeps). */
export interface ControlServerDeps {
  mqtt: MqttClient;
  modeManager: ModeManager;
  cameraServer: CameraServer;
  sensorCache: SensorCache;
  sensorHistory: SensorHistoryLike;
  motionHistory: MotionHistoryLike;
  modeHistory: ModeHistoryLike;
  spaceManager: SpaceManager;
  eventBridge: EventBridge;
  packLoader: PackLoader;
  skillLog: SkillLog;
  getBrainConnected: () => boolean;
}


export class ControlServer extends EventEmitter {
  private deps: ControlServerDeps;
  private router = new MicroRouter();
  private sseClients: Set<ServerResponse> = new Set();
  private port: number;
  private publicDir: string;
  private server: InstanceType<typeof import("http").Server> | null = null;

  private static MAX_BODY_SIZE = 64 * 1024; // 64KB max request body

  /** Fields that may be updated via PATCH /api/skills/:id */
  private static PATCHABLE_FIELDS = new Set([
    'enabled', 'displayName', 'trigger', 'actions', 'priority',
    'cooldownMs', 'modeFilter', 'escalation', 'collect',
  ]);

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
      .add("GET", "/api/camera", this.handleGetCamera.bind(this))
      // Skills — NOTE: /api/skill-log before /api/skills/:id to avoid 'log' captured as :id
      .add("GET", "/api/skill-log", this.handleGetSkillLog.bind(this))
      .add("GET", "/api/skills", this.handleListSkills.bind(this))
      .add("GET", "/api/skills/:id", this.handleGetSkill.bind(this))
      .add("POST", "/api/skills", this.handleCreateSkill.bind(this))
      .add("PATCH", "/api/skills/:id", this.handleUpdateSkill.bind(this))
      .add("DELETE", "/api/skills/:id", this.handleDeleteSkill.bind(this))
      // Packs
      .add("GET", "/api/packs", this.handleListPacks.bind(this))
      .add("POST", "/api/packs/:name/load", this.handleLoadPack.bind(this))
      .add("POST", "/api/packs/:name/reload", this.handleReloadPack.bind(this))
      // Spaces
      .add("GET", "/api/spaces", this.handleListSpaces.bind(this))
      .add("POST", "/api/spaces/:id/mode", this.handleSetSpaceMode.bind(this))
      // Event Mappings
      .add("GET", "/api/event-mappings", this.handleListEventMappings.bind(this))
      .add("POST", "/api/event-mappings", this.handleAddEventMapping.bind(this))
      .add("DELETE", "/api/event-mappings/:id", this.handleRemoveEventMapping.bind(this))
      // Sensor History (backed by SensorHistory — added in 08-05)
      .add("GET", "/api/sensors/history", this.handleGetSensorHistory.bind(this))
      // Motion History (backed by MotionHistory — added in 08-05)
      .add("GET", "/api/sensors/motion-history", this.handleGetMotionHistory.bind(this))
      // Mode History (backed by ModeHistory — added in 08-05)
      .add("GET", "/api/mode/history", this.handleGetModeHistory.bind(this))
      // Config (frontend constants — Expansion 6.4)
      .add("GET", "/api/config", this.handleGetConfig.bind(this));
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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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
        } else if (message === "Invalid JSON") {
          this.sendJSON(res, 400, { error: "Invalid JSON in request body" });
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

  // ── Skill Endpoints ──────────────────────────────────────────────────

  /** Serialize a CoreSkill for API responses (strip internal fields) */
  private serializeSkill(skill: CoreSkill): object {
    return {
      id: skill.id,
      displayName: skill.displayName,
      enabled: skill.enabled,
      spaceId: skill.spaceId,
      trigger: skill.trigger,
      priority: skill.priority,
      actions: skill.actions,
      collect: skill.collect,
      escalation: skill.escalation,
      source: skill.source,
      cooldownMs: skill.cooldownMs,
      fireCount: skill.fireCount,
      lastFiredAt: skill.lastFiredAt,
      escalationCount: skill.escalationCount,
      modeFilter: skill.modeFilter,
      _pack: skill._pack,
    };
  }

  private async handleListSkills(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const skills = this.deps.spaceManager.listSkills();
    this.sendJSON(res, 200, skills.map(s => this.serializeSkill(s)));
  }

  private async handleGetSkill(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { id } = params;
    const skill = this.deps.spaceManager.listSkills().find(s => s.id === id);
    if (!skill) {
      this.sendJSON(res, 404, { error: `Skill '${id}' not found` });
      return;
    }
    this.sendJSON(res, 200, this.serializeSkill(skill));
  }

  private async handleCreateSkill(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const body = await this.parseBody(req) as Record<string, unknown>;
    const id = String(body.id ?? '');
    if (!id) {
      this.sendJSON(res, 400, { error: 'Skill ID is required' });
      return;
    }
    // Check for existing skill — 409 Conflict
    const existing = this.deps.spaceManager.listSkills().find(s => s.id === id);
    if (existing) {
      this.sendJSON(res, 409, { error: `Skill '${id}' already exists (source: ${existing.source}). Use PATCH to update.` });
      return;
    }
    // Construct CoreSkill from request body
    const skill: CoreSkill = {
      id,
      displayName: String(body.displayName ?? id),
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      spaceId: String(body.spaceId ?? '*'),
      trigger: body.trigger as CoreSkill['trigger'] ?? { type: 'event', event: 'manual_trigger' },
      priority: Number(body.priority ?? 50),
      actions: Array.isArray(body.actions) ? body.actions as CoreSkill['actions'] : [],
      collect: Array.isArray(body.collect) ? body.collect as CoreSkill['collect'] : undefined,
      escalation: body.escalation as CoreSkill['escalation'] ?? undefined,
      source: 'brain',
      cooldownMs: Number(body.cooldownMs ?? 0),
      fireCount: 0,
      escalationCount: 0,
      modeFilter: body.modeFilter as CoreSkill['modeFilter'] ?? undefined,
    };
    this.deps.spaceManager.registerSkill(skill);
    this.sendJSON(res, 201, { ok: true, skill: this.serializeSkill(skill) });
  }

  private async handleUpdateSkill(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { id } = params;
    const body = await this.parseBody(req) as Record<string, unknown>;

    // Filter to allowlisted fields only
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ControlServer.PATCHABLE_FIELDS.has(key)) patch[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      this.sendJSON(res, 400, { error: 'No patchable fields provided', patchableFields: [...ControlServer.PATCHABLE_FIELDS] });
      return;
    }

    const skill = this.deps.spaceManager.listSkills().find(s => s.id === id);
    if (!skill) {
      this.sendJSON(res, 404, { error: `Skill '${id}' not found` });
      return;
    }

    this.deps.spaceManager.updateSkill(id, patch);
    this.sendJSON(res, 200, { ok: true, patched: Object.keys(patch) });
  }

  private async handleDeleteSkill(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { id } = params;
    const skill = this.deps.spaceManager.listSkills().find(s => s.id === id);
    if (!skill) {
      this.sendJSON(res, 404, { error: `Skill '${id}' not found` });
      return;
    }
    if (skill.source === 'builtin') {
      this.sendJSON(res, 403, { error: `Cannot remove builtin skill '${id}'` });
      return;
    }
    if (skill.source === 'pack') {
      this.sendJSON(res, 403, { error: `Cannot remove pack-managed skill '${id}'. Unload the pack instead.` });
      return;
    }
    this.deps.spaceManager.removeSkill(id);
    this.sendJSON(res, 200, { ok: true, removed: id });
  }

  private async handleGetSkillLog(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const url = new URL(req.url!, `http://localhost`);
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const filter = {
      spaceId: url.searchParams.get('spaceId') ?? undefined,
      skillId: url.searchParams.get('skillId') ?? undefined,
      since: url.searchParams.get('since') ? Number(url.searchParams.get('since')) : undefined,
      limit,
    };
    const entries = this.deps.skillLog.query(filter);
    this.sendJSON(res, 200, entries);
  }

  // ── Pack Endpoints ───────────────────────────────────────────────────

  private async handleListPacks(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const available = this.deps.packLoader.listAvailablePacks();
    const loaded = this.deps.packLoader.getLoadedPack();
    this.sendJSON(res, 200, { available, loaded });
  }

  private async handleLoadPack(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { name } = params;
    try {
      this.deps.packLoader.loadPack(name);
      this.sendJSON(res, 200, { ok: true, loaded: name });
    } catch (err) {
      this.sendJSON(res, 400, { error: String((err as Error).message) });
    }
  }

  private async handleReloadPack(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    try {
      this.deps.packLoader.reload();
      const loaded = this.deps.packLoader.getLoadedPack();
      this.sendJSON(res, 200, { ok: true, loaded });
    } catch (err) {
      this.sendJSON(res, 400, { error: String((err as Error).message) });
    }
  }

  // ── Space Endpoints ──────────────────────────────────────────────────

  private async handleListSpaces(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const skills = this.deps.spaceManager.listSkills();
    // Deduplicate space IDs from skills
    const spaceIds = [...new Set(skills.map(s => s.spaceId))];
    const spaces = spaceIds.map(id => ({
      id,
      mode: this.deps.modeManager.getMode(),
      skillCount: skills.filter(s => s.spaceId === id || s.spaceId === '*').length,
    }));
    this.sendJSON(res, 200, spaces);
  }

  private async handleSetSpaceMode(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { id } = params;
    const body = await this.parseBody(req) as Record<string, unknown>;
    const mode = String(body.mode ?? '');
    if (!mode || !['sleep', 'listen', 'active', 'record'].includes(mode)) {
      this.sendJSON(res, 400, { error: 'Invalid mode. Use: sleep, listen, active, record' });
      return;
    }
    // Check that the space exists
    const skills = this.deps.spaceManager.listSkills();
    const spaceIds = [...new Set(skills.map(s => s.spaceId))];
    if (!spaceIds.includes(id) && id !== 'default') {
      this.sendJSON(res, 404, { error: `Space '${id}' not found` });
      return;
    }
    this.deps.spaceManager.switchMode(id, mode);
    this.sendJSON(res, 200, { ok: true, spaceId: id, mode });
  }

  // ── Event Mapping Endpoints ──────────────────────────────────────────

  /** Serialize an EventMapping for API responses (strip functions) */
  private serializeMapping(m: EventMapping): object {
    return {
      id: m.id,
      protected: m.protected ?? false,
      source: m.source,
      eventName: m.eventName,
      hasFilter: typeof m.filter === 'function',
      hasTransform: typeof m.transform === 'function',
    };
  }

  private async handleListEventMappings(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const mappings = this.deps.eventBridge.listMappings();
    this.sendJSON(res, 200, mappings.map(m => this.serializeMapping(m)));
  }

  private async handleAddEventMapping(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const body = await this.parseBody(req) as Record<string, unknown>;
    const source = String(body.source ?? '');
    const eventName = String(body.eventName ?? '');
    const validSources = ['mqtt:sensor', 'mqtt:triggerPipeline', 'mode', 'custom'];
    if (!validSources.includes(source)) {
      this.sendJSON(res, 400, { error: `Invalid source. Valid: ${validSources.join(', ')}` });
      return;
    }
    if (!eventName) {
      this.sendJSON(res, 400, { error: 'eventName is required' });
      return;
    }
    const id = this.deps.eventBridge.addCustomMapping(
      source as import('./EventBridge').EventSource,
      eventName,
    );
    this.sendJSON(res, 201, { ok: true, id, source, eventName });
  }

  private async handleRemoveEventMapping(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { id } = params;
    const removed = this.deps.eventBridge.removeMapping(id);
    if (!removed) {
      // Could be not found or protected — check which
      const mappings = this.deps.eventBridge.listMappings();
      const mapping = mappings.find(m => m.id === id);
      if (mapping?.protected) {
        this.sendJSON(res, 403, { error: `Cannot remove protected mapping '${id}'` });
      } else {
        this.sendJSON(res, 404, { error: `Mapping '${id}' not found` });
      }
      return;
    }
    this.sendJSON(res, 200, { ok: true, removed: id });
  }

  // ── Sensor History Endpoint ──────────────────────────────────────────

  private async handleGetSensorHistory(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const url = new URL(req.url!, `http://localhost`);
    const since = url.searchParams.get('since') ? Number(url.searchParams.get('since')) : undefined;
    const readings = this.deps.sensorHistory.query(since);
    this.sendJSON(res, 200, readings);
  }

  // ── Motion History Endpoint ──────────────────────────────────────────

  private async handleGetMotionHistory(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const url = new URL(req.url!, `http://localhost`);
    const minutes = Number(url.searchParams.get('minutes') ?? '30');
    const sinceMs = minutes * 60 * 1000;
    const history = this.deps.motionHistory.query(sinceMs);
    this.sendJSON(res, 200, history);
  }

  // ── Mode History Endpoint ─────────────────────────────────────────────

  private async handleGetModeHistory(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    const url = new URL(req.url!, `http://localhost`);
    const minutes = Number(url.searchParams.get('minutes') ?? '30');
    const sinceMs = minutes * 60 * 1000;
    const history = this.deps.modeHistory.query(sinceMs);
    this.sendJSON(res, 200, history);
  }

  // ── Config Endpoint ──────────────────────────────────────────────────

  private async handleGetConfig(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    this.sendJSON(res, 200, {
      modeTransitions: MODE_TRANSITIONS,
      availableModes: Object.keys(MODE_TRANSITIONS),
      triggerTypes: ['event', 'interval', 'sensor', 'mode', 'cron', 'internal', 'composite'],
      peripheralIds: Object.fromEntries(
        Object.entries(PERIPHERAL_IDS).map(([k, v]) => [k, v]),
      ),
    });
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

  /** Broadcast an SSE event to all connected dashboard clients. */
  broadcastSSE(data: object): void {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /** Throttled sensor update: max 1 broadcast per second. */
  private sensorThrottleTimer: NodeJS.Timeout | null = null;
  private lastSensorBroadcast = 0;
  private static THROTTLE_MS = 1000;

  broadcastThrottledSensor(data: { temperature: number | null; humidity: number | null; pressure: number | null }): void {
    const now = Date.now();
    if (now - this.lastSensorBroadcast >= ControlServer.THROTTLE_MS) {
      this.lastSensorBroadcast = now;
      this.broadcastSSE({ type: 'sensor_update', ...data });
    } else if (!this.sensorThrottleTimer) {
      const delay = ControlServer.THROTTLE_MS - (now - this.lastSensorBroadcast);
      this.sensorThrottleTimer = setTimeout(() => {
        this.sensorThrottleTimer = null;
        this.lastSensorBroadcast = Date.now();
        this.broadcastSSE({ type: 'sensor_update', ...data });
      }, delay);
    }
  }

  // ── Body Parsing ────────────────────────────────────────────────────

  private parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let exceeded = false;
      req.on("data", (c: Buffer) => {
        if (exceeded) return; // Already over limit, discard further data
        totalSize += c.length;
        if (totalSize > ControlServer.MAX_BODY_SIZE) {
          exceeded = true;
          // Continue consuming data to allow the response to be sent,
          // but reject the promise so the handler returns 413
          reject(new Error("Body too large"));
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        if (exceeded) return; // Already rejected
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
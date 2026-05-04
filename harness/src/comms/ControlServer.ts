import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, stat, readdir } from "fs/promises";
import { join, extname, resolve } from "path";
import { EventEmitter } from "events";
import { WebSocketServer, WebSocket } from "ws";
import { MqttClient } from "./MqttClient";
import { CameraServer } from "./CameraServer";
import { ModeManager } from "../engine/ModeManager";
import { SpaceManager } from "../engine/SpaceManager";
import { EventBridge } from "./EventBridge";
import { PackLoader } from "../engine/PackLoader";
import { SkillLog } from "../engine/SkillLog";
import { MicroRouter } from "./MicroRouter";
import { listenWithFallback } from "./port-fallback";
import type { CoreSkill, SensorCache } from "../shared/types";
import type { NodeProvisioner } from "./NodeProvisioner";
import { MODE_TRANSITIONS, PERIPHERAL_IDS, CreateSkillApiSchema } from "../shared/contracts";
import type { EventMapping } from "./EventBridge";
import type { McpSseServer } from "../mcp/server";
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
  nodeProvisioner?: NodeProvisioner;
  mcpSse?: McpSseServer;
  audioServer: { on: (event: string, handler: (chunk: Buffer) => void) => void };
}


export class ControlServer extends EventEmitter {
  private deps: ControlServerDeps;
  private router = new MicroRouter();
  private sseClients: Set<ServerResponse> = new Set();
  private port: number;
  private publicDir: string;
  private server: InstanceType<typeof import("http").Server> | null = null;

  /** Actual port the server is listening on (after potential fallback) */
  get actualPort(): number { return this.port; }

  private static MAX_BODY_SIZE = 64 * 1024; // 64KB max request body

  /** Fields that may be updated via PATCH /api/skills/:id */
  private static PATCHABLE_FIELDS = new Set([
    'enabled', 'displayName', 'trigger', 'actions', 'priority',
    'cooldownMs', 'configFilter', 'escalation', 'collect',
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
      .add("POST", "/api/spaces/:id/config", this.handleActivateConfig.bind(this))
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
      .add("GET", "/api/config", this.handleGetConfig.bind(this))
      // Node Provisioning
      .add("POST", "/api/nodes/register", this.handleRegisterNode.bind(this));
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (err) {
        logger.error({ err, url: req.url }, "Request handler error");
        this.sendJSON(res, 500, { error: "Internal server error" });
      }
    });

    const wssAudio = new WebSocketServer({ noServer: true });
    const audioClients = new Set<WebSocket>();

    this.server.on('upgrade', (req, socket, head) => {
      if (req.url === '/live-audio') {
        wssAudio.handleUpgrade(req, socket, head, (ws) => {
          audioClients.add(ws);
          ws.on('close', () => audioClients.delete(ws));
        });
      } else {
        socket.destroy();
      }
    });

    this.deps.audioServer.on('audioChunk', (chunk: Buffer) => {
      if (audioClients.size === 0) return;
      audioClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(chunk);
      });
    });

    this.port = await listenWithFallback(this.server, this.port, 'ControlServer');
    logger.info({ port: this.port }, "Control server listening");
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

    // 3b. MCP SSE endpoint — brain processes connect here
    if (url.split("?")[0] === "/mcp" && this.deps.mcpSse) {
      this.deps.mcpSse.connectClient(req, res);
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
    const manifest = this.deps.packLoader.getLoadedPackManifest();
    this.sendJSON(res, 200, {
      mode: this.deps.modeManager.getMode(),
      mqtt: this.deps.mqtt.connected,
      camera: this.deps.cameraServer.getStats(),
      sensors: this.deps.sensorCache,
      brain: this.deps.getBrainConnected(),
      activePack: this.deps.packLoader.getLoadedPack(),
      activeConfig: this.deps.spaceManager?.getSpace('default')?.activeConfig ?? null,
      nodeFunctions: ControlServer.deriveNodeFunctions(manifest, this.deps.spaceManager?.getSpace('default')?.activeConfig ?? null),
    });
  }

  /** Derive which node functions (hardware peripherals) are active from the loaded pack manifest. */
  static deriveNodeFunctions(manifest: { configurations?: { name: string; nodeAssignments?: Record<string, string> }[]; nodeSkills?: { id: string; requires?: { camera?: boolean; mic?: boolean; bme?: boolean; pir?: boolean } }[]; skills?: { actions?: Record<string, unknown>[] }[] } | null, activeConfig?: string | null): { core: boolean; cam: boolean; mic: boolean; speaker: boolean; tempHumid: boolean; pir: boolean } {
    if (!manifest) {
      return { core: true, cam: false, mic: false, speaker: false, tempHumid: false, pir: false };
    }
    
    let ns;
    if (activeConfig) {
      const config = manifest.configurations?.find(c => c.name === activeConfig);
      const nodeSkillId = config?.nodeAssignments?.['base'];
      ns = nodeSkillId ? manifest.nodeSkills?.find(n => n.id === nodeSkillId) : undefined;
    }
    if (!ns) ns = manifest.nodeSkills?.[0];

    return {
      core: true,
      cam: ns?.requires?.camera === true,
      mic: ns?.requires?.mic === true,
      speaker: manifest.skills?.some(s => s.actions?.some((a: Record<string, unknown>) => a.type === 'play_chime')) ?? false,
      tempHumid: ns?.requires?.bme === true,
      pir: ns?.requires?.pir === true,
    };
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
      configFilter: skill.configFilter,
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

    // Strict schema validation
    const parsed = CreateSkillApiSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      this.sendJSON(res, 400, { error: `Validation failed: ${issues}` });
      return;
    }
    const data = parsed.data;

    // Check for existing skill — 409 Conflict
    const existing = this.deps.spaceManager.listSkills().find(s => s.id === data.id);
    if (existing) {
      this.sendJSON(res, 409, { error: `Skill '${data.id}' already exists (source: ${existing.source}). Use PATCH to update.` });
      return;
    }

    const skill: CoreSkill = {
      id: data.id,
      displayName: data.displayName,
      enabled: data.enabled ?? true,
      spaceId: data.spaceId ?? '*',
      trigger: data.trigger as CoreSkill['trigger'],
      priority: data.priority ?? 50,
      actions: data.actions as CoreSkill['actions'],
      collect: data.collect as CoreSkill['collect'] ?? undefined,
      escalation: data.escalation as CoreSkill['escalation'] ?? undefined,
      source: 'brain',
      cooldownMs: data.cooldownMs ?? 0,
      fireCount: 0,
      escalationCount: 0,
      configFilter: data.configFilter as CoreSkill['configFilter'] ?? undefined,
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
    const space = this.deps.spaceManager.getSpace('default');
    const manifest = this.deps.packLoader.getLoadedPackManifest();
    const config = manifest?.configurations.find(c => c.name === space?.activeConfig);
    const nodeSkill = manifest?.nodeSkills.find(ns => ns.id === config?.nodeAssignments?.['base']);

    this.sendJSON(res, 200, [{
      id: space?.id ?? 'default',
      activeConfig: space?.activeConfig ?? null,
      activePack: space?.activePack ?? null,
      availableConfigs: manifest?.configurations.map(c => c.name) ?? [],
      nodes: space?.nodes ?? [],
      nodeSkill: nodeSkill ? {
        id: nodeSkill.id,
        requires: nodeSkill.requires,
        emits: nodeSkill.emits,
      } : null,
    }]);
  }

  private async handleActivateConfig(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const { id } = params;
    const body = await this.parseBody(req) as Record<string, unknown>;
    const config = String(body.config ?? body.mode ?? '');
    if (!config) {
      this.sendJSON(res, 400, { error: 'Config name is required' });
      return;
    }
    // Check that the space exists
    const skills = this.deps.spaceManager.listSkills();
    const spaceIds = [...new Set(skills.map(s => s.spaceId))];
    if (!spaceIds.includes(id) && id !== 'default') {
      this.sendJSON(res, 404, { error: `Space '${id}' not found` });
      return;
    }
    this.deps.spaceManager.activateConfig(id, config);
    this.sendJSON(res, 200, { ok: true, spaceId: id, activeConfig: config });
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

  // ── Node Provisioning Endpoint ────────────────────────────────────────

  private async handleRegisterNode(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>): Promise<void> {
    if (!this.deps.nodeProvisioner) {
      this.sendJSON(res, 503, { error: 'NodeProvisioner not available' });
      return;
    }
    const body = await this.parseBody(req) as Record<string, unknown>;
    const spaceId = String(body.spaceId ?? 'default');
    const role = String(body.role ?? 'base');
    const hardware = body.hardware as string[] | undefined;
    const wifiSsid = body.wifiSsid as string | undefined;
    const wifiPass = body.wifiPass as string | undefined;
    const token = this.deps.nodeProvisioner.generateToken(
      spaceId,
      role,
      hardware ?? ['motion', 'temperature', 'humidity', 'audio', 'camera'],
      wifiSsid,
      wifiPass,
    );
    const safeToken = this.deps.nodeProvisioner.sanitizeToken(token);
    this.sendJSON(res, 200, { token: safeToken, json: JSON.stringify(safeToken, null, 2) });
  }

  // ── Static File Serving ─────────────────────────────────────────────

  private async serveStatic(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = _req.url ?? "/";
    const filePath = url === "/" ? "/index.html" : url;
    const fullPath = resolve(join(this.publicDir, filePath));

    // Security: reject paths outside publicDir (handles .., URL encoding, etc.)
    // Normalize both paths for Windows drive-letter casing and separator differences
    const normPublic = resolve(this.publicDir).toLowerCase();
    const normFull = fullPath.toLowerCase();
    if (!normFull.startsWith(normPublic)) {
      this.sendJSON(res, 403, { error: "Forbidden" });
      return;
    }

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
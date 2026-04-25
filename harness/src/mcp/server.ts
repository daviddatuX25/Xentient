/**
 * MCP SDK transport import paths (verified @ v1.29.0)
 *
 * Phase 3 (SSE/HTTP transport for Hermes cloud brain) will use one of:
 *   import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
 *   import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
 *   import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
 *
 * SSEServerTransport        — legacy HTTP+SSE transport (Express IncomingMessage/ServerResponse)
 * StreamableHTTPServerTransport — Node.js Streamable HTTP transport (IncomingMessage/ServerResponse)
 * WebStandardStreamableHTTPServerTransport — Web Standard APIs (Request/Response), works on Node 18+, Bun, Deno, CF Workers
 *
 * For the Xentient harness (Node.js + Express), SSEServerTransport or StreamableHTTPServerTransport
 * are the appropriate choices. StreamableHTTP is the newer protocol (MCP 2025-03-26 spec) and is
 * recommended over SSE for new implementations.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createToolHandlers, type McpToolDeps } from "./tools";
import { wireMcpEvents } from "./events";
import pino from "pino";

const logger = pino({ name: "mcp-server" }, process.stderr);

export type { McpToolDeps };
import type { RuleEngine } from "../engine/RuleEngine";
import type { HealthMonitor } from "../engine/HealthMonitor";

export interface McpServerDeps extends McpToolDeps {
  ruleEngine: RuleEngine;
  onToolCall?: () => void;
}

export async function startMcpServer(deps: McpServerDeps): Promise<McpServer> {
  const server = new McpServer({
    name: "xentient-core",
    version: "1.0.0",
  });

  const handlers = createToolHandlers(deps);

  server.tool(
    "xentient_read_sensors",
    "Read current sensor values (temperature, humidity, pressure, motion)",
    {},
    async () => handlers.xentient_read_sensors(),
  );

  server.tool(
    "xentient_read_mode",
    "Read the current Xentient mode (sleep, listen, active, record)",
    {},
    async () => handlers.xentient_read_mode(),
  );

  server.tool(
    "xentient_set_mode",
    "Set the Xentient mode. Valid transitions follow state machine rules.",
    { mode: z.enum(["sleep", "listen", "active", "record"]) },
    async ({ mode }) => handlers.xentient_set_mode({ mode }),
  );

  server.tool(
    "xentient_play_audio",
    "Play audio through the ESP32 speaker. Send base64-encoded PCM s16le.",
    {
      data: z.string().describe("Base64-encoded PCM s16le audio"),
      format: z.literal("pcm_s16le"),
    },
    async ({ data, format }) => handlers.xentient_play_audio({ data, format }),
  );

  server.tool(
    "xentient_set_lcd",
    "Set the LCD display text (2 lines, max 16 chars each)",
    {
      line1: z.string().max(16),
      line2: z.string().max(16),
    },
    async ({ line1, line2 }) => handlers.xentient_set_lcd({ line1, line2 }),
  );

  server.tool(
    "xentient_capture_frame",
    "Capture the latest camera frame as base64 JPEG",
    {},
    async () => handlers.xentient_capture_frame(),
  );

  server.tool(
    "xentient_mqtt_publish",
    "Publish a JSON payload to an MQTT topic",
    {
      topic: z.string(),
      payload: z.record(z.unknown()),
    },
    async ({ topic, payload }) => handlers.xentient_mqtt_publish({ topic, payload }),
  );

  // ── Rule management tools ──────────────────────────────────────────

  const TriggerSchemaLocal = z.discriminatedUnion("type", [
    z.object({ type: z.literal("cron"), schedule: z.string() }),
    z.object({ type: z.literal("interval"), everyMs: z.number().int().positive() }),
    z.object({ type: z.literal("mode"), from: z.enum(["sleep", "listen", "active", "record"]), to: z.enum(["sleep", "listen", "active", "record"]) }),
    z.object({
      type: z.literal("sensor"),
      sensor: z.enum(["temperature", "humidity", "pressure", "motion"]),
      operator: z.enum([">", "<", "==", ">=", "<="]),
      value: z.number(),
    }),
    z.object({ type: z.literal("event"), event: z.string() }),
    z.object({ type: z.literal("composite"), all: z.array(z.any()) }),
  ]);

  const RuleActionSchemaLocal = z.discriminatedUnion("type", [
    z.object({ type: z.literal("set_mode"), mode: z.enum(["sleep", "listen", "active", "record"]) }),
    z.object({ type: z.literal("set_lcd"), line1: z.string().max(16), line2: z.string().max(16) }),
    z.object({ type: z.literal("play_chime"), preset: z.enum(["morning", "alert", "chime"]) }),
    z.object({ type: z.literal("mqtt_publish"), topic: z.string(), payload: z.record(z.unknown()) }),
    z.object({ type: z.literal("notify"), event: z.string(), context: z.record(z.unknown()).optional() }),
    z.object({ type: z.literal("chain"), actions: z.array(z.any()) }),
  ]);

  const ConditionSchemaLocal = z.object({
    field: z.enum(["mode", "temperature", "humidity", "pressure", "motion", "time", "dayOfWeek", "lastMotionAgoMs"]),
    operator: z.enum(["==", "!=", ">", "<", ">=", "<=", "in"]),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
  });

  server.tool(
    "xentient_register_rule",
    "Register a deterministic rule in the Core rule engine. " +
    "Rules are evaluated every tick without LLM inference. " +
    "FAST actions execute immediately. SLOW actions send notifications to the Brain.",
    {
      id: z.string().describe("Unique rule identifier"),
      enabled: z.boolean().default(true),
      trigger: TriggerSchemaLocal,
      condition: z.array(ConditionSchemaLocal).optional(),
      action: RuleActionSchemaLocal,
      priority: z.number().int().min(0).default(10),
      cooldownMs: z.number().int().min(0).default(0),
    },
    async (params) => handlers.xentient_register_rule(params as any),
  );

  server.tool(
    "xentient_unregister_rule",
    "Remove a rule from the Core rule engine",
    { id: z.string() },
    async ({ id }) => handlers.xentient_unregister_rule({ id }),
  );

  server.tool(
    "xentient_list_rules",
    "List all registered rules and their current state",
    {},
    async () => handlers.xentient_list_rules(),
  );

  // Wire push-based events from Core subsystems -> Brain
  wireMcpEvents(server, deps.mqtt, deps.modeManager, deps.sensorCache);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");

  return server;
}
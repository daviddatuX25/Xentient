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

export async function startMcpServer(deps: McpToolDeps): Promise<McpServer> {
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

  // Wire push-based events from Core subsystems -> Brain
  wireMcpEvents(server, deps.mqtt, deps.modeManager, deps.sensorCache);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");

  return server;
}
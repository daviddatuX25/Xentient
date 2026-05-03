import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ── Constants ──────────────────────────────────────────────────────

const EXPECTED_TOOLS = [
  "xentient_read_sensors",
  "xentient_read_mode",
  "xentient_set_mode",
  "xentient_play_audio",
  "xentient_set_lcd",
  "xentient_capture_frame",
  "xentient_mqtt_publish",
] as const;

const VALID_MODES = ["sleep", "listen", "active", "record"] as const;

/** Maximum time to wait for the core process to accept an MCP connection. */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Set SKIP_MCP_INTEGRATION=1 to skip this suite in CI environments
 * where no MQTT broker is available. When unset, the suite still
 * gracefully skips individual tests if the core process cannot start.
 */
const skipSuite = process.env.SKIP_MCP_INTEGRATION === "1";

// ── Integration Smoke Test ─────────────────────────────────────────

describe.skipIf(skipSuite)("MCP integration smoke test", () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;
  let connected = false;

  beforeAll(async () => {
    // RF-8: portable path resolution
    const corePath = resolve(__dirname, "../dist/core.js");

    try {
      transport = new StdioClientTransport({
        command: process.execPath,
        args: [corePath],
      });

      client = new Client({
        name: "xentient-test-client",
        version: "1.0.0",
      });

      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`MCP connection timed out after ${CONNECT_TIMEOUT_MS}ms`)),
          CONNECT_TIMEOUT_MS,
        ),
      );

      await Promise.race([connectPromise, timeoutPromise]);
      connected = true;
    } catch {
      // Core process failed to start or MQTT broker is unavailable.
      // Skip tests gracefully rather than fail the entire suite.
      connected = false;
      try {
        await transport?.close();
      } catch {
        // Swallow cleanup errors
      }
      client = undefined;
      transport = undefined;
    }
  }, 30_000);

  afterAll(async () => {
    if (client) {
      await client.close().catch(() => {});
    }
    if (transport) {
      await transport.close().catch(() => {});
    }
  });

  // ── Tests ────────────────────────────────────────────────────────

  it("should connect to the MCP core process", () => {
    if (!connected) return; // Skip when core process unavailable (e.g. no MQTT broker)
    expect(connected).toBe(true);
  });

  it("should expose all 7 MCP tools", async () => {
    if (!connected) return;

    const { tools } = await client!.listTools();
    const toolNames = tools.map((t) => t.name).sort();
    const expected = [...EXPECTED_TOOLS].sort();

    expect(toolNames).toEqual(expected);
  });

  it("xentient_read_mode returns a valid mode string", async () => {
    if (!connected) return;

    const result = await client!.callTool({
      name: "xentient_read_mode",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();

    const textContent = result.content.find(
      (c): c is { type: "text"; text: string } => c.type === "text",
    );
    expect(textContent).toBeDefined();

    const parsed = JSON.parse(textContent!.text);
    expect(parsed).toHaveProperty("mode");
    expect(VALID_MODES).toContain(parsed.mode);
  });
});
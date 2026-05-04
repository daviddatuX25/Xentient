/**
 * HermesAdapter — Minimum viable stub for SSE transport contract verification.
 *
 * Connects to Core via SSE MCP transport, handles `xentient/skill_escalated`
 * for voice_command events, and proves the round-trip (escalation received →
 * escalation complete → timeout cancelled).
 *
 * TODO (next sprint): Wire full Ollama/Hermes LLM loop:
 *   - STT: Whisper via Ollama (/api/generate with audio)
 *   - LLM: Nous Hermes via Ollama (/v1/chat/completions, streaming)
 *   - TTS: Kokoro / Piper / Coqui → xentient_play_audio
 *   - Reasoning tokens → xentient_brain_stream(reasoning_token)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import pino from "pino";

const logger = pino({ name: "hermes-brain" }, process.stderr);

const CORE_URL = process.env.CORE_MCP_URL ?? "http://localhost:3000/mcp";

async function main() {
  logger.info({ coreUrl: CORE_URL }, "Hermes brain connecting to Core...");

  const client = new Client({ name: "hermes-brain", version: "0.1.0" });
  const transport = new SSEClientTransport(new URL(CORE_URL));

  await client.connect(transport);
  logger.info({ coreUrl: CORE_URL }, "[hermes] Connected to Core");

  // List tools to confirm connection
  const { tools } = await client.listTools();
  logger.info({ tools: tools.map((t) => t.name) }, "[hermes] Available MCP tools");

  client.fallbackNotificationHandler = async (notification) => {
    if (!notification.method || !notification.params) return;
    const params = notification.params as Record<string, unknown>;

    if (notification.method !== "xentient/skill_escalated") return;

    const { escalationId, event, context } = params as {
      escalationId: string;
      event: string;
      context?: { audio?: string };
    };

    if (event !== "voice_command") {
      logger.debug({ event }, "[hermes] Skipping non-voice escalation");
      return;
    }

    logger.info({ escalationId }, "[hermes] Voice command escalation received");

    // Signal received — starts the brain_event feed on the dashboard
    await client.callTool({
      name: "xentient_brain_stream",
      arguments: {
        escalation_id: escalationId,
        subtype: "escalation_received",
        payload: { brain: "hermes" },
      },
    }).catch((err: Error) => logger.error({ err }, "[hermes] Failed to signal escalation_received"));

    // TODO: Replace with full STT → Hermes LLM → TTS pipeline
    // For now: 500ms stub delay to prove the round-trip works
    logger.info({ escalationId }, "[hermes] Processing (stub — no LLM yet)");
    await new Promise((r) => setTimeout(r, 500));

    // Signal complete — cancels the 8s EscalationSupervisor timeout
    await client.callTool({
      name: "xentient_brain_stream",
      arguments: {
        escalation_id: escalationId,
        subtype: "escalation_complete",
        payload: { brain: "hermes" },
      },
    }).catch((err: Error) => logger.error({ err }, "[hermes] Failed to signal escalation_complete"));

    logger.info({ escalationId }, "[hermes] Escalation complete");
  };

  logger.info("[hermes] Ready — listening for skill_escalated notifications");

  // Keep process alive
  await new Promise(() => {});
}

process.on("SIGINT", () => {
  logger.info("[hermes] Shutting down");
  process.exit(0);
});

main().catch((err) => {
  logger.error({ err }, "[hermes] Fatal error");
  process.exit(1);
});

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
    { mode: z.enum(["sleep", "listen", "active", "record"]) } as any,
    async ({ mode }: { mode: string }) => handlers.xentient_set_mode({ mode: mode as "sleep" | "listen" | "active" | "record" }),
  );

  server.tool(
    "xentient_play_audio",
    "Play audio through the ESP32 speaker. Send base64-encoded PCM s16le.",
    {
      data: z.string().describe("Base64-encoded PCM s16le audio"),
      format: z.literal("pcm_s16le"),
    } as any,
    async ({ data, format }: { data: string; format: "pcm_s16le" }) => handlers.xentient_play_audio({ data, format }),
  );

  server.tool(
    "xentient_set_lcd",
    "Set the LCD display text (2 lines, max 16 chars each)",
    {
      line1: z.string().max(16),
      line2: z.string().max(16),
    } as any,
    async ({ line1, line2 }: { line1: string; line2: string }) => handlers.xentient_set_lcd({ line1, line2 }),
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
    } as any,
    async ({ topic, payload }: { topic: string; payload: Record<string, unknown> }) => handlers.xentient_mqtt_publish({ topic, payload }),
  );

  // ============================================================
  // SKILL MANAGEMENT TOOLS — Spec: docs/SPEC-xentient-layers.md §8.1
  // ============================================================

  server.tool(
    'xentient_register_skill',
    'Register a new CoreSkill on the heartbeat loop. Skills are evaluated every tick without LLM.',
    {
      id: z.string().describe('Unique skill identifier (kebab-case)'),
      displayName: z.string().describe('Human-readable name'),
      spaceId: z.string().describe('Space this skill belongs to, or "*" for all spaces'),
      trigger: z.object({
        type: z.enum(['cron', 'interval', 'mode', 'sensor', 'event', 'composite']),
        schedule: z.string().optional(),
        everyMs: z.number().optional(),
        sensor: z.string().optional(),
        operator: z.string().optional(),
        value: z.number().optional(),
        event: z.string().optional(),
      }).describe('What activates this skill'),
      actions: z.array(z.object({
        type: z.enum(['set_lcd', 'play_chime', 'set_mode', 'mqtt_publish', 'increment_counter', 'log']),
        line1: z.string().optional(),
        line2: z.string().optional(),
        preset: z.string().optional(),
        mode: z.string().optional(),
        topic: z.string().optional(),
        payload: z.record(z.unknown()).optional(),
        name: z.string().optional(),
        message: z.string().optional(),
      })).describe('L1 actions to execute (deterministic, no LLM)'),
      escalation: z.object({
        conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.number() })),
        event: z.string(),
        contextBuilder: z.enum(['sensor-snapshot', 'camera-snapshot', 'full-context', 'minimal']),
        priority: z.enum(['low', 'normal', 'urgent']),
        cooldownMs: z.number(),
        conflictGroup: z.string().optional(),
      }).optional().describe('When and how to escalate to Brain'),
      priority: z.number().default(10),
      cooldownMs: z.number().default(0),
      configFilter: z.string().optional().describe('Only activate in this configuration'),
    } as any,
    async (params: any) => handlers.xentient_register_skill(params),
  );

  server.tool(
    'xentient_update_skill',
    'Modify an existing CoreSkill (priority, cooldown, actions, escalation)',
    {
      id: z.string(),
      spaceId: z.string().optional(),
      priority: z.number().optional(),
      cooldownMs: z.number().optional(),
      actions: z.array(z.record(z.unknown())).optional(),
      escalation: z.record(z.unknown()).optional(),
      configFilter: z.string().optional().describe('Only activate in this configuration'),
    } as any,
    async (params: any) => handlers.xentient_update_skill(params),
  );

  server.tool(
    'xentient_disable_skill',
    'Enable or disable a CoreSkill without removing it',
    {
      id: z.string(),
      enabled: z.boolean(),
      spaceId: z.string().optional(),
    } as any,
    async ({ id, enabled, spaceId }: { id: string; enabled: boolean; spaceId?: string }) => handlers.xentient_disable_skill({ id, enabled, spaceId }),
  );

  server.tool(
    'xentient_remove_skill',
    'Delete a dynamic CoreSkill. Builtin skills (prefixed _) cannot be removed.',
    {
      id: z.string(),
      spaceId: z.string().optional(),
    } as any,
    async ({ id, spaceId }: { id: string; spaceId?: string }) => handlers.xentient_remove_skill({ id, spaceId }),
  );

  server.tool(
    'xentient_list_skills',
    'Query all CoreSkills with current state (fireCount, lastFiredAt, escalationCount, enabled)',
    {
      spaceId: z.string().optional().describe('Filter by space ID. Omit for all spaces.'),
    } as any,
    async ({ spaceId }: { spaceId?: string }) => handlers.xentient_list_skills({ spaceId }),
  );

  server.tool(
    'xentient_get_skill_log',
    'Read the skill execution log (ring buffer, last 1000 entries). Filterable by space, skill, and time range.',
    {
      spaceId: z.string().optional(),
      skillId: z.string().optional(),
      since: z.number().optional().describe('Unix timestamp ms — return entries after this'),
      limit: z.number().optional().default(50),
    } as any,
    async (params: { spaceId?: string; skillId?: string; since?: number; limit?: number }) => handlers.xentient_get_skill_log(params),
  );

  server.tool(
    'xentient_activate_config',
    'Activate a named Configuration for a Space (student/family/developer/default/custom)',
    {
      spaceId: z.string(),
      config: z.string().describe('Configuration name to activate'),
    } as any,
    async ({ spaceId, config }: { spaceId: string; config: string }) => handlers.xentient_activate_config({ spaceId, config }),
  );

  server.tool(
    'xentient_resolve_conflict',
    'Respond to a skill_conflict notification. Specify which skills to execute and which to skip.',
    {
      execute: z.array(z.string()).describe('Skill IDs to execute'),
      skip: z.array(z.string()).describe('Skill IDs to skip'),
      reason: z.string().describe('Explanation for the decision'),
      conflictGroup: z.string().describe('The conflictGroup that triggered this'),
    } as any,
    async (params: { execute: string[]; skip: string[]; reason: string; conflictGroup: string }) => handlers.xentient_resolve_conflict(params),
  );

  // ============================================================
  // EVENT BRIDGE TOOLS — Phase 7 Plan 07-02
  // Runtime mapping registration/removal for the EventBridge
  // ============================================================

  server.tool(
    'xentient_register_event_mapping',
    'Register a custom event mapping that routes MQTT or mode events to skill events',
    {
      source: z.string().describe('Event source: mqtt:sensor, mqtt:triggerPipeline, or mode'),
      eventName: z.string().describe('Target skill event name (e.g., motion_detected, sensor_update)'),
      filter: z.string().optional().describe('JS expression string for filtering (e.g., "data.peripheralType === 0x12")'),
      transform: z.string().optional().describe('JS expression string for transforming event data (e.g., "{ payload: data.payload, timestamp: Date.now() }")'),
    } as any,
    async ({ source, eventName, filter, transform }: { source: string; eventName: string; filter?: string; transform?: string }) =>
      handlers.xentient_register_event_mapping({ source, eventName, filter, transform }),
  );

  server.tool(
    'xentient_remove_event_mapping',
    'Remove an event mapping by its ID',
    {
      mappingId: z.string().describe('The mapping ID to remove'),
    } as any,
    async ({ mappingId }: { mappingId: string }) => handlers.xentient_remove_event_mapping({ mappingId }),
  );

  server.tool(
    'xentient_list_event_mappings',
    'List all current event mappings (default and custom)',
    {} as any,
    async () => handlers.xentient_list_event_mappings(),
  );

  // ============================================================
  // PACK MANAGEMENT TOOLS — Phase 7 Plan 07-03
  // Load, list, and reload skill packs
  // ============================================================

  server.tool(
    'xentient_load_pack',
    'Unload current pack (if any) and load a new skill pack by name',
    {
      packName: z.string().describe('Name of the pack directory under packs/'),
    } as any,
    async ({ packName }: { packName: string }) => handlers.xentient_load_pack({ packName }),
  );

  server.tool(
    'xentient_list_packs',
    'List available skill packs and show which one is active',
    {} as any,
    async () => handlers.xentient_list_packs(),
  );

  server.tool(
    'xentient_reload_pack',
    'Reload the currently active pack from disk (hot-reload)',
    {} as any,
    async () => handlers.xentient_reload_pack(),
  );

  server.tool(
    'xentient_register_config',
    'Register a new configuration (Brain-authored)',
    {
      name: z.string().regex(/^[a-z0-9-]{1,32}$/).describe('Configuration name (lowercase, hyphens, 1-32 chars)'),
      displayName: z.string().max(64).describe('Human-readable configuration name'),
      nodeAssignments: z.record(z.string()).optional().describe('Map of node role to NodeSkill ID'),
      coreSkills: z.array(z.string()).min(1).describe('CoreSkill IDs enabled for this config'),
      transitions: z.record(z.unknown()).optional().describe('Auto-transition rules'),
    } as any,
    ({ name, displayName, nodeAssignments, coreSkills, transitions }: { name: string; displayName: string; nodeAssignments?: Record<string, string>; coreSkills: string[]; transitions?: Record<string, unknown> }) =>
      handlers.xentient_register_config({ name, displayName, nodeAssignments, coreSkills, transitions }),
  );

  server.tool(
    'xentient_brain_stream',
    'Push brain reasoning tokens and events back to Core SSE bus for live dashboard rendering',
    {
      escalation_id: z.string().describe('Escalation ID this stream event belongs to'),
      subtype: z.string().describe('Event subtype: escalation_received, reasoning_token, tool_call_fired, tool_call_result, tts_queued, escalation_complete'),
      payload: z.record(z.unknown()).optional().describe('Event-specific payload data'),
    } as any,
    async ({ escalation_id, subtype, payload }: { escalation_id: string; subtype: string; payload?: Record<string, unknown> }) =>
      handlers.xentient_brain_stream({ escalation_id, subtype, payload }),
  );

  // ============================================================
  // EVENT SUBSCRIPTION TOOLS — Sprint 4
  // ============================================================

  server.tool(
    'xentient_subscribe_events',
    'Subscribe to a filtered event stream from Core',
    {
      eventTypes: z.array(z.string()).min(1).describe('Event types to receive (e.g. ["motion_detected", "sensor_update"])'),
      maxRateMs: z.number().int().min(0).default(1000).describe('Minimum ms between deliveries. 0 = real-time.'),
    } as any,
    ({ eventTypes, maxRateMs }: { eventTypes: string[]; maxRateMs: number }) => handlers.xentient_subscribe_events({ eventTypes, maxRateMs }),
  );

  server.tool(
    'xentient_unsubscribe_events',
    'Remove an event subscription',
    {
      subscriptionId: z.string().describe('The subscription ID to remove'),
    } as any,
    ({ subscriptionId }: { subscriptionId: string }) => handlers.xentient_unsubscribe_events({ subscriptionId }),
  );

  // ============================================================
  // NODE PROVISIONING TOOLS — Sprint 9 (S5, S9, S11)
  // ============================================================

  server.tool(
    'xentient_register_node',
    'Register a new node and generate a provisioning token for ESP32 WiFiManager portal',
    {
      spaceId: z.string().optional().default('default').describe('Space ID to register the node in'),
      role: z.string().optional().default('base').describe('Node role (e.g. base, ceiling, door)'),
      hardware: z.array(z.string()).optional().default(['motion', 'temperature', 'humidity', 'audio', 'camera']).describe('Hardware capabilities'),
      wifiSsid: z.string().optional().describe('WiFi SSID to pre-fill in provisioning portal'),
      wifiPass: z.string().optional().describe('WiFi password to pre-fill in provisioning portal'),
    } as any,
    ({ spaceId, role, hardware, wifiSsid, wifiPass }: { spaceId?: string; role?: string; hardware?: string[]; wifiSsid?: string; wifiPass?: string }) =>
      handlers.xentient_register_node({ spaceId, role, hardware, wifiSsid, wifiPass }),
  );

  // ============================================================
  // CAPABILITY DISCOVERY TOOLS — Sprint 3
  // ============================================================

  server.tool(
    'xentient_get_capabilities',
    'Return the full current capability picture of the Xentient system (nodes, core, space)',
    {
      spaceId: z.string().optional().describe('Space ID to query. Defaults to "default".'),
    } as any,
    async ({ spaceId }: { spaceId?: string }) => handlers.xentient_get_capabilities({ spaceId }),
  );

  server.tool(
    'xentient_get_skill_schema',
    'Return the schema for a skill type (CoreSkill, NodeSkill, Configuration) for Brain to author new skills',
    {
      skillType: z.enum(['CoreSkill', 'NodeSkill', 'Configuration']).describe('The skill type to get schema for'),
    } as any,
    async ({ skillType }: { skillType: string }) => handlers.xentient_get_skill_schema({ skillType }),
  );

  // Wire push-based events from Core subsystems -> Brain
  wireMcpEvents(server, deps.mqtt, deps.modeManager, deps.sensorCache);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");

  return server;
}
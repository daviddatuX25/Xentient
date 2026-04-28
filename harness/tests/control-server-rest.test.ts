import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ControlServer, type ControlServerDeps } from "../src/comms/ControlServer";
import { createMockMqtt } from "./helpers/mockMqtt";
import { createMockModeManager } from "./helpers/mockModeManager";
import { createMockCameraServer } from "./helpers/mockCameraServer";

describe("ControlServer REST endpoints", () => {
  let server: ControlServer;
  let baseUrl: string;

  beforeAll(async () => {
    const mqtt = createMockMqtt() as any;
    const modeManager = createMockModeManager() as any;
    const cameraServer = createMockCameraServer() as any;
    const sensorCache = { temperature: 25.3, humidity: 60.1, pressure: 1013.2, motion: false, lastMotionAt: null };

    const deps: ControlServerDeps = {
      mqtt,
      modeManager,
      cameraServer,
      sensorCache,
      sensorHistory: { query: () => [] },
      spaceManager: { listSkills: () => [], skillLog: { append: () => {}, query: () => [], attachEscalationResponse: () => {} } } as any,
      eventBridge: { start: () => {}, stop: () => {}, listMappings: () => [], addCustomMapping: () => "", removeMapping: () => false, handleMqttEvent: () => {}, forwardModeEvent: () => {}, register: () => {} } as any,
      packLoader: { loadPack: () => {}, unloadCurrentPack: () => {}, getLoadedPack: () => null, listAvailablePacks: () => [], reload: () => {} } as any,
      skillLog: { append: () => {}, query: () => [], attachEscalationResponse: () => {} } as any,
      getBrainConnected: () => true,
    };

    server = new ControlServer(deps, 0);
    await server.start();
    const port = (server as any).server?.address()?.port ?? 3000;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => server.close());

  it("GET /api/sensors returns sensor cache", async () => {
    const res = await fetch(`${baseUrl}/api/sensors`);
    const data = await res.json();
    expect(data).toHaveProperty("temperature");
    expect(data).toHaveProperty("humidity");
    expect(data).toHaveProperty("pressure");
    expect(data).toHaveProperty("motion");
  });

  it("GET /api/mode returns current mode", async () => {
    const res = await fetch(`${baseUrl}/api/mode`);
    const data = await res.json();
    expect(data).toHaveProperty("mode");
    expect(["sleep", "listen", "active", "record"]).toContain(data.mode);
  });

  it("GET /api/camera returns 404 when no frame", async () => {
    const res = await fetch(`${baseUrl}/api/camera`);
    expect(res.status).toBe(404);
  });

  it("GET /api/status returns system status", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    const data = await res.json();
    expect(data).toHaveProperty("mode");
    expect(data).toHaveProperty("mqtt");
    expect(data).toHaveProperty("sensors");
  });

  it("GET /api/nonexistent returns 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Not found");
  });

  it("PATCH /api/mode returns 405 Method not allowed", async () => {
    const res = await fetch(`${baseUrl}/api/mode`, { method: "PATCH" });
    expect(res.status).toBe(405);
    const data = await res.json();
    expect(data.error).toBe("Method not allowed");
  });

  it("OPTIONS request returns 204 CORS preflight", async () => {
    const res = await fetch(`${baseUrl}/api/status`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("POST /api/text with body returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    const data = await res.json();
    expect(data).toHaveProperty("ok", true);
  });

  it("POST /api/mode with valid mode returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "listen" }),
    });
    const data = await res.json();
    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("mode", "listen");
  });

  it("POST /api/mode with invalid mode returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/trigger with valid source returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "web" }),
    });
    const data = await res.json();
    expect(data).toHaveProperty("ok", true);
  });

  it("POST /api/trigger with invalid source returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "invalid" }),
    });
    expect(res.status).toBe(400);
  });
});
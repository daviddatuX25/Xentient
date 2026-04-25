import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ControlServer } from "../src/comms/ControlServer";
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

    server = new ControlServer(0, mqtt, modeManager, cameraServer, sensorCache);
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
});
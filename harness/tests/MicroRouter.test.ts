import { describe, it, expect } from "vitest";
import { MicroRouter } from "../src/comms/MicroRouter";
import type { IncomingMessage, ServerResponse } from "http";

/** Helper to create a mock IncomingMessage. */
function mockReq(method: string, url: string): IncomingMessage {
  return { method, url } as IncomingMessage;
}

/** Helper to create a mock ServerResponse that captures JSON output. */
function mockRes(): ServerResponse & { json: () => { status: number; body: unknown } } {
  let capturedStatus = 0;
  let capturedBody: unknown = "";
  const res = {
    writeHead: (status: number) => { capturedStatus = status; },
    end: (body?: unknown) => { capturedBody = body ? JSON.parse(body as string) : ""; },
    json: () => ({ status: capturedStatus, body: capturedBody }),
    setHeader: () => {},
  } as unknown as ServerResponse & { json: () => { status: number; body: unknown } };
  return res;
}

describe("MicroRouter", () => {
  it("resolves exact path matches", () => {
    const router = new MicroRouter();
    const handler = async () => {};
    router.add("GET", "/api/status", handler);

    const result = router.resolve("GET", "/api/status");
    expect("handler" in result).toBe(true);
    if ("handler" in result) {
      expect(result.handler).toBe(handler);
      expect(result.params).toEqual({});
    }
  });

  it("resolves path parameters via named capture groups", () => {
    const router = new MicroRouter();
    const handler = async () => {};
    router.add("GET", "/api/skills/:id", handler);

    const result = router.resolve("GET", "/api/skills/my-skill");
    expect("handler" in result).toBe(true);
    if ("handler" in result) {
      expect(result.params).toEqual({ id: "my-skill" });
    }
  });

  it("returns 404 for non-existent paths", () => {
    const router = new MicroRouter();
    router.add("GET", "/api/status", async () => {});

    const result = router.resolve("GET", "/api/nonexistent");
    expect("handler" in result).toBe(false);
    if (!("handler" in result)) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 405 when path matches but method does not", () => {
    const router = new MicroRouter();
    router.add("GET", "/api/mode", async () => {});

    const result = router.resolve("POST", "/api/mode");
    expect("handler" in result).toBe(false);
    if (!("handler" in result)) {
      expect(result.status).toBe(405);
    }
  });

  it("strips query strings before matching", () => {
    const router = new MicroRouter();
    const handler = async () => {};
    router.add("GET", "/api/sensors", handler);

    const result = router.resolve("GET", "/api/sensors?since=1234");
    expect("handler" in result).toBe(true);
  });

  it("matches paths with trailing slashes", () => {
    const router = new MicroRouter();
    const handler = async () => {};
    router.add("GET", "/api/skills", handler);

    const result = router.resolve("GET", "/api/skills/");
    expect("handler" in result).toBe(true);
  });

  it("supports fluent add() chaining", () => {
    const router = new MicroRouter();
    const h1 = async () => {};
    const h2 = async () => {};

    const result = router
      .add("GET", "/api/status", h1)
      .add("GET", "/api/sensors", h2);

    // Result of add() is the router itself
    expect(result).toBe(router);

    // Both routes resolve
    expect("handler" in router.resolve("GET", "/api/status")).toBe(true);
    expect("handler" in router.resolve("GET", "/api/sensors")).toBe(true);
  });

  it("distinguishes multiple parameters in a single path", () => {
    const router = new MicroRouter();
    router.add("GET", "/api/spaces/:spaceId/skills/:skillId", async () => {});

    const result = router.resolve("GET", "/api/spaces/default/skills/wake-on-mode");
    expect("handler" in result).toBe(true);
    if ("handler" in result) {
      expect(result.params).toEqual({ spaceId: "default", skillId: "wake-on-mode" });
    }
  });

  it("does not match partial paths", () => {
    const router = new MicroRouter();
    router.add("GET", "/api/mode", async () => {});

    const result = router.resolve("GET", "/api/mode-extra");
    expect("handler" in result).toBe(false);
  });

  it("handles case-insensitive method matching", () => {
    const router = new MicroRouter();
    const handler = async () => {};
    router.add("post", "/api/mode", handler);

    const result = router.resolve("POST", "/api/mode");
    expect("handler" in result).toBe(true);
  });
});
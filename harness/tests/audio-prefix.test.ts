import { describe, it, expect, vi } from "vitest";
import { WebSocket } from "ws";
import { AUDIO_WS_PREFIX } from "../src/shared/contracts";

describe("AudioServer sendAudio prefix", () => {
  it("prepends 0xA0 prefix to PCM audio before sending", async () => {
    const { AudioServer } = await import("../src/comms/AudioServer");
    const server = new AudioServer(0); // port 0 = random available port
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    // Mock the active connection
    const mockWs = { readyState: WebSocket.OPEN, send: vi.fn() } as any;
    (server as any).activeConnection = mockWs;

    server.sendAudio(pcm);

    const sent = mockWs.send.mock.calls[0][0] as Buffer;
    expect(sent[0]).toBe(AUDIO_WS_PREFIX);
    expect(sent.subarray(1)).toEqual(pcm);
    server.close();
  });

  it("does not send when no active connection exists", async () => {
    const { AudioServer } = await import("../src/comms/AudioServer");
    const server = new AudioServer(0);
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    // No activeConnection set (defaults to null)
    server.sendAudio(pcm);

    // Just verify no crash — the method should log a warning and return
    server.close();
  });
});
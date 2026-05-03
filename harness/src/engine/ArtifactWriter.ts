/**
 * Artifact Writer — writes session artifacts to disk per CONTRACTS.md layout.
 *
 * Layout:
 *   $XENTIENT_ARTIFACTS_PATH/{sessionId}/
 *     user.wav          S16LE 16kHz mono
 *     assistant.wav     same format
 *     transcript.txt    UTF-8
 *     meta.json         { sessionId, startedAt, endedAt, mode, turns[] }
 *     camera.jpg        optional
 *
 * CRITICAL: fsync BEFORE publishing session_complete.
 * Paths in MQTT messages are RELATIVE to $XENTIENT_ARTIFACTS_PATH.
 */

import * as fs from "fs";
import * as path from "path";
import pino from "pino";

const logger = pino({ name: "artifact-writer" }, process.stderr); // GAP-11/T-22: stderr for MCP stdio safety

export interface ArtifactPaths {
  userAudio: string;
  asstAudio: string;
  transcript: string;
  meta: string;
  cameraSnapshot?: string;
}

export interface TurnData {
  role: "user" | "assistant" | "system";
  text: string;
  startedAt: number;
  durationMs: number;
}

export interface SessionMeta {
  sessionId: string;
  nodeBaseId: string;
  spaceId: string;
  startedAt: number;
  endedAt: number;
  mode: string;
  turns: TurnData[];
}

export class ArtifactWriter {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.env.XENTIENT_ARTIFACTS_PATH ?? "./var/artifacts";
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  /** Write all artifacts for a session and return relative paths. */
  async writeSession(
    sessionId: string,
    meta: SessionMeta,
    userAudio: Buffer,
    assistantAudio: Buffer,
    transcriptText: string,
    cameraSnapshot?: Buffer,
  ): Promise<ArtifactPaths> {
    const dir = path.join(this.basePath, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    const paths: ArtifactPaths = {
      userAudio: `${sessionId}/user.wav`,
      asstAudio: `${sessionId}/assistant.wav`,
      transcript: `${sessionId}/transcript.txt`,
      meta: `${sessionId}/meta.json`,
    };

    // Write each file + fsync
    await this.writeAndSync(path.join(dir, "user.wav"), userAudio);
    await this.writeAndSync(path.join(dir, "assistant.wav"), assistantAudio);
    await this.writeAndSync(path.join(dir, "transcript.txt"), Buffer.from(transcriptText, "utf-8"));
    await this.writeAndSync(path.join(dir, "meta.json"), Buffer.from(JSON.stringify(meta, null, 2), "utf-8"));

    if (cameraSnapshot) {
      paths.cameraSnapshot = `${sessionId}/camera.jpg`;
      await this.writeAndSync(path.join(dir, "camera.jpg"), cameraSnapshot);
    }

    logger.info({ sessionId, dir }, "Session artifacts written and synced");
    return paths;
  }

  private writeAndSync(filePath: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const fd = fs.openSync(filePath, "w");
      fs.write(fd, data, (writeErr) => {
        if (writeErr) { fs.closeSync(fd); reject(writeErr); return; }
        fs.fsync(fd, (syncErr) => {
          if (syncErr) { fs.closeSync(fd); reject(syncErr); return; }
          fs.close(fd, (closeErr) => {
            if (closeErr) { reject(closeErr); return; }
            resolve();
          });
        });
      });
    });
  }
}
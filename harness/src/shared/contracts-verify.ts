#!/usr/bin/env bun
/**
 * Verify all session fixtures parse against Zod contracts.
 *
 * Usage: bun run fixtures:verify
 *
 * Reads harness/fixtures/sessions/*.json, validates each fixture's
 * session.turns structure against the SessionComplete schema, and
 * reports pass/fail for each.
 */

import * as fs from "fs";
import * as path from "path";
import {
  SessionComplete,
  TurnSchema,
  MODE_VALUES,
  CameraRequest,
  CameraReady,
  CAMERA_WS_PREFIX,
  AUDIO_WS_PREFIX,
  UART_SYNC_BYTE_1,
  UART_SYNC_BYTE_2,
  UART_CRC8_POLY,
  validateMessage,
} from "./contracts";

interface FixtureTurn {
  role: string;
  text: string;
  durationMs: number;
}

interface Fixture {
  session: {
    mode: string;
    turns: FixtureTurn[];
  };
  hasAudio: boolean;
  hasCamera: boolean;
  error?: { recoverable: boolean; message: string };
}

const FIXTURES_DIR = path.join(__dirname, "..", "..", "fixtures", "sessions");

let passed = 0;
let failed = 0;

const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();

console.log(`\nVerifying ${files.length} session fixtures...\n`);

for (const file of files) {
  const fp = path.join(FIXTURES_DIR, file);
  const name = file.replace(".json", "");

  try {
    const raw = fs.readFileSync(fp, "utf-8");
    const fixture: Fixture = JSON.parse(raw);

    // Validate fixture structure
    const errors: string[] = [];

    if (!fixture.session) errors.push("missing 'session' key");
    if (!fixture.session?.mode) errors.push("missing 'session.mode'");
    if (!fixture.session?.turns) errors.push("missing 'session.turns'");
    if (!Array.isArray(fixture.session?.turns)) errors.push("'session.turns' is not an array");

    // Validate mode is a known value
    if (fixture.session?.mode && !MODE_VALUES.includes(fixture.session.mode as any)) {
      errors.push(`unknown mode: ${fixture.session.mode}`);
    }

    // Validate each turn
    for (const [i, turn] of (fixture.session?.turns ?? []).entries()) {
      const parsed = TurnSchema.safeParse({
        role: turn.role,
        text: turn.text,
        startedAt: Date.now(),
        durationMs: turn.durationMs,
      });
      if (!parsed.success) {
        errors.push(`turn[${i}]: ${parsed.error.issues.map((iss) => iss.message).join(", ")}`);
      }
    }

    // Validate that a full SessionComplete can be built from this fixture
    const now = Date.now();
    const sessionData = {
      v: 1,
      type: "session_complete" as const,
      sessionId: `verify-${name}`,
      nodeBaseId: "node-01",
      spaceId: "living-room",
      startedAt: now - 3000,
      endedAt: now,
      mode: fixture.session.mode,
      status: "done" as const,
      turns: fixture.session.turns.map((t: FixtureTurn) => ({
        role: t.role,
        text: t.text,
        startedAt: now - 2000,
        durationMs: t.durationMs,
      })),
      artifacts: {
        userAudio: `verify-${name}/user.wav`,
        asstAudio: `verify-${name}/assistant.wav`,
        transcript: `verify-${name}/transcript.txt`,
        meta: `verify-${name}/meta.json`,
      },
    };

    const sessionParsed = SessionComplete.safeParse(sessionData);
    if (!sessionParsed.success) {
      errors.push(`SessionComplete: ${sessionParsed.error.issues.map((iss) => iss.message).join(", ")}`);
    }

    if (errors.length > 0) {
      console.log(`  FAIL  ${name}`);
      errors.forEach((e) => console.log(`        ${e}`));
      failed++;
    } else {
      console.log(`  PASS  ${name}`);
      passed++;
    }
  } catch (e: any) {
    console.log(`  FAIL  ${name} — ${e.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);

// ── Camera contract verification ──────────────────────────────────────

/**
 * Verify camera MQTT messages parse against Zod schemas.
 * Also verifies binary transport constants match CONTRACTS.md.
 */
function verifyCameraContracts(): void {
  console.log("\nVerifying camera contracts...\n");

  let camPassed = 0;
  let camFailed = 0;

  // Verify binary transport constants
  const constantChecks = [
    { name: "CAMERA_WS_PREFIX == 0xCA", actual: CAMERA_WS_PREFIX, expected: 0xca },
    { name: "AUDIO_WS_PREFIX == 0xA0 (0xAU spec notation)", actual: AUDIO_WS_PREFIX, expected: 0xa0 },
    { name: "UART_SYNC_BYTE_1 == 0xAA", actual: UART_SYNC_BYTE_1, expected: 0xaa },
    { name: "UART_SYNC_BYTE_2 == 0x55", actual: UART_SYNC_BYTE_2, expected: 0x55 },
    { name: "UART_CRC8_POLY == 0x07", actual: UART_CRC8_POLY, expected: 0x07 },
  ];

  for (const check of constantChecks) {
    if (check.actual === check.expected) {
      console.log(`  PASS  ${check.name}`);
      camPassed++;
    } else {
      console.log(`  FAIL  ${check.name} — got 0x${check.actual.toString(16).toUpperCase()}`);
      camFailed++;
    }
  }

  // Verify camera_request message schema
  const cameraRequestCases = [
    { name: "valid camera_request", data: { v: 1, type: "camera_request", frameId: 0 }, shouldPass: true },
    { name: "valid camera_request max frameId", data: { v: 1, type: "camera_request", frameId: 65535 }, shouldPass: true },
    { name: "invalid camera_request frameId overflow", data: { v: 1, type: "camera_request", frameId: 65536 }, shouldPass: false },
    { name: "invalid camera_request negative frameId", data: { v: 1, type: "camera_request", frameId: -1 }, shouldPass: false },
    { name: "invalid camera_request missing frameId", data: { v: 1, type: "camera_request" }, shouldPass: false },
  ];

  for (const tc of cameraRequestCases) {
    const parsed = CameraRequest.safeParse(tc.data);
    const pass = parsed.success === tc.shouldPass;
    if (pass) {
      console.log(`  PASS  ${tc.name}`);
      camPassed++;
    } else {
      console.log(`  FAIL  ${tc.name} — expected ${tc.shouldPass ? "pass" : "fail"}, got ${parsed.success ? "pass" : "fail"}`);
      camFailed++;
    }
  }

  // Verify camera_ready message schema
  const cameraReadyCases = [
    { name: "valid camera_ready", data: { v: 1, type: "camera_ready", frameId: 42, size: 3245 }, shouldPass: true },
    { name: "valid camera_ready zero size", data: { v: 1, type: "camera_ready", frameId: 0, size: 0 }, shouldPass: true },
    { name: "invalid camera_ready frameId overflow", data: { v: 1, type: "camera_ready", frameId: 70000, size: 100 }, shouldPass: false },
    { name: "invalid camera_ready negative size", data: { v: 1, type: "camera_ready", frameId: 1, size: -1 }, shouldPass: false },
    { name: "invalid camera_ready missing size", data: { v: 1, type: "camera_ready", frameId: 1 }, shouldPass: false },
  ];

  for (const tc of cameraReadyCases) {
    const parsed = CameraReady.safeParse(tc.data);
    const pass = parsed.success === tc.shouldPass;
    if (pass) {
      console.log(`  PASS  ${tc.name}`);
      camPassed++;
    } else {
      console.log(`  FAIL  ${tc.name} — expected ${tc.shouldPass ? "pass" : "fail"}, got ${parsed.success ? "pass" : "fail"}`);
      camFailed++;
    }
  }

  // Verify validateMessage works for camera types
  try {
    const req = validateMessage("camera_request", { v: 1, type: "camera_request", frameId: 100 });
    if (req.frameId === 100) {
      console.log("  PASS  validateMessage('camera_request')");
      camPassed++;
    } else {
      console.log("  FAIL  validateMessage('camera_request') — frameId mismatch");
      camFailed++;
    }
  } catch (e: any) {
    console.log(`  FAIL  validateMessage('camera_request') — ${e.message}`);
    camFailed++;
  }

  try {
    const ready = validateMessage("camera_ready", { v: 1, type: "camera_ready", frameId: 100, size: 2048 });
    if (ready.frameId === 100 && ready.size === 2048) {
      console.log("  PASS  validateMessage('camera_ready')");
      camPassed++;
    } else {
      console.log("  FAIL  validateMessage('camera_ready') — field mismatch");
      camFailed++;
    }
  } catch (e: any) {
    console.log(`  FAIL  validateMessage('camera_ready') — ${e.message}`);
    camFailed++;
  }

  console.log(`\nCamera: ${camPassed} passed, ${camFailed} failed\n`);

  if (camFailed > 0) {
    process.exit(1);
  }
}

verifyCameraContracts();
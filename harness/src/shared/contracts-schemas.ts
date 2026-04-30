#!/usr/bin/env bun
/**
 * Export all Zod contract schemas as JSON-Schema to harness/fixtures/schemas/.
 *
 * Usage: bun run fixtures:regen-schemas
 *
 * Track A uses these to validate inbound messages without touching TS.
 * Re-run whenever contracts.ts changes.
 */

import * as fs from "fs";
import * as path from "path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ALL_CONTRACT_SCHEMAS } from "./contracts";

const SCHEMAS_DIR = path.join(__dirname, "..", "..", "fixtures", "schemas");

// Ensure output directory exists
fs.mkdirSync(SCHEMAS_DIR, { recursive: true });

let count = 0;

for (const [name, schema] of Object.entries(ALL_CONTRACT_SCHEMAS)) {
  // @ts-expect-error Zod union schema exceeds TypeScript's type instantiation depth limit
  const jsonSchema = zodToJsonSchema(schema, { target: "draft-7" });
  const outputPath = path.join(SCHEMAS_DIR, `${name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));
  console.log(`  wrote ${name}.json`);
  count++;
}

console.log(`\n${count} schemas exported to ${SCHEMAS_DIR}/\n`);
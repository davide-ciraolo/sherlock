import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("schemas are valid JSON Schema with required props", async () => {
  const finding = JSON.parse(await readFile(path.join(root, "schemas/finding.schema.json"), "utf8"));
  assert.equal(finding.type, "object");
  for (const p of ["id", "lens", "severity", "file", "line", "excerpt", "rationale", "recommendation"]) {
    assert.ok(finding.properties[p], `finding.${p} present`);
  }
  const verdict = JSON.parse(await readFile(path.join(root, "schemas/verdict.schema.json"), "utf8"));
  assert.deepEqual(verdict.properties.verdict.enum, ["confirmed", "uncertain", "refuted"]);
  const units = JSON.parse(await readFile(path.join(root, "schemas/units.schema.json"), "utf8"));
  assert.ok(units.properties.units);
});

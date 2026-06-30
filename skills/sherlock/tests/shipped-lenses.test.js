import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, validateLens } from "../src/lenses.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("all five shipped lenses parse and validate", async () => {
  const lenses = await listLenses(path.join(root, "lenses"));
  const names = lenses.map((l) => l.name).sort();
  assert.deepEqual(names, ["comments", "correctness", "dead-code", "refactor", "security"]);
  for (const l of lenses) validateLens(l);
});

test("verification_class routing is correct", async () => {
  const lenses = await listLenses(path.join(root, "lenses"));
  const byName = Object.fromEntries(lenses.map((l) => [l.name, l.verification_class]));
  assert.equal(byName.security, "security");
  assert.equal(byName.correctness, "correctness");
  assert.equal(byName["dead-code"], "cleanup");
  assert.equal(byName.comments, "cleanup");
  assert.equal(byName.refactor, "cleanup");
});

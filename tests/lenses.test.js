import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listLenses, validateLens, resolveSelection } from "../src/lenses.js";

function lensMd(name, vc) {
  return `---\nname: ${name}\ntitle: ${name} lens\nperspective: looks at ${name}\nverification_class: ${vc}\napplies_to:\n  tiers: [S, A, B]\n  globs: ["**/*"]\nseverity_default: HIGH\n---\nBody.\n`;
}

async function lensesDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "sherlock-lens-"));
  await writeFile(path.join(dir, "security.md"), lensMd("security", "security"));
  await writeFile(path.join(dir, "correctness.md"), lensMd("correctness", "correctness"));
  await writeFile(path.join(dir, "_TEMPLATE.md"), "---\nname: TEMPLATE\n---\n");
  return dir;
}

test("listLenses parses frontmatter and skips the template", async () => {
  const lenses = await listLenses(await lensesDir());
  assert.deepEqual(lenses.map((l) => l.name).sort(), ["correctness", "security"]);
  for (const l of lenses) validateLens(l);
});

test("validateLens rejects bad verification_class", () => {
  assert.throws(() => validateLens({ name: "x", title: "x", perspective: "x", verification_class: "bogus", applies_to: { tiers: ["B"], globs: ["**"] }, severity_default: "LOW" }), /verification_class/);
});

test("resolveSelection maps aliases and rejects unknowns", async () => {
  const lenses = await listLenses(await lensesDir());
  assert.deepEqual(resolveSelection(lenses, "bugs,security").map((l) => l.name).sort(), ["correctness", "security"]);
  assert.throws(() => resolveSelection(lenses, "nope"), /unknown lens/);
});

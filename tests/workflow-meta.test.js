import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("workflow declares meta with the four phases", async () => {
  const src = await readFile(path.join(root, "workflow/sherlock.workflow.js"), "utf8");
  assert.ok(src.includes("export const meta"));
  for (const phase of ["Partition", "Review", "Verify", "Synthesize"]) {
    assert.ok(src.includes(`'${phase}'`) || src.includes(`"${phase}"`), `mentions ${phase}`);
  }
  assert.ok(src.includes("verification_class"));
});

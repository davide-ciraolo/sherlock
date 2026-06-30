import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("SKILL.md has frontmatter name + description and the token-cost warning", async () => {
  const md = await readFile(path.join(root, "SKILL.md"), "utf8");
  assert.ok(/^---\n[\s\S]*name:\s*sherlock[\s\S]*description:[\s\S]*\n---/.test(md));
  assert.ok(/token|cost|opt-in/i.test(md), "must flag token-intensive opt-in");
  for (const c of ["partition", "scaffold", "coverage", "lenses", "rules"]) assert.ok(md.includes(c));
});

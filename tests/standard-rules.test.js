import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "rules/standard");

test("standard pack has the three general rule files", async () => {
  const files = (await readdir(dir)).sort();
  for (const f of ["cleanliness.md", "correctness.md", "security.md"]) assert.ok(files.includes(f));
});

test("standard pack contains no project-specific terms", async () => {
  const banned = /furiosa|coordinator|svc_token|path-jail|pi thread|tenant/i;
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".md")) continue;
    const text = await readFile(path.join(dir, f), "utf8");
    assert.ok(!banned.test(text), `${f} must stay general (no project-specific terms)`);
  }
});

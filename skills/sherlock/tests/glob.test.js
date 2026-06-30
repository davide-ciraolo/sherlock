import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkFiles } from "../src/glob.js";
import { countLines } from "../src/loc.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-"));
  await mkdir(path.join(root, "api/src"), { recursive: true });
  await mkdir(path.join(root, "node_modules/x"), { recursive: true });
  await writeFile(path.join(root, "api/src/app.py"), "a\nb\nc\n");
  await writeFile(path.join(root, "api/src/app.test.py"), "t\n");
  await writeFile(path.join(root, "node_modules/x/i.js"), "x\n");
  return root;
}

test("walkFiles honours include + exclude, returns sorted posix rels", async () => {
  const root = await fixture();
  const files = await walkFiles(root, {
    include: ["**/*.py"],
    exclude: ["**/node_modules/**", "**/*.test.py"],
  });
  assert.deepEqual(files.map((f) => f.rel), ["api/src/app.py"]);
});

test("countLines counts text lines", () => {
  assert.equal(countLines("a\nb\nc\n"), 3);
  assert.equal(countLines(""), 0);
  assert.equal(countLines("nonl"), 1);
});

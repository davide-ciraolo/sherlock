import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("package.json declares ESM + node>=18 + pinned deps", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.name, "sherlock");
  assert.ok(pkg.engines.node.includes("18"));
  assert.ok(pkg.dependencies["js-yaml"]);
  assert.ok(pkg.dependencies["picomatch"]);
  assert.equal(pkg.scripts.test, "node --test tests/**/*.test.js");
});

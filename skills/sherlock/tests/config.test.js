import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultConfig, loadConfig, validateConfig, CONFIG_FILENAME, configFileExists } from "../src/config.js";
import { assignTier } from "../src/tiers.js";

test("defaultConfig has output, tiers, exclude, maxUnitLoc", () => {
  const c = defaultConfig();
  assert.equal(c.output, "docs/reviews");
  assert.ok(c.tiers.S && c.tiers.A && c.tiers.B);
  assert.ok(Array.isArray(c.exclude));
  assert.equal(typeof c.maxUnitLoc, "number");
  assert.deepEqual(c.rules, { project: [] });
});

test("loadConfig returns defaults when file absent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-cfg-"));
  const c = await loadConfig(root);
  assert.equal(c.output, "docs/reviews");
});

test("loadConfig merges user overrides", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-cfg-"));
  await writeFile(
    path.join(root, CONFIG_FILENAME),
    'output: docs/audits\nrules:\n  project:\n    - .claude/rules/project\n',
  );
  const c = await loadConfig(root);
  assert.equal(c.output, "docs/audits");
  assert.deepEqual(c.rules.project, [".claude/rules/project"]);
  assert.ok(c.tiers.B, "defaults still present after merge");
});

test("validateConfig rejects bad maxUnitLoc", () => {
  assert.throws(() => validateConfig({ ...defaultConfig(), maxUnitLoc: 0 }), /maxUnitLoc/);
});

test("default tiers classify auth→S, api→A, other→B", () => {
  const c = defaultConfig();
  assert.equal(assignTier("src/auth/login.ts", c.tiers), "S");
  assert.equal(assignTier("services/api/users.ts", c.tiers), "A");
  assert.equal(assignTier("src/util/str.ts", c.tiers), "B");
});

test("configFileExists detects yml/json presence", async () => {
  const empty = await mkdtemp(path.join(tmpdir(), "sherlock-cfe-"));
  assert.equal(await configFileExists(empty), false);
  const withYml = await mkdtemp(path.join(tmpdir(), "sherlock-cfe-"));
  await writeFile(path.join(withYml, "sherlock.config.yml"), "output: docs/reviews\n");
  assert.equal(await configFileExists(withYml), true);
});

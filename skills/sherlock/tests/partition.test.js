import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdPartition } from "../src/commands/partition.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-part-"));
  await mkdir(path.join(root, "api/src/auth"), { recursive: true });
  await mkdir(path.join(root, "frontend/src/pages"), { recursive: true });
  await writeFile(path.join(root, "api/src/auth/login.py"), "x\n".repeat(10));
  await writeFile(path.join(root, "frontend/src/pages/Home.tsx"), "y\n".repeat(5));
  await writeFile(
    path.join(root, "sherlock.config.yml"),
    'tiers:\n  S:\n    - "api/src/auth/**"\n  A: []\n  B:\n    - "**"\n',
  );
  return root;
}

test("partition writes units.json with tiers + loc, deterministic", async () => {
  const root = await repo();
  const sink = { out: "" };
  const code = await cmdPartition({ cwd: root, args: [], stdout: { write: (s) => (sink.out += s) }, stderr: { write() {} } });
  assert.equal(code, 0);
  const units = JSON.parse(await readFile(path.join(root, ".sherlock/units.json"), "utf8"));
  const auth = units.units.find((u) => u.path.includes("auth"));
  assert.equal(auth.tier, "S");
  assert.ok(auth.loc >= 10);
  assert.deepEqual(units.units.map((u) => u.id).slice().sort(), units.units.map((u) => u.id));
});

test("oversized single-directory group is bin-packed into multiple units with unique ids", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-part2-"));
  await mkdir(path.join(root, "agents/src"), { recursive: true });
  await writeFile(path.join(root, "agents/src/a.ts"), "x\n".repeat(40));
  await writeFile(path.join(root, "agents/src/b.ts"), "x\n".repeat(40));
  await writeFile(path.join(root, "agents/src/c.ts"), "x\n".repeat(40));
  await writeFile(
    path.join(root, "sherlock.config.yml"),
    'maxUnitLoc: 80\ninclude:\n  - "**/*.ts"\ntiers:\n  S: []\n  A: []\n  B:\n    - "**"\n',
  );
  const code = await cmdPartition({ cwd: root, args: [], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const units = JSON.parse(await readFile(path.join(root, ".sherlock/units.json"), "utf8")).units;
  const agentsUnits = units.filter((u) => u.path === "agents/src");
  assert.ok(agentsUnits.length >= 2, "oversized dir should split into >=2 units");
  for (const u of agentsUnits) assert.ok(u.loc <= 80 || u.files.length === 1, "each chunk under cap (or a single file)");
  const ids = units.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, "unit ids must be unique");
});

test("scoped partition writes a scope-keyed units file", async () => {
  const root = await repo();
  const code = await cmdPartition({ cwd: root, args: ["api/**"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const { unitsFileName } = await import("../src/paths.js");
  const scoped = JSON.parse(await readFile(path.join(root, ".sherlock", unitsFileName("api/**")), "utf8"));
  assert.ok(scoped.units.length >= 1);
  // the bare units.json must NOT be created by a scoped run
  await assert.rejects(readFile(path.join(root, ".sherlock/units.json"), "utf8"), /ENOENT/);
});

test("unit ids are short: <hash>-<name>, not the full kebab path", async () => {
  const root = await repo();
  const code = await cmdPartition({ cwd: root, args: [], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const units = JSON.parse(await readFile(path.join(root, ".sherlock/units.json"), "utf8")).units;
  const auth = units.find((u) => u.path.includes("auth"));
  // id ends with the readable basename and is prefixed by a 6-hex hash
  assert.match(auth.id, /^[0-9a-f]{6}-auth$/);
  // the old long form must NOT appear
  assert.ok(!units.some((u) => u.id === "api-src-auth"), "no full-path kebab id");
});

test("units file records the scope (null for full codebase)", async () => {
  const root = await repo();
  await cmdPartition({ cwd: root, args: [], stdout: { write() {} }, stderr: { write() {} } });
  const full = JSON.parse(await readFile(path.join(root, ".sherlock/units.json"), "utf8"));
  assert.equal(full.scope, null);

  await cmdPartition({ cwd: root, args: ["api/**"], stdout: { write() {} }, stderr: { write() {} } });
  const { unitsFileName } = await import("../src/paths.js");
  const scoped = JSON.parse(await readFile(path.join(root, ".sherlock", unitsFileName("api/**")), "utf8"));
  assert.equal(scoped.scope, "api/**");
});

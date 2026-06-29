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

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdCoverage } from "../src/commands/coverage.js";

async function setup(statusMap) {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-cov-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  await writeFile(path.join(root, ".sherlock/units.json"), JSON.stringify({ units: [{ id: "u1" }, { id: "u2" }] }));
  const dir = path.join(root, "report");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "units-status.json"), JSON.stringify({ units: statusMap }));
  return { root, dir };
}

test("coverage passes when every unit done", async () => {
  const { root, dir } = await setup({ u1: { status: "done" }, u2: { status: "done" } });
  const code = await cmdCoverage({ cwd: root, args: ["--findings", dir], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
});

test("coverage fails on a missing unit and an error unit", async () => {
  const { root, dir } = await setup({ u1: { status: "error" } });
  let err = "";
  const code = await cmdCoverage({ cwd: root, args: ["--findings", dir], stdout: { write() {} }, stderr: { write: (s) => (err += s) } });
  assert.equal(code, 1);
  assert.ok(err.includes("u2"));
  assert.ok(err.includes("u1"));
});

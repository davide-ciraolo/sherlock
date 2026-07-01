import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdInit } from "../src/commands/init.js";

async function withUnits() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-scaf-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  await writeFile(
    path.join(root, ".sherlock/units.json"),
    JSON.stringify({ units: [{ id: "api-src-auth", path: "api/src/auth", tier: "S", files: ["api/src/auth/a.py"], loc: 120 }] }),
  );
  return root;
}

test("init creates report skeleton + seeded coverage table", async () => {
  const root = await withUnits();
  const code = await cmdInit({ cwd: root, args: ["--date", "2026-06-29"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const dir = path.join(root, "docs/reviews/2026-06-29-codebase-review");
  for (const f of ["INVESTIGATION.md", "findings-security.md", "findings-bugs.md", "findings-cleanup.md", "appendix-refuted.md", "coverage.md", "units-status.json"]) {
    await readFile(path.join(dir, f), "utf8");
  }
  // README.md must no longer be produced
  await assert.rejects(readFile(path.join(dir, "README.md"), "utf8"), /ENOENT/);

  const investigation = await readFile(path.join(dir, "INVESTIGATION.md"), "utf8");
  assert.ok(investigation.includes("🕵️"), "header mark");
  assert.ok(investigation.includes("🔴"), "severity legend");
  assert.ok(investigation.includes("The Brief"));
  assert.ok(investigation.includes("Evidence ledger"));
  assert.ok(investigation.includes("The Verdict"));

  const refuted = await readFile(path.join(dir, "appendix-refuted.md"), "utf8");
  assert.ok(refuted.includes("Dismissed leads"));

  const coverage = await readFile(path.join(dir, "coverage.md"), "utf8");
  assert.ok(coverage.includes("api-src-auth"));
  assert.ok(coverage.includes("| S |"));
});

test("scaffold errors clearly when units.json is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-scaf-miss-"));
  let err = "";
  const code = await cmdInit({ cwd: root, args: ["--date", "2026-06-29"], stdout: { write() {} }, stderr: { write: (s) => (err += s) } });
  assert.equal(code, 1);
  assert.ok(/units\.json|partition/i.test(err), "should mention units.json / partition");
});

test("init is scope-aware: scoped units file → scoped report dir", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-init-scope-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  await writeFile(
    path.join(root, ".sherlock/units-api.json"),
    JSON.stringify({ units: [{ id: "api-x", path: "api/x", tier: "S", files: ["api/x/a.py"], loc: 50 }] }),
  );
  const code = await cmdInit({ cwd: root, args: ["api", "--date", "2026-06-29"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const dir = path.join(root, "docs/reviews/2026-06-29-api-review");
  await readFile(path.join(dir, "INVESTIGATION.md"), "utf8"); // throws if missing
  const coverage = await readFile(path.join(dir, "coverage.md"), "utf8");
  assert.ok(coverage.includes("api-x"));
});

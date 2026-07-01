import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdInit } from "../src/commands/init.js";

async function withUnits() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-scaf-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  await writeFile(
    path.join(root, ".sherlock/units.json"),
    JSON.stringify({ scope: null, units: [{ id: "aaa111-auth", path: "api/src/auth", tier: "S", files: ["api/src/auth/a.py"], loc: 120 }] }),
  );
  return root;
}

const ABSENT = ["INVESTIGATION.md", "findings-security.md", "findings-bugs.md", "findings-cleanup.md", "appendix-refuted.md", "units-status.json", "README.md"];

test("init creates only the report dir + coverage.md, no content skeletons", async () => {
  const root = await withUnits();
  const code = await cmdInit({ cwd: root, args: ["--date", "2026-06-29"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const dir = path.join(root, "docs/reviews/2026-06-29-codebase-review");

  // coverage.md exists and lists the unit's id AND path + tier
  const coverage = await readFile(path.join(dir, "coverage.md"), "utf8");
  assert.ok(coverage.includes("aaa111-auth"), "shows the short unit id");
  assert.ok(coverage.includes("api/src/auth"), "shows the readable path");
  assert.ok(coverage.includes("| S |"), "shows the tier");

  // none of the content-bearing files (or units-status.json) are pre-created
  for (const f of ABSENT) {
    await assert.rejects(access(path.join(dir, f)), /ENOENT/, `${f} must NOT be scaffolded`);
  }
});

test("init errors clearly when the units file is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-scaf-miss-"));
  let err = "";
  const code = await cmdInit({ cwd: root, args: ["--date", "2026-06-29"], stdout: { write() {} }, stderr: { write: (s) => (err += s) } });
  assert.equal(code, 1);
  assert.ok(/units\.json|partition/i.test(err), "should mention units.json / partition");
});

test("init is scope-aware: scoped units file → scoped report dir", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-init-scope-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  const { unitsFileName, reportDirName } = await import("../src/paths.js");
  await writeFile(
    path.join(root, ".sherlock", unitsFileName("api")),
    JSON.stringify({ scope: "api", units: [{ id: "bbb222-x", path: "api/x", tier: "S", files: ["api/x/a.py"], loc: 50 }] }),
  );
  const code = await cmdInit({ cwd: root, args: ["api", "--date", "2026-06-29"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const dir = path.join(root, "docs/reviews", reportDirName("2026-06-29", "api"));
  const coverage = await readFile(path.join(dir, "coverage.md"), "utf8"); // throws if missing
  assert.ok(coverage.includes("bbb222-x"));
  assert.ok(coverage.includes("api/x"));
});

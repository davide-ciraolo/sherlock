import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdScaffold } from "../src/commands/scaffold.js";

async function withUnits() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-scaf-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  await writeFile(
    path.join(root, ".sherlock/units.json"),
    JSON.stringify({ units: [{ id: "api-src-auth", path: "api/src/auth", tier: "S", files: ["api/src/auth/a.py"], loc: 120 }] }),
  );
  return root;
}

test("scaffold creates report skeleton + seeded coverage table", async () => {
  const root = await withUnits();
  const code = await cmdScaffold({ cwd: root, args: ["--date", "2026-06-29"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const dir = path.join(root, "docs/reviews/2026-06-29-codebase-review");
  for (const f of ["README.md", "findings-security.md", "findings-bugs.md", "findings-cleanup.md", "appendix-refuted.md", "coverage.md", "units-status.json"]) {
    await readFile(path.join(dir, f), "utf8");
  }
  const coverage = await readFile(path.join(dir, "coverage.md"), "utf8");
  assert.ok(coverage.includes("api-src-auth"));
  assert.ok(coverage.includes("| S |"));
});

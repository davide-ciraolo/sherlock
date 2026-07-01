import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdInvestigate } from "../src/commands/investigate.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-inv-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src/a.js"), "x\n".repeat(20));
  await writeFile(path.join(root, "src/b.js"), "y\n".repeat(20));
  await writeFile(path.join(root, "sherlock.config.yml"), 'tiers:\n  S: []\n  A: []\n  B:\n    - "**"\n');
  return root;
}
function capture() {
  const sink = { out: "" };
  return { sink, stdout: { write: (s) => (sink.out += s) }, stderr: { write() {} } };
}

test("investigate preps state and prints a plan with a recommendation", async () => {
  const root = await repo();
  const { sink, stdout, stderr } = capture();
  const code = await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout, stderr });
  assert.equal(code, 0);
  await access(path.join(root, ".sherlock/units.json"));
  await access(path.join(root, "docs/reviews/2026-06-30-codebase-review/coverage.md"));
  assert.ok(sink.out.includes("Investigation Plan"));
  assert.ok(sink.out.includes("Recommended mode:"));
  assert.ok(sink.out.includes("inline < agents < workflow"));
  assert.ok(sink.out.includes("Claude Code plan"));
  assert.ok(sink.out.includes("Available lenses:"));
  assert.ok(sink.out.includes("security"));
  assert.ok(sink.out.includes("Next steps"));
  assert.ok(sink.out.includes("coverage --findings"));
});

test("investigate reuses an existing units cache on a second run", async () => {
  const root = await repo();
  const first = capture();
  await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout: first.stdout, stderr: first.stderr });
  const second = capture();
  await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout: second.stdout, stderr: second.stderr });
  assert.ok(second.sink.out.includes("(reused cache)"));
});

test("investigate scoped run is keyed and emits --units in the coverage command", async () => {
  const root = await repo();
  const { sink, stdout, stderr } = capture();
  const code = await cmdInvestigate({ cwd: root, args: ["src/**", "--date", "2026-06-30"], stdout, stderr });
  assert.equal(code, 0);
  const { unitsFileName, reportDirName } = await import("../src/paths.js");
  const unitsFile = unitsFileName("src/**");
  await access(path.join(root, ".sherlock", unitsFile));
  await access(path.join(root, "docs/reviews", reportDirName("2026-06-30", "src/**"), "coverage.md"));
  assert.ok(sink.out.includes(`--units .sherlock/${unitsFile}`));
});

test("investigate echoes provided --mode instead of asking", async () => {
  const root = await repo();
  const { sink, stdout, stderr } = capture();
  await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30", "--mode", "workflow"], stdout, stderr });
  assert.ok(sink.out.includes("Mode: workflow (provided)"));
});

test("investigate does not re-init an existing report (guard on a file init writes)", async () => {
  const root = await repo();
  const first = capture();
  await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout: first.stdout, stderr: first.stderr });
  const covPath = path.join(root, "docs/reviews/2026-06-30-codebase-review/coverage.md");
  // simulate work already written into the report dir
  await writeFile(covPath, "SENTINEL — do not clobber\n");
  const second = capture();
  await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout: second.stdout, stderr: second.stderr });
  const after = await readFile(covPath, "utf8");
  assert.ok(after.includes("SENTINEL"), "existing report must be reused, not re-initialized");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveRules, GENERAL_BUCKETS } from "../src/rules.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-rules-"));
  for (const b of ["common", "python", "typescript", "project"]) {
    await mkdir(path.join(root, ".claude/rules", b), { recursive: true });
    await writeFile(path.join(root, ".claude/rules", b, "r.md"), `# ${b}\n`);
  }
  const skill = await mkdtemp(path.join(tmpdir(), "sherlock-skill-"));
  await mkdir(path.join(skill, "rules/standard"), { recursive: true });
  await writeFile(path.join(skill, "rules/standard/owasp.md"), "# owasp\n");
  return { root, skill };
}

test("standard is general-only; project-specific bucket never auto-included", async () => {
  const { root, skill } = await repo();
  const r = await resolveRules(root, { rules: { project: [] } }, skill);
  assert.ok(r.standard.some((f) => f.includes("owasp.md")));
  assert.ok(r.projectGeneral.every((f) => GENERAL_BUCKETS.some((b) => f.includes(`/${b}/`))));
  assert.ok(!r.projectGeneral.some((f) => f.includes("/project/")));
  assert.deepEqual(r.projectSpecific, []);
});

test("project-specific bucket enters projectSpecific only when explicitly configured", async () => {
  const { root, skill } = await repo();
  const r = await resolveRules(root, { rules: { project: [".claude/rules/project"] } }, skill);
  assert.ok(r.projectSpecific.some((f) => f.includes("/project/r.md")));
});

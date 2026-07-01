import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("workflow declares meta with the four phases", async () => {
  const src = await readFile(path.join(root, "workflow/sherlock.workflow.js"), "utf8");
  assert.ok(src.includes("export const meta"));
  for (const phase of ["Partition", "Review", "Verify", "Synthesize"]) {
    assert.ok(src.includes(`'${phase}'`) || src.includes(`"${phase}"`), `mentions ${phase}`);
  }
  assert.ok(src.includes("verification_class"));
});

test("synthesize prompt follows the report style guide", async () => {
  const src = await readFile(path.join(root, "workflow/sherlock.workflow.js"), "utf8");
  assert.ok(src.includes("report-style.md"), "synthesize references the style guide");
  for (const s of ["The Brief", "Evidence ledger", "The Verdict"]) {
    assert.ok(src.includes(s), `synthesize prompt names ${s}`);
  }
});

test("workflow never instructs an unscoped init (would scaffold the full-codebase folder)", async () => {
  const src = await readFile(path.join(root, "workflow/sherlock.workflow.js"), "utf8");
  // the old buggy comment ran `init --date <date>` with no scope
  assert.ok(!/init --date/.test(src), "no unscoped `init --date` in the orchestration comment");
  // any init reference must be scoped
  assert.ok(!/cli\.js init\b(?! <scope>)/.test(src), "init references must carry <scope>");
});

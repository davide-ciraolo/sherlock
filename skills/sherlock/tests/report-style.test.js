import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("report-style.md ships the canonical palette and arc", async () => {
  const md = await readFile(path.join(root, "investigation", "report-style.md"), "utf8");
  // severity + verdict emoji
  for (const e of ["🔴", "🟠", "🟡", "🟢", "✅", "🚫"]) {
    assert.ok(md.includes(e), `palette must include ${e}`);
  }
  // marks + section icons
  for (const e of ["🕵️", "🔍", "🗂️", "🧾", "🧠", "⚖️", "🔧"]) {
    assert.ok(md.includes(e), `palette must include ${e}`);
  }
  // arc section names
  for (const s of ["The Brief", "Evidence ledger", "The Verdict"]) {
    assert.ok(md.includes(s), `must name section ${s}`);
  }
  // case-file labels
  for (const s of ["Observation", "Deduction", "Verdict", "Remedy"]) {
    assert.ok(md.includes(s), `must name case-file line ${s}`);
  }
});

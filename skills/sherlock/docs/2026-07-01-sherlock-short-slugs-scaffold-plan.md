# Sherlock — Short Slugs, No-Skeleton Scaffold, Scope-Safe Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sherlock's review/unit names short and path-decoupled, stop `init` from
scaffolding placeholder report files (which forced a read-before-write), and stop a scoped
review from also scaffolding the full-codebase report folder.

**Architecture:** Names become `<short-hash>-<short-name>` derived deterministically from
the posix path (`sha256` prefix + capped kebab basename); the authoritative path lives in
file content (`scope` field in the units file, `path` on each unit, the `· <scope> ·`
header in `INVESTIGATION.md`, and a new `Path` column in `coverage.md`). `init` creates
only the report dir + `coverage.md`; Claude writes the content-bearing report files fresh
with `Write`. Workflow-mode orchestration no longer runs an unscoped `init`.

**Tech Stack:** Node.js ≥18 ESM, `node --test` (built-in test runner), `node:crypto` for
hashing. All paths below are relative to the skill root
`skills/sherlock/` (the working directory for `npm test`).

**Spec:** [`docs/2026-07-01-sherlock-short-slugs-scaffold-design.md`](2026-07-01-sherlock-short-slugs-scaffold-design.md)

**Refinement vs spec §3.2:** `coverage.md` **adds** a `Path` column while keeping the
`Unit` (id) column, rather than replacing the id with the path. Reason: bin-packed chunks
of one directory share a path but differ only by id, so keeping both avoids ambiguous rows
while still surfacing the human-readable path. This is a strict superset of the spec intent
("read the path from content").

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/paths.js` | Derive slugs / file+dir names from a scope | Add `shortHash`, `shortName`, `scopeToken`; rewrite `scopeSlug`/`unitsFileName`/`reportDirName` |
| `src/commands/partition.js` | Walk repo → units file | Unit id via shared helper; write top-level `scope` field |
| `src/commands/init.js` | Scaffold the report dir | Create only dir + `coverage.md` (with `Path` column); stop writing the 5 content files |
| `src/commands/investigate.js` | Prep + plan | Init-guard tests `coverage.md` instead of `INVESTIGATION.md` |
| `workflow/sherlock.workflow.js` | Workflow-mode orchestration | Fix Partition-phase comment: no unscoped `init` |
| `SKILL.md` | Agent entry point | Step 4: report files created fresh with `Write` |
| `tests/*.test.js` | Coverage of the above | Updated assertions + new scope-safety assertions |

---

## Task 1: Short, deterministic name helpers in `src/paths.js`

**Files:**
- Modify: `src/paths.js`
- Test: `tests/paths.test.js`

- [ ] **Step 1: Rewrite the test to assert the new scheme**

Replace the entire contents of `tests/paths.test.js` with:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { scopeSlug, unitsFileName, reportDirName, shortHash, shortName, scopeToken } from "../src/paths.js";

const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 6);

test("shortHash: first 6 hex of sha256, deterministic", () => {
  assert.equal(shortHash("api/src/auth"), h("api/src/auth"));
  assert.match(shortHash("anything"), /^[0-9a-f]{6}$/);
  assert.equal(shortHash("x"), shortHash("x"));
});

test("shortName: kebab of the last real path segment, glob/root stripped", () => {
  assert.equal(shortName("api/src/agents/coordinator"), "coordinator");
  assert.equal(shortName("src/auth"), "auth");
  assert.equal(shortName("api/**"), "api");
  assert.equal(shortName("."), "");
});

test("shortName: caps very long segments at 24 chars", () => {
  const long = "a".repeat(50);
  assert.equal(shortName(long).length, 24);
});

test("scopeToken: hash-name when a name exists, hash-only otherwise", () => {
  assert.equal(scopeToken("src/auth"), `${h("src/auth")}-auth`);
  assert.equal(scopeToken("."), h("."));
});

test("scopeSlug: full repo vs scoped", () => {
  assert.equal(scopeSlug(undefined), "codebase");
  assert.equal(scopeSlug("src/auth"), `${h("src/auth")}-auth`);
  assert.equal(scopeSlug("api/**"), `${h("api/**")}-api`);
});

test("unitsFileName: full uses units.json, scoped is hash-keyed", () => {
  assert.equal(unitsFileName(undefined), "units.json");
  assert.equal(unitsFileName("src/auth"), `units-${h("src/auth")}-auth.json`);
});

test("reportDirName: full uses codebase, scoped is hash-keyed", () => {
  assert.equal(reportDirName("2026-06-30", undefined), "2026-06-30-codebase-review");
  assert.equal(reportDirName("2026-06-30", "src/auth"), `2026-06-30-${h("src/auth")}-auth-review`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/paths.test.js`
Expected: FAIL — `shortHash`/`shortName`/`scopeToken` are not exported; `scopeSlug("src/auth")` still returns `"src-auth"`.

- [ ] **Step 3: Implement the helpers**

Replace the entire contents of `src/paths.js` with:

```javascript
import path from "node:path";
import { createHash } from "node:crypto";
import { kebab } from "./kebab.js";

const NAME_CAP = 24;

export function toPosix(p) {
  return p.split(path.sep).join("/").split("\\").join("/");
}

export function relPosix(root, abs) {
  return toPosix(path.relative(root, abs));
}

// First 6 hex of sha256 of the (posix) path string. Deterministic across runs so the
// .sherlock/ cache and cross-run diffs stay stable; collision-safe for a review's small N.
export function shortHash(s) {
  return createHash("sha256").update(String(s)).digest("hex").slice(0, 6);
}

// kebab of the last "real" path segment (glob wildcards, ".", and empties stripped),
// capped so a pathological directory name can't blow up the slug. Human hint only.
export function shortName(s) {
  const segs = String(s)
    .split(/[\\/]+/)
    .filter((x) => x && x !== "." && x !== "*" && x !== "**");
  const base = segs.length ? segs[segs.length - 1] : "";
  return kebab(base).slice(0, NAME_CAP);
}

// Combined short identifier for a path: "<hash>-<name>", or "<hash>" when no name.
export function scopeToken(s) {
  const name = shortName(s);
  return name ? `${shortHash(s)}-${name}` : shortHash(s);
}

export function scopeSlug(scope) {
  return scope ? scopeToken(scope) : "codebase";
}

export function unitsFileName(scope) {
  return scope ? `units-${scopeToken(scope)}.json` : "units.json";
}

export function reportDirName(date, scope) {
  return `${date}-${scopeSlug(scope)}-review`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/paths.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/paths.js tests/paths.test.js
git commit -m "feat(sherlock): short hash-based slugs decoupled from path"
```

---

## Task 2: Short unit ids + `scope` field in `src/commands/partition.js`

**Files:**
- Modify: `src/commands/partition.js`
- Test: `tests/partition.test.js`

- [ ] **Step 1: Extend the partition test**

In `tests/partition.test.js`, add these two tests at the end of the file (after the
existing `scoped partition writes a scope-keyed units file` test):

```javascript
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
```

Also update the existing `scoped partition writes a scope-keyed units file` test so it no
longer hardcodes `units-api.json`. Replace its body with:

```javascript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/partition.test.js`
Expected: FAIL — unit id is still `api-src-auth`; the units file has no `scope` field.

- [ ] **Step 3: Implement short ids + scope field**

In `src/commands/partition.js`:

Change the import line 7 from:

```javascript
import { kebab } from "../kebab.js";
```

to:

```javascript
import { shortHash, shortName } from "../paths.js";
```

Add this helper just below the `TIER_RANK` constant (after line 10):

```javascript
function unitId(pathKey) {
  const name = shortName(pathKey);
  return name ? `${shortHash(pathKey)}-${name}` : shortHash(pathKey);
}
```

In `unitsForGroup`, replace the three `kebab(pathKey)` usages with `unitId(pathKey)`:
- line 27: `if (total <= maxLoc) return [makeUnit(unitId(pathKey), pathKey, members)];`
- line 43: `if (chunks.length === 1) return [makeUnit(unitId(pathKey), pathKey, chunks[0])];`
- line 44: `return chunks.map((ms, i) => makeUnit(`${unitId(pathKey)}-${i + 1}`, pathKey, ms));`

Finally, write the `scope` field. Replace the `writeFile` call (line 71) that writes the
units file:

```javascript
  await writeFile(path.join(stateDir, unitsFileName(scope)), JSON.stringify({ units }, null, 2));
```

with:

```javascript
  await writeFile(
    path.join(stateDir, unitsFileName(scope)),
    JSON.stringify({ scope: scope ?? null, units }, null, 2),
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/partition.test.js`
Expected: PASS (all partition tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/commands/partition.js tests/partition.test.js
git commit -m "feat(sherlock): short unit ids + scope field in units file"
```

---

## Task 3: `init` stops scaffolding content files

**Files:**
- Modify: `src/commands/init.js`
- Test: `tests/init-cmd.test.js`

- [ ] **Step 1: Rewrite the init test**

Replace the entire contents of `tests/init-cmd.test.js` with:

```javascript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/init-cmd.test.js`
Expected: FAIL — `INVESTIGATION.md`, `units-status.json`, etc. are still created (the
`assert.rejects` on their `access` fails), and `coverage.md` lacks the path column.

- [ ] **Step 3: Trim `init` to dir + coverage.md**

Replace the entire contents of `src/commands/init.js` with:

```javascript
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { flag, scopeArg } from "../args.js";
import { unitsFileName, reportDirName } from "../paths.js";
import { today } from "../clock.js";

export async function cmdInit({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;

  const scope = scopeArg(args);

  const unitsFile = unitsFileName(scope);
  let units;
  try {
    ({ units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, unitsFile), "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") {
      stderr.write(`init: ${config.stateDir}/${unitsFile} not found — run 'partition${scope ? " " + scope : ""}' first\n`);
      return 1;
    }
    throw e;
  }

  const dir = path.join(cwd, out, reportDirName(date, scope));
  await mkdir(dir, { recursive: true });

  // coverage.md is the only file init writes. Claude never edits it, so there is no
  // read-before-write friction. The content-bearing report files (INVESTIGATION.md,
  // findings-*.md, appendix-refuted.md) and units-status.json are written fresh by
  // Claude at synthesis — a Write on a non-existent file needs no prior Read.
  const rows = units
    .map((u) => `| ${u.id} | ${u.path} | ${u.tier} | ${u.loc} | | pending |`)
    .join("\n");
  const coverage = `# Coverage\n\n| Unit | Path | Tier | LOC | Lenses run | Status |\n|---|---|---|---|---|---|\n${rows}\n`;
  await writeFile(path.join(dir, "coverage.md"), coverage);

  stdout.write(`initialized report at ${path.relative(cwd, dir)}\n`);
  return 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/init-cmd.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.js tests/init-cmd.test.js
git commit -m "feat(sherlock): init scaffolds only dir + coverage.md (no read-before-write)"
```

---

## Task 4: `investigate` init-guard tests `coverage.md`

**Files:**
- Modify: `src/commands/investigate.js`
- Test: `tests/investigate.test.js`

- [ ] **Step 1: Update the investigate tests to the new artifacts**

In `tests/investigate.test.js`, update the two file-existence assertions.

In the first test (`investigate preps state and prints a plan…`), replace line 27:

```javascript
  await access(path.join(root, "docs/reviews/2026-06-30-codebase-review/INVESTIGATION.md"));
```

with:

```javascript
  await access(path.join(root, "docs/reviews/2026-06-30-codebase-review/coverage.md"));
```

In the scoped test (`investigate scoped run is keyed…`), replace its body's assertions
(the two `access` calls + the `--units` assertion, lines 51-54) with:

```javascript
  const { unitsFileName, reportDirName } = await import("../src/paths.js");
  const unitsFile = unitsFileName("src/**");
  await access(path.join(root, ".sherlock", unitsFile));
  await access(path.join(root, "docs/reviews", reportDirName("2026-06-30", "src/**"), "coverage.md"));
  assert.ok(sink.out.includes(`--units .sherlock/${unitsFile}`));
```

Then add this new test at the end of the file — it is the true RED for the guard change
(with the guard still keyed to the no-longer-written `INVESTIGATION.md`, `init` re-runs on
every call and clobbers the report dir):

```javascript
import { readFile } from "node:fs/promises";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/investigate.test.js`
Expected: FAIL — the new reuse test fails: the guard tests `INVESTIGATION.md` (never
written anymore), so `init` re-runs on the second call and overwrites the `SENTINEL`
`coverage.md`.

- [ ] **Step 3: Switch the guard to `coverage.md`**

In `src/commands/investigate.js`, replace line 50:

```javascript
  if (!(await exists(path.join(reportDir, "INVESTIGATION.md")))) {
```

with:

```javascript
  if (!(await exists(path.join(reportDir, "coverage.md")))) {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/investigate.test.js`
Expected: PASS (5 tests) — including the new reuse test: with the guard on `coverage.md`,
the second run finds the report already initialized and leaves the `SENTINEL` intact.

- [ ] **Step 5: Commit**

```bash
git add src/commands/investigate.js tests/investigate.test.js
git commit -m "fix(sherlock): investigate init-guard checks coverage.md"
```

---

## Task 5: Scope-safe workflow comment + SKILL.md write-fresh note

**Files:**
- Modify: `workflow/sherlock.workflow.js`
- Modify: `SKILL.md`
- Test: `tests/workflow-meta.test.js`

- [ ] **Step 1: Add a scope-safety assertion to the workflow test**

In `tests/workflow-meta.test.js`, add this test at the end of the file:

```javascript
test("workflow never instructs an unscoped init (would scaffold the full-codebase folder)", async () => {
  const src = await readFile(path.join(root, "workflow/sherlock.workflow.js"), "utf8");
  // the old buggy comment ran `init --date <date>` with no scope
  assert.ok(!/init --date/.test(src), "no unscoped `init --date` in the orchestration comment");
  // any init reference must be scoped
  assert.ok(!/cli\.js init(?! <scope>)/.test(src), "init references must carry <scope>");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/workflow-meta.test.js`
Expected: FAIL — the comment `//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js init --date <date>` matches `/init --date/`.

- [ ] **Step 3: Rewrite the Partition-phase comment**

In `workflow/sherlock.workflow.js`, replace the comment block (lines 22-29):

```javascript
phase('Partition')
log('Sherlock: partitioning + scaffolding (deterministic CLI)')
// The orchestrator (you) runs these Bash steps before/within the workflow:
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js partition <scope>
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js init --date <date>
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js rules        (resolve rule context)
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js lenses --select <lenses>
// units.json, the resolved lens set, and the rule context are passed via args.
```

with:

```javascript
phase('Partition')
log('Sherlock: partitioning + scaffolding (deterministic CLI)')
// `investigate <scope>` has ALREADY done the scoped prep (partition + init) before this
// workflow runs — it wrote the scope-keyed units file and the scope-named report dir.
// Do NOT run a bare `init` here: an unscoped init scaffolds the full-codebase report
// folder alongside the scoped one. If you invoke the CLI manually, always pass the scope:
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js partition <scope>
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js init <scope> --date <date>
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js rules        (resolve rule context)
//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js lenses --select <lenses>
// units (the resolved units array), the lens set, and the rule context are passed via args.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/workflow-meta.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Update SKILL.md — report files are written fresh; workflow prep is scoped**

In `SKILL.md`, replace step 4 (the "Write results" paragraph, lines 51-56) with:

```markdown
4. **Write results** into the report files, following the report style guide
   [`investigation/report-style.md`](investigation/report-style.md). `init` scaffolds only
   `coverage.md` — the content-bearing files do **not** exist yet, so **create each one
   fresh with `Write`** (a `Write` on a non-existent file needs no prior `Read`): the
   synthesized `summary` becomes `INVESTIGATION.md` (🗂️ The Brief → 🧾 Evidence ledger →
   ⚖️ The Verdict); write each kept finding as a case-file (Observation → 🧠 Deduction →
   ⚖️ Verdict → 🔧 Remedy) into the matching `findings-*.md`; write dismissed leads into
   `appendix-refuted.md`; write `units-status.json` (before running `coverage`).
```

Then, in the **workflow** bullet of step 3 (lines 45-49), append this sentence to the end
of that bullet:

```markdown
     The scoped prep (partition + init) is already done by `investigate` — never run an
     unscoped `init`, which would scaffold the full-codebase report folder.
```

- [ ] **Step 6: Run the SKILL.md + workflow tests**

Run: `node --test tests/skill-md.test.js tests/workflow-meta.test.js`
Expected: PASS. (`skill-md.test.js` still finds `INVESTIGATION.md` and `report-style.md`
in step 4, plus all six command names and the three modes.)

- [ ] **Step 7: Commit**

```bash
git add workflow/sherlock.workflow.js SKILL.md tests/workflow-meta.test.js
git commit -m "fix(sherlock): scope-safe workflow prep; write report files fresh"
```

---

## Task 6: Full suite + docs sync

**Files:**
- Modify: `docs/2026-06-30-sherlock-init-investigate-design.md` (naming note), if needed
- Test: entire suite

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all test files green (paths, partition, init-cmd, investigate, coverage,
workflow-meta, skill-md, and the untouched suites).

- [ ] **Step 2: Fix any fallout**

If any previously-passing test asserts an old name (e.g. a hardcoded `units-<kebab>.json`
or `INVESTIGATION.md` scaffold), update it to use the `paths.js` helpers or the new
artifact, matching the patterns established in Tasks 1-5. Re-run `npm test` until green.

- [ ] **Step 3: Sync the prior design doc's naming line (docs accuracy)**

In `docs/2026-06-30-sherlock-init-investigate-design.md` §5.0, the line
`a scoped path/glob → .sherlock/units-<scope-slug>.json (slug = kebab(scope))` is now
stale. Update the parenthetical to:
`(slug = <shorthash>-<name>; see 2026-07-01-sherlock-short-slugs-scaffold-design.md)`.
Leave the rest of that historical doc unchanged.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test(sherlock): green suite for short slugs + no-skeleton scaffold; doc sync"
```

---

## Self-Review

- **Spec §3 (short names):** Tasks 1 (helpers) + 2 (unit ids + `scope` field). ✅
- **Spec §3.2 (path from content):** `scope` field (Task 2), `path` column in `coverage.md`
  (Task 3), `INVESTIGATION.md` header already carries `· <scope> ·` (unchanged). ✅
- **Spec §4 (no skeleton):** Task 3 (`init` trimmed) + Task 4 (guard on `coverage.md`) +
  Task 5 Step 5 (SKILL.md write-fresh note). ✅
- **Spec §5 (scope-safe workflow):** Task 5 (workflow comment + SKILL.md workflow bullet +
  test). ✅
- **Spec §6 invariants:** determinism asserted in Task 1; coverage still compares ids
  (Task 3 keeps the `Unit` id column; `coverage.js` untouched); workflow fan-out logic
  untouched. ✅
- **Type/name consistency:** `shortHash`/`shortName`/`scopeToken`/`scopeSlug`/
  `unitsFileName`/`reportDirName` used with identical signatures across `paths.js`,
  `partition.js`, `init.js`, and all tests. `unitId(pathKey)` local to `partition.js`. ✅
- **Placeholder scan:** none — every step shows full code or an exact command + expected
  result. ✅
```

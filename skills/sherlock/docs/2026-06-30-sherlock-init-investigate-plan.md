# Sherlock `init` + `investigate` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `scaffold` CLI command to `init`, and add an `investigate` command + skill flow that reuses a scope-keyed partition cache, recommends an execution mode (inline/agents/workflow) from project structure, and prints the plan Claude follows.

**Architecture:** The deterministic Node CLI gains scope-keyed units caching (`.sherlock/units.json` full, `.sherlock/units-<slug>.json` scoped) and a new `investigate` command that does reuse-first prep + prints an Investigation Plan. Claude (per `SKILL.md`) does the interactive asking and executes the chosen mode. `investigate` never prompts or spawns agents.

**Tech Stack:** Node.js ≥18 ES modules, built-in `node --test`, `picomatch`, `js-yaml`. No new dependencies.

**Spec:** `skills/sherlock/docs/2026-06-30-sherlock-init-investigate-design.md`

---

## Working directory & conventions

- **Package dir** (run all `node`/`npm`/test commands here): `<repo>/skills/sherlock/` where `<repo>` = the sherlock checkout root. All file paths below are **relative to this package dir**.
- **Git** runs from anywhere in the repo; `git add` paths are written repo-relative (`skills/sherlock/...`). Commits are pre-authorized per the chosen branch.
- **Run one test file:** `node --test tests/<file>.test.js`
- **Run all tests:** `npm test`
- Tests resolve the package dir as `path.dirname(path.dirname(fileURLToPath(import.meta.url)))`.
- Slug helper: `kebab()` already exists (`src/kebab.js`): `kebab("src/auth") === "src-auth"`, `kebab("api/**") === "api"`.

## File Structure

| File | Responsibility |
|---|---|
| `src/paths.js` (modify) | Add `scopeSlug`, `unitsFileName`, `reportDirName` helpers (scope → filenames). |
| `src/recommend.js` (new) | Pure `recommendMode(stats)` heuristic + threshold constants. |
| `src/commands/partition.js` (modify) | Write the scope-keyed units file. |
| `src/commands/coverage.js` (modify) | Add `--units <file>` flag (default `.sherlock/units.json`). |
| `src/commands/init.js` (renamed from `scaffold.js`) | `cmdInit`; scope-aware units read + report-dir naming. |
| `src/commands/investigate.js` (new) | `cmdInvestigate`: reuse-first prep, recommendation, plan output. |
| `bin/cli.js` (modify) | `scaffold`→`init`; add `investigate`. |
| `workflow/sherlock.workflow.js` (modify) | Comment `scaffold`→`init`. |
| `SKILL.md` (modify) | Rewrite around `investigate` + three modes. |
| `README.md` (repo root, modify) | Command table + CLI block + flow. |
| Tests | rename + new (`paths`, `recommend`, `investigate`) + updates. |

---

## Task 1: `src/paths.js` scope helpers

**Files:**
- Modify: `src/paths.js`
- Test: `tests/paths.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/paths.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeSlug, unitsFileName, reportDirName } from "../src/paths.js";

test("scopeSlug: full repo vs scoped", () => {
  assert.equal(scopeSlug(undefined), "codebase");
  assert.equal(scopeSlug("src/auth"), "src-auth");
  assert.equal(scopeSlug("api/**"), "api");
});

test("unitsFileName: full uses units.json, scoped is keyed", () => {
  assert.equal(unitsFileName(undefined), "units.json");
  assert.equal(unitsFileName("src/auth"), "units-src-auth.json");
});

test("reportDirName: full uses codebase, scoped is keyed", () => {
  assert.equal(reportDirName("2026-06-30", undefined), "2026-06-30-codebase-review");
  assert.equal(reportDirName("2026-06-30", "src/auth"), "2026-06-30-src-auth-review");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/paths.test.js`
Expected: FAIL — `scopeSlug`/`unitsFileName`/`reportDirName` are not exported.

- [ ] **Step 3: Add the helpers to `src/paths.js`**

Add the import at the top (after the existing `import path from "node:path";`) and the three helpers at the end of the file:

```javascript
import { kebab } from "./kebab.js";

export function scopeSlug(scope) {
  return scope ? kebab(scope) : "codebase";
}

export function unitsFileName(scope) {
  return scope ? `units-${kebab(scope)}.json` : "units.json";
}

export function reportDirName(date, scope) {
  return `${date}-${scopeSlug(scope)}-review`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/paths.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/paths.js skills/sherlock/tests/paths.test.js
git commit -m "feat(sherlock): scope-keyed path helpers (units file + report dir)"
```

---

## Task 2: `src/recommend.js` heuristic

**Files:**
- Create: `src/recommend.js`
- Test: `tests/recommend.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/recommend.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendMode } from "../src/recommend.js";

test("small scope, no S-tier → inline", () => {
  assert.equal(recommendMode({ unitCount: 3, tiers: { S: 0, A: 0, B: 3 }, totalLoc: 100 }).mode, "inline");
});

test("moderate scope → agents", () => {
  assert.equal(recommendMode({ unitCount: 10, tiers: { S: 0, A: 2, B: 8 }, totalLoc: 5000 }).mode, "agents");
  assert.equal(recommendMode({ unitCount: 20, tiers: { S: 0, A: 0, B: 20 }, totalLoc: 5000 }).mode, "agents");
});

test("any S-tier → workflow", () => {
  assert.equal(recommendMode({ unitCount: 2, tiers: { S: 1, A: 0, B: 1 }, totalLoc: 100 }).mode, "workflow");
});

test("large scope (units or loc) → workflow", () => {
  assert.equal(recommendMode({ unitCount: 21, tiers: { S: 0, A: 0, B: 21 }, totalLoc: 5000 }).mode, "workflow");
  assert.equal(recommendMode({ unitCount: 2, tiers: { S: 0, A: 0, B: 2 }, totalLoc: 30000 }).mode, "workflow");
});

test("returns a non-empty reason string", () => {
  const r = recommendMode({ unitCount: 1, tiers: { S: 0, A: 0, B: 1 }, totalLoc: 10 });
  assert.equal(typeof r.reason, "string");
  assert.ok(r.reason.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/recommend.test.js`
Expected: FAIL — module `../src/recommend.js` not found.

- [ ] **Step 3: Create `src/recommend.js`**

```javascript
export const INLINE_MAX_UNITS = 3;
export const AGENTS_MAX_UNITS = 20;
export const LARGE_LOC = 20000;

// Pure recommendation from deterministic partition stats. First match wins.
export function recommendMode({ unitCount, tiers, totalLoc }) {
  const s = (tiers && tiers.S) || 0;
  if (s > 0) {
    return { mode: "workflow", reason: "security-critical (S-tier) code present — maximum rigor" };
  }
  if (unitCount > AGENTS_MAX_UNITS || totalLoc > LARGE_LOC) {
    return { mode: "workflow", reason: "large scope — full fan-out with adversarial panels" };
  }
  if (unitCount <= INLINE_MAX_UNITS) {
    return { mode: "inline", reason: "small scope — cheapest path" };
  }
  return { mode: "agents", reason: "moderate scope — parallel review" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/recommend.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/recommend.js skills/sherlock/tests/recommend.test.js
git commit -m "feat(sherlock): execution-mode recommendation heuristic"
```

---

## Task 3: `partition` writes the scope-keyed units file

**Files:**
- Modify: `src/commands/partition.js`
- Test: `tests/partition.test.js`

- [ ] **Step 1: Add the failing test**

Append this test to `tests/partition.test.js` (keep the existing two tests + the `repo()` helper + imports):

```javascript
test("scoped partition writes a scope-keyed units file", async () => {
  const root = await repo();
  const code = await cmdPartition({ cwd: root, args: ["api/**"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  // scoped file exists, keyed by kebab("api/**") === "api"
  const scoped = JSON.parse(await readFile(path.join(root, ".sherlock/units-api.json"), "utf8"));
  assert.ok(scoped.units.length >= 1);
  // the bare units.json must NOT be created by a scoped run
  await assert.rejects(readFile(path.join(root, ".sherlock/units.json"), "utf8"), /ENOENT/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/partition.test.js`
Expected: FAIL — the new test reads `.sherlock/units-api.json` which doesn't exist (partition still writes `units.json`).

- [ ] **Step 3: Update `src/commands/partition.js`**

Add the import (after the existing `import { kebab } from "../kebab.js";` line — note `kebab` is already imported; add `unitsFileName` from paths):

```javascript
import { unitsFileName } from "../paths.js";
```

Then change the write line. Replace:

```javascript
  await writeFile(path.join(stateDir, "units.json"), JSON.stringify({ units }, null, 2));
```

with:

```javascript
  await writeFile(path.join(stateDir, unitsFileName(scope)), JSON.stringify({ units }, null, 2));
```

(`scope` is already defined earlier in the function as `args.find((a) => !a.startsWith("--"))`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/partition.test.js`
Expected: PASS (3 tests — the two existing no-scope tests still write `units.json`).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/commands/partition.js skills/sherlock/tests/partition.test.js
git commit -m "feat(sherlock): partition writes scope-keyed units file"
```

---

## Task 4: `coverage --units` flag

**Files:**
- Modify: `src/commands/coverage.js`
- Test: `tests/coverage.test.js`

- [ ] **Step 1: Add the failing test**

Append this test to `tests/coverage.test.js` (keep existing tests + `setup` + imports):

```javascript
test("coverage reads a scope-keyed units file via --units", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-cov-units-"));
  await mkdir(path.join(root, ".sherlock"), { recursive: true });
  await writeFile(path.join(root, ".sherlock/units-api.json"), JSON.stringify({ units: [{ id: "a1" }] }));
  const dir = path.join(root, "report");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "units-status.json"), JSON.stringify({ units: { a1: { status: "done" } } }));
  const code = await cmdCoverage({
    cwd: root,
    args: ["--findings", dir, "--units", ".sherlock/units-api.json"],
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/coverage.test.js`
Expected: FAIL — `--units` is ignored, so coverage reads the default `.sherlock/units.json` (missing) and exits 1.

- [ ] **Step 3: Update `src/commands/coverage.js`**

Replace the line that reads `units.json`:

```javascript
  const unitsDoc = await readJson(path.join(cwd, config.stateDir, "units.json"), "units.json (run 'partition' first)", stderr);
```

with (resolve the optional `--units` flag, default to the shared full-repo file):

```javascript
  const unitsArg = flag(args, "--units");
  const unitsPath = unitsArg ? path.resolve(cwd, unitsArg) : path.join(cwd, config.stateDir, "units.json");
  const unitsDoc = await readJson(unitsPath, "units file (run 'partition' first)", stderr);
```

(`flag` is already imported in this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/coverage.test.js`
Expected: PASS (4 tests — the three existing tests use the default path unchanged).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/commands/coverage.js skills/sherlock/tests/coverage.test.js
git commit -m "feat(sherlock): coverage --units flag for scope-keyed reconcile"
```

---

## Task 5: Rename `scaffold` → `init` (atomic, behavior unchanged)

**Files:**
- Rename: `src/commands/scaffold.js` → `src/commands/init.js`
- Modify: `bin/cli.js`, `workflow/sherlock.workflow.js`
- Rename test: `tests/scaffold-cmd.test.js` → `tests/init-cmd.test.js`
- Modify test: `tests/cli.test.js`

- [ ] **Step 1: Rename the command file and its test (preserve history)**

```bash
cd <repo>
git mv skills/sherlock/src/commands/scaffold.js skills/sherlock/src/commands/init.js
git mv skills/sherlock/tests/scaffold-cmd.test.js skills/sherlock/tests/init-cmd.test.js
```

- [ ] **Step 2: Rename the export + internal strings in `src/commands/init.js`**

- Change the function signature line `export async function cmdScaffold({ cwd, args, stdout, stderr }) {` → `export async function cmdInit({ cwd, args, stdout, stderr }) {`
- Change the error string `scaffold: ${config.stateDir}/units.json not found — run 'partition' first` → `init: ${config.stateDir}/units.json not found — run 'partition' first`
- Change the final `stdout.write(\`scaffolded report at ${path.relative(cwd, dir)}\n\`);` → `stdout.write(\`initialized report at ${path.relative(cwd, dir)}\n\`);`

- [ ] **Step 3: Update `tests/init-cmd.test.js`**

- Change the import `import { cmdScaffold } from "../src/commands/scaffold.js";` → `import { cmdInit } from "../src/commands/init.js";`
- Replace both `cmdScaffold(` calls with `cmdInit(`.
- (Leave the assertions, test names, and `withUnits()` helper as-is.)

- [ ] **Step 4: Update `bin/cli.js`**

- Change import `import { cmdScaffold } from "../src/commands/scaffold.js";` → `import { cmdInit } from "../src/commands/init.js";`
- In the `HELP` string, change the line `  scaffold [--date YYYY-MM-DD] [--out <dir>]   create report skeleton + coverage table` → `  init [--date YYYY-MM-DD] [--out <dir>] [path]   create report skeleton + coverage table`
- In `HANDLERS`, change `scaffold: cmdScaffold,` → `init: cmdInit,`

- [ ] **Step 5: Update the `workflow/sherlock.workflow.js` comment**

Change the comment line `//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js scaffold --date <date>` → `//   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js init --date <date>`

- [ ] **Step 6: Update `tests/cli.test.js`**

In the `cli --help lists commands` test, change the array `["partition", "scaffold", "coverage", "lenses", "rules"]` → `["partition", "init", "coverage", "lenses", "rules"]`.

- [ ] **Step 7: Run the affected tests**

Run: `node --test tests/init-cmd.test.js tests/cli.test.js`
Expected: PASS. (`skill-md.test.js` still references `scaffold` and SKILL.md is untouched — both still pass; SKILL.md is rewritten in Task 8.)

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS (all files; nothing else references `cmdScaffold`).

- [ ] **Step 9: Commit**

```bash
git add -A skills/sherlock
git commit -m "refactor(sherlock): rename scaffold command to init"
```

---

## Task 6: `init` becomes scope-aware

**Files:**
- Modify: `src/commands/init.js`
- Test: `tests/init-cmd.test.js`

- [ ] **Step 1: Add the failing test**

Append this test to `tests/init-cmd.test.js` (keep existing tests + `withUnits` helper):

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/init-cmd.test.js`
Expected: FAIL — `init` reads `.sherlock/units.json` (missing here) and writes `…-codebase-review`, so the scoped read fails / the `…-api-review` dir is absent.

- [ ] **Step 3: Update `src/commands/init.js`**

Add the import near the top (after `import { flag } from "../args.js";`):

```javascript
import { unitsFileName, reportDirName } from "../paths.js";
```

Inside `cmdInit`, after `const out = flag(args, "--out") || config.output;`, add:

```javascript
  const scope = args.find((a) => !a.startsWith("--"));
```

Change the units read + error string. Replace:

```javascript
  let units;
  try {
    ({ units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, "units.json"), "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") {
      stderr.write(`init: ${config.stateDir}/units.json not found — run 'partition' first\n`);
      return 1;
    }
    throw e;
  }
```

with:

```javascript
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
```

Change the report-dir line. Replace:

```javascript
  const dir = path.join(cwd, out, `${date}-codebase-review`);
```

with:

```javascript
  const dir = path.join(cwd, out, reportDirName(date, scope));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/init-cmd.test.js`
Expected: PASS (the existing no-scope tests still read `units.json` → `…-codebase-review`; the new scoped test passes).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/commands/init.js skills/sherlock/tests/init-cmd.test.js
git commit -m "feat(sherlock): init reads scope-keyed units + names scoped report dir"
```

---

## Task 7: `investigate` command

**Files:**
- Create: `src/commands/investigate.js`
- Modify: `bin/cli.js`, `tests/cli.test.js`
- Test: `tests/investigate.test.js` (new)

- [ ] **Step 1: Create `src/commands/investigate.js`**

```javascript
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { flag } from "../args.js";
import { unitsFileName, reportDirName } from "../paths.js";
import { recommendMode } from "../recommend.js";
import { listLenses } from "../lenses.js";
import { cmdPartition } from "./partition.js";
import { cmdInit } from "./init.js";

const skillRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const NULL_SINK = { write() {} };

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function cmdInvestigate({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const scope = args.find((a) => !a.startsWith("--"));
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;
  const mode = flag(args, "--mode");
  const lensesSel = flag(args, "--lenses");
  const tiers = flag(args, "--tiers");
  const refresh = args.includes("--refresh");

  const unitsRel = path.join(config.stateDir, unitsFileName(scope));
  const unitsPath = path.join(cwd, unitsRel);
  const reportRel = path.join(out, reportDirName(date, scope));
  const reportDir = path.join(cwd, reportRel);

  // --- reuse-first prep ---
  let reused = false;
  if (refresh || !(await exists(unitsPath))) {
    const code = await cmdPartition({ cwd, args: scope ? [scope] : [], stdout: NULL_SINK, stderr });
    if (code !== 0) return code;
  } else {
    reused = true;
  }
  if (!(await exists(path.join(reportDir, "INVESTIGATION.md")))) {
    const code = await cmdInit({
      cwd,
      args: [scope, "--date", date, "--out", out].filter(Boolean),
      stdout: NULL_SINK,
      stderr,
    });
    if (code !== 0) return code;
  }

  // --- stats ---
  const { units } = JSON.parse(await readFile(unitsPath, "utf8"));
  const tierHist = { S: 0, A: 0, B: 0 };
  let totalLoc = 0;
  for (const u of units) {
    tierHist[u.tier] = (tierHist[u.tier] || 0) + 1;
    totalLoc += u.loc || 0;
  }
  const reco = recommendMode({ unitCount: units.length, tiers: tierHist, totalLoc });

  // --- lens preview ---
  const lensNames = (await listLenses(path.join(skillRoot, "lenses"))).map((l) => l.name);

  const coverageCmd = scope
    ? `coverage --findings ${reportRel} --units ${unitsRel}`
    : `coverage --findings ${reportRel}`;

  const lines = [
    "# 🕵️ Sherlock — Investigation Plan",
    "",
    `Scope: ${scope || "(full codebase)"}`,
    `Units: ${units.length}  (S:${tierHist.S} A:${tierHist.A} B:${tierHist.B})  ·  LOC: ${totalLoc}`,
    `Units file: ${unitsRel} ${reused ? "(reused cache)" : "(freshly partitioned)"}`,
    `Report dir: ${reportRel}`,
    "",
    `Recommended mode: ${reco.mode} — ${reco.reason}`,
    "Token cost & rigor: inline < agents < workflow.",
    "Note: this skill cannot detect your Claude Code plan — weigh the recommendation against your own plan/usage.",
  ];
  if (reused) {
    lines.push(`The units cache was reused; re-run with --refresh (or 'partition ${scope || ""}'.trim()) if the code changed.`);
  }
  lines.push("", `Available lenses: ${lensNames.join(", ")}`, "");
  lines.push("## Next steps (Claude drives these — the CLI does not prompt)");
  lines.push(mode ? `- Mode: ${mode} (provided).` : "- Ask the user to choose a mode (show the recommendation + cost ordering + plan caveat above).");
  lines.push(lensesSel ? `- Lenses: ${lensesSel} (provided).` : "- Ask the user which lenses to apply (default: full tier-resolved set).");
  lines.push(tiers ? `- Tier-application: ${tiers} (provided).` : "- Ask the user: apply all selected lenses to every unit ('all') or follow tier-based applicability ('strict', default).");
  lines.push(`- Execute the chosen mode per SKILL.md, write the persona report into ${reportRel}, then run:`);
  lines.push(`  node \${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js ${coverageCmd}`);

  stdout.write(lines.join("\n") + "\n");
  return 0;
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/investigate.test.js`:

```javascript
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
  // prep happened
  await access(path.join(root, ".sherlock/units.json"));
  await access(path.join(root, "docs/reviews/2026-06-30-codebase-review/INVESTIGATION.md"));
  // plan content
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
  await access(path.join(root, ".sherlock/units-src.json"));
  await access(path.join(root, "docs/reviews/2026-06-30-src-review/INVESTIGATION.md"));
  assert.ok(sink.out.includes("--units .sherlock/units-src.json") || sink.out.includes(path.join(".sherlock", "units-src.json")));
});

test("investigate echoes provided --mode instead of asking", async () => {
  const root = await repo();
  const { sink, stdout, stderr } = capture();
  await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30", "--mode", "workflow"], stdout, stderr });
  assert.ok(sink.out.includes("Mode: workflow (provided)"));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/investigate.test.js`
Expected: FAIL initially only if Step 1 not saved; if Step 1 is saved, this verifies behavior. (Per TDD, if you prefer strict red-first, stub `cmdInvestigate` to `return 1` first, see the test fail, then paste the Step 1 body.)

- [ ] **Step 4: Wire `investigate` into `bin/cli.js`**

- Add import: `import { cmdInvestigate } from "../src/commands/investigate.js";`
- In `HELP`, add this line directly under the `Commands:` header (above `partition`):
  `  investigate [path] [--mode m] [--lenses l] [--tiers strict|all] [--refresh]   prep + recommend + plan`
- In `HANDLERS`, add `investigate: cmdInvestigate,`

- [ ] **Step 5: Update `tests/cli.test.js`**

In the `cli --help lists commands` test, change the array to include investigate:
`["partition", "init", "coverage", "lenses", "rules", "investigate"]`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/investigate.test.js tests/cli.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add skills/sherlock/src/commands/investigate.js skills/sherlock/bin/cli.js skills/sherlock/tests/investigate.test.js skills/sherlock/tests/cli.test.js
git commit -m "feat(sherlock): investigate command (reuse-first prep + mode recommendation)"
```

---

## Task 8: Rewrite `SKILL.md` around `investigate`

**Files:**
- Modify: `SKILL.md`
- Test: `tests/skill-md.test.js`

- [ ] **Step 1: Update the test**

In `tests/skill-md.test.js`:

- In the first test, change the command-list loop array from `["partition", "scaffold", "coverage", "lenses", "rules"]` to `["partition", "init", "coverage", "lenses", "rules", "investigate"]`.
- Append this test:

```javascript
test("SKILL.md documents the three execution modes", async () => {
  const md = await readFile(path.join(root, "SKILL.md"), "utf8");
  for (const m of ["inline", "agents", "workflow"]) assert.ok(md.includes(m), `mentions ${m} mode`);
});
```

(Keep the existing persona test that asserts `INVESTIGATION.md` + `report-style.md`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skill-md.test.js`
Expected: FAIL — `investigate` and the mode names aren't in SKILL.md yet (and `scaffold` was removed from the list).

- [ ] **Step 3: Replace `SKILL.md` with the investigate-centered version**

Write `SKILL.md` (entire file) as:

```markdown
---
name: sherlock
description: Use when the user wants a structured, full or scoped code review/audit of a codebase for security vulnerabilities, bugs, dead code, removable comments, and refactor/cleanliness opportunities — runs risk-tiered investigator "lenses" with adversarial verification and produces a triaged findings report (no code changes). Triggers include "review the codebase", "audit for vulnerabilities", "/sherlock".
---

# Sherlock — Code Investigation

Sherlock reviews a codebase through perspective **lenses** (security, correctness,
dead-code, comments, refactor), **adversarially verifies** every finding, and writes
a **triaged report** (`INVESTIGATION.md` + per-lens case-files) under `docs/reviews/`.
It changes no code.

> **Opt-in / token-intensive.** The review can run as multi-agent orchestration.
> Confirm scope and execution mode with the user before launching a full-repo run.

## Procedure

1. **Prep + recommend (deterministic CLI):**
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js investigate [path-or-glob] [--mode …] [--lenses …] [--tiers strict|all] [--refresh]
   ```
   `investigate` reuses a cached, scope-keyed partition (`.sherlock/units.json` for the
   full repo, `.sherlock/units-<slug>.json` for a scoped path), runs `init` if the report
   skeleton is missing, and prints an **Investigation Plan**: project stats, a recommended
   execution mode, the token-cost ordering, a subscription caveat, the available lenses,
   and the next-step instructions below. Read that plan.

2. **Ask the user** (skip any answer already supplied as a flag):
   1. **Mode** — present the recommendation and the cost/rigor ordering
      `inline < agents < workflow`, plus the caveat that the skill cannot detect the
      user's Claude Code plan.
   2. **Lenses** — which lenses to apply (default: the full tier-resolved set).
   3. **Tier-application** — *apply all selected lenses to every unit* (`all`) **or**
      *follow tier-based applicability* (`strict`, the default — a lens runs only on units
      whose tier is in its `applies_to.tiers`).

3. **Execute the chosen mode:**
   - **inline** — review each unit's files through each applicable lens directly, in this
     conversation, producing candidate findings. For **each** candidate, dispatch one
     **verifier subagent** (refute-by-default, single vote); keep confirmed/uncertain,
     route refuted to the appendix. Cheapest; review is sequential, verification is
     independent.
   - **agents** — dispatch one **reviewer subagent per `(unit × applicable lens)`**
     (parallel), then one **verifier subagent per candidate** (single vote); synthesize.
   - **workflow** — run `${CLAUDE_PLUGIN_ROOT}/skills/sherlock/workflow/sherlock.workflow.js`
     via the Workflow tool, passing `{ units, lenses, rules, date }` as `args` (read
     `units` from the scope's units file). It fans out reviewers, runs **3-vote
     adversarial panels**, and returns `{ kept, refuted, summary }`. Most thorough and
     most token-intensive.

4. **Write results** into the scaffolded report files, following the persona style guide
   [`persona/report-style.md`](persona/report-style.md): the synthesized `summary` becomes
   `INVESTIGATION.md` (🗂️ The Brief → 🧾 Evidence ledger → ⚖️ The Verdict); write each kept
   finding as a case-file (Observation → 🧠 Deduction → ⚖️ Verdict → 🔧 Remedy) into the
   matching `findings-*.md`; write dismissed leads into `appendix-refuted.md`. Fill
   `units-status.json`.

5. **Reconcile coverage:** run the exact command printed in the plan —
   `coverage --findings <report-dir>` (plus `--units .sherlock/units-<slug>.json` for a
   scoped review). A non-zero exit means a unit was missed — do not call the review
   complete.

## Invocation
- `/sherlock` — whole repo; asks mode + lenses + tier-application.
- `/sherlock <path-or-glob>` — scoped to a subtree.
- `/sherlock --mode workflow --lenses security,bugs` — pre-answer the questions; flags are
  forwarded to `investigate`.

## Extending
Add an investigator: copy `lenses/_TEMPLATE.md` to `lenses/<name>.md`. Project-specific
invariants: set `rules.project` in `sherlock.config.yml` (never edit `rules/standard/`,
which stays general — see the design doc §6).

## CLI reference
`investigate` · `partition` · `init` · `coverage` · `lenses` · `rules` — run any with `--help`.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/skill-md.test.js`
Expected: PASS (all three tests — frontmatter+commands, persona references, and the three modes).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/SKILL.md skills/sherlock/tests/skill-md.test.js
git commit -m "docs(sherlock): rewrite SKILL.md around investigate + execution modes"
```

---

## Task 9: Update the repo-root `README.md`

**Files:**
- Modify: `README.md` (repo root — `skills/sherlock/README.md`)

(No test — prose only. Verified by reading.)

- [ ] **Step 1: Update the CLI usage block**

Replace the block (currently lines ~139–144):

```bash
node "$CLI" partition [path-or-glob]   # repo → risk-tiered .sherlock/units.json
node "$CLI" scaffold                   # create the report skeleton + coverage table
node "$CLI" rules                      # resolve standard ∪ project rule overlay
node "$CLI" lenses --select security,bugs   # list / validate the lens selection
# ... run the workflow (review → verify → synthesize) ...
node "$CLI" coverage --findings docs/reviews/<date>-codebase-review   # non-zero exit on any gap
```

with:

```bash
node "$CLI" investigate [path-or-glob]   # reuse-first prep + recommend a mode; prints the plan Claude follows
node "$CLI" partition [path-or-glob]     # repo → risk-tiered .sherlock/units.json (scope-keyed: units-<slug>.json)
node "$CLI" init                         # create the report skeleton + coverage table
node "$CLI" rules                        # resolve standard ∪ project rule overlay
node "$CLI" lenses --select security,bugs   # list / validate the lens selection
# ... run the chosen mode: inline / agents / workflow ...
node "$CLI" coverage --findings docs/reviews/<date>-codebase-review   # non-zero exit on any gap
```

- [ ] **Step 2: Update the "drives the four-phase procedure" sentence (line ~135)**

Change `Claude reads \`SKILL.md\` and drives the four-phase procedure. Or run the deterministic CLI yourself:` → `Claude reads \`SKILL.md\` and drives the investigate flow (it recommends and asks for an execution mode). Or run the deterministic CLI yourself:`

- [ ] **Step 3: Update the Commands table**

In the `## Commands` table, insert an `investigate` row as the first row (above `partition`):

```markdown
| `investigate [path-or-glob] [--mode …] [--lenses …] [--tiers strict|all] [--refresh]` | Reuse-first prep (partition + init), recommend an execution mode from project structure, and print the Investigation Plan + next-step instructions Claude follows. |
```

Replace the `partition` row's trailing `write \`.sherlock/units.json\`.` with `write \`.sherlock/units.json\` (or \`.sherlock/units-<slug>.json\` for a scoped run).`

Replace the `scaffold` row:

```markdown
| `scaffold [--date YYYY-MM-DD] [--out <dir>]` | Create `<out>/<date>-codebase-review/` with the report skeleton and a coverage table seeded from `units.json`. |
```

with:

```markdown
| `init [--date YYYY-MM-DD] [--out <dir>] [path]` | Create `<out>/<date>-<scope>-review/` (full repo → `<date>-codebase-review/`) with the report skeleton and a coverage table seeded from the scope's units file. |
```

Replace the `coverage` row's signature `coverage --findings <report-dir>` with `coverage --findings <report-dir> [--units <file>]`.

- [ ] **Step 4: Update the "How it works" intro (line ~165)**

Change `The review is a four-phase workflow (\`workflow/sherlock.workflow.js\`):` → `The \`workflow\` execution mode is a four-phase pipeline (\`workflow/sherlock.workflow.js\`); the lighter \`inline\` and \`agents\` modes run the same review/verify shape with fewer agents:`

And in phase 0, change `\`partition\` + \`scaffold\` build` → `\`partition\` + \`init\` build`.

- [ ] **Step 5: Verify the edits read correctly**

Run: `grep -n "scaffold" skills/sherlock/README.md` — expect **no matches** (all replaced). Run `grep -n "investigate" skills/sherlock/README.md` — expect the new entries.

- [ ] **Step 6: Commit**

```bash
git add skills/sherlock/README.md
git commit -m "docs(sherlock): README — init rename + investigate flow + modes"
```

---

## Task 10: Full suite green + end-to-end sanity

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run (from the package dir): `npm test`
Expected: PASS — all files, including `paths`, `recommend`, `investigate`, the renamed `init-cmd`, and the updated `partition`/`coverage`/`cli`/`skill-md` tests.

- [ ] **Step 2: End-to-end — full-repo investigate**

```bash
node bin/cli.js investigate --date 2026-06-30
```
Expected stdout: an Investigation Plan with `Recommended mode:`, `inline < agents < workflow`, the subscription caveat, `Available lenses:`, `Next steps`, and a `coverage --findings docs/reviews/2026-06-30-codebase-review` line. On disk: `.sherlock/units.json` and `docs/reviews/2026-06-30-codebase-review/INVESTIGATION.md` exist.

- [ ] **Step 3: End-to-end — reuse + scoped**

```bash
node bin/cli.js investigate --date 2026-06-30          # second run → "(reused cache)" in output
node bin/cli.js investigate src/** --date 2026-06-30   # scoped → units-src.json + 2026-06-30-src-review/
```
Expected: the second full run prints `(reused cache)`; the scoped run creates `.sherlock/units-src.json` and `docs/reviews/2026-06-30-src-review/`, and its plan's coverage command includes `--units .sherlock/units-src.json`.

- [ ] **Step 4: Confirm coverage reconciles the scoped report**

```bash
node bin/cli.js coverage --findings docs/reviews/2026-06-30-src-review --units .sherlock/units-src.json; echo "exit=$?"
```
Expected: non-zero exit with "no status recorded" gaps (statuses unfilled in this dry run) — proving the scoped units file + report reconcile together.

- [ ] **Step 5: Clean up dry-run artifacts**

```bash
rm -rf docs/reviews .sherlock
git status --short   # expect clean (only committed changes)
```

---

## Self-Review

**Spec coverage:**
- §3 rename `scaffold`→`init` → Task 5 (+ scope-awareness in Task 6).
- §4 three execution modes → Task 8 (SKILL.md sub-procedures); `workflow` unchanged.
- §5 `investigate` command (signature, conditional prep, plan output) → Task 7.
- §5.0 state model (scope-keyed cache in `.sherlock/`, scope-named report dir) → Tasks 1 (paths), 3 (partition), 6 (init), 4 (coverage `--units`).
- §5.1 reuse-first + `--refresh` → Task 7.
- §6 recommendation heuristic + constants → Task 2.
- §7 interactive flow → Task 8.
- §8 lens selection + tier-application → Task 8 (asking sequence).
- §9 touch-points → Tasks 1–9 (all files listed).
- §10 invariants → preserved by construction; verified end-to-end in Task 10.

**Placeholder scan:** No TBD/TODO; every code/markdown step shows full content or exact old→new strings.

**Type/name consistency:** `cmdInit`, `cmdInvestigate`, `scopeSlug`/`unitsFileName`/`reportDirName`, `recommendMode`, the `--units`/`--mode`/`--lenses`/`--tiers`/`--refresh` flags, report-dir names (`<date>-codebase-review`, `<date>-<slug>-review`), and units filenames (`units.json`, `units-<slug>.json`) are used identically across paths.js, partition, init, coverage, investigate, cli.js, SKILL.md, README, and every test.

**Note for execution:** this plan builds on the unmerged `feat/sherlock-persona` branch (it references `INVESTIGATION.md`, `persona/report-style.md`). Decide at execution time whether to branch off `feat/sherlock-persona` or merge that first.

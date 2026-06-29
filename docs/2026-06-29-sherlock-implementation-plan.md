# Sherlock Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sherlock` — a repo-agnostic, CLI-driven code-investigation skill that partitions a codebase into risk-tiered units, runs perspective "lenses" over them via a multi-agent workflow, adversarially verifies findings, and emits a triaged report — with no code changes.

**Architecture:** A Node ESM package under `.claude/skills/sherlock/`, mirroring the existing `.claude/skills/specforest/` conventions: `bin/cli.js` dispatches to `src/commands/*.js`; command handlers receive `{ cwd, args, stdin, stdout, stderr }` and return an exit code. Deterministic work (partition, scaffold, coverage, lens/rule resolution) lives in the CLI; judgment work (review, refute, synthesize) lives in `workflow/sherlock.workflow.js`, a Workflow-tool script that calls the CLI for its deterministic phases. Investigators are markdown files in `lenses/`; the shipped `rules/standard/` pack holds general invariants only, with project-specific invariants layered in via explicit config.

**Tech Stack:** Node ≥18 (ESM), `js-yaml`, `picomatch`, `node --test`. Authoritative design: [`2026-06-29-sherlock-skill-design.md`](2026-06-29-sherlock-skill-design.md).

---

## File Structure

```
.claude/skills/sherlock/
├── package.json                # ESM, node>=18, deps js-yaml + picomatch
├── bin/cli.js                  # dispatcher (Task 12)
├── src/
│   ├── paths.js                # toPosix, relPosix          (Task 2)
│   ├── kebab.js                # kebab slug                 (Task 2)
│   ├── loc.js                  # countLines                 (Task 3)
│   ├── glob.js                 # walkFiles (picomatch)      (Task 3)
│   ├── config.js               # defaults + load + validate (Task 4)
│   ├── tiers.js                # assignTier                 (Task 5)
│   ├── lenses.js               # listLenses, resolveSelection, validateLens (Task 9)
│   ├── rules.js                # resolveRules               (Task 10)
│   └── commands/
│       ├── partition.js        # units.json                 (Task 6)
│       ├── scaffold.js         # report skeleton            (Task 7)
│       ├── coverage.js         # reconcile                  (Task 8)
│       ├── lenses.js           # list/--select              (Task 9)
│       └── rules.js            # print resolved rule context (Task 10)
├── lenses/                     # _TEMPLATE.md + 5 investigators (Task 13)
├── rules/standard/             # general invariants only    (Task 14)
├── schemas/                    # finding/verdict/units JSON  (Task 11)
├── workflow/sherlock.workflow.js  # orchestration          (Task 15)
├── tests/                      # node --test                (per task)
├── SKILL.md                    # entry point                (Task 16)
├── README.md                   # human overview             (Task 16)
└── docs/                       # this plan + the design doc (already present)
```

**Module API contract (locked here so later tasks stay consistent):**

- `paths.js`: `toPosix(p): string`, `relPosix(root, abs): string`
- `kebab.js`: `kebab(s): string`
- `loc.js`: `countLines(text): number`
- `glob.js`: `walkFiles(root, { include, exclude }): Promise<Array<{abs, rel}>>`
- `config.js`: `CONFIG_FILENAME`, `defaultConfig()`, `loadConfig(projectRoot)`, `validateConfig(c)`
- `tiers.js`: `assignTier(rel, tiers): "S"|"A"|"B"`, `defaultTiers()`
- `lenses.js`: `listLenses(lensesDir): Promise<Lens[]>`, `validateLens(lens): void`, `resolveSelection(lenses, selectArg): Lens[]`, `LENS_ALIASES`
- `rules.js`: `resolveRules(projectRoot, config, skillRoot): Promise<{ standard, projectGeneral, projectSpecific }>`, `GENERAL_BUCKETS`

A "unit" object (in `units.json`): `{ id, path, tier, files: string[], loc }`.
A "Lens" object: `{ name, title, perspective, verification_class, applies_to: { tiers, globs }, severity_default, file }`.

---

## Task 1: Skill scaffold (package.json + smoke test)

**Files:**
- Create: `.claude/skills/sherlock/package.json`
- Create: `.claude/skills/sherlock/.gitignore`
- Test: `.claude/skills/sherlock/tests/scaffold.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/scaffold.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("package.json declares ESM + node>=18 + pinned deps", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.name, "sherlock");
  assert.ok(pkg.engines.node.includes("18"));
  assert.ok(pkg.dependencies["js-yaml"]);
  assert.ok(pkg.dependencies["picomatch"]);
  assert.equal(pkg.scripts.test, "node --test tests/**/*.test.js");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/scaffold.test.js`
Expected: FAIL — `ENOENT` reading `package.json`.

- [ ] **Step 3: Create package.json + .gitignore**

```json
{
  "name": "sherlock",
  "version": "0.1.0",
  "description": "Repo-agnostic code-investigation skill: risk-tiered lenses + adversarial verification.",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": { "test": "node --test tests/**/*.test.js" },
  "dependencies": { "js-yaml": "^4.1.0", "picomatch": "^4.0.2" }
}
```

```gitignore
node_modules/
.sherlock/
```

- [ ] **Step 4: Install deps and run the test**

Run: `cd .claude/skills/sherlock && npm install && node --test tests/scaffold.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/package.json .claude/skills/sherlock/.gitignore .claude/skills/sherlock/tests/scaffold.test.js .claude/skills/sherlock/package-lock.json
git commit -m "chore(sherlock): scaffold ESM skill package"
```

---

## Task 2: Pure helpers — paths + kebab

**Files:**
- Create: `.claude/skills/sherlock/src/paths.js`
- Create: `.claude/skills/sherlock/src/kebab.js`
- Test: `.claude/skills/sherlock/tests/pure.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pure.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPosix, relPosix } from "../src/paths.js";
import { kebab } from "../src/kebab.js";

test("toPosix normalises backslashes", () => {
  assert.equal(toPosix("a\\b\\c"), "a/b/c");
  assert.equal(toPosix("a/b"), "a/b");
});

test("relPosix yields posix relative path", () => {
  assert.equal(relPosix("/repo", "/repo/api/src/app.py"), "api/src/app.py");
});

test("kebab slugifies", () => {
  assert.equal(kebab("API Src Auth"), "api-src-auth");
  assert.equal(kebab("agents/src/coordinator"), "agents-src-coordinator");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/pure.test.js`
Expected: FAIL — cannot find module `../src/paths.js`.

- [ ] **Step 3: Implement the helpers**

```javascript
// src/paths.js
import path from "node:path";

export function toPosix(p) {
  return p.split(path.sep).join("/").split("\\").join("/");
}

export function relPosix(root, abs) {
  return toPosix(path.relative(root, abs));
}
```

```javascript
// src/kebab.js
export function kebab(s) {
  return String(s)
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/pure.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/paths.js .claude/skills/sherlock/src/kebab.js .claude/skills/sherlock/tests/pure.test.js
git commit -m "feat(sherlock): paths + kebab helpers"
```

---

## Task 3: File walker + LOC counter

**Files:**
- Create: `.claude/skills/sherlock/src/loc.js`
- Create: `.claude/skills/sherlock/src/glob.js`
- Test: `.claude/skills/sherlock/tests/glob.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/glob.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkFiles } from "../src/glob.js";
import { countLines } from "../src/loc.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-"));
  await mkdir(path.join(root, "api/src"), { recursive: true });
  await mkdir(path.join(root, "node_modules/x"), { recursive: true });
  await writeFile(path.join(root, "api/src/app.py"), "a\nb\nc\n");
  await writeFile(path.join(root, "api/src/app.test.py"), "t\n");
  await writeFile(path.join(root, "node_modules/x/i.js"), "x\n");
  return root;
}

test("walkFiles honours include + exclude, returns sorted posix rels", async () => {
  const root = await fixture();
  const files = await walkFiles(root, {
    include: ["**/*.py"],
    exclude: ["**/node_modules/**", "**/*.test.py"],
  });
  assert.deepEqual(files.map((f) => f.rel), ["api/src/app.py"]);
});

test("countLines counts text lines", () => {
  assert.equal(countLines("a\nb\nc\n"), 3);
  assert.equal(countLines(""), 0);
  assert.equal(countLines("nonl"), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/glob.test.js`
Expected: FAIL — cannot find module `../src/glob.js`.

- [ ] **Step 3: Implement walker + counter**

```javascript
// src/loc.js
export function countLines(text) {
  if (text.length === 0) return 0;
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
  return trimmed.split("\n").length;
}
```

```javascript
// src/glob.js
import { readdir } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import { relPosix } from "./paths.js";

export async function walkFiles(root, { include, exclude }) {
  const isIncluded = picomatch(include, { dot: true });
  const isExcluded = exclude && exclude.length ? picomatch(exclude, { dot: true }) : () => false;
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = relPosix(root, abs);
      if (isExcluded(rel)) continue;
      if (ent.isDirectory()) await walk(abs);
      else if (ent.isFile() && isIncluded(rel)) out.push({ abs, rel });
    }
  }
  await walk(root);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/glob.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/loc.js .claude/skills/sherlock/src/glob.js .claude/skills/sherlock/tests/glob.test.js
git commit -m "feat(sherlock): file walker + LOC counter"
```

---

## Task 4: Config — defaults, load, validate

**Files:**
- Create: `.claude/skills/sherlock/src/config.js`
- Test: `.claude/skills/sherlock/tests/config.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/config.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultConfig, loadConfig, validateConfig, CONFIG_FILENAME } from "../src/config.js";

test("defaultConfig has output, tiers, exclude, maxUnitLoc", () => {
  const c = defaultConfig();
  assert.equal(c.output, "docs/reviews");
  assert.ok(c.tiers.S && c.tiers.A && c.tiers.B);
  assert.ok(Array.isArray(c.exclude));
  assert.equal(typeof c.maxUnitLoc, "number");
  assert.deepEqual(c.rules, { project: [] });
});

test("loadConfig returns defaults when file absent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-cfg-"));
  const c = await loadConfig(root);
  assert.equal(c.output, "docs/reviews");
});

test("loadConfig merges user overrides", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-cfg-"));
  await writeFile(
    path.join(root, CONFIG_FILENAME),
    'output: docs/audits\nrules:\n  project:\n    - .claude/rules/furiosa\n',
  );
  const c = await loadConfig(root);
  assert.equal(c.output, "docs/audits");
  assert.deepEqual(c.rules.project, [".claude/rules/furiosa"]);
  assert.ok(c.tiers.B, "defaults still present after merge");
});

test("validateConfig rejects bad maxUnitLoc", () => {
  assert.throws(() => validateConfig({ ...defaultConfig(), maxUnitLoc: 0 }), /maxUnitLoc/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/config.test.js`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 3: Implement config**

```javascript
// src/config.js
import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export const CONFIG_FILENAME = "sherlock.config.yml";

export function defaultConfig() {
  return {
    output: "docs/reviews",
    stateDir: ".sherlock",
    include: ["**/*.py", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    exclude: [
      "**/node_modules/**",
      "**/__pycache__/**",
      "**/dist/**",
      "**/build/**",
      "**/*.test.*",
      "**/tests/**",
      "**/test_*.py",
      "**/.sherlock/**",
    ],
    maxUnitLoc: 2000,
    rules: { project: [] },
    tiers: defaultTiersConfig(),
    lensesByTier: {
      S: ["*"],
      A: ["security", "correctness", "dead-code", "refactor"],
      B: ["security", "correctness", "dead-code", "comments", "refactor"],
    },
  };
}

function defaultTiersConfig() {
  return {
    S: [],
    A: ["**/ws/**", "**/streaming/**"],
    B: ["**"],
  };
}

export function validateConfig(c) {
  for (const k of ["output", "stateDir", "include", "exclude", "maxUnitLoc", "rules", "tiers", "lensesByTier"]) {
    if (c[k] === undefined || c[k] === null) throw new Error(`config.${k} missing`);
  }
  if (typeof c.maxUnitLoc !== "number" || c.maxUnitLoc < 1) throw new Error("config.maxUnitLoc must be >= 1");
  if (!Array.isArray(c.rules.project)) throw new Error("config.rules.project must be an array");
  for (const t of ["S", "A", "B"]) {
    if (!Array.isArray(c.tiers[t])) throw new Error(`config.tiers.${t} must be an array`);
  }
  return c;
}

export async function loadConfig(projectRoot) {
  const p = path.join(projectRoot, CONFIG_FILENAME);
  let parsed = {};
  try {
    parsed = yaml.load(await readFile(p, "utf8")) || {};
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const d = defaultConfig();
  const merged = {
    ...d,
    ...parsed,
    rules: { ...d.rules, ...(parsed.rules || {}) },
    tiers: { ...d.tiers, ...(parsed.tiers || {}) },
    lensesByTier: { ...d.lensesByTier, ...(parsed.lensesByTier || {}) },
  };
  return validateConfig(merged);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/config.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/config.js .claude/skills/sherlock/tests/config.test.js
git commit -m "feat(sherlock): config loader with defaults + validation"
```

---

## Task 5: Tier assignment

**Files:**
- Create: `.claude/skills/sherlock/src/tiers.js`
- Test: `.claude/skills/sherlock/tests/tiers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/tiers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignTier } from "../src/tiers.js";

const tiers = {
  S: ["api/src/auth/**", "agents/src/coordinator/**"],
  A: ["**/ws/**"],
  B: ["**"],
};

test("S wins over A over B (priority order)", () => {
  assert.equal(assignTier("api/src/auth/login.py", tiers), "S");
  assert.equal(assignTier("api/src/ws/dispatcher.py", tiers), "A");
  assert.equal(assignTier("frontend/src/pages/Home.tsx", tiers), "B");
});

test("unmatched path defaults to B", () => {
  assert.equal(assignTier("random/file.py", { S: [], A: [], B: [] }), "B");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/tiers.test.js`
Expected: FAIL — cannot find module `../src/tiers.js`.

- [ ] **Step 3: Implement tier assignment**

```javascript
// src/tiers.js
import picomatch from "picomatch";

export function assignTier(rel, tiers) {
  for (const t of ["S", "A", "B"]) {
    const globs = tiers[t] || [];
    if (globs.length && picomatch(globs, { dot: true })(rel)) return t;
  }
  return "B";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/tiers.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/tiers.js .claude/skills/sherlock/tests/tiers.test.js
git commit -m "feat(sherlock): risk-tier assignment by glob priority"
```

---

## Task 6: `partition` command

**Files:**
- Create: `.claude/skills/sherlock/src/commands/partition.js`
- Test: `.claude/skills/sherlock/tests/partition.test.js`

Behaviour: walk files (config include/exclude), group by **top-2-path-segment directory**, split any group exceeding `maxUnitLoc` into per-subdir sub-units, assign each unit the **highest tier** among its files, write `<stateDir>/units.json`. Deterministic ordering.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/partition.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmdPartition } from "../src/commands/partition.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-part-"));
  await mkdir(path.join(root, "api/src/auth"), { recursive: true });
  await mkdir(path.join(root, "frontend/src/pages"), { recursive: true });
  await writeFile(path.join(root, "api/src/auth/login.py"), "x\n".repeat(10));
  await writeFile(path.join(root, "frontend/src/pages/Home.tsx"), "y\n".repeat(5));
  await writeFile(
    path.join(root, "sherlock.config.yml"),
    'tiers:\n  S:\n    - "api/src/auth/**"\n  A: []\n  B:\n    - "**"\n',
  );
  return root;
}

test("partition writes units.json with tiers + loc, deterministic", async () => {
  const root = await repo();
  const sink = { out: "" };
  const code = await cmdPartition({ cwd: root, args: [], stdout: { write: (s) => (sink.out += s) }, stderr: { write() {} } });
  assert.equal(code, 0);
  const units = JSON.parse(await readFile(path.join(root, ".sherlock/units.json"), "utf8"));
  const auth = units.units.find((u) => u.path.includes("auth"));
  assert.equal(auth.tier, "S");
  assert.ok(auth.loc >= 10);
  assert.deepEqual(units.units.map((u) => u.id).slice().sort(), units.units.map((u) => u.id));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/partition.test.js`
Expected: FAIL — cannot find module `../src/commands/partition.js`.

- [ ] **Step 3: Implement partition**

```javascript
// src/commands/partition.js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { walkFiles } from "../glob.js";
import { countLines } from "../loc.js";
import { assignTier } from "../tiers.js";
import { kebab } from "../kebab.js";

const TIER_RANK = { B: 0, A: 1, S: 2 };

function makeUnit(id, pathKey, members) {
  const tier = members.reduce((t, m) => (TIER_RANK[m.tier] > TIER_RANK[t] ? m.tier : t), "B");
  return {
    id,
    path: pathKey,
    tier,
    files: members.map((m) => m.rel).sort(),
    loc: members.reduce((n, m) => n + m.loc, 0),
  };
}

// A group is the files directly under one directory. If it exceeds the cap, bin-pack
// the sorted file list into <=maxLoc chunks (a single over-cap file lands alone).
function unitsForGroup(pathKey, members, maxLoc) {
  const total = members.reduce((n, m) => n + m.loc, 0);
  if (total <= maxLoc) return [makeUnit(kebab(pathKey), pathKey, members)];

  const sorted = [...members].sort((a, b) => a.rel.localeCompare(b.rel));
  const chunks = [];
  let cur = [];
  let curLoc = 0;
  for (const m of sorted) {
    if (cur.length && curLoc + m.loc > maxLoc) {
      chunks.push(cur);
      cur = [];
      curLoc = 0;
    }
    cur.push(m);
    curLoc += m.loc;
  }
  if (cur.length) chunks.push(cur);
  if (chunks.length === 1) return [makeUnit(kebab(pathKey), pathKey, chunks[0])];
  return chunks.map((ms, i) => makeUnit(`${kebab(pathKey)}-${i + 1}`, pathKey, ms));
}

export async function cmdPartition({ cwd, args, stdout }) {
  const config = await loadConfig(cwd);
  const scope = args.find((a) => !a.startsWith("--"));
  const include = scope ? [scope.endsWith("/") ? `${scope}**` : scope] : config.include;
  const files = await walkFiles(cwd, { include, exclude: config.exclude });

  // group by full directory path
  const texts = await Promise.all(files.map((f) => readFile(f.abs, "utf8").catch(() => "")));
  const groups = new Map();
  files.forEach((f, i) => {
    const parts = f.rel.split("/");
    const key = parts.slice(0, parts.length - 1).join("/") || ".";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ rel: f.rel, loc: countLines(texts[i]), tier: assignTier(f.rel, config.tiers) });
  });

  const units = [];
  for (const [key, members] of groups) {
    units.push(...unitsForGroup(key, members, config.maxUnitLoc));
  }
  units.sort((a, b) => a.id.localeCompare(b.id));

  const stateDir = path.join(cwd, config.stateDir);
  await mkdir(stateDir, { recursive: true });
  await writeFile(path.join(stateDir, "units.json"), JSON.stringify({ units }, null, 2));
  stdout.write(`partitioned ${files.length} files into ${units.length} units\n`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/partition.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/commands/partition.js .claude/skills/sherlock/tests/partition.test.js
git commit -m "feat(sherlock): partition command builds risk-tiered units.json"
```

---

## Task 7: `scaffold` command

**Files:**
- Create: `.claude/skills/sherlock/src/commands/scaffold.js`
- Test: `.claude/skills/sherlock/tests/scaffold-cmd.test.js`

Behaviour: read `units.json`, create `<output>/<date>-codebase-review/` with `README.md`, `findings-security.md`, `findings-bugs.md`, `findings-cleanup.md`, `appendix-refuted.md`, `coverage.md` (seeded table), and an empty `units-status.json`. Accepts `--date YYYY-MM-DD` (default: today) and `--out <dir>`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/scaffold-cmd.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/scaffold-cmd.test.js`
Expected: FAIL — cannot find module `../src/commands/scaffold.js`.

- [ ] **Step 3: Implement scaffold**

```javascript
// src/commands/scaffold.js
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function cmdScaffold({ cwd, args, stdout }) {
  const config = await loadConfig(cwd);
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;
  const { units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, "units.json"), "utf8"));

  const dir = path.join(cwd, out, `${date}-codebase-review`);
  await mkdir(dir, { recursive: true });

  const rows = units
    .map((u) => `| ${u.id} | ${u.tier} | ${u.loc} | | pending |`)
    .join("\n");
  const coverage = `# Coverage\n\n| Unit | Tier | LOC | Lenses run | Status |\n|---|---|---|---|---|\n${rows}\n`;

  await writeFile(path.join(dir, "README.md"), `# Codebase Review — ${date}\n\n_Executive summary populated at synthesis._\n`);
  await writeFile(path.join(dir, "findings-security.md"), "# Security findings\n\n_None yet._\n");
  await writeFile(path.join(dir, "findings-bugs.md"), "# Correctness / bug findings\n\n_None yet._\n");
  await writeFile(path.join(dir, "findings-cleanup.md"), "# Cleanup findings (dead code / comments / refactor)\n\n_None yet._\n");
  await writeFile(path.join(dir, "appendix-refuted.md"), "# Refuted candidates\n\n_None yet._\n");
  await writeFile(path.join(dir, "coverage.md"), coverage);
  await writeFile(path.join(dir, "units-status.json"), JSON.stringify({ units: {} }, null, 2));

  stdout.write(`scaffolded report at ${path.relative(cwd, dir)}\n`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/scaffold-cmd.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/commands/scaffold.js .claude/skills/sherlock/tests/scaffold-cmd.test.js
git commit -m "feat(sherlock): scaffold command seeds report skeleton + coverage table"
```

---

## Task 8: `coverage` command

**Files:**
- Create: `.claude/skills/sherlock/src/commands/coverage.js`
- Test: `.claude/skills/sherlock/tests/coverage.test.js`

Behaviour: read `units.json` and the report's `units-status.json`; any unit id missing a status, or with status `error`, is a gap → print the gaps and return exit code `1`. All accounted-for & non-error → `0`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/coverage.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/coverage.test.js`
Expected: FAIL — cannot find module `../src/commands/coverage.js`.

- [ ] **Step 3: Implement coverage**

```javascript
// src/commands/coverage.js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function cmdCoverage({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const findingsDir = flag(args, "--findings");
  if (!findingsDir) {
    stderr.write("coverage: --findings <report-dir> required\n");
    return 1;
  }
  const { units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, "units.json"), "utf8"));
  const status = JSON.parse(await readFile(path.join(findingsDir, "units-status.json"), "utf8")).units || {};

  const gaps = [];
  for (const u of units) {
    const s = status[u.id];
    if (!s) gaps.push(`${u.id}: no status recorded`);
    else if (s.status === "error") gaps.push(`${u.id}: status=error`);
  }
  if (gaps.length) {
    stderr.write(`coverage gaps (${gaps.length}):\n${gaps.map((g) => `  - ${g}`).join("\n")}\n`);
    return 1;
  }
  stdout.write(`coverage OK: ${units.length} units accounted for\n`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/coverage.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/commands/coverage.js .claude/skills/sherlock/tests/coverage.test.js
git commit -m "feat(sherlock): coverage command reconciles units vs recorded status"
```

---

## Task 9: Lens resolution (`src/lenses.js` + `lenses` command)

**Files:**
- Create: `.claude/skills/sherlock/src/lenses.js`
- Create: `.claude/skills/sherlock/src/commands/lenses.js`
- Test: `.claude/skills/sherlock/tests/lenses.test.js`

Behaviour: parse each `lenses/*.md` (skip `_TEMPLATE.md`) for YAML frontmatter; validate required keys; `resolveSelection` maps `--lenses` names (with aliases like `bugs`→`correctness`) to lenses and rejects unknowns.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lenses.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listLenses, validateLens, resolveSelection } from "../src/lenses.js";

function lensMd(name, vc) {
  return `---\nname: ${name}\ntitle: ${name} lens\nperspective: looks at ${name}\nverification_class: ${vc}\napplies_to:\n  tiers: [S, A, B]\n  globs: ["**/*"]\nseverity_default: HIGH\n---\nBody.\n`;
}

async function lensesDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "sherlock-lens-"));
  await writeFile(path.join(dir, "security.md"), lensMd("security", "security"));
  await writeFile(path.join(dir, "correctness.md"), lensMd("correctness", "correctness"));
  await writeFile(path.join(dir, "_TEMPLATE.md"), "---\nname: TEMPLATE\n---\n");
  return dir;
}

test("listLenses parses frontmatter and skips the template", async () => {
  const lenses = await listLenses(await lensesDir());
  assert.deepEqual(lenses.map((l) => l.name).sort(), ["correctness", "security"]);
  for (const l of lenses) validateLens(l);
});

test("validateLens rejects bad verification_class", () => {
  assert.throws(() => validateLens({ name: "x", title: "x", perspective: "x", verification_class: "bogus", applies_to: { tiers: ["B"], globs: ["**"] }, severity_default: "LOW" }), /verification_class/);
});

test("resolveSelection maps aliases and rejects unknowns", async () => {
  const lenses = await listLenses(await lensesDir());
  assert.deepEqual(resolveSelection(lenses, "bugs,security").map((l) => l.name).sort(), ["correctness", "security"]);
  assert.throws(() => resolveSelection(lenses, "nope"), /unknown lens/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/lenses.test.js`
Expected: FAIL — cannot find module `../src/lenses.js`.

- [ ] **Step 3: Implement lens resolution**

```javascript
// src/lenses.js
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export const LENS_ALIASES = { bugs: "correctness", bug: "correctness", dead: "dead-code", clean: "refactor" };
const VALID_CLASSES = new Set(["security", "correctness", "cleanup"]);

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return yaml.load(m[1]) || {};
}

export async function listLenses(lensesDir) {
  const entries = await readdir(lensesDir);
  const lenses = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".md") || name.startsWith("_")) continue;
    const fm = parseFrontmatter(await readFile(path.join(lensesDir, name), "utf8"));
    if (fm && fm.name) lenses.push({ ...fm, file: name });
  }
  return lenses;
}

export function validateLens(lens) {
  for (const k of ["name", "title", "perspective", "verification_class", "applies_to", "severity_default"]) {
    if (lens[k] === undefined) throw new Error(`lens ${lens.name || "?"} missing '${k}'`);
  }
  if (!VALID_CLASSES.has(lens.verification_class)) {
    throw new Error(`lens ${lens.name}: verification_class must be one of security|correctness|cleanup`);
  }
  if (!Array.isArray(lens.applies_to.tiers) || !Array.isArray(lens.applies_to.globs)) {
    throw new Error(`lens ${lens.name}: applies_to.tiers and applies_to.globs must be arrays`);
  }
}

export function resolveSelection(lenses, selectArg) {
  if (!selectArg) return lenses;
  const byName = new Map(lenses.map((l) => [l.name, l]));
  const out = [];
  for (const raw of selectArg.split(",").map((s) => s.trim()).filter(Boolean)) {
    const name = LENS_ALIASES[raw] || raw;
    const lens = byName.get(name);
    if (!lens) throw new Error(`unknown lens '${raw}'. Available: ${[...byName.keys()].join(", ")}`);
    if (!out.includes(lens)) out.push(lens);
  }
  return out;
}
```

```javascript
// src/commands/lenses.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, validateLens, resolveSelection } from "../lenses.js";

const skillRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function cmdLenses({ args, stdout, stderr }) {
  const lenses = await listLenses(path.join(skillRoot, "lenses"));
  for (const l of lenses) validateLens(l);
  let selected;
  try {
    selected = resolveSelection(lenses, flag(args, "--select"));
  } catch (e) {
    stderr.write(`${e.message}\n`);
    return 1;
  }
  for (const l of selected) {
    stdout.write(`${l.name}\t[${l.verification_class}]\ttiers=${l.applies_to.tiers.join(",")}\t${l.title}\n`);
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/lenses.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/lenses.js .claude/skills/sherlock/src/commands/lenses.js .claude/skills/sherlock/tests/lenses.test.js
git commit -m "feat(sherlock): lens discovery, validation, --select resolution"
```

---

## Task 10: Rule layering (`src/rules.js` + `rules` command)

**Files:**
- Create: `.claude/skills/sherlock/src/rules.js`
- Create: `.claude/skills/sherlock/src/commands/rules.js`
- Test: `.claude/skills/sherlock/tests/rules.test.js`

Behaviour (spec §6): `standard` = every file under the skill's `rules/standard/`. `projectGeneral` = auto-discovered files under the **general buckets only** (`common/`, `python/`, `typescript/`) of the target repo's `.claude/rules/`. `projectSpecific` = files under the paths **explicitly listed** in `config.rules.project` — never auto-scraped. Guarantees: a `.claude/rules/furiosa/*` file is in `projectSpecific` *only* if `config.rules.project` names it; it never leaks into `projectGeneral` or `standard`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/rules.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveRules, GENERAL_BUCKETS } from "../src/rules.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-rules-"));
  for (const b of ["common", "python", "typescript", "furiosa"]) {
    await mkdir(path.join(root, ".claude/rules", b), { recursive: true });
    await writeFile(path.join(root, ".claude/rules", b, "r.md"), `# ${b}\n`);
  }
  const skill = await mkdtemp(path.join(tmpdir(), "sherlock-skill-"));
  await mkdir(path.join(skill, "rules/standard"), { recursive: true });
  await writeFile(path.join(skill, "rules/standard/owasp.md"), "# owasp\n");
  return { root, skill };
}

test("standard is general-only; furiosa never auto-included", async () => {
  const { root, skill } = await repo();
  const r = await resolveRules(root, { rules: { project: [] } }, skill);
  assert.ok(r.standard.some((f) => f.includes("owasp.md")));
  assert.ok(r.projectGeneral.every((f) => GENERAL_BUCKETS.some((b) => f.includes(`/${b}/`))));
  assert.ok(!r.projectGeneral.some((f) => f.includes("/furiosa/")));
  assert.deepEqual(r.projectSpecific, []);
});

test("furiosa enters projectSpecific only when explicitly configured", async () => {
  const { root, skill } = await repo();
  const r = await resolveRules(root, { rules: { project: [".claude/rules/furiosa"] } }, skill);
  assert.ok(r.projectSpecific.some((f) => f.includes("/furiosa/r.md")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/rules.test.js`
Expected: FAIL — cannot find module `../src/rules.js`.

- [ ] **Step 3: Implement rule layering**

```javascript
// src/rules.js
import path from "node:path";
import { walkFiles } from "./glob.js";

export const GENERAL_BUCKETS = ["common", "python", "typescript"];

async function mdUnder(absDir, root) {
  const files = await walkFiles(absDir, { include: ["**/*.md"], exclude: [] });
  return files.map((f) => path.relative(root, f.abs).split(path.sep).join("/"));
}

export async function resolveRules(projectRoot, config, skillRoot) {
  const standard = await mdUnder(path.join(skillRoot, "rules/standard"), skillRoot);

  const projectGeneral = [];
  for (const bucket of GENERAL_BUCKETS) {
    const dir = path.join(projectRoot, ".claude/rules", bucket);
    projectGeneral.push(...(await mdUnder(dir, projectRoot)));
  }

  const projectSpecific = [];
  for (const rel of config.rules?.project || []) {
    projectSpecific.push(...(await mdUnder(path.join(projectRoot, rel), projectRoot)));
  }

  return {
    standard: standard.sort(),
    projectGeneral: projectGeneral.sort(),
    projectSpecific: projectSpecific.sort(),
  };
}
```

```javascript
// src/commands/rules.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { resolveRules } from "../rules.js";

const skillRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export async function cmdRules({ cwd, stdout }) {
  const config = await loadConfig(cwd);
  const r = await resolveRules(cwd, config, skillRoot);
  stdout.write(`standard (${r.standard.length}):\n${r.standard.map((f) => `  ${f}`).join("\n")}\n`);
  stdout.write(`project-general (${r.projectGeneral.length}):\n${r.projectGeneral.map((f) => `  ${f}`).join("\n")}\n`);
  stdout.write(`project-specific (${r.projectSpecific.length}):\n${r.projectSpecific.map((f) => `  ${f}`).join("\n")}\n`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/rules.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/src/rules.js .claude/skills/sherlock/src/commands/rules.js .claude/skills/sherlock/tests/rules.test.js
git commit -m "feat(sherlock): rule layering — general-only standard + explicit project overlay"
```

---

## Task 11: Output schemas

**Files:**
- Create: `.claude/skills/sherlock/schemas/finding.schema.json`
- Create: `.claude/skills/sherlock/schemas/verdict.schema.json`
- Create: `.claude/skills/sherlock/schemas/units.schema.json`
- Test: `.claude/skills/sherlock/tests/schemas.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/schemas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("schemas are valid JSON Schema with required props", async () => {
  const finding = JSON.parse(await readFile(path.join(root, "schemas/finding.schema.json"), "utf8"));
  assert.equal(finding.type, "object");
  for (const p of ["id", "lens", "severity", "file", "line", "excerpt", "rationale", "recommendation"]) {
    assert.ok(finding.properties[p], `finding.${p} present`);
  }
  const verdict = JSON.parse(await readFile(path.join(root, "schemas/verdict.schema.json"), "utf8"));
  assert.deepEqual(verdict.properties.verdict.enum, ["confirmed", "uncertain", "refuted"]);
  const units = JSON.parse(await readFile(path.join(root, "schemas/units.schema.json"), "utf8"));
  assert.ok(units.properties.units);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/schemas.test.js`
Expected: FAIL — `ENOENT` on `schemas/finding.schema.json`.

- [ ] **Step 3: Create the schema files**

```json
// schemas/finding.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "lens", "severity", "file", "line", "excerpt", "rationale", "recommendation"],
  "properties": {
    "id": { "type": "string" },
    "lens": { "type": "string" },
    "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
    "file": { "type": "string" },
    "line": { "type": "integer" },
    "excerpt": { "type": "string" },
    "rationale": { "type": "string" },
    "rule": { "type": "string" },
    "recommendation": { "type": "string" }
  }
}
```

```json
// schemas/verdict.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["finding_id", "verdict", "reason"],
  "properties": {
    "finding_id": { "type": "string" },
    "verdict": { "type": "string", "enum": ["confirmed", "uncertain", "refuted"] },
    "reason": { "type": "string" }
  }
}
```

```json
// schemas/units.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["units"],
  "properties": {
    "units": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "path", "tier", "files", "loc"],
        "properties": {
          "id": { "type": "string" },
          "path": { "type": "string" },
          "tier": { "type": "string", "enum": ["S", "A", "B"] },
          "files": { "type": "array", "items": { "type": "string" } },
          "loc": { "type": "integer" }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/schemas.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/schemas/ .claude/skills/sherlock/tests/schemas.test.js
git commit -m "feat(sherlock): finding/verdict/units JSON schemas"
```

---

## Task 12: Wire `bin/cli.js`

**Files:**
- Create: `.claude/skills/sherlock/bin/cli.js`
- Test: `.claude/skills/sherlock/tests/cli.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/cli.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "bin/cli.js");

test("cli --help lists commands", async () => {
  const { stdout } = await run("node", [cli, "--help"]);
  for (const c of ["partition", "scaffold", "coverage", "lenses", "rules"]) assert.ok(stdout.includes(c));
});

test("cli unknown command exits non-zero", async () => {
  await assert.rejects(run("node", [cli, "bogus"]));
});

test("cli lenses prints the five shipped lenses", async () => {
  const { stdout } = await run("node", [cli, "lenses"]);
  for (const n of ["security", "correctness", "dead-code", "comments", "refactor"]) assert.ok(stdout.includes(n));
});
```

> Note: the third assertion depends on Task 13 (lens files). Run it after Task 13; it will fail until the lenses exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/cli.test.js`
Expected: FAIL — cannot find `bin/cli.js`.

- [ ] **Step 3: Implement the dispatcher**

```javascript
// bin/cli.js
#!/usr/bin/env node
import { cmdPartition } from "../src/commands/partition.js";
import { cmdScaffold } from "../src/commands/scaffold.js";
import { cmdCoverage } from "../src/commands/coverage.js";
import { cmdLenses } from "../src/commands/lenses.js";
import { cmdRules } from "../src/commands/rules.js";

const HELP = `sherlock — code-investigation skill

Commands:
  partition [path-or-glob]        walk repo → risk-tiered units.json
  scaffold [--date YYYY-MM-DD] [--out <dir>]   create report skeleton + coverage table
  coverage --findings <report-dir>             reconcile units vs recorded status (exit 1 on gap)
  lenses [--select security,bugs,...]          list / resolve investigators
  rules                            print resolved standard + project rule context

Examples:
  node .claude/skills/sherlock/bin/cli.js partition
  node .claude/skills/sherlock/bin/cli.js lenses --select security,bugs
`;

const HANDLERS = { partition: cmdPartition, scaffold: cmdScaffold, coverage: cmdCoverage, lenses: cmdLenses, rules: cmdRules };

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const handler = HANDLERS[cmd];
  if (!handler) {
    process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`);
    process.exit(1);
  }
  try {
    const code = await handler({ cwd: process.cwd(), args: rest, stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
    process.exit(code ?? 0);
  } catch (e) {
    process.stderr.write(`fatal: ${e.stack || e.message}\n`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 4: Run test to verify it passes (first two tests)**

Run: `cd .claude/skills/sherlock && node --test tests/cli.test.js`
Expected: first two PASS; the `lenses` test FAILS until Task 13 (expected).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/bin/cli.js .claude/skills/sherlock/tests/cli.test.js
git commit -m "feat(sherlock): wire bin/cli.js dispatcher"
```

---

## Task 13: Lens files (`_TEMPLATE.md` + five investigators)

**Files:**
- Create: `.claude/skills/sherlock/lenses/_TEMPLATE.md`
- Create: `.claude/skills/sherlock/lenses/security.md`
- Create: `.claude/skills/sherlock/lenses/correctness.md`
- Create: `.claude/skills/sherlock/lenses/dead-code.md`
- Create: `.claude/skills/sherlock/lenses/comments.md`
- Create: `.claude/skills/sherlock/lenses/refactor.md`
- Test: `.claude/skills/sherlock/tests/shipped-lenses.test.js`

> **Frontmatter placement (load-bearing):** `parseFrontmatter` matches `/^---\r?\n.../`, so the YAML frontmatter MUST begin at byte 0 of each lens file. The `<!-- lenses/<name>.md -->` label below is a doc annotation only — when authoring the real files, put the `---` frontmatter first and move any such comment into the body (after the closing `---`), or omit it. A comment on line 1 makes the lens silently unparseable.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/shipped-lenses.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, validateLens } from "../src/lenses.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("all five shipped lenses parse and validate", async () => {
  const lenses = await listLenses(path.join(root, "lenses"));
  const names = lenses.map((l) => l.name).sort();
  assert.deepEqual(names, ["comments", "correctness", "dead-code", "refactor", "security"]);
  for (const l of lenses) validateLens(l);
});

test("verification_class routing is correct", async () => {
  const lenses = await listLenses(path.join(root, "lenses"));
  const byName = Object.fromEntries(lenses.map((l) => [l.name, l.verification_class]));
  assert.equal(byName.security, "security");
  assert.equal(byName.correctness, "correctness");
  assert.equal(byName["dead-code"], "cleanup");
  assert.equal(byName.comments, "cleanup");
  assert.equal(byName.refactor, "cleanup");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/shipped-lenses.test.js`
Expected: FAIL — `listLenses` returns `[]`, deepEqual mismatch.

- [ ] **Step 3: Create the template**

```markdown
<!-- lenses/_TEMPLATE.md -->
---
name: my-lens                 # unique slug; identifier for --lenses
title: My Lens
perspective: >
  One paragraph describing the single perspective this investigator takes on the code.
verification_class: cleanup   # security | correctness | cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---

## What to look for
- Bullet the concrete patterns this lens hunts.

## Rules consulted
- Which standard-pack files and project-overlay categories to weigh.

## False-positive traps
- The known ways this lens cries wolf.

## Finding fields
- Anything beyond the shared finding schema this lens should populate.

## Refutation hints
- What a verifier should probe to refute a finding of this class.
```

- [ ] **Step 4: Create `security.md`**

```markdown
<!-- lenses/security.md -->
---
name: security
title: Security Investigator
perspective: >
  Read the code as both attacker and auditor: where does untrusted input enter,
  whose data is it, and what stops one tenant or an unauthenticated caller from
  reaching another's data or the host?
verification_class: security
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: HIGH
---

## What to look for
- AuthN/AuthZ bypass; missing role/permission checks; trusting client-supplied identity.
- Tenant cross-talk: data access not funnelled through the project's tenant-scoping mechanism.
- Service-to-service trust: privileged identity resolved from request body instead of a verified token.
- Path traversal / jail escape; filename or path taken from the client without re-resolution + containment check.
- SSRF in outbound fetches; missing redirect/peer-IP re-validation.
- Injection (SQL/command/template); unsanitized interpolation.
- Secret leakage (hardcoded keys, secrets in logs/errors).
- Supply-chain: CDN `<script>`/`<link>` without exact-version pin + integrity + crossorigin.

## Rules consulted
- Standard security pack; project-overlay security guardrails take precedence on conflict.

## False-positive traps
- A check that looks missing but is enforced by an upstream middleware/decorator.
- "Internal-only" endpoints unreachable from the public surface (still report if reachable).

## Finding fields
- `rule`: the exact standard/overlay rule or OWASP class violated.

## Refutation hints
- Trace the real call path: is the dangerous sink actually reachable with attacker-controlled input?
- Is there an upstream guard (auth middleware, scoping wrapper, jail re-check) the finding missed?
```

- [ ] **Step 5: Create `correctness.md`**

```markdown
<!-- lenses/correctness.md -->
---
name: correctness
title: Correctness Investigator
perspective: >
  Assume the happy path works; hunt the edges — concurrency, error handling,
  lifecycle, and the invariants the code is supposed to preserve.
verification_class: correctness
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: HIGH
---

## What to look for
- Unhandled promise rejections / swallowed exceptions; missing `await`.
- Race conditions; shared mutable state without a lock; check-then-act gaps.
- Off-by-one, wrong boundary, inverted condition.
- State-machine violations; resource leaks (fds, sockets, child processes).
- Violations of documented project invariants (streaming/buffering, lifecycle, threading discipline).

## Rules consulted
- Standard correctness pack; project-overlay invariants take precedence on conflict.

## False-positive traps
- Code paths guarded by an invariant established elsewhere (e.g. a single-writer guarantee).
- "Missing" error handling that is intentionally handled by a framework boundary.

## Finding fields
- `rule`: the violated invariant or bug class.

## Refutation hints
- Can the bug actually be triggered? Construct the concrete input/interleaving.
- Is there a test that already exercises this path and passes?
```

- [ ] **Step 6: Create `dead-code.md`**

```markdown
<!-- lenses/dead-code.md -->
---
name: dead-code
title: Dead-Code Investigator
perspective: >
  Find code that no longer earns its place: unreferenced symbols and files,
  unreachable branches, and dependencies nothing imports.
verification_class: cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---

## What to look for
- Exported/!exported functions, classes, constants with no references.
- Whole files imported by nothing.
- Unreachable branches (conditions that can never hold).
- Declared dependencies never imported.

## Rules consulted
- General cleanliness rules.

## False-positive traps
- Dynamic imports / `require(variable)`; string-keyed dispatch tables.
- Reflection / registration patterns (plugin/tool/route registries, DI containers).
- Test-only or fixture-only references; framework/CLI entrypoints invoked by config.
- Re-exports consumed by external packages.

## Finding fields
- Cite where you searched for references (the negative evidence).

## Refutation hints
- Re-run a repo-wide reference search including dynamic/string usages before confirming.
```

- [ ] **Step 7: Create `comments.md`**

```markdown
<!-- lenses/comments.md -->
---
name: comments
title: Comment Hygiene Investigator
perspective: >
  Treat comments as code that can rot: flag the ones that mislead, duplicate the
  code, or are leftover scaffolding.
verification_class: cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---

## What to look for
- Comments that contradict the code they describe (stale).
- Commented-out code blocks.
- Redundant comments that merely restate the next line.
- TODO/FIXME that are already done or obsolete.

## Rules consulted
- General coding-style rules on comments.

## False-positive traps
- Comments encoding non-obvious *why* (rationale, links to specs/issues) — keep these.
- License headers, type-checker directives, generated-file markers.

## Finding fields
- Quote the comment and the code it contradicts/duplicates.

## Refutation hints
- Does the comment carry rationale not derivable from the code? If so, it is not removable.
```

- [ ] **Step 8: Create `refactor.md`**

```markdown
<!-- lenses/refactor.md -->
---
name: refactor
title: Refactor & Conciseness Investigator
perspective: >
  Look for structure that fights the reader: oversized units, duplication,
  deep nesting, and code living in the wrong place.
verification_class: cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---

## What to look for
- Files > ~800 LOC or functions > ~50 LOC doing too much.
- Deep nesting (> 4 levels) that early-returns would flatten.
- Duplicated logic that wants a shared helper.
- Code misplaced relative to its responsibility; weak module boundaries.
- Mutation where an immutable update would be clearer.

## Rules consulted
- General coding-style + code-review rules.

## False-positive traps
- A "long" file that is cohesive and stable — size alone is not a defect.
- Apparent duplication that is coincidental and would couple unrelated code if merged.

## Finding fields
- Propose the concrete split/extraction; note it must be behavior-preserving.

## Refutation hints
- Would the refactor change behavior? If yes, it is a bug-risk, not a clean refactor — downgrade/redirect.
```

- [ ] **Step 9: Run tests (shipped lenses + the deferred CLI lens test)**

Run: `cd .claude/skills/sherlock && node --test tests/shipped-lenses.test.js tests/cli.test.js`
Expected: PASS — shipped-lenses (2 tests) and the previously-deferred `cli lenses` test now pass.

- [ ] **Step 10: Commit**

```bash
git add .claude/skills/sherlock/lenses/ .claude/skills/sherlock/tests/shipped-lenses.test.js
git commit -m "feat(sherlock): ship five investigator lenses + template"
```

---

## Task 14: Standard rule-pack (general invariants only)

**Files:**
- Create: `.claude/skills/sherlock/rules/standard/security.md`
- Create: `.claude/skills/sherlock/rules/standard/correctness.md`
- Create: `.claude/skills/sherlock/rules/standard/cleanliness.md`
- Create: `.claude/skills/sherlock/rules/standard/README.md`
- Test: `.claude/skills/sherlock/tests/standard-rules.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/standard-rules.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "rules/standard");

test("standard pack has the three general rule files", async () => {
  const files = (await readdir(dir)).sort();
  for (const f of ["cleanliness.md", "correctness.md", "security.md"]) assert.ok(files.includes(f));
});

test("standard pack contains no project-specific terms", async () => {
  const banned = /furiosa|coordinator|svc_token|path-jail|pi thread|tenant/i;
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".md")) continue;
    const text = await readFile(path.join(dir, f), "utf8");
    assert.ok(!banned.test(text), `${f} must stay general (no project-specific terms)`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/standard-rules.test.js`
Expected: FAIL — `ENOENT` on `rules/standard`.

- [ ] **Step 3: Create `security.md` (general)**

```markdown
<!-- rules/standard/security.md -->
# Standard Security Invariants (general)

- Validate all input at trust boundaries; never trust client-supplied identity, paths, or sizes.
- Parameterize queries; never concatenate untrusted input into SQL/commands/templates.
- Escape/encode output to prevent XSS; sanitize HTML.
- Enforce authentication and authorization on every non-public entrypoint.
- Re-resolve and contain filesystem paths derived from input (canonicalize + prefix-check).
- Re-validate outbound request targets to prevent SSRF; bound and re-check redirects.
- Keep secrets in env/secret-manager; never hardcode; never log them.
- Pin third-party CDN scripts/styles to exact versions with Subresource Integrity + crossorigin.
- Error messages must not leak sensitive data.
```

- [ ] **Step 4: Create `correctness.md` (general)**

```markdown
<!-- rules/standard/correctness.md -->
# Standard Correctness Invariants (general)

- Handle errors explicitly at every level; never silently swallow.
- Always `await` promises; surface or handle rejections.
- Guard shared mutable state against races; avoid check-then-act on shared resources.
- Release resources deterministically (files, sockets, child processes, locks).
- Validate boundary conditions (empty, max, off-by-one).
- Preserve documented state-machine transitions; reject impossible states early.
```

- [ ] **Step 5: Create `cleanliness.md` (general) + README**

```markdown
<!-- rules/standard/cleanliness.md -->
# Standard Cleanliness Invariants (general)

- Functions focused (< ~50 lines); files cohesive (< ~800 lines); nesting < 4 levels.
- No dead code: unreferenced symbols/files, unreachable branches, unused deps.
- Comments explain *why*, not *what*; remove stale, contradictory, commented-out, or done-TODO comments.
- Prefer immutable updates; avoid in-place mutation of shared inputs.
- DRY: extract genuine duplication; do not over-couple coincidental similarity.
```

```markdown
<!-- rules/standard/README.md -->
# Standard rule-pack

General, repo-agnostic invariants shipped with sherlock. **Never** put
project-specific guardrails here — those reach a review only through the target
repo's explicit project overlay (`sherlock.config.yml` → `rules.project`).
See the design doc §6.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/standard-rules.test.js`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/sherlock/rules/standard/ .claude/skills/sherlock/tests/standard-rules.test.js
git commit -m "feat(sherlock): general-only standard rule-pack"
```

---

## Task 15: Workflow orchestration script

**Files:**
- Create: `.claude/skills/sherlock/workflow/sherlock.workflow.js`
- Test: `.claude/skills/sherlock/tests/workflow-meta.test.js`

The workflow runs under the Workflow tool, not `node` — so it cannot be unit-tested by execution. We test only its static shape (valid `meta` literal, declared phases, presence of the verify routing). The body is authored to the spec §7.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/workflow-meta.test.js
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
  // verify routing distinguishes cleanup vs security/correctness
  assert.ok(src.includes("verification_class"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/workflow-meta.test.js`
Expected: FAIL — `ENOENT` on the workflow file.

- [ ] **Step 3: Author the workflow script**

```javascript
// workflow/sherlock.workflow.js
export const meta = {
  name: 'sherlock',
  description: 'Risk-tiered code investigation: lenses → adversarial verify → triaged report',
  phases: [
    { title: 'Partition', detail: 'CLI builds units.json + scaffolds report' },
    { title: 'Review', detail: 'one reviewer agent per (unit × applicable lens)' },
    { title: 'Verify', detail: 'adversarially refute each candidate finding' },
    { title: 'Synthesize', detail: 'dedupe, group, write report; reconcile coverage' },
  ],
}

// args: { scope?: string, lenses?: string, date?: string }
const CLI = '.claude/skills/sherlock/bin/cli.js'
const FINDING = { type: 'object', required: ['id','lens','severity','file','line','excerpt','rationale','recommendation'],
  properties: { id:{type:'string'}, lens:{type:'string'}, severity:{type:'string',enum:['CRITICAL','HIGH','MEDIUM','LOW']},
    file:{type:'string'}, line:{type:'integer'}, excerpt:{type:'string'}, rationale:{type:'string'}, rule:{type:'string'}, recommendation:{type:'string'} } }
const FINDINGS = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: FINDING } } }
const VERDICT = { type: 'object', required: ['verdict','reason'], properties: { verdict:{type:'string',enum:['confirmed','uncertain','refuted']}, reason:{type:'string'} } }

phase('Partition')
log('Sherlock: partitioning + scaffolding (deterministic CLI)')
// The orchestrator (you) runs these Bash steps before/within the workflow:
//   node .claude/skills/sherlock/bin/cli.js partition <scope>
//   node .claude/skills/sherlock/bin/cli.js scaffold --date <date>
//   node .claude/skills/sherlock/bin/cli.js rules        (resolve rule context)
//   node .claude/skills/sherlock/bin/cli.js lenses --select <lenses>
// units.json, the resolved lens set, and the rule context are passed via args.
const units = args?.units || []
const lenses = args?.lenses || []        // resolved Lens objects (name, verification_class, applies_to, severity_default)
const rules = args?.rules || { standard: [], projectGeneral: [], projectSpecific: [] }

function lensesForUnit(unit) {
  return lenses.filter(l => l.applies_to.tiers.includes(unit.tier))
}

const perUnit = await pipeline(
  units,
  // Stage 1 — REVIEW: fan out one reviewer per applicable lens, collect candidate findings
  (unit) => parallel(lensesForUnit(unit).map(lens => () =>
    agent(
      `You are the "${lens.name}" investigator (${lens.title}).\n` +
      `Perspective: ${lens.perspective}\n` +
      `Review ONLY these files of unit "${unit.id}" (tier ${unit.tier}): ${unit.files.join(', ')}.\n` +
      `Check against these rules (project-specific override general on conflict):\n` +
      `  standard: ${rules.standard.join(', ')}\n  project: ${[...rules.projectGeneral, ...rules.projectSpecific].join(', ')}\n` +
      `Emit candidate findings with file:line, a code excerpt, the violated rule, severity, and a concrete recommendation. ` +
      `Be precise; no finding without evidence.`,
      { label: `review:${unit.id}:${lens.name}`, phase: 'Review', schema: FINDINGS },
    ).then(r => (r?.findings || []).map(f => ({ ...f, unit: unit.id, verification_class: lens.verification_class })))
  )).then(groups => ({ unit, candidates: groups.filter(Boolean).flat() })),

  // Stage 2 — VERIFY: route each candidate by verification_class
  ({ unit, candidates }) => parallel(candidates.map(f => () => {
    if (f.verification_class === 'cleanup') {
      return agent(
        `Refute-by-default check of this ${f.lens} finding:\n${JSON.stringify(f)}\n` +
        `For dead-code: re-search the whole repo for references INCLUDING dynamic imports, string-keyed dispatch, ` +
        `reflection/registration, test-only and entrypoint usage. For comment/refactor: confirm the change is ` +
        `behavior-preserving and a real improvement. Verdict refuted unless clearly real.`,
        { label: `verify:${unit.id}:${f.id}`, phase: 'Verify', schema: VERDICT },
      ).then(v => ({ ...f, verdict: v }))
    }
    // security / correctness → 3-vote panel, distinct probes
    const probes = ['reproduce the concrete trigger path', 'establish a real reachable impact', 'confirm it violates the cited rule/spec']
    return parallel(probes.map(probe => () =>
      agent(`Try to REFUTE this ${f.lens} finding via: ${probe}.\n${JSON.stringify(f)}\nDefault to refuted if uncertain.`,
        { label: `verify:${unit.id}:${f.id}`, phase: 'Verify', schema: VERDICT })
    )).then(votes => {
      const real = votes.filter(Boolean).filter(v => v.verdict === 'confirmed').length
      const verdict = real >= 2 ? 'confirmed' : (real === 1 ? 'uncertain' : 'refuted')
      return { ...f, verdict: { verdict, reason: votes.filter(Boolean).map(v => v.reason).join(' | ') } }
    })
  })).then(verified => ({ unit, verified: verified.filter(Boolean) })),
)

// Phase 3 — SYNTHESIZE (barrier: needs all units to dedupe + group)
phase('Synthesize')
const all = perUnit.filter(Boolean).flatMap(u => u.verified)
const kept = all.filter(f => f.verdict.verdict !== 'refuted')
const refuted = all.filter(f => f.verdict.verdict === 'refuted')
const summary = await agent(
  `Synthesize the final review report from these verified findings (JSON):\n${JSON.stringify(kept).slice(0, 200000)}\n` +
  `Group by area and severity; write an executive summary with counts by severity × area and the top CRITICAL/HIGH items first.`,
  { label: 'synthesize', phase: 'Synthesize' },
)
log(`Sherlock: ${kept.length} findings kept, ${refuted.length} refuted`)
return { kept, refuted, summary, units: units.map(u => u.id) }
```

> Execution note for the orchestrator: run the deterministic CLI steps (partition,
> scaffold, rules, lenses) first, then invoke this workflow passing `{ units, lenses,
> rules }` as `args`. After it returns, write `kept`/`refuted`/`summary` into the
> scaffolded report files, populate `units-status.json`, and run
> `node .claude/skills/sherlock/bin/cli.js coverage --findings <report-dir>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/workflow-meta.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/sherlock/workflow/sherlock.workflow.js .claude/skills/sherlock/tests/workflow-meta.test.js
git commit -m "feat(sherlock): fan-out → adversarial-verify → synthesize workflow"
```

---

## Task 16: `SKILL.md` + `README.md`

**Files:**
- Create: `.claude/skills/sherlock/SKILL.md`
- Create: `.claude/skills/sherlock/README.md`
- Test: `.claude/skills/sherlock/tests/skill-md.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/skill-md.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("SKILL.md has frontmatter name + description and the token-cost warning", async () => {
  const md = await readFile(path.join(root, "SKILL.md"), "utf8");
  assert.ok(/^---\n[\s\S]*name:\s*sherlock[\s\S]*description:[\s\S]*\n---/.test(md));
  assert.ok(/token|cost|opt-in/i.test(md), "must flag token-intensive opt-in");
  for (const c of ["partition", "scaffold", "coverage", "lenses", "rules"]) assert.ok(md.includes(c));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .claude/skills/sherlock && node --test tests/skill-md.test.js`
Expected: FAIL — `ENOENT` on `SKILL.md`.

- [ ] **Step 3: Write `SKILL.md`**

```markdown
---
name: sherlock
description: Use when the user wants a structured, full or scoped code review/audit of a codebase for security vulnerabilities, bugs, dead code, removable comments, and refactor/cleanliness opportunities — runs risk-tiered investigator "lenses" with adversarial verification and produces a triaged findings report (no code changes). Triggers include "review the codebase", "audit for vulnerabilities", "/sherlock".
---

# Sherlock — Code Investigation

Sherlock reviews a codebase through perspective **lenses** (security, correctness,
dead-code, comments, refactor), **adversarially verifies** every finding, and writes
a **triaged report** under `docs/reviews/`. It changes no code.

> **Opt-in / token-intensive.** The review runs as multi-agent orchestration
> (one reviewer per unit × lens, plus per-finding verifiers). Confirm scope with the
> user before launching a full-repo run.

## Procedure

1. **Partition + scaffold (deterministic CLI):**
   ```bash
   node .claude/skills/sherlock/bin/cli.js partition [path-or-glob]
   node .claude/skills/sherlock/bin/cli.js scaffold
   node .claude/skills/sherlock/bin/cli.js rules
   node .claude/skills/sherlock/bin/cli.js lenses [--select security,bugs,...]
   ```
   Read `.sherlock/units.json` and the resolved lens + rule context.
2. **Run the workflow** `workflow/sherlock.workflow.js` via the Workflow tool,
   passing `{ units, lenses, rules, date }` as `args`. It fans out reviewers,
   adversarially verifies, and returns `{ kept, refuted, summary }`.
3. **Write results** into the scaffolded report files; fill `units-status.json`.
4. **Reconcile coverage:**
   ```bash
   node .claude/skills/sherlock/bin/cli.js coverage --findings docs/reviews/<date>-codebase-review
   ```
   A non-zero exit means a unit was missed — do not call the review complete.

## Invocation
- `/sherlock` — whole repo, all applicable lenses.
- `/sherlock <path-or-glob>` — scoped.
- `/sherlock --lenses security,bugs` — only the named investigators.

## Extending
Add an investigator: copy `lenses/_TEMPLATE.md` to `lenses/<name>.md`. Project-specific
invariants: set `rules.project` in `sherlock.config.yml` (never edit `rules/standard/`,
which stays general — see the design doc §6).

## CLI reference
`partition` · `scaffold` · `coverage` · `lenses` · `rules` — run any with `--help`.
```

- [ ] **Step 4: Write `README.md`**

```markdown
<!-- README.md -->
# sherlock

Repo-agnostic code-investigation skill: risk-tiered review lenses + adversarial
verification → a triaged findings report (no code changes).

- Design: [`docs/2026-06-29-sherlock-skill-design.md`](docs/2026-06-29-sherlock-skill-design.md)
- Plan: [`docs/2026-06-29-sherlock-implementation-plan.md`](docs/2026-06-29-sherlock-implementation-plan.md)
- Entry point for agents: [`SKILL.md`](SKILL.md)

```bash
node bin/cli.js --help
npm test
```
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .claude/skills/sherlock && node --test tests/skill-md.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Run the full suite**

Run: `cd .claude/skills/sherlock && npm test`
Expected: PASS — all test files green.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/sherlock/SKILL.md .claude/skills/sherlock/README.md .claude/skills/sherlock/tests/skill-md.test.js
git commit -m "docs(sherlock): SKILL.md entry point + README"
```

---

## Task 17: Smoke-test against this repo (no findings written)

**Files:**
- None created — this is a verification task on the real repo.

- [ ] **Step 1: Add the furiosa project overlay config**

Create `sherlock.config.yml` at the repo root:

```yaml
# sherlock config — see .claude/skills/sherlock/docs/2026-06-29-sherlock-skill-design.md
output: docs/reviews
rules:
  project:
    - .claude/rules/furiosa
tiers:
  S:
    - "api/src/auth/**"
    - "api/src/workspace/**"
    - "api/src/routes/**"
    - "api/src/mcp/**"
    - "api/src/voice/**"
    - "api/src/sessions/**"
    - "api/src/tasks/**"
    - "api/src/agents/**"
    - "api/src/messages/**"
    - "api/src/memory/**"
    - "api/src/models/**"
    - "agents/src/coordinator/**"
    - "agents/src/coordinator-pool.ts"
    - "agents/src/http/**"
    - "agents/src/tools/**"
    - "agents/src/middleware/**"
    - "agents/src/worker-*.ts"
    - "agents/src/agent-respawn.ts"
    - "agents/src/protocol/**"
  A:
    - "api/src/ws/**"
    - "api/src/observability/**"
    - "frontend/src/ws/**"
    - "frontend/src/streaming/**"
    - "frontend/src/store/**"
    - "frontend/src/voice/**"
    - "agents/src/completion/**"
    - "agents/src/persistence/**"
    - "agents/src/redis/**"
  B:
    - "**"
```

- [ ] **Step 2: Run the deterministic CLI end-to-end**

Run:
```bash
node .claude/skills/sherlock/bin/cli.js partition
node .claude/skills/sherlock/bin/cli.js rules
node .claude/skills/sherlock/bin/cli.js lenses
node .claude/skills/sherlock/bin/cli.js scaffold --date 2026-06-29
```
Expected: `.sherlock/units.json` lists ~30–50 units; `rules` shows the furiosa overlay under project-specific and common/python/typescript under project-general; `scaffold` creates `docs/reviews/2026-06-29-codebase-review/` with a seeded `coverage.md`.

- [ ] **Step 3: Sanity-check the partition**

Run: `node -e "const u=require('./.sherlock/units.json');const t={};for(const x of u.units)t[x.tier]=(t[x.tier]||0)+1;console.log(t)"`
Expected: counts in all three tiers; S includes auth/workspace/coordinator units.

- [ ] **Step 4: Commit the config (campaign execution is separate)**

```bash
git add sherlock.config.yml
git commit -m "chore(sherlock): furiosa project overlay config for the review campaign"
```

> The actual multi-agent review run (Phase 1–3 producing findings) is the
> **campaign** described in `docs/superpowers/specs/2026-06-29-codebase-review-campaign-design.md`
> and is launched explicitly by the user, not by this build plan.

---

## Self-Review (completed during planning)

- **Spec coverage:** package layout (§3) → Tasks 1,12,16; lenses + template (§4) →
  Tasks 9,13; CLI commands (§5) → Tasks 6,7,8,9,10,12; rule layering (§6) → Tasks
  10,14; verify panel + workflow (§7) → Task 15; invocation incl. `--lenses` (§8) →
  Tasks 9,12,16; config (§9) → Tasks 4,17; testing (§10) → every task; out-of-scope
  (§11) `--fix`/non-git/monorepo correctly absent.
- **Placeholder scan:** every code/step block contains real, runnable content; no
  TBD/TODO-as-implementation.
- **Type consistency:** module APIs (paths/kebab/loc/glob/config/tiers/lenses/rules)
  match the contract table; unit object `{id,path,tier,files,loc}` and Lens object
  `{name,title,perspective,verification_class,applies_to,severity_default,file}` are
  used identically across partition, scaffold, coverage, lenses, workflow, and schemas.
- **Known cross-task dependency:** the `cli lenses` assertion in Task 12 intentionally
  goes green only after Task 13 — called out in both tasks.

# Sherlock — Project-Aware Tier Config Bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give repos meaningful risk tiers with zero config — ship a real default taxonomy, and have `investigate` draft a project-aware `sherlock.config.yml` (from a tree scan) that Claude refines before the first partition.

**Architecture:** A new leaf module `src/config-gen.js` owns the risk taxonomy + config drafting (pure helpers + a tree scan). `src/config.js` reuses the taxonomy for its built-in defaults and gains a `configFileExists` check. `src/commands/investigate.js` gains a bootstrap gate: on a config-less repo it drafts the config and returns early (the refine gate), so Claude tunes tiers before any partition. Deterministic CLI draft → LLM refine.

**Tech Stack:** Node.js ≥18 ESM, `node --test`, `js-yaml`, `picomatch` (via existing `src/glob.js`). All paths relative to the skill root `skills/sherlock/` (the `npm test` cwd). Base branch: `main`.

**Spec:** [`docs/2026-07-01-sherlock-tier-config-bootstrap-design.md`](2026-07-01-sherlock-tier-config-bootstrap-design.md)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/config-gen.js` | Risk taxonomy + config drafting | **New.** `TIER_KEYWORDS`, `keywordGlobs`, `scanSegments`, `tailoredTiers`, `renderConfigYaml`, `writeStarterConfig`. Leaf: imports only `node:fs/promises`, `node:path`, `./glob.js`. |
| `src/config.js` | Config load/defaults/validate | `defaultTiersConfig` uses `keywordGlobs`; add `configFileExists(cwd)`. |
| `src/commands/investigate.js` | Prep + plan | Bootstrap gate + early return before the reuse-first prep. |
| `SKILL.md` | Agent entry point | First-run refine-loop note in the Procedure. |
| `README.md` | Docs | Note zero-config tiers + the drafted config. |
| `tests/*` | Coverage | New `config-gen.test.js`; extend `config.test.js`, `investigate.test.js`, `skill-md.test.js`. |

**No circular import:** direction is one-way `config.js → config-gen.js`. `config-gen.js` never imports `config.js`; the `include`/`exclude` it needs are passed in by `investigate` (which has them from `loadConfig`).

---

## Task 1: Taxonomy + pure config-rendering helpers (`src/config-gen.js`)

**Files:**
- Create: `src/config-gen.js`
- Test: `tests/config-gen.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/config-gen.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import { TIER_KEYWORDS, keywordGlobs, tailoredTiers, renderConfigYaml } from "../src/config-gen.js";

test("TIER_KEYWORDS defines S and A keyword lists", () => {
  assert.ok(Array.isArray(TIER_KEYWORDS.S) && TIER_KEYWORDS.S.includes("auth"));
  assert.ok(Array.isArray(TIER_KEYWORDS.A) && TIER_KEYWORDS.A.includes("api"));
});

test("keywordGlobs maps keywords to sorted **/kw/** globs", () => {
  const s = keywordGlobs("S");
  assert.ok(s.includes("**/auth/**"));
  assert.deepEqual(s, [...s].sort(), "sorted");
  assert.equal(s.length, TIER_KEYWORDS.S.length);
});

test("tailoredTiers keeps only globs whose keyword is present; B is always **", () => {
  const t = tailoredTiers(new Set(["auth", "api", "util"]));
  assert.deepEqual(t.S, ["**/auth/**"]);
  assert.deepEqual(t.A, ["**/api/**"]);
  assert.deepEqual(t.B, ["**"]);
});

test("tailoredTiers is deterministic and empty when nothing matches", () => {
  const t = tailoredTiers(new Set(["util", "helpers2"]));
  assert.deepEqual(t.S, []);
  assert.deepEqual(t.A, []);
  assert.deepEqual(t.B, ["**"]);
});

test("renderConfigYaml emits parseable YAML with tiers + exclude + rules.project", () => {
  const yml = renderConfigYaml({
    tiers: { S: ["**/auth/**"], A: [], B: ["**"] },
    exclude: ["**/node_modules/**"],
  });
  const doc = yaml.load(yml);
  assert.deepEqual(doc.tiers.S, ["**/auth/**"]);
  assert.deepEqual(doc.tiers.A, []);
  assert.deepEqual(doc.tiers.B, ["**"]);
  assert.deepEqual(doc.exclude, ["**/node_modules/**"]);
  assert.deepEqual(doc.rules.project, []);
  assert.equal(doc.output, "docs/reviews");
  assert.ok(yml.startsWith("#"), "leads with an explanatory comment");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config-gen.test.js`
Expected: FAIL — `../src/config-gen.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/config-gen.js`:

```javascript
import { writeFile, access } from "node:fs/promises";
import path from "node:path";
import { walkFiles } from "./glob.js";

// Single source of truth for the risk taxonomy. A keyword `k` → glob `**/${k}/**`
// (matches any directory named `k` at any depth). Directory-segment matching only —
// no fuzzy filename matching (which would catch "author" for "auth").
export const TIER_KEYWORDS = {
  S: [
    "auth", "authz", "login", "security", "secret", "secrets", "crypto",
    "credential", "credentials", "token", "tokens", "password", "passwords",
    "payment", "payments", "billing", "oauth", "jwt", "sso", "saml", "iam",
    "vault", "keys",
  ],
  A: [
    "api", "server", "route", "routes", "router", "controller", "controllers",
    "db", "database", "model", "models", "middleware", "session", "sessions",
    "tenant", "permission", "permissions", "ws", "websocket", "stream",
    "streaming", "upload", "uploads", "webhook", "webhooks", "handlers",
    "graphql", "rpc", "gateway", "queue", "queues", "worker", "workers",
    "storage", "cache",
  ],
};

export function keywordGlobs(tier) {
  return TIER_KEYWORDS[tier].map((k) => `**/${k}/**`).sort();
}

// Keep only the taxonomy globs whose keyword actually appears as a directory segment.
export function tailoredTiers(segments) {
  const pick = (tier) =>
    TIER_KEYWORDS[tier].filter((k) => segments.has(k)).map((k) => `**/${k}/**`).sort();
  return { S: pick("S"), A: pick("A"), B: ["**"] };
}

// A commented sherlock.config.yml body. Built by hand (not yaml.dump) so it can carry
// explanatory comments. Empty tier lists render as `S: []`.
export function renderConfigYaml({ tiers, exclude }) {
  const list = (name, items) =>
    items.length
      ? `  ${name}:\n${items.map((i) => `    - "${i}"`).join("\n")}`
      : `  ${name}: []`;
  return [
    "# sherlock.config.yml — drafted by `investigate` from your project's file tree.",
    "# The S/A tiers below were derived from directories found in the repo. REVIEW and",
    "# refine them to match your real risk surface, then re-run investigate.",
    "#   S = highest-risk (all lenses) · A = elevated · B = everything else.",
    "",
    "output: docs/reviews",
    "",
    "rules:",
    "  project: []   # paths to your project's rule/invariant docs (override standard on conflict)",
    "",
    "tiers:",
    list("S", tiers.S),
    list("A", tiers.A),
    list("B", tiers.B),
    "",
    "exclude:",
    ...exclude.map((e) => `  - "${e}"`),
    "",
  ].join("\n");
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Collect every directory path segment across the included files (exclude-aware walk).
export async function scanSegments(cwd, { include, exclude }) {
  const files = await walkFiles(cwd, { include, exclude });
  const segments = new Set();
  for (const f of files) {
    const parts = f.rel.split("/");
    for (const seg of parts.slice(0, -1)) segments.add(seg);
  }
  return segments;
}

// Draft a tailored sherlock.config.yml — but never overwrite an existing config.
export async function writeStarterConfig(cwd, { include, exclude }) {
  const yml = path.join(cwd, "sherlock.config.yml");
  const json = path.join(cwd, "sherlock.config.json");
  if ((await fileExists(yml)) || (await fileExists(json))) {
    return { written: false, path: yml, tiers: null };
  }
  const segments = await scanSegments(cwd, { include, exclude });
  const tiers = tailoredTiers(segments);
  await writeFile(yml, renderConfigYaml({ tiers, exclude }));
  return { written: true, path: yml, tiers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/config-gen.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/config-gen.js skills/sherlock/tests/config-gen.test.js
git commit -m "feat(sherlock): risk taxonomy + config-draft helpers (config-gen.js)"
```

---

## Task 2: Tree scan + write-once starter config (I/O in `config-gen.js`)

**Files:**
- Modify: `tests/config-gen.test.js` (add I/O tests — the functions already exist from Task 1)

Note: `scanSegments` and `writeStarterConfig` were implemented in Task 1. This task adds their I/O tests (kept separate because they need a temp filesystem).

- [ ] **Step 1: Write the failing test**

Append to `tests/config-gen.test.js`:

```javascript
import { mkdtemp, mkdir, writeFile as fsWrite, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanSegments, writeStarterConfig } from "../src/config-gen.js";
import { loadConfig } from "../src/config.js";

async function repoWith(files) {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-gen-"));
  for (const rel of files) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await fsWrite(path.join(root, rel), "x\n");
  }
  return root;
}

test("scanSegments collects directory segments of included files", async () => {
  const root = await repoWith(["src/auth/a.ts", "lib/util/b.ts"]);
  const segs = await scanSegments(root, { include: ["**/*.ts"], exclude: [] });
  assert.ok(segs.has("auth") && segs.has("util") && segs.has("src") && segs.has("lib"));
});

test("writeStarterConfig writes a tailored config when none exists", async () => {
  const root = await repoWith(["src/auth/a.ts", "src/api/b.ts", "src/util/c.ts"]);
  const res = await writeStarterConfig(root, { include: ["**/*.ts"], exclude: ["**/node_modules/**"] });
  assert.equal(res.written, true);
  assert.deepEqual(res.tiers.S, ["**/auth/**"]);
  assert.deepEqual(res.tiers.A, ["**/api/**"]);
  // the written file loads + validates through loadConfig
  const cfg = await loadConfig(root);
  assert.ok(cfg.tiers.S.includes("**/auth/**"));
  assert.ok(cfg.tiers.A.includes("**/api/**"));
});

test("writeStarterConfig never overwrites an existing config", async () => {
  const root = await repoWith(["src/auth/a.ts"]);
  const cfgPath = path.join(root, "sherlock.config.yml");
  await fsWrite(cfgPath, "output: docs/custom\n");
  const before = await readFile(cfgPath, "utf8");
  const res = await writeStarterConfig(root, { include: ["**/*.ts"], exclude: [] });
  assert.equal(res.written, false);
  assert.equal(await readFile(cfgPath, "utf8"), before, "file left byte-identical");
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node --test tests/config-gen.test.js`
Expected: PASS — the functions exist from Task 1. If any fails, it reveals a bug in Task 1's `scanSegments`/`writeStarterConfig`; fix it in `src/config-gen.js` (do not weaken the test) and re-run.

Note: this task depends on `loadConfig` reading the written YAML. If Task 3 is not yet done, `loadConfig`'s defaults still merge correctly (parsed tiers override defaults per key), so this test passes regardless of Task 3 ordering.

- [ ] **Step 3: (implementation already present)** — no source change; Task 1 implemented these.

- [ ] **Step 4: Run the whole file**

Run: `node --test tests/config-gen.test.js`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/tests/config-gen.test.js
git commit -m "test(sherlock): scanSegments + writeStarterConfig I/O coverage"
```

---

## Task 3: Real default tiers + `configFileExists` (`src/config.js`)

**Files:**
- Modify: `src/config.js`
- Test: `tests/config.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/config.test.js`:

```javascript
import { assignTier } from "../src/tiers.js";
import { configFileExists } from "../src/config.js";
import { mkdtemp as mkdtempFn, mkdir as mkdirFn, writeFile as writeFileFn } from "node:fs/promises";

test("default tiers classify auth→S, api→A, other→B", () => {
  const c = defaultConfig();
  assert.equal(assignTier("src/auth/login.ts", c.tiers), "S");
  assert.equal(assignTier("services/api/users.ts", c.tiers), "A");
  assert.equal(assignTier("src/util/str.ts", c.tiers), "B");
});

test("configFileExists detects yml/json presence", async () => {
  const empty = await mkdtempFn(path.join(tmpdir(), "sherlock-cfe-"));
  assert.equal(await configFileExists(empty), false);
  const withYml = await mkdtempFn(path.join(tmpdir(), "sherlock-cfe-"));
  await writeFileFn(path.join(withYml, "sherlock.config.yml"), "output: docs/reviews\n");
  assert.equal(await configFileExists(withYml), true);
});
```

Add the `tmpdir` import at the top of `tests/config.test.js` if not present (it currently imports `mkdtemp, writeFile` from `node:fs/promises` and `tmpdir` from `node:os` — verify; the existing file already imports `tmpdir`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config.test.js`
Expected: FAIL — default `tiers.S` is empty so `auth` classifies as B; `configFileExists` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/config.js`:

(a) Add imports at the top — add `access` to the `node:fs/promises` import and import `keywordGlobs`:

```javascript
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { keywordGlobs } from "./config-gen.js";
```

(b) Replace `defaultTiersConfig`:

```javascript
function defaultTiersConfig() {
  return {
    S: keywordGlobs("S"),
    A: keywordGlobs("A"),
    B: ["**"],
  };
}
```

(c) Add `configFileExists` (near the other exports, e.g. after `loadConfig`):

```javascript
export async function configFileExists(cwd) {
  for (const name of ["sherlock.config.yml", "sherlock.config.json"]) {
    try {
      await access(path.join(cwd, name));
      return true;
    } catch {
      // not present — keep checking
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/config.test.js`
Expected: PASS. Then confirm no regression in the taxonomy tests: `node --test tests/config-gen.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/config.js skills/sherlock/tests/config.test.js
git commit -m "feat(sherlock): taxonomy-based default tiers + configFileExists"
```

---

## Task 4: `investigate` bootstrap gate (`src/commands/investigate.js`)

**Files:**
- Modify: `src/commands/investigate.js`
- Test: `tests/investigate.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/investigate.test.js`, add a config-less repo helper and two tests. Append at the end of the file:

```javascript
import { mkdir as mkdirI, writeFile as writeFileI } from "node:fs/promises";

async function repoNoConfig() {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-inv-nocfg-"));
  await mkdirI(path.join(root, "src/auth"), { recursive: true });
  await mkdirI(path.join(root, "src/api"), { recursive: true });
  await writeFileI(path.join(root, "src/auth/login.js"), "x\n".repeat(10));
  await writeFileI(path.join(root, "src/api/users.js"), "y\n".repeat(10));
  // deliberately NO sherlock.config.yml
  return root;
}

test("investigate bootstraps a tailored config and returns early when none exists", async () => {
  const root = await repoNoConfig();
  const { sink, stdout, stderr } = capture();
  const code = await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout, stderr });
  assert.equal(code, 0);
  // config drafted
  await access(path.join(root, "sherlock.config.yml"));
  // plan tells the user to refine + re-run
  assert.ok(sink.out.includes("Config Bootstrap"));
  assert.ok(/refine/i.test(sink.out) && /re-run/i.test(sink.out));
  // EARLY RETURN: no partition, no report
  await assert.rejects(access(path.join(root, ".sherlock/units.json")), /ENOENT/);
  await assert.rejects(access(path.join(root, "docs/reviews/2026-06-30-codebase-review/coverage.md")), /ENOENT/);
});

test("investigate does NOT bootstrap when a config already exists (proceeds to plan)", async () => {
  const root = await repo(); // repo() writes a sherlock.config.yml
  const { sink, stdout, stderr } = capture();
  const code = await cmdInvestigate({ cwd: root, args: ["--date", "2026-06-30"], stdout, stderr });
  assert.equal(code, 0);
  assert.ok(!sink.out.includes("Config Bootstrap"), "no bootstrap when config present");
  await access(path.join(root, ".sherlock/units.json")); // partitioned as normal
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/investigate.test.js`
Expected: FAIL — the config-less repo currently partitions (no bootstrap gate), so `units.json` exists and no "Config Bootstrap" text is printed.

- [ ] **Step 3: Write the implementation**

In `src/commands/investigate.js`:

(a) Extend the imports:

```javascript
import { loadConfig, configFileExists } from "../config.js";
```
and add, alongside the other local imports:
```javascript
import { writeStarterConfig } from "../config-gen.js";
```

(b) Insert the bootstrap gate immediately after the arg-parsing block (after the line `const refresh = args.includes("--refresh");`) and before the `const unitsRelNative = …` line:

```javascript
  // --- config bootstrap (first run in a repo) ---
  // No config yet → draft tailored tiers from the tree and STOP, so Claude refines the
  // S/A globs before any partition consumes them. Fires at most once per repo.
  if (!(await configFileExists(cwd))) {
    const boot = await writeStarterConfig(cwd, { include: config.include, exclude: config.exclude });
    const rel = path.relative(cwd, boot.path) || "sherlock.config.yml";
    stdout.write(
      [
        "# 🕵️ Sherlock — Config Bootstrap",
        "",
        `No sherlock.config.yml found — drafted one from your file tree at ${rel}.`,
        `Tailored tiers: S=${boot.tiers.S.length} A=${boot.tiers.A.length} keyword-dirs matched (everything else → B).`,
        "",
        "## Next step — refine, then re-run",
        "- Review sherlock.config.yml and refine the S/A tier globs to your real risk",
        "  surface (add project-specific high-risk dirs, drop false matches).",
        "- Then re-run investigate to partition + plan:",
        `  node \${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js investigate${scope ? " " + scope : ""}`,
      ].join("\n") + "\n",
    );
    return 0;
  }
```

(`config`, `scope`, `stdout`, and `path` are all already in scope at that point.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/investigate.test.js`
Expected: PASS (the two new tests + the existing ones — existing tests use `repo()` which writes a config, so they skip the gate and behave as before).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/commands/investigate.js skills/sherlock/tests/investigate.test.js
git commit -m "feat(sherlock): investigate drafts tailored config + refine gate on first run"
```

---

## Task 5: SKILL.md refine loop + README note

**Files:**
- Modify: `SKILL.md`, `README.md`
- Test: `tests/skill-md.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/skill-md.test.js`, add:

```javascript
test("SKILL.md documents the first-run config bootstrap + refine loop", async () => {
  const md = await readFile(path.join(root, "SKILL.md"), "utf8");
  assert.ok(md.includes("sherlock.config.yml"), "names the config file");
  assert.ok(/refine/i.test(md) && /tier/i.test(md), "explains refining tiers");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skill-md.test.js`
Expected: FAIL — SKILL.md does not yet mention `sherlock.config.yml`.

- [ ] **Step 3: Update SKILL.md**

In `SKILL.md`, in the Procedure, immediately after step 1 (the `investigate` paragraph that ends "…and the next-step instructions below. Read that plan."), insert a new indented note:

```markdown

   **First run in a repo (no `sherlock.config.yml`):** `investigate` instead drafts a
   tailored `sherlock.config.yml` from the file tree (risk tiers derived from directory
   names) and stops. **Refine it before proceeding:** review the `S`/`A` tier globs against
   the project's real risk surface — add project-specific high-risk dirs, drop false
   matches — then re-run the same `investigate` command to partition + plan. This happens
   once; repos that already have a config skip straight to the plan.
```

- [ ] **Step 4: Update README.md**

In `README.md`, in the **Configuration** section, immediately after the sentence `Sane defaults when absent: tiers default to B, all lenses apply, output docs/reviews, standard exclude list.` replace that sentence with:

```markdown
Zero-config tiers are meaningful out of the box: the built-in defaults map common
risk-bearing directory names to tiers (`**/auth/**`, `**/login/**`, … → **S**;
`**/api/**`, `**/db/**`, `**/middleware/**`, … → **A**; everything else → **B**). On the
first `investigate` in a repo with no `sherlock.config.yml`, the CLI **drafts** one tailored
to your tree (tier globs only for risk keywords actually present) and stops so you can
refine the `S`/`A` globs before the first partition. Other defaults when a key is absent:
all lenses apply, output `docs/reviews`, standard exclude list.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/skill-md.test.js`
Expected: PASS (existing SKILL.md tests + the new one).

- [ ] **Step 6: Commit**

```bash
git add skills/sherlock/SKILL.md skills/sherlock/README.md skills/sherlock/tests/skill-md.test.js
git commit -m "docs(sherlock): document config bootstrap + tier refine loop"
```

---

## Task 6: Full suite + docs commit

**Files:**
- Test: entire suite
- Commit: the design + plan docs

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: ALL pass (previous count 63 + the new tests: 5 config-gen pure + 3 config-gen I/O + 2 config + 2 investigate + 1 skill-md ⇒ ~76 total). Paste the `# tests / # pass / # fail` summary.

- [ ] **Step 2: Fix any fallout**

If any pre-existing test asserted the old empty-`S` default tiers (e.g. a partition/recommend test that assumed everything is B), update it to the new taxonomy-based defaults — but only if the failure is a stale expectation, not a real regression. Re-run `npm test` until green. If a failure looks like a real source bug, STOP and report it rather than papering over it.

- [ ] **Step 3: Commit the design + plan docs**

```bash
git add skills/sherlock/docs/2026-07-01-sherlock-tier-config-bootstrap-design.md \
        skills/sherlock/docs/2026-07-01-sherlock-tier-config-bootstrap-plan.md
git commit -m "docs(sherlock): tier-config bootstrap design + implementation plan"
```

---

## Self-Review

- **Spec §5 (better static defaults):** Task 3 (`defaultTiersConfig` via `keywordGlobs`) + `config.test.js` classification. ✅
- **Spec §6.1 (config-gen module):** Task 1 (pure: `TIER_KEYWORDS`, `keywordGlobs`, `tailoredTiers`, `renderConfigYaml`) + Task 2 (`scanSegments`, `writeStarterConfig` I/O). ✅
- **Spec §6.2 (`configFileExists`):** Task 3. ✅
- **Spec §6.3 (investigate bootstrap + early return):** Task 4, with a test asserting no `units.json`/`coverage.md` are created (early return) and a no-regression test for the config-present path. ✅
- **Spec §6.4 (SKILL.md refine loop) + README:** Task 5. ✅
- **Spec §4 taxonomy:** encoded once in `config-gen.js TIER_KEYWORDS`, reused by `config.js` defaults (no duplication). ✅
- **Spec §10 (no circular import):** `config-gen.js` imports only `node:fs/promises`, `node:path`, `./glob.js`; `config.js → config-gen.js` one-way. Verified in Task 1 import list + Task 3 import. ✅
- **Name/signature consistency:** `keywordGlobs(tier)`, `tailoredTiers(segments)`, `scanSegments(cwd,{include,exclude})`, `renderConfigYaml({tiers,exclude})`, `writeStarterConfig(cwd,{include,exclude})→{written,path,tiers}`, `configFileExists(cwd)` — used identically across Tasks 1–4 and all tests. ✅
- **Placeholder scan:** none — every code step is complete; every run step has an expected result. ✅
- **Early-return safety:** existing `investigate.test.js` `repo()` writes a config, so the gate is skipped there; the two new tests cover both branches. ✅
```

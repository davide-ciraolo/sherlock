# Sherlock Investigator Persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sherlock's review report an investigator persona — an investigation-arc structure, per-finding case-files, and a canonical emoji palette — confined to the report-writing layer.

**Architecture:** Persona lives only in report-writing surfaces: the deterministic scaffold templates, a new `report-style.md` style guide, the workflow's *Synthesize* prompt, and the SKILL.md write-up step. Reviewer/verifier prompts and the finding schema are untouched.

**Tech Stack:** Node.js ≥18 ES modules, `node --test` (built-in test runner), `js-yaml`, `picomatch`. No new dependencies.

**Spec:** `skills/sherlock/docs/2026-06-30-sherlock-persona-design.md`

---

## Working directory & conventions

- **Package dir** (run all `node`/`npm`/test commands here): `<repo>/skills/sherlock/` where `<repo>` = `c:/Users/Public/digitiamo/furiosa/.claude/skills/sherlock`. All file paths below are **relative to this package dir**.
- **Git:** run from anywhere in the repo; `git add` paths are written repo-relative (`skills/sherlock/...`).
- **Run one test file:** `node --test tests/<file>.test.js`
- **Run all tests:** `npm test`
- Tests resolve the package dir as `path.dirname(path.dirname(fileURLToPath(import.meta.url)))` (i.e. `tests/` → package root). Shipped resources (`lenses/`, the new `report-style.md`) are read relative to that root.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `report-style.md` | Single source of truth for the persona: arc, emoji palette, case-file format | **Create** |
| `tests/report-style.test.js` | Validates the shipped `report-style.md` contains the palette + sections | **Create** |
| `src/commands/scaffold.js` | Writes the report skeleton; renames `README.md`→`INVESTIGATION.md`, adds persona skeletons + legend | **Modify** |
| `tests/scaffold-cmd.test.js` | Update expected filenames + assert persona content | **Modify** |
| `workflow/sherlock.workflow.js` | *Synthesize* prompt references `report-style.md` and emits Brief/ledger/Verdict | **Modify** |
| `tests/workflow-meta.test.js` | Assert the synthesize prompt references the style guide + arc sections | **Modify** |
| `SKILL.md` | Step 3 references the case-file format, legend, and `report-style.md` | **Modify** |
| `tests/skill-md.test.js` | Assert SKILL.md mentions `INVESTIGATION.md` + `report-style.md` | **Modify** |

---

## Task 1: Ship the `report-style.md` persona style guide

**Files:**
- Create: `report-style.md`
- Test: `tests/report-style.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/report-style.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("report-style.md ships the canonical persona palette and arc", async () => {
  const md = await readFile(path.join(root, "report-style.md"), "utf8");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/report-style.test.js`
Expected: FAIL — `ENOENT` opening `report-style.md` (file does not exist yet).

- [ ] **Step 3: Create `report-style.md`**

```markdown
# Sherlock — Report Style Guide

The persona that shapes how a review **reads**. Voice lives here and in the
synthesis/write step only — never in reviewer or verifier prompts.

## Voice
Terse, technical, evidence-first. One in-character framing line per section is
welcome. **No narrative prose inside findings** beyond the four case-file lines.

## Emoji palette (canonical)

| Role | Emoji |
|---|---|
| Severity — CRITICAL / HIGH / MEDIUM / LOW | 🔴 / 🟠 / 🟡 / 🟢 |
| Verdict — confirmed / uncertain / dismissed | ✅ / 🟡 / 🚫 |
| Report header (Sherlock) | 🕵️ |
| A lead / line of inquiry / lens | 🔍 |
| Section — The Brief | 🗂️ |
| Section — Evidence | 🧾 |
| Per-finding — Deduction | 🧠 |
| Per-finding / section — Verdict | ⚖️ |
| Per-finding — Remedy | 🔧 |

Legend line to embed at the top of the summary:

> 🔴 critical · 🟠 high · 🟡 medium · 🟢 low — verdicts: ✅ confirmed · 🟡 uncertain · 🚫 dismissed

## The investigation arc — `INVESTIGATION.md` (summary)

```
# 🕵️ Codebase Review · <scope> · <date>
> <legend line>

## 🗂️ The Brief
Scope, units reviewed, total LOC, tiers, lines of inquiry (lenses run), counts.

## 🧾 Evidence ledger
| | Location | Lead | Verdict |
|---|---|---|---|
| 🔴 | file:line | short lead | ✅ 3/3 |
(one row per kept finding; top CRITICAL/HIGH first; link into findings-*.md)

## ⚖️ The Verdict
N must-fix before merge · M to review · K dismissed. One-line headline lead.
```

## The case-file — `findings-{security,bugs,cleanup}.md`

Each kept finding is a self-contained dossier. The four lines map 1:1 onto the
existing `FINDING` schema, so no schema change is needed:

```
🔴 CRITICAL · <file>:<line>
  Observation: <excerpt + what is wrong>          (FINDING.excerpt)
  🧠 Deduction: <reachability / impact reasoning>  (FINDING.rationale)
  ⚖️ Verdict: confirmed (3/3 panel)                (FINDING.verdict + vote)
  🔧 Remedy: <recommendation>                       (FINDING.recommendation)
```

## Dismissed leads — `appendix-refuted.md`
Same case-file shape; the refutation reason becomes the 🧠 Deduction, under a
`# 🚫 Dismissed leads` heading.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/report-style.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/report-style.md skills/sherlock/tests/report-style.test.js
git commit -m "feat(sherlock): add report-style persona guide"
```

---

## Task 2: Scaffold writes `INVESTIGATION.md` with persona skeletons

**Files:**
- Modify: `src/commands/scaffold.js`
- Test: `tests/scaffold-cmd.test.js`

- [ ] **Step 1: Update the failing test**

In `tests/scaffold-cmd.test.js`, replace the first test (`scaffold creates report skeleton...`) body with the version below. The file-list loop now expects `INVESTIGATION.md` (not `README.md`), and new assertions check persona content. Leave the second test (missing units.json) unchanged.

```javascript
test("scaffold creates persona report skeleton + seeded coverage table", async () => {
  const root = await withUnits();
  const code = await cmdScaffold({ cwd: root, args: ["--date", "2026-06-29"], stdout: { write() {} }, stderr: { write() {} } });
  assert.equal(code, 0);
  const dir = path.join(root, "docs/reviews/2026-06-29-codebase-review");
  for (const f of ["INVESTIGATION.md", "findings-security.md", "findings-bugs.md", "findings-cleanup.md", "appendix-refuted.md", "coverage.md", "units-status.json"]) {
    await readFile(path.join(dir, f), "utf8");
  }
  // README.md must no longer be produced
  await assert.rejects(readFile(path.join(dir, "README.md"), "utf8"), /ENOENT/);

  const investigation = await readFile(path.join(dir, "INVESTIGATION.md"), "utf8");
  assert.ok(investigation.includes("🕵️"), "header mark");
  assert.ok(investigation.includes("🔴"), "severity legend");
  assert.ok(investigation.includes("The Brief"));
  assert.ok(investigation.includes("Evidence ledger"));
  assert.ok(investigation.includes("The Verdict"));

  const refuted = await readFile(path.join(dir, "appendix-refuted.md"), "utf8");
  assert.ok(refuted.includes("Dismissed leads"));

  const coverage = await readFile(path.join(dir, "coverage.md"), "utf8");
  assert.ok(coverage.includes("api-src-auth"));
  assert.ok(coverage.includes("| S |"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scaffold-cmd.test.js`
Expected: FAIL — `INVESTIGATION.md` read throws `ENOENT` (scaffold still writes `README.md`).

- [ ] **Step 3: Update `src/commands/scaffold.js`**

Replace the block of `writeFile` calls (the lines writing `README.md` through `units-status.json`) with the following. Add the `LEGEND` constant just above, after the `coverage` string is built:

```javascript
  const LEGEND = "🔴 critical · 🟠 high · 🟡 medium · 🟢 low — verdicts: ✅ confirmed · 🟡 uncertain · 🚫 dismissed";

  await writeFile(
    path.join(dir, "INVESTIGATION.md"),
    `# 🕵️ Codebase Review — ${date}\n\n> ${LEGEND}\n\n` +
      `## 🗂️ The Brief\n\n_Scope, units, LOC, lines of inquiry, and counts — populated at synthesis._\n\n` +
      `## 🧾 Evidence ledger\n\n| | Location | Lead | Verdict |\n|---|---|---|---|\n\n_Populated at synthesis._\n\n` +
      `## ⚖️ The Verdict\n\n_Must-fix / to-review / dismissed summary — populated at synthesis._\n`,
  );
  await writeFile(path.join(dir, "findings-security.md"), "# 🧾 Security — Evidence\n\n_No confirmed leads yet._\n");
  await writeFile(path.join(dir, "findings-bugs.md"), "# 🧾 Correctness — Evidence\n\n_No confirmed leads yet._\n");
  await writeFile(path.join(dir, "findings-cleanup.md"), "# 🧾 Cleanup — Evidence (dead code · comments · refactor)\n\n_No confirmed leads yet._\n");
  await writeFile(path.join(dir, "appendix-refuted.md"), "# 🚫 Dismissed leads\n\n_None yet._\n");
  await writeFile(path.join(dir, "coverage.md"), coverage);
  await writeFile(path.join(dir, "units-status.json"), JSON.stringify({ units: {} }, null, 2));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scaffold-cmd.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/src/commands/scaffold.js skills/sherlock/tests/scaffold-cmd.test.js
git commit -m "feat(sherlock): scaffold INVESTIGATION.md with persona skeletons"
```

---

## Task 3: Synthesize prompt follows the persona style guide

**Files:**
- Modify: `workflow/sherlock.workflow.js`
- Test: `tests/workflow-meta.test.js`

- [ ] **Step 1: Add the failing test**

Append this test to `tests/workflow-meta.test.js`:

```javascript
test("synthesize prompt follows the persona style guide", async () => {
  const src = await readFile(path.join(root, "workflow/sherlock.workflow.js"), "utf8");
  assert.ok(src.includes("report-style.md"), "synthesize references the style guide");
  for (const s of ["The Brief", "Evidence ledger", "The Verdict"]) {
    assert.ok(src.includes(s), `synthesize prompt names ${s}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/workflow-meta.test.js`
Expected: FAIL — `report-style.md` not found in the workflow source.

- [ ] **Step 3: Update `workflow/sherlock.workflow.js`**

Add a `STYLE` constant next to the existing `CLI` constant (single-quoted so the `${CLAUDE_PLUGIN_ROOT}` placeholder stays literal and is substituted at skill-load time, not interpolated by JS):

```javascript
const CLI = '${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js'
const STYLE = '${CLAUDE_PLUGIN_ROOT}/skills/sherlock/report-style.md'
```

Then replace the `const summary = await agent(...)` call (the Synthesize step) with:

```javascript
const summary = await agent(
  `Synthesize the final review report from these verified findings (JSON):\n${JSON.stringify(kept).slice(0, 200000)}\n` +
  `First read the Sherlock persona style guide at ${STYLE} and follow it.\n` +
  `Write the INVESTIGATION.md summary in three sections: ` +
  `"🗂️ The Brief" (scope, units, LOC, lines of inquiry, counts); ` +
  `"🧾 Evidence ledger" — a table | severity | location | lead | verdict | with one row per kept finding, top CRITICAL/HIGH first; ` +
  `and "⚖️ The Verdict" (counts of must-fix / to-review / dismissed plus the headline lead). ` +
  `Use the canonical emoji legend (🔴🟠🟡🟢 severity; ✅🟡🚫 verdict). Keep it terse and technical.`,
  { label: 'synthesize', phase: 'Synthesize' },
)
```

(Note: `${STYLE}` here interpolates the JS `STYLE` const — the literal path string — which is correct. Do **not** write a bare `${CLAUDE_PLUGIN_ROOT}` inside the backtick template; that would be a JS interpolation of an undefined variable.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/workflow-meta.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/workflow/sherlock.workflow.js skills/sherlock/tests/workflow-meta.test.js
git commit -m "feat(sherlock): synthesize report via persona style guide"
```

---

## Task 4: SKILL.md write-up step references the persona

**Files:**
- Modify: `SKILL.md`
- Test: `tests/skill-md.test.js`

- [ ] **Step 1: Add the failing test**

Append this test to `tests/skill-md.test.js`:

```javascript
test("SKILL.md write-up step references the persona + INVESTIGATION.md", async () => {
  const md = await readFile(path.join(root, "SKILL.md"), "utf8");
  assert.ok(md.includes("INVESTIGATION.md"), "names the summary file");
  assert.ok(md.includes("report-style.md"), "points at the style guide");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skill-md.test.js`
Expected: FAIL — neither `INVESTIGATION.md` nor `report-style.md` appears in `SKILL.md` yet.

- [ ] **Step 3: Update `SKILL.md`**

Replace step 3 in the `## Procedure` list:

```markdown
3. **Write results** into the scaffolded report files, following the persona style
   guide [`report-style.md`](report-style.md): the synthesized `summary` becomes
   `INVESTIGATION.md` (🗂️ The Brief → 🧾 Evidence ledger → ⚖️ The Verdict); write each
   kept finding as a case-file (Observation → 🧠 Deduction → ⚖️ Verdict → 🔧 Remedy) into
   the matching `findings-*.md`; write dismissed leads into `appendix-refuted.md`. Fill
   `units-status.json`.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/skill-md.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add skills/sherlock/SKILL.md skills/sherlock/tests/skill-md.test.js
git commit -m "docs(sherlock): SKILL.md write-up step uses persona report format"
```

---

## Task 5: Full suite green

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run (from the package dir): `npm test`
Expected: PASS — all test files, including the four touched/added ones, green.

- [ ] **Step 2: Sanity-run the scaffold end-to-end**

```bash
node bin/cli.js partition src
node bin/cli.js scaffold --date 2026-06-30
```
Expected: a `docs/reviews/2026-06-30-codebase-review/` directory containing
`INVESTIGATION.md` (with 🕵️ header, legend, The Brief / Evidence ledger / The Verdict),
the three `findings-*.md`, `appendix-refuted.md` (🚫 Dismissed leads), `coverage.md`,
and `units-status.json`. No `README.md`.

- [ ] **Step 3: Confirm coverage still reconciles by `units-status.json` (unaffected by rename)**

```bash
node bin/cli.js coverage --findings docs/reviews/2026-06-30-codebase-review
```
Expected: exits non-zero with "no status recorded" gaps (statuses unfilled in this dry
run) — proving coverage keys off `units-status.json`, **not** any report filename. (In a
real run the orchestrator fills `units-status.json` and this exits 0.)

- [ ] **Step 4: Clean up the dry-run artifacts**

```bash
rm -rf docs/reviews/2026-06-30-codebase-review .sherlock
```

---

## Self-Review

**Spec coverage:**
- §3 emoji palette → Task 1 (`report-style.md`) + asserted in its test; embedded in scaffold legend (Task 2).
- §4.1 `INVESTIGATION.md` B3 summary + rename → Task 2 (scaffold) + Task 3 (synthesize fills it).
- §4.2 B2 case-files → Task 1 (format defined) + Task 4 (SKILL.md write-up instruction).
- §4.3 dismissed-leads appendix → Task 2 (skeleton) + Task 4.
- §4.4 coverage unchanged → Task 5 Step 3 verifies.
- §5 `report-style.md` → Task 1.
- §6 touch-points (scaffold, report-style, workflow, SKILL.md) → Tasks 1–4; reviewer/verifier prompts untouched (only the `summary` agent call in Task 3 changes).
- §7 token impact / §8 out-of-scope → no schema, no CLI logic, no reviewer-prompt changes; honored by construction.

**Placeholder scan:** No TBD/TODO; every code/markdown step shows full content.

**Type/name consistency:** `INVESTIGATION.md`, `report-style.md`, `LEGEND`, `STYLE`, and the section names (`The Brief`, `Evidence ledger`, `The Verdict`) and case-file labels (`Observation`, `Deduction`, `Verdict`, `Remedy`) are used identically across the style guide, scaffold output, workflow prompt, SKILL.md, and every test.

# Sherlock — Short Slugs, No-Skeleton Scaffold, Scope-Safe Workflow

**Date:** 2026-07-01
**Status:** Design (approved in brainstorming)
**Scope:** CLI naming (`src/paths.js`, `src/commands/partition.js`), the `init` scaffold
behavior (`src/commands/init.js`), the `investigate` init-guard
(`src/commands/investigate.js`), and the workflow-mode orchestration comment
(`workflow/sherlock.workflow.js` + `SKILL.md`). **No change** to the finding/verdict
schemas, the lens/rule logic, partition grouping, or tier assignment.

---

## 1. Goals

Three independent behaviors are fixed:

1. **Short, path-decoupled names.** Review slugs and unit ids currently encode the full
   directory path via `kebab()`, so deep scopes produce very long dir names, units-file
   names, and unit ids. Names become short generated identifiers; the real path lives in
   file **content** (metadata), read from content — never parsed back out of the name.
2. **No skeleton report `.md` files.** `init` pre-writes placeholder report files, so
   Claude's first write of findings fails (the Edit/Write tools require reading an
   existing file first) and must Read-then-retry. `init` stops scaffolding the
   content-bearing files; Claude writes them fresh with `Write` (no prior Read needed on a
   non-existent file).
3. **Scoped review must not spawn the full-codebase report folder.** In `workflow` mode
   the orchestration comment runs an **unscoped** `init`, scaffolding
   `<date>-codebase-review` alongside the scoped report. The scope is threaded through
   consistently.

---

## 2. Non-goals (YAGNI)

- No change to the `FINDING` / `VERDICT` schemas or the persona report format.
- No change to partition grouping, tier assignment, or rule resolution.
- No new lenses or CLI commands.
- No migration of pre-existing report dirs / units files created under the old naming —
  old artifacts keep working; only new runs use the new names.

---

## 3. Short, path-decoupled names (Goal 1)

### 3.1 Naming scheme

Two deterministic parts derived from the **posix** path string:

- `<short-hash>` = first 6 hex chars of `sha256(posixPath)`. Deterministic, so the same
  scope/unit always yields the same name — the `.sherlock/` units cache and cross-run
  diffs stay stable. Collision-resistant enough for the small N of a single review.
- `<short-name>` = `kebab(basename(posixPath))`, capped at a small length (constant,
  e.g. `NAME_CAP = 24`). Human hint only; not authoritative.

Full-codebase scope (no path) is unchanged: slug `codebase`, units file `units.json`, no
hash.

| Artifact | Before | After |
|---|---|---|
| Review dir | `2026-07-01-api-src-agents-coordinator-review` | `2026-07-01-<hash>-<name>-review` (e.g. `2026-07-01-3f9a2c-coordinator-review`) |
| Units file | `units-api-src-agents-coordinator.json` | `units-<hash>-<name>.json` (e.g. `units-3f9a2c-coordinator.json`) |
| Unit id | `api-src-agents-coordinator` | `<hash>-<name>` (e.g. `3f9a2c-coordinator`); bin-packed chunks keep the `-1`/`-2` suffix |
| Full codebase | `codebase` / `units.json` | unchanged |

### 3.2 Where the path lives (read from content, not name)

- **Units file** gains a top-level `scope` field:
  `{ "scope": "api/src/agents/coordinator", "units": [ … ] }`. For full codebase,
  `scope: null`.
- **Each unit** already carries `path` and `files` — these stay the authoritative source
  of what a unit covers. Nothing reads the path back out of `unit.id`.
- **`INVESTIGATION.md`** already prints `· <scope> ·` in its header (per
  `investigation/report-style.md`), so the human report is self-describing.
- **`coverage.md`** table shows the unit **`path`** (not the id) in its first column for
  human readability. `units-status.json` keys remain the short `unit.id`. Coverage
  reconciliation compares ids between the units file and `units-status.json`, so display
  choice does not affect the check.

### 3.3 Touch-points

| File | Change |
|---|---|
| `src/paths.js` | `scopeSlug`, `unitsFileName`, `reportDirName` build `<hash>-<name>` from the scope instead of `kebab(scope)`. Add a small helper (`shortName(path)` / `shortHash(path)`), reused by partition for unit ids. |
| `src/commands/partition.js` | Unit id becomes `<hash>-<name>` (via the shared helper) instead of `kebab(pathKey)`; bin-pack suffixing (`-1`/`-2`) unchanged. Write the units file with a top-level `scope` field. |
| `src/commands/init.js` | Read the scope-keyed units file (already scope-aware); build `coverage.md` table with the `path` column. |
| `src/commands/coverage.js` | No logic change (still compares ids); it already receives `--units`. |

---

## 4. No skeleton report `.md` files (Goal 2)

### 4.1 New `init` responsibilities

`init` **creates**:
- the report directory (`mkdir -p`), and
- `coverage.md` — the deterministic unit/tier/loc/pending table (Claude never edits it →
  no read-before-write friction).

`init` **no longer creates**:
- `INVESTIGATION.md`
- `findings-security.md`, `findings-bugs.md`, `findings-cleanup.md`
- `appendix-refuted.md`
- `units-status.json`

### 4.2 Claude writes the rest fresh

At the synthesis / "Write results" step Claude uses `Write` to create the report files.
`Write` on a **non-existent** file needs no prior `Read`, eliminating the friction.
Claude writes `units-status.json` **before** running `coverage`, so the coverage check
still finds it.

Structure and house style already live in `investigation/report-style.md`; SKILL.md
step 4 gains an explicit note: *these files do not exist yet — create them with `Write`,
following report-style.md.*

### 4.3 `investigate` init-guard

`investigate` currently decides "is the report initialized?" by testing for
`INVESTIGATION.md`. Since that file is no longer scaffolded, the guard switches to testing
for **`coverage.md`** (or the report dir). Same reuse semantics: an existing report is
never clobbered.

### 4.4 Resume edge case (accepted)

Re-running over an in-progress report whose files already exist still requires a `Read`
before a rewrite. This is acceptable: the friction only ever bit the **first** write of a
fresh review, which is now friction-free.

### 4.5 Touch-points

| File | Change |
|---|---|
| `src/commands/init.js` | Drop the five `writeFile` calls for the content-bearing files; keep the dir + `coverage.md`. |
| `src/commands/investigate.js` | Init-guard tests `coverage.md` (or dir) instead of `INVESTIGATION.md`. |
| `SKILL.md` | Step 4: note that report `.md` files + `units-status.json` are created fresh with `Write`, per report-style.md. |
| Tests | `init-cmd.test.js`: assert only dir + `coverage.md` are created, and the content-bearing files are **absent**. `investigate.test.js`: guard on `coverage.md`. |

---

## 5. Scope-safe workflow mode (Goal 3)

### 5.1 Root cause

`workflow/sherlock.workflow.js` (the orchestration comment) instructs:

```
partition <scope>          ← scoped
init --date <date>         ← NO scope → scaffolds <date>-codebase-review
```

Run literally in `workflow` mode, the unscoped `init` creates the full-codebase report
dir next to the scoped one.

### 5.2 Fix

- `investigate` already runs a **scoped** `init` during prep, so the manual `init` in the
  workflow comment is **redundant** — drop it. This removes the only place the scope
  leaks.
- Correct the remaining comment so any manual invocation is scope-consistent
  (`partition <scope>`, and if `init` is shown at all, `init <scope> --date <date>`).
- SKILL.md's workflow sub-procedure reinforces: the scoped prep is done by `investigate`;
  **never** run an unscoped `init`.

### 5.3 Touch-points

| File | Change |
|---|---|
| `workflow/sherlock.workflow.js` | Fix/trim the Partition-phase comment: drop the redundant unscoped `init`; make any shown command scope-consistent. |
| `SKILL.md` | Workflow sub-procedure: state that `investigate` owns the scoped prep; do not run an unscoped `init`. |
| Tests | `workflow-meta.test.js` / `skill-md.test.js`: assert no unscoped `init` appears in the workflow/skill guidance. |

---

## 6. Invariants preserved

- The deterministic CLI still never spawns agents, calls the Workflow tool, or prompts
  interactively.
- `coverage` still reconciles the units file against `units-status.json` by comparing
  ids; the display column change does not affect the check.
- Deterministic names: the same scope/unit path always yields the same hash+name, so the
  `.sherlock/` cache reuse and re-run stability hold.
- `workflow` mode's fan-out / verification behavior is otherwise unchanged; only the
  scaffold-scope leak is closed.

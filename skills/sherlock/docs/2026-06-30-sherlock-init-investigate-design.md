# Sherlock — `init` Rename + `investigate` Flow

**Date:** 2026-06-30
**Status:** Design (approved in brainstorming)
**Scope:** CLI command surface + the skill orchestration flow. No change to the
finding schema, the partition/lens/rule logic, or the persona report format.

---

## 1. Goal

1. Rename the deterministic `scaffold` CLI command to `init`.
2. Add an `investigate` command that is the single entry point for a review: it does
   the deterministic prep (idempotently), recommends an execution mode from project
   structure, and emits the instructions Claude follows to ask the user and execute.

The investigate flow offers three execution modes — **inline**, **agents**, **workflow**
— at increasing token cost and verification rigor. It replaces the current 4-step
`/sherlock` procedure; `workflow` mode reproduces today's behavior exactly.

---

## 2. Architectural boundary (load-bearing)

Sherlock is a **hybrid CLI + LLM skill**. The Node CLI is **deterministic — no LLM**:
it cannot ask the user through the Claude UI, spawn subagents, call the Workflow tool,
or detect the user's Claude Code subscription. Those are LLM/harness capabilities that
live with Claude, driven by `SKILL.md`.

Therefore `investigate` is a **deterministic CLI command** that prepares state, prints a
recommendation, and prints **next-step instructions**. **Claude** (per `SKILL.md`) does
the interactive asking and the execution. The CLI never prompts interactively and never
spawns agents.

---

## 3. `scaffold` → `init`

Rename (behavior otherwise unchanged except for the scope-keyed units-file read and
scope-aware report-dir naming introduced in §5.0):

- `src/commands/scaffold.js` → `src/commands/init.js`; export `cmdScaffold` → `cmdInit`.
- `bin/cli.js`: HELP text + `HANDLERS` key `scaffold` → `init`.
- `workflow/sherlock.workflow.js`: the comment referencing `scaffold` → `init`.
- `SKILL.md`, `README.md`: update command name.
- Tests: `tests/scaffold-cmd.test.js` → `tests/init-cmd.test.js` (import `cmdInit`);
  `tests/skill-md.test.js` command-list assertion; `tests/cli.test.js` if it names the
  command.

---

## 4. Execution modes

Least → most token-intensive. **All three produce independently-verified findings**;
the rigor scales.

| Mode | Review | Adversarial verification | Independence |
|---|---|---|---|
| **inline** | Claude reviews units sequentially in the main conversation | **one verifier subagent per finding** (single-vote, refute-by-default) | verification independent; review not parallel |
| **agents** | one reviewer subagent per `(unit × applicable lens)`, parallel | one verifier subagent per finding (single-vote) | review + verification both independent & parallel |
| **workflow** | existing `sherlock.workflow.js` fan-out via the Workflow tool | **3-vote refutation panels** with distinct probes | strongest — multiple independent voters |

Key point: **inline is not zero-agent** — it keeps the *review* inline but delegates
*verification* to subagents so even the cheapest mode gets independent refutation. Cost
still climbs inline → agents → workflow (parallel review fans out more reviewer agents;
workflow triples the verifiers per finding).

Each mode ends the same way: write the persona report (`INVESTIGATION.md` + case-files +
dismissed-leads appendix), fill `units-status.json`, then reconcile `coverage`.

The per-mode sub-procedures are documented in `SKILL.md` (§7). `workflow` mode is the
current behavior verbatim.

---

## 5. `investigate` CLI command (deterministic)

```
investigate [path-or-glob] [--mode inline|agents|workflow] [--lenses a,b,…] \
            [--tiers strict|all] [--date YYYY-MM-DD] [--out <dir>] [--refresh]
```

### 5.0 State model — cached, scope-keyed partition files

Partition output is **cached in `.sherlock/` and keyed by scope**, so a later review
reuses it instead of re-walking the tree:

- full codebase → `.sherlock/units.json`
- a scoped path/glob → `.sherlock/units-<scope-slug>.json` (slug = `<shorthash>-<name>`; see 2026-07-01-sherlock-short-slugs-scaffold-design.md)

The **report dir** (`<out>/<date>-<scope-slug>-review`; full → `<date>-codebase-review`)
holds only the report itself: `units-status.json`, `coverage.md`, `INVESTIGATION.md`,
`findings-*.md`, `appendix-refuted.md`. Distinct scopes get distinct report dirs, so
full and scoped reviews coexist while sharing their cached units files.

Standalone command changes:
- `partition [scope]` writes the **scope-keyed** units file in `.sherlock/` (full →
  `units.json`, scoped → `units-<slug>.json`). Re-running `partition <scope>` refreshes
  that cache after the code changes.
- `init [scope] [--date] [--out]` reads the scope's units file from `.sherlock/` and
  writes the skeleton into the scope-named report dir.
- `coverage --findings <report-dir> [--units <units-file>]` reads the units file
  (default `.sherlock/units.json`) and `units-status.json` from the report dir. For a
  scoped report, `--units .sherlock/units-<slug>.json` is passed.
- `src/paths.js` derives both the units-file name and the report-dir name from the scope,
  so all three commands agree.

### 5.1 Conditional prep (reuse-first)

`investigate` derives the scope slug, the units-file path, and the report dir, then:
- **Partition (reuse):** if the scope's units file already exists in `.sherlock/`, reuse
  it; if it's missing, run `partition <scope>`. `--refresh` forces a re-partition (use
  after the code has changed).
- **Init:** if the report dir's skeleton is missing, run `init <scope>`; if it exists,
  reuse it (never clobber an in-progress report).

The reuse trade-off: a cached units file can go **stale** if the code changed since it
was built. `--refresh` (or re-running `partition <scope>`) rebuilds it. The Investigation
Plan notes when a cached file was reused so the user can refresh if needed.

### 5.2 Output — the Investigation Plan (to stdout)

A structured, human-readable plan:

1. **Scope & structure:** scope string, unit count, tier histogram (S/A/B counts),
   total LOC.
2. **Recommended mode** + one-line reason (from §6).
3. **Token-intensity line:** `inline < agents < workflow (cost & rigor)`, plus a
   one-line **subscription caveat**: the skill cannot detect your Claude Code plan —
   weigh the recommendation against your plan/usage.
4. **Lenses:** the available lens names + the tier-based applicability preview.
5. **Next steps for Claude** (explicit): which questions to ask — **mode** (skip if
   `--mode` given), **lenses** (skip if `--lenses` given), **tier-application** (skip if
   `--tiers` given) — then "execute the chosen mode per SKILL.md", then write the report
   and run `coverage`.

Flags pre-answer questions; when present, the plan tells Claude to skip that question.
`investigate` always exits 0 on successful prep (prep failures exit 1 with a clear
message, mirroring the other commands).

---

## 6. Recommendation heuristic (`src/recommend.js`, pure + unit-tested)

`recommendMode({ unitCount, tiers: {S, A, B}, totalLoc }) → { mode, reason }`

Named constants (tunable):

- `INLINE_MAX_UNITS = 3`
- `AGENTS_MAX_UNITS = 20`
- `LARGE_LOC = 20000`

Logic (first match wins):

1. `tiers.S > 0` → **workflow** ("security-critical (S-tier) code present — maximum rigor").
2. `unitCount > AGENTS_MAX_UNITS || totalLoc > LARGE_LOC` → **workflow** ("large scope").
3. `unitCount <= INLINE_MAX_UNITS` → **inline** ("small scope — cheapest path").
4. otherwise → **agents** ("moderate scope — parallel review").

The reason string is printed verbatim in the plan.

---

## 7. Interactive flow (Claude, in `SKILL.md`)

Replaces the current 4-step procedure. `/sherlock [path] [--mode …] [--lenses …]` maps
to this flow.

1. **Prep + recommend:** run `investigate [path] [flags]`; read the Investigation Plan.
2. **Ask the user** (only for answers not supplied as flags):
   1. **Mode** — present the recommendation, the `inline < agents < workflow` cost/rigor
      ordering, and the subscription caveat.
   2. **Lenses** — which lenses to apply (default: the full tier-resolved set).
   3. **Tier-application** — *apply all selected lenses to every unit* (`--tiers all`,
      override `applies_to.tiers`) **or** *follow tier-based applicability* (`--tiers
      strict`, the default; a lens runs only on units whose tier is in its `applies_to.tiers`).
3. **Execute the chosen mode** (per-mode sub-procedures in SKILL.md):
   - **inline:** for each unit, read its files through each applicable lens → candidate
     findings; dispatch one verifier subagent per candidate (refute-by-default); keep
     confirmed/uncertain, route refuted to the appendix.
   - **agents:** dispatch one reviewer subagent per `(unit × applicable lens)` (parallel);
     dispatch one verifier subagent per candidate; synthesize.
   - **workflow:** invoke `sherlock.workflow.js` via the Workflow tool with
     `{ units, lenses, rules, date }` (today's behavior); use the returned
     `{ kept, refuted, summary }`.
4. **Write results** into the scaffolded report files (persona format) and fill
   `units-status.json`.
5. **Reconcile coverage:** `coverage --findings <report-dir>` (plus `--units
   .sherlock/units-<slug>.json` for a scoped review); non-zero exit ⇒ not complete. The
   exact command is printed in the Investigation Plan.

**Defaults:** no path ⇒ full codebase; no `--mode` ⇒ ask (recommendation shown); no
`--lenses` ⇒ ask (full tier-resolved set offered); no `--tiers` ⇒ ask (default `strict`).

---

## 8. Lens selection + tier-application

- The **lens** question lets the user pick any subset of the installed lenses
  (intersected with what exists).
- The **tier-application** question then decides how those lenses map onto units:
  - `strict` (default): a chosen lens runs on a unit only if the unit's tier ∈ the lens's
    `applies_to.tiers` — preserves the risk-tiered model.
  - `all`: every chosen lens runs on every unit, ignoring `applies_to.tiers`.
- The chosen mode receives the resolved `(unit → lenses)` mapping accordingly. `workflow`
  mode passes the resolved lens set; its `lensesForUnit` already filters by
  `applies_to.tiers` for `strict`, and is given the full set per unit for `all`.

---

## 9. Touch-points

| File | Change |
|---|---|
| `bin/cli.js` | Rename `scaffold`→`init` in HELP + HANDLERS; add `investigate` handler + HELP entry. |
| `src/commands/init.js` | Renamed from `scaffold.js`; `cmdScaffold`→`cmdInit`; accept `scope`; read the scope-keyed units file from `.sherlock/`; write the skeleton into the scope-named report dir (§5.0). |
| `src/commands/partition.js` | Write the **scope-keyed** units file in `.sherlock/` (full → `units.json`, scoped → `units-<slug>.json`) via `src/paths.js`. |
| `src/commands/coverage.js` | Add `--units <units-file>` flag (default `.sherlock/units.json`); still reads `units-status.json` from the report dir. |
| `src/commands/investigate.js` (new) | `cmdInvestigate`: derive slug/units-path/report-dir, reuse-first prep, `--refresh`, plan output, recommendation, flag handling. |
| `src/recommend.js` (new) | Pure `recommendMode(stats)` heuristic. |
| `src/paths.js` (existing) | Add helpers: scope-keyed units-file name (`units.json` / `units-<slug>.json`) and report-dir name (`<date>-<slug>-review` / `<date>-codebase-review`), slug = `<shorthash>-<name>`; see 2026-07-01-sherlock-short-slugs-scaffold-design.md. |
| `workflow/sherlock.workflow.js` | Comment: `scaffold`→`init`. (No logic change — units are passed via args, not read from disk.) |
| `SKILL.md` | Rewrite procedure around `investigate` + the three per-mode sub-procedures + invocation; reads of the units file come from `.sherlock/` (scope-keyed). |
| `README.md` | Update command list + flow description. |
| Tests | `scaffold-cmd.test.js`→`init-cmd.test.js` (scope + report-dir naming); `partition.test.js` (scope-keyed output filename); `coverage.test.js` (`--units` flag); `skill-md.test.js` command list + flow mentions; `cli.test.js` command handling; new `investigate.test.js`; new `recommend.test.js`. |

---

## 10. Invariants preserved

- The deterministic CLI never spawns agents, never calls the Workflow tool, never prompts
  interactively. `investigate` only prepares state and prints text.
- `coverage` still reconciles by comparing the units file to `units-status.json`; the
  units file comes from the `.sherlock/` cache (scope-keyed, via `--units`), the status
  from the report dir.
- The `FINDING` / `VERDICT` schemas and the persona report format are unchanged.
- `workflow` mode is byte-for-byte today's behavior (the only adjustment is where
  `SKILL.md` reads `units.json` to build the workflow args).

---

## 11. Out of scope (YAGNI)

- No subscription auto-detection (architecturally impossible from a skill).
- No interactive prompting from the Node CLI.
- No new lenses or finding fields.
- No change to partition grouping, tier assignment, or rule resolution.
- No persistence of the chosen mode/lenses beyond the current run.

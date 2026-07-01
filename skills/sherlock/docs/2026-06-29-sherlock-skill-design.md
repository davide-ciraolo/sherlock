# Sherlock — Reusable Code-Investigation Skill (Design)

**Date:** 2026-06-29
**Status:** Design / approved for planning
**Related:** [`2026-06-29-codebase-review-campaign-design.md`](../../../../docs/superpowers/specs/2026-06-29-codebase-review-campaign-design.md) (the first run of sherlock, against this repo)
**Location:** this design doc and its implementation plan live under `.claude/skills/sherlock/docs/`.

---

## 1. Purpose

`sherlock` is a **repo-agnostic code-investigation skill**. It reviews a codebase
(whole or scoped) through a set of **investigators** — each a single *perspective*
("lens") on the code — and produces a **triaged findings report** with no code
changes. Every candidate finding is **adversarially verified** before it lands.

It is the durable, reusable form of the methodology in the campaign spec. The
campaign spec describes *what we review in this repo*; this spec describes *the tool*.

Non-goals:

- Not a linter or formatter replacement — sherlock does *judgment* work (logic bugs,
  security reasoning, dead-code reachability, refactor opportunities) that static
  tools miss. It complements `make check-all`, it does not replace it.
- Does not modify code. Output is reports only. (A future `--fix` mode is explicitly
  out of scope for v1.)

---

## 2. Design principles

1. **Deterministic where it can be, LLM where it must be.** Partitioning, risk-tier
   assignment, report scaffolding, and coverage reconciliation are *scripts* — a CLI,
   not model guesswork. The LLM only reviews, refutes, and synthesizes.
2. **Investigators are data, not code.** A lens is a markdown file following a
   template. Adding a perspective = adding a file. The orchestration discovers lenses
   dynamically and applies each to the units matching its `applies_to`.
3. **Generic core, layered rules.** Sherlock ships a **standard rule-pack of
   general invariants only**. Project-specific invariants reach a review through an
   explicitly-configured **project overlay**, never by silently absorbing a repo's
   quirks as universal truth (see §6).
4. **No silent gaps.** Coverage is reconciled by script: every partition unit is
   accounted for in the final report, and any unit that errored or was skipped is
   surfaced loudly.
5. **CLI is the contract.** Like specforest, agents interact with sherlock through
   its CLI and read its emitted artifact files — they never re-implement partition or
   coverage logic inline.

---

## 3. Package layout

Mirrors the specforest skill conventions already in this repo
(`.claude/skills/specforest/`): ESM Node package, `SKILL.md` entry, `bin/cli.js`,
`src/commands/*.js`, `tests/` via `node --test`, minimal dependencies.

```
.claude/skills/sherlock/
├── SKILL.md                  # entry: when-to-use, 4-phase procedure, CLI usage,
│                             #   how to invoke the workflow, how to read results
├── README.md                 # human-facing overview
├── package.json              # ESM, "node": ">=18", deps: js-yaml, picomatch
├── bin/
│   └── cli.js                # `sherlock <command>` dispatcher
├── src/
│   ├── commands/
│   │   ├── partition.js      # repo → review units + default risk tiers → units.json
│   │   ├── scaffold.js       # create <output>/<date>/ report skeleton + coverage table
│   │   ├── coverage.js       # reconcile findings vs units.json → flag gaps/skips
│   │   ├── lenses.js         # list/validate lenses; resolve --lenses selection
│   │   └── rules.js          # resolve standard + project rule overlay for a run
│   ├── config.js             # load + default sherlock.config.* from target repo
│   ├── glob.js, paths.js, kebab.js   # shared helpers (picomatch-based)
│   └── tiers.js              # default tier-glob heuristics
├── lenses/                   # the investigators — one perspective per file
│   ├── _TEMPLATE.md          # the lens template (see §4)
│   ├── security.md           # L1
│   ├── correctness.md        # L2
│   ├── dead-code.md          # L3
│   ├── comments.md           # L4
│   └── refactor.md           # L5
├── rules/
│   └── standard/             # GENERAL invariants only (OWASP-ish security, generic
│                             #   correctness, language-agnostic cleanliness). NEVER
│                             #   project-specific guardrails. See §6.
├── schemas/
│   ├── finding.schema.json   # one candidate/confirmed finding
│   ├── verdict.schema.json   # an adversarial verifier's verdict
│   └── units.schema.json     # partition output
├── workflow/
│   └── sherlock.workflow.js  # fan-out review → adversarial verify → synthesize
├── tests/                    # node --test: partition, coverage, lens/rule resolution
└── docs/
    ├── 2026-06-29-sherlock-skill-design.md         # this design doc
    └── 2026-06-29-sherlock-implementation-plan.md  # the implementation plan
```

---

## 4. Lenses (investigators)

Each lens is a markdown file with YAML frontmatter + a structured body. The
`_TEMPLATE.md` defines the contract; any file that conforms is a valid investigator.

**Frontmatter:**

```yaml
name: security                 # unique slug; CLI/`--lenses` identifier
title: Security Investigator
perspective: >                 # one-paragraph "what this investigator sees"
  Reads the code as an attacker and as an auditor...
verification_class: security   # security | correctness | cleanup  (routes the verify panel — §7)
applies_to:
  tiers: [S, A, B]             # which risk tiers invoke this lens
  globs: ["**/*"]              # optional path filter on top of tiers
severity_default: HIGH         # default severity bucket for this lens's findings
```

**Body sections (prose the reviewer agent receives):**

- **What to look for** — the checklist of this perspective's concerns.
- **Rules consulted** — which standard rule-pack files + project-overlay categories
  this lens should weigh (resolved at runtime).
- **False-positive traps** — the known ways this lens cries wolf (e.g. dead-code:
  dynamic imports, string-keyed dispatch, test-only references, framework entrypoints).
- **Finding fields** — what to populate beyond the shared schema.
- **Refutation hints** — what a verifier should probe to refute a finding of this class.

**Shipped lenses (v1):**

| Lens | `name` | Perspective | `verification_class` |
|---|---|---|---|
| L1 Security | `security` | auth/tenant/path-jail/SSRF/injection/secrets/role-gating | security |
| L2 Correctness | `correctness` | logic, races, unhandled errors/promises, state machines, leaks, streaming regressions | correctness |
| L3 Dead code | `dead-code` | unreferenced symbols/files, unreachable branches, unused deps | cleanup |
| L4 Comments | `comments` | stale/contradictory/commented-out/redundant comments, done TODOs | cleanup |
| L5 Refactor | `refactor` | oversized files/functions, deep nesting, duplication, misplacement, weak boundaries | cleanup |

New investigators (e.g. `performance`, `accessibility`, `i18n`) drop into `lenses/`
following `_TEMPLATE.md` — no orchestration change required.

---

## 5. CLI commands (deterministic core)

```
sherlock partition [path-or-glob] [--config <file>]
        → walks the target, builds cohesive review units (≤ ~2k LOC each; oversized
          dirs split by sub-feature), assigns a default risk tier per unit from
          tier-glob heuristics + config overrides, writes units.json. Emits nothing
          to stdout but a summary; the artifact is the contract.

sherlock scaffold [--out <dir>]
        → creates <out>/<date>-codebase-review/ with README.md, findings-*.md,
          appendix-refuted.md, coverage.md skeletons + the coverage table seeded
          from units.json.

sherlock lenses [--select security,bugs,...]
        → lists available lenses; with --select, validates the requested subset and
          prints the resolved lens set (used by the workflow and by --lenses).

sherlock rules [--config <file>]
        → resolves the effective rule context: standard pack ∪ project overlay
          (§6), prints which files feed which lenses.

sherlock coverage --findings <dir>
        → reconciles emitted findings against units.json; exits non-zero and lists
          any unit with no recorded status (gap) or an error status.
```

Agents call these and read the artifacts — they do **not** re-derive partitions or
coverage in-prompt (matches the specforest "CLI-only, never parse internal JSON by
hand" discipline).

---

## 6. Rule layering (general standard + project overlay)

The load-bearing distinction the user called out:

- **Standard pack (`rules/standard/`)** ships *inside* sherlock and contains **only
  general invariants** — OWASP-style security, language-agnostic correctness, the
  kind of engineering/style rules in a generic `common/` + `python/` + `typescript/`
  set. It **must not** contain project-specific guardrails (a given app's tenant model,
  its path-jail layout, its S2S token scheme). Sherlock stays portable.

- **Project overlay** is supplied by the target repo and *explicitly configured* —
  not silently scraped. Resolution order:
  1. `sherlock.config.*` `rules.project` paths, if present, win.
  2. Else sherlock auto-discovers the repo's `.claude/rules/` but **only auto-folds
     the clearly-general buckets** (`common/`, `python/`, `typescript/`, or files it
     can classify as general) into the general context. **Project-specific rule
     directories are included only when explicitly named** in config as the project
     overlay.
  3. `CLAUDE.md` / `AGENTS.md` are ingested as project context (advisory).

- **Conflict rule:** when a project-overlay rule and a standard rule disagree, the
  **project overlay wins** (the repo knows its own constraints).

This is exactly why a project review campaign wires its own
`.claude/rules/<project>/*` in **as an explicit project overlay** — those invariants
*should* drive that review — while sherlock's shipped standard pack never absorbs them.

---

## 7. Orchestration (`workflow/sherlock.workflow.js`)

A Workflow-tool script (multi-agent fan-out). Phases:

- **Phase 0 — Partition (deterministic):** call `sherlock partition` + `sherlock
  scaffold`; load `units.json` and the resolved lens set (honouring `--lenses`).
- **Phase 1 — Review (fan-out):** `pipeline()` over units. For each unit, run one
  reviewer agent per applicable lens (lens `applies_to` ∩ selected lenses ∩ unit
  tier). Each agent receives: the unit's files, the lens body, and the resolved rule
  context. Returns schema-validated candidate findings.
- **Phase 2 — Verify (per-finding, no barrier):** each candidate routes by its lens's
  `verification_class`:
  - `security` / `correctness` → **3-vote adversarial panel**, distinct probes
    (reproduce path · exploit/impact reachability · spec/rule conformance), each
    prompted to *refute by default*. `confirmed` if ≥2 say real; `uncertain` if split;
    `refuted` (dropped to appendix) otherwise.
  - `cleanup` → **single refutation check** (dead-code: repo-wide reference re-check;
    comment/refactor: "real improvement, not a behavior change?").
- **Phase 3 — Synthesize:** dedupe across units, group by area + severity, write the
  report files; run `sherlock coverage` and fail loudly on any gap.

The workflow is **opt-in / token-intensive** — `SKILL.md` states this and the cost
shape up front. It scales finder/verifier fleet to the `budget` directive when given.

---

## 8. Invocation

```
/sherlock                          # whole repo, all applicable lenses
/sherlock <path-or-glob>           # scoped to a subtree
/sherlock --lenses security,bugs   # only the named investigators (any scope)
/sherlock <path> --lenses security # combine scope + lens selection
/sherlock --config <file>          # override config location
```

`--lenses` accepts lens `name`s (and friendly aliases, e.g. `bugs`→`correctness`).
Unknown names fail fast with the available list. Absent `--lenses` ⇒ all lenses
applicable to each unit's tier.

---

## 9. Configuration (`sherlock.config.*` in target repo, optional)

```jsonc
{
  "output": "docs/reviews",          // where reports land
  "rules": { "project": [".claude/rules/project"] },  // explicit project overlay
  "tiers": {                          // override default tier-glob heuristics
    "S": ["src/auth/**", "src/billing/**", "..."],
    "A": ["**/api/**", "**/streaming/**"],
    "B": ["**"]
  },
  "lensesByTier": { "S": ["*"], "A": ["security","correctness","dead-code","refactor"], "B": ["correctness","dead-code","comments","refactor"] },
  "exclude": ["**/node_modules/**", "**/__pycache__/**", "**/*.test.*", "**/tests/**"]
}
```

Sane defaults when the file is absent: tiers default to `B`, all lenses apply,
output `docs/reviews`, standard exclude list.

---

## 10. Testing

`node --test tests/**/*.test.js` (specforest convention):

- `partition`: deterministic units for a fixture tree; oversized-dir splitting;
  tier assignment from globs + config override.
- `lenses`: template conformance validation; `--select` resolution + alias mapping;
  unknown-lens rejection.
- `rules`: standard-only pack never includes a project-specific fixture rule;
  project overlay wins on conflict; auto-discovery folds only general buckets.
- `coverage`: detects a missing unit and an errored unit; exit codes.

The LLM phases (review/verify/synthesize) are exercised by the first live run
(campaign spec), not unit-tested.

---

## 11. Out of scope (v1)

- `--fix` / auto-applied changes.
- Non-git repos (assumes a working tree; uses path walking, not history).
- Cross-repo / monorepo-package routing beyond glob scoping.
- A published marketplace plugin — sherlock lives in `.claude/skills/sherlock/`;
  packaging for distribution is a later step.

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
     The scoped prep (partition + init) is already done by `investigate` — never run an
     unscoped `init`, which would scaffold the full-codebase report folder.

4. **Write results** into the report files, following the report style guide
   [`investigation/report-style.md`](investigation/report-style.md). `init` scaffolds only
   `coverage.md` — the content-bearing files do **not** exist yet, so **create each one
   fresh with `Write`** (a `Write` on a non-existent file needs no prior `Read`): the
   synthesized `summary` becomes `INVESTIGATION.md` (🗂️ The Brief → 🧾 Evidence ledger →
   ⚖️ The Verdict); write each kept finding as a case-file (Observation → 🧠 Deduction →
   ⚖️ Verdict → 🔧 Remedy) into the matching `findings-*.md`; write dismissed leads into
   `appendix-refuted.md`; write `units-status.json` (before running `coverage`).

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

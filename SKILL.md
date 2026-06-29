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

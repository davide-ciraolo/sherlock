<h1 align="center">sherlock</h1>

<p align="center"><em>Risk-tiered code investigation: perspective lenses + adversarial verification → a triaged findings report. No code changes.</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"/></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node >=18"/>
  <img src="https://img.shields.io/badge/tests-35%20passing-brightgreen.svg" alt="35 tests passing"/>
</p>

---

Sherlock reviews a codebase — whole or scoped — through a set of **investigators**, each a single *perspective* ("lens") on the code: security, correctness, dead-code, comments, refactor. Every candidate finding is **adversarially verified** before it lands, and the result is a **triaged report** under `docs/reviews/`. It changes no code.

A **hybrid CLI + LLM skill**:
- The Node CLI does the deterministic work: partitioning the repo into risk-tiered review units, scaffolding the report, resolving the lens set and rule overlay, and reconciling coverage so no unit is silently skipped.
- Claude does the judgment work the CLI can't: reading code through each lens, refuting candidate findings, and synthesizing the report.

It complements static tooling (`make check-all`, linters) — it does **not** replace it. Sherlock chases logic bugs, security reasoning, dead-code reachability, and refactor opportunities that static tools miss.

> **Opt-in / token-intensive.** A full run is multi-agent orchestration — one reviewer per `(unit × applicable lens)`, plus per-finding verifier panels. Confirm scope before launching a whole-repo run.

---

## When to use

- You want a structured security/quality **audit** of a codebase, not just a linter pass.
- You want every finding **adversarially checked** before it reaches you — fewer false positives.
- You want **coverage you can trust**: a script proves every partition unit was reviewed.
- You want the review **scoped** to a subtree or a single perspective (`--lenses security`).

---

## Layout

This repository is a **Claude Code marketplace plugin**. The skill itself lives under `skills/sherlock/`:

```
sherlock/                          # repo root = the plugin
├── .claude-plugin/
│   ├── marketplace.json           # marketplace manifest
│   └── plugin.json                # plugin manifest
├── LICENSE
├── README.md                      # this file
└── skills/sherlock/               # the skill
    ├── SKILL.md                   # Claude-facing instructions (when-to-use, procedure)
    ├── bin/cli.js                 # entry point
    ├── src/                       # commands + pure modules
    ├── lenses/                    # the investigators — one perspective per file
    ├── rules/standard/            # shipped GENERAL invariants only (portable)
    ├── schemas/                   # finding / verdict / units JSON schemas
    ├── workflow/sherlock.workflow.js   # fan-out → adversarial verify → synthesize
    ├── tests/                     # 35 tests (node:test)
    └── docs/                      # design doc + implementation plan
```

When a review runs, the host project gets:

```
<project>/
├── .sherlock/                     # internal state (units.json, …) — gitignore this
└── docs/reviews/<date>-codebase-review/   # the triaged report (configurable)
```

---

## Install

Requires **Node >= 18**.

### Recommended — Claude Code plugin marketplace

```bash
# Register the marketplace (once per machine, or via .claude/settings.json)
/plugin marketplace add davide-ciraolo/sherlock

# Install the plugin
/plugin install sherlock@sherlock
```

Or commit a per-project enable in `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "sherlock": {
      "source": { "source": "github", "repo": "davide-ciraolo/sherlock" }
    }
  },
  "enabledPlugins": {
    "sherlock@sherlock": true
  }
}
```

Teammates cloning the repo open it in Claude Code → marketplace prompt → install once. Updates via `/plugin update`. The CLI is reachable at `${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js`.

### Manual / vendored install (fallback for non–Claude Code tools)

The skill is self-contained — copy the `skills/sherlock/` directory into your project, install two runtime deps, done. No npm registry publish.

```bash
# clone and copy the skill out
git clone https://github.com/davide-ciraolo/sherlock /tmp/sherlock
mkdir -p .claude/skills
cp -r /tmp/sherlock/skills/sherlock .claude/skills/

# install runtime deps
cd .claude/skills/sherlock && npm install && cd -
```

Then point your agent tool at `.claude/skills/sherlock/SKILL.md`:

- **Claude Code** auto-discovers any `.claude/skills/<name>/SKILL.md`. Just say `"review the codebase"` or `/sherlock`.
- **OpenCode / Cursor / Windsurf / Continue**: add a project rule pointing the agent at `.claude/skills/sherlock/SKILL.md` and the CLI at `.claude/skills/sherlock/bin/cli.js`.
- **Any other tool**: the CLI is the contract — run it manually and follow the emitted `NEXT`/procedure markers.

Gitignore the state dir:

```bash
echo ".sherlock/" >> .gitignore
```

---

## Quick start

Ask Claude any of:

- `"review the codebase"` / `"audit for vulnerabilities"` / `/sherlock` — whole repo, all applicable lenses.
- `/sherlock <path-or-glob>` — scoped to a subtree.
- `/sherlock --lenses security,bugs` — only the named investigators.
- `/sherlock <path> --lenses security` — combine scope + lens selection.

Claude reads `SKILL.md` and drives the four-phase procedure. Or run the deterministic CLI yourself:

```bash
CLI="${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js"   # or .claude/skills/sherlock/bin/cli.js when vendored
node "$CLI" partition [path-or-glob]   # repo → risk-tiered .sherlock/units.json
node "$CLI" scaffold                   # create the report skeleton + coverage table
node "$CLI" rules                      # resolve standard ∪ project rule overlay
node "$CLI" lenses --select security,bugs   # list / validate the lens selection
# ... run the workflow (review → verify → synthesize) ...
node "$CLI" coverage --findings docs/reviews/<date>-codebase-review   # non-zero exit on any gap
```

---

## Commands

| Command | Purpose |
|---|---|
| `partition [path-or-glob] [--config <file>]` | Walk the target into cohesive review units (≤ ~2k LOC each; oversized dirs bin-packed into sub-units), assign a default risk tier per unit from tier-glob heuristics + config, write `.sherlock/units.json`. |
| `scaffold [--date YYYY-MM-DD] [--out <dir>]` | Create `<out>/<date>-codebase-review/` with the report skeleton and a coverage table seeded from `units.json`. |
| `lenses [--select security,bugs,...]` | List available lenses; with `--select`, validate the requested subset (friendly aliases like `bugs`→`correctness`) and print the resolved set. |
| `rules [--config <file>]` | Resolve the effective rule context: shipped standard pack ∪ explicitly-configured project overlay, and print which files feed which lenses. |
| `coverage --findings <report-dir>` | Reconcile recorded findings against `units.json`; exit non-zero and list any unit with no status (gap) or an error status. |

Run any command with `--help`.

---

## How it works

The review is a four-phase workflow (`workflow/sherlock.workflow.js`):

0. **Partition (deterministic).** `partition` + `scaffold` build `units.json` and the report skeleton; the resolved lens set and rule context are loaded.
1. **Review (fan-out).** One reviewer agent per `(unit × applicable lens)` — gated by lens `applies_to` ∩ selected lenses ∩ unit tier. Each agent gets the unit's files, the lens body, and the resolved rules; returns schema-validated candidate findings.
2. **Verify (per-finding, no barrier).** Each candidate routes by its lens's `verification_class`:
   - `security` / `correctness` → a **3-vote adversarial panel** with distinct probes (reproduce · impact reachability · spec/rule conformance), each prompted to *refute by default*. `confirmed` if ≥2 say real; `uncertain` if split; otherwise `refuted` (dropped to an appendix).
   - `cleanup` → a **single refutation check** (dead-code: repo-wide reference re-check; comment/refactor: "real improvement, not a behavior change?").
3. **Synthesize.** Dedupe across units, group by area + severity, write the report files, then run `coverage` and **fail loudly** on any gap.

### Lenses (investigators)

Each lens is a markdown file with YAML frontmatter + structured body. Adding a perspective is adding a file — no orchestration change.

| Lens | `name` | Perspective | verification class |
|---|---|---|---|
| Security | `security` | auth, tenant isolation, path-jail, SSRF, injection, secrets, role-gating | security |
| Correctness | `correctness` | logic, races, unhandled errors/promises, state machines, leaks, streaming regressions | correctness |
| Dead code | `dead-code` | unreferenced symbols/files, unreachable branches, unused deps | cleanup |
| Comments | `comments` | stale/contradictory/commented-out/redundant comments, done TODOs | cleanup |
| Refactor | `refactor` | oversized files/functions, deep nesting, duplication, weak boundaries | cleanup |

Add an investigator: copy `lenses/_TEMPLATE.md` to `lenses/<name>.md`.

### Rule layering — general standard + project overlay

Sherlock ships a **standard pack** (`rules/standard/`) of **general invariants only** — OWASP-style security, language-agnostic correctness and cleanliness. It never contains project-specific guardrails, so the skill stays portable.

A target repo's own invariants reach a review through an **explicitly-configured project overlay** — never silently scraped. On conflict, the **project overlay wins** (the repo knows its own constraints). Never edit `rules/standard/` to encode a project's quirks; point `rules.project` at them instead.

---

## Configuration

Optional `sherlock.config.yml` (or `.json`) at the target repo root:

```jsonc
{
  "output": "docs/reviews",                            // where reports land
  "rules": { "project": [".claude/rules/furiosa"] },   // explicit project overlay
  "tiers": {                                           // override tier-glob heuristics
    "S": ["api/src/auth/**", "api/src/workspace/**"],  // highest-risk
    "A": ["**/ws/**", "**/streaming/**"],
    "B": ["**"]                                        // everything else
  },
  "lensesByTier": {
    "S": ["*"],
    "A": ["security", "correctness", "dead-code", "refactor"],
    "B": ["correctness", "dead-code", "comments", "refactor"]
  },
  "exclude": ["**/node_modules/**", "**/*.test.*", "**/tests/**"]
}
```

Sane defaults when absent: tiers default to `B`, all lenses apply, output `docs/reviews`, standard exclude list.

---

## Testing

```bash
cd skills/sherlock
npm test          # node --test tests/**/*.test.js — 35 tests
```

Tests cover the deterministic core: partition (units, oversized-dir splitting, tier assignment), lens template conformance + `--select` resolution, rule layering (standard-only never absorbs a project rule; overlay wins on conflict), and coverage gap detection + exit codes. The LLM phases (review/verify/synthesize) are exercised by live runs, not unit tests.

---

## Pitfalls

- **Sherlock writes reports, not code.** There is no `--fix` mode in v1.
- **Don't encode project-specific rules in `rules/standard/`.** Use the `rules.project` overlay — keep the shipped pack general.
- **A non-zero `coverage` exit means a unit was missed.** Don't call a review complete until coverage is clean.
- **The `.sherlock/` directory is internal state.** Gitignore it; don't hand-edit.
- **Full runs are token-intensive.** Scope with a path or `--lenses` when you don't need the whole repo × every perspective.

---

## License

MIT — see [LICENSE](LICENSE).

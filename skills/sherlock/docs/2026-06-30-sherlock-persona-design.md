# Sherlock — Investigator Persona & Report Structure

**Date:** 2026-06-30
**Status:** Design (approved in brainstorming)
**Scope:** Output/report layer only. No change to partitioning, lens fan-out,
verification topology, or the finding schema.

---

## 1. Goal

Give Sherlock a coherent investigator persona that shapes **how the review report
reads**, without adding noise to the data engineers act on and without inflating the
token cost of a run.

The persona is expressed as:
1. An **investigation arc** for the report structure (The Brief → Evidence → The Verdict).
2. A **case-file format** for each finding (Observation → Deduction → Verdict → Remedy).
3. A **canonical emoji palette** (severity circles, lens/hat marks, section icons).

---

## 2. Guiding principle — persona lives in the report layer only

Personality is confined to the **report-writing surfaces**:

- The deterministic scaffold templates (`src/commands/scaffold.js`).
- A new persona style guide (`report-style.md`) read at synthesis/write time.
- The workflow's **Synthesize** agent prompt.
- The SKILL.md "write results" instructions.

**Reviewer and verifier prompts stay plain.** Those run once per `(unit × lens)` and
per finding-probe — hundreds of agent calls. Putting voice there would multiply token
cost across the whole fan-out. Keeping voice in the single synthesis/write step bounds
the extra output to roughly one paragraph + per-finding framing (well under 1% of a
full run; see §7).

---

## 3. Emoji palette (canonical)

One source of truth, defined in `report-style.md` and mirrored in the scaffold legend.

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

The uncertain-verdict 🟡 and the MEDIUM-severity 🟡 are the same glyph but never
collide in practice — one labels a severity column, the other a verdict column.

---

## 4. Report file layout

The review directory (`docs/reviews/<date>-codebase-review/`) keeps its multi-file
split. Only the **top-level summary file is renamed** and all files adopt the persona
structure.

### 4.1 `INVESTIGATION.md` (was `README.md`) — the case summary (B3 layout)

Renamed from `README.md` to `INVESTIGATION.md`: uppercase so it still surfaces as the
folder's entry point, and it names what the folder is.

Structure:

```
🕵️ Codebase Review · <scope> · <date>

🗂️ The Brief
  scope, units reviewed, total LOC, tiers, lines of inquiry (lenses run), counts.

🧾 Evidence ledger
  compact table — | sev | location | lead | verdict | — one row per kept finding,
  linking into the per-lens findings-*.md files.

⚖️ The Verdict
  N must-fix before merge · M to review · K dismissed. One-line headline lead.
```

### 4.2 `findings-{security,bugs,cleanup}.md` — case-files (B2 layout)

Each kept finding is a self-contained dossier:

```
🔴 CRITICAL · <file>:<line>
  Observation: <excerpt + what is wrong>          ← FINDING.excerpt
  🧠 Deduction: <reachability / impact reasoning>  ← FINDING.rationale
  ⚖️ Verdict: confirmed (3/3 panel)                ← FINDING.verdict + vote
  🔧 Remedy: <recommendation>                       ← FINDING.recommendation
```

The four case-file lines map 1:1 onto the **existing** `FINDING` schema fields, so
**no schema change is required**.

### 4.3 `appendix-refuted.md` — 🚫 Dismissed leads

Same case-file shape; the refutation reason from the verdict becomes the Deduction.

### 4.4 `coverage.md`

Unchanged in purpose (CLI-generated coverage matrix). May gain the emoji severity
legend header for consistency, but its table stays as-is. The `coverage` reconcile
command keys off `units-status.json` (not any report filename), so the rename in §4.1
does not affect it — see §6.

---

## 5. The new `report-style.md`

A single persona style guide shipped with the skill (alongside `lenses/` and
`rules/`). It contains:

- The investigation arc and section names (§4).
- The canonical emoji palette (§3).
- The case-file format (§4.2) with a worked example.
- A short voice note: terse, technical, evidence-first; one in-character framing line
  per section is allowed; **no narrative prose inside findings** beyond the four
  case-file lines.

Both the Synthesize agent (via its prompt) and the orchestrator (via SKILL.md) read
this file, so the voice is defined once and not duplicated across prompts.

---

## 6. Touch-points & invariants

| File | Change |
|---|---|
| `src/commands/scaffold.js` | Write `INVESTIGATION.md` instead of `README.md`; new persona skeletons for the summary, `findings-*`, and appendix; add the emoji legend. |
| `report-style.md` (new) | Persona style guide (§5). |
| `workflow/sherlock.workflow.js` | Synthesize prompt points at `report-style.md` and produces Brief + ledger + Verdict. **Reviewer/verifier prompts unchanged.** |
| `SKILL.md` | Step 3 references the case-file format + legend + `report-style.md`. |

**Invariants preserved:**
- The `coverage` command reconciles every partition unit via `units-status.json`; it
  does not reference any report filename, so the `README.md → INVESTIGATION.md` rename
  leaves it untouched. A non-zero exit still means "a unit was missed".
- The `FINDING` / `VERDICT` schemas are unchanged.
- No change to partitioning, lens resolution, rule overlay, or workflow topology.

---

## 7. Token impact

The differentiator is **report-writing output at synthesis time**; the reviewer
fan-out and verifier panels are byte-for-byte identical to today.

| Style | Extra output tokens / report |
|---|---|
| Chosen design (framed arc, B2 case-files, technical title) | ~400–900, depending on finding count |

That is well under 1% of a full multi-agent run. The case-file lines reuse data the
synthesis step already emits (`excerpt`, `rationale`, `recommendation`, `verdict`), so
the marginal cost is the section framing and emoji, not new analysis.

---

## 8. Out of scope (YAGNI)

- No persona in reviewer/verifier prompts.
- No new finding/verdict fields.
- No CLI logic changes beyond the scaffold templates and the `coverage` filename fix.
- No alternate report themes / configurable personas — one canonical voice.
- No ASCII art, banners, or per-finding narrative prose.

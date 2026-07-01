# Sherlock — Report Style Guide

The house style that shapes how a review **reads**. Voice lives here and in the
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

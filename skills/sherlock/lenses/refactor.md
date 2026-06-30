---
name: refactor
title: Refactor & Conciseness Investigator
perspective: >
  Look for structure that fights the reader: oversized units, duplication,
  deep nesting, and code living in the wrong place.
verification_class: cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---
<!-- lenses/refactor.md -->

## What to look for
- Files > ~800 LOC or functions > ~50 LOC doing too much.
- Deep nesting (> 4 levels) that early-returns would flatten.
- Duplicated logic that wants a shared helper.
- Code misplaced relative to its responsibility; weak module boundaries.
- Mutation where an immutable update would be clearer.

## Rules consulted
- General coding-style + code-review rules.

## False-positive traps
- A "long" file that is cohesive and stable — size alone is not a defect.
- Apparent duplication that is coincidental and would couple unrelated code if merged.

## Finding fields
- Propose the concrete split/extraction; note it must be behavior-preserving.

## Refutation hints
- Would the refactor change behavior? If yes, it is a bug-risk, not a clean refactor — downgrade/redirect.

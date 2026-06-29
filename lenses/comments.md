---
name: comments
title: Comment Hygiene Investigator
perspective: >
  Treat comments as code that can rot: flag the ones that mislead, duplicate the
  code, or are leftover scaffolding.
verification_class: cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---
<!-- lenses/comments.md -->

## What to look for
- Comments that contradict the code they describe (stale).
- Commented-out code blocks.
- Redundant comments that merely restate the next line.
- TODO/FIXME that are already done or obsolete.

## Rules consulted
- General coding-style rules on comments.

## False-positive traps
- Comments encoding non-obvious *why* (rationale, links to specs/issues) — keep these.
- License headers, type-checker directives, generated-file markers.

## Finding fields
- Quote the comment and the code it contradicts/duplicates.

## Refutation hints
- Does the comment carry rationale not derivable from the code? If so, it is not removable.

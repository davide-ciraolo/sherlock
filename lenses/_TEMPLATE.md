---
name: my-lens                 # unique slug; identifier for --lenses
title: My Lens
perspective: >
  One paragraph describing the single perspective this investigator takes on the code.
verification_class: cleanup   # security | correctness | cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---
<!-- lenses/_TEMPLATE.md -->

## What to look for
- Bullet the concrete patterns this lens hunts.

## Rules consulted
- Which standard-pack files and project-overlay categories to weigh.

## False-positive traps
- The known ways this lens cries wolf.

## Finding fields
- Anything beyond the shared finding schema this lens should populate.

## Refutation hints
- What a verifier should probe to refute a finding of this class.

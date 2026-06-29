---
name: dead-code
title: Dead-Code Investigator
perspective: >
  Find code that no longer earns its place: unreferenced symbols and files,
  unreachable branches, and dependencies nothing imports.
verification_class: cleanup
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: LOW
---
<!-- lenses/dead-code.md -->

## What to look for
- Exported/!exported functions, classes, constants with no references.
- Whole files imported by nothing.
- Unreachable branches (conditions that can never hold).
- Declared dependencies never imported.

## Rules consulted
- General cleanliness rules.

## False-positive traps
- Dynamic imports / `require(variable)`; string-keyed dispatch tables.
- Reflection / registration patterns (plugin/tool/route registries, DI containers).
- Test-only or fixture-only references; framework/CLI entrypoints invoked by config.
- Re-exports consumed by external packages.

## Finding fields
- Cite where you searched for references (the negative evidence).

## Refutation hints
- Re-run a repo-wide reference search including dynamic/string usages before confirming.

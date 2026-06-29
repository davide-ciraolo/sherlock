---
name: correctness
title: Correctness Investigator
perspective: >
  Assume the happy path works; hunt the edges — concurrency, error handling,
  lifecycle, and the invariants the code is supposed to preserve.
verification_class: correctness
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: HIGH
---
<!-- lenses/correctness.md -->

## What to look for
- Unhandled promise rejections / swallowed exceptions; missing `await`.
- Race conditions; shared mutable state without a lock; check-then-act gaps.
- Off-by-one, wrong boundary, inverted condition.
- State-machine violations; resource leaks (fds, sockets, child processes).
- Violations of documented project invariants (streaming/buffering, lifecycle, threading discipline).

## Rules consulted
- Standard correctness pack; project-overlay invariants take precedence on conflict.

## False-positive traps
- Code paths guarded by an invariant established elsewhere (e.g. a single-writer guarantee).
- "Missing" error handling that is intentionally handled by a framework boundary.

## Finding fields
- `rule`: the violated invariant or bug class.

## Refutation hints
- Can the bug actually be triggered? Construct the concrete input/interleaving.
- Is there a test that already exercises this path and passes?

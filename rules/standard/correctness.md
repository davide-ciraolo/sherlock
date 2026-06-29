<!-- rules/standard/correctness.md -->
# Standard Correctness Invariants (general)

- Handle errors explicitly at every level; never silently swallow.
- Always `await` promises; surface or handle rejections.
- Guard shared mutable state against races; avoid check-then-act on shared resources.
- Release resources deterministically (files, sockets, child processes, locks).
- Validate boundary conditions (empty, max, off-by-one).
- Preserve documented state-machine transitions; reject impossible states early.

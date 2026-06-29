<!-- rules/standard/cleanliness.md -->
# Standard Cleanliness Invariants (general)

- Functions focused (< ~50 lines); files cohesive (< ~800 lines); nesting < 4 levels.
- No dead code: unreferenced symbols/files, unreachable branches, unused deps.
- Comments explain *why*, not *what*; remove stale, contradictory, commented-out, or done-TODO comments.
- Prefer immutable updates; avoid in-place mutation of shared inputs.
- DRY: extract genuine duplication; do not over-couple coincidental similarity.

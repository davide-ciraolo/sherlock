<!-- rules/standard/README.md -->
# Standard rule-pack

General, repo-agnostic invariants shipped with sherlock. **Never** put
project-specific guardrails here — those reach a review only through the target
repo's explicit project overlay (`sherlock.config.yml` -> `rules.project`).
See the design doc section 6.

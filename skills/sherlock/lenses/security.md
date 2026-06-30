---
name: security
title: Security Investigator
perspective: >
  Read the code as both attacker and auditor: where does untrusted input enter,
  whose data is it, and what stops one tenant or an unauthenticated caller from
  reaching another's data or the host?
verification_class: security
applies_to:
  tiers: [S, A, B]
  globs: ["**/*"]
severity_default: HIGH
---
<!-- lenses/security.md -->

## What to look for
- AuthN/AuthZ bypass; missing role/permission checks; trusting client-supplied identity.
- Tenant cross-talk: data access not funnelled through the project's tenant-scoping mechanism.
- Service-to-service trust: privileged identity resolved from request body instead of a verified token.
- Path traversal / jail escape; filename or path taken from the client without re-resolution + containment check.
- SSRF in outbound fetches; missing redirect/peer-IP re-validation.
- Injection (SQL/command/template); unsanitized interpolation.
- Secret leakage (hardcoded keys, secrets in logs/errors).
- Supply-chain: CDN `<script>`/`<link>` without exact-version pin + integrity + crossorigin.

## Rules consulted
- Standard security pack; project-overlay security guardrails take precedence on conflict.

## False-positive traps
- A check that looks missing but is enforced by an upstream middleware/decorator.
- "Internal-only" endpoints unreachable from the public surface (still report if reachable).

## Finding fields
- `rule`: the exact standard/overlay rule or OWASP class violated.

## Refutation hints
- Trace the real call path: is the dangerous sink actually reachable with attacker-controlled input?
- Is there an upstream guard (auth middleware, scoping wrapper, jail re-check) the finding missed?

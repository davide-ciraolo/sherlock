<!-- rules/standard/security.md -->
# Standard Security Invariants (general)

- Validate all input at trust boundaries; never trust client-supplied identity, paths, or sizes.
- Parameterize queries; never concatenate untrusted input into SQL/commands/templates.
- Escape/encode output to prevent XSS; sanitize HTML.
- Enforce authentication and authorization on every non-public entrypoint.
- Re-resolve and contain filesystem paths derived from input (canonicalize + prefix-check).
- Re-validate outbound request targets to prevent SSRF; bound and re-check redirects.
- Keep secrets in env/secret-manager; never hardcode; never log them.
- Pin third-party CDN scripts/styles to exact versions with Subresource Integrity + crossorigin.
- Error messages must not leak sensitive data.

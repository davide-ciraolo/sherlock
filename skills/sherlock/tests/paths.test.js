import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { scopeSlug, unitsFileName, reportDirName, shortHash, shortName, scopeToken } from "../src/paths.js";

const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 6);

test("shortHash: first 6 hex of sha256, deterministic", () => {
  assert.equal(shortHash("api/src/auth"), h("api/src/auth"));
  assert.match(shortHash("anything"), /^[0-9a-f]{6}$/);
});

test("shortName: kebab of the last real path segment, glob/root stripped", () => {
  assert.equal(shortName("api/src/agents/coordinator"), "coordinator");
  assert.equal(shortName("src/auth"), "auth");
  assert.equal(shortName("api/**"), "api");
  assert.equal(shortName("."), "");
});

test("shortName: caps very long segments at 24 chars", () => {
  const long = "a".repeat(50);
  assert.equal(shortName(long).length, 24);
});

test("scopeToken: hash-name when a name exists, hash-only otherwise", () => {
  assert.equal(scopeToken("src/auth"), `${h("src/auth")}-auth`);
  assert.equal(scopeToken("."), h("."));
});

test("scopeSlug: full repo vs scoped", () => {
  assert.equal(scopeSlug(undefined), "codebase");
  assert.equal(scopeSlug("src/auth"), `${h("src/auth")}-auth`);
  assert.equal(scopeSlug("api/**"), `${h("api/**")}-api`);
});

test("unitsFileName: full uses units.json, scoped is hash-keyed", () => {
  assert.equal(unitsFileName(undefined), "units.json");
  assert.equal(unitsFileName("src/auth"), `units-${h("src/auth")}-auth.json`);
});

test("reportDirName: full uses codebase, scoped is hash-keyed", () => {
  assert.equal(reportDirName("2026-06-30", undefined), "2026-06-30-codebase-review");
  assert.equal(reportDirName("2026-06-30", "src/auth"), `2026-06-30-${h("src/auth")}-auth-review`);
});

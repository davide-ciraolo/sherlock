import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeSlug, unitsFileName, reportDirName } from "../src/paths.js";

test("scopeSlug: full repo vs scoped", () => {
  assert.equal(scopeSlug(undefined), "codebase");
  assert.equal(scopeSlug("src/auth"), "src-auth");
  assert.equal(scopeSlug("api/**"), "api");
});

test("unitsFileName: full uses units.json, scoped is keyed", () => {
  assert.equal(unitsFileName(undefined), "units.json");
  assert.equal(unitsFileName("src/auth"), "units-src-auth.json");
});

test("reportDirName: full uses codebase, scoped is keyed", () => {
  assert.equal(reportDirName("2026-06-30", undefined), "2026-06-30-codebase-review");
  assert.equal(reportDirName("2026-06-30", "src/auth"), "2026-06-30-src-auth-review");
});

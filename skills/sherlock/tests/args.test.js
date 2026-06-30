import { test } from "node:test";
import assert from "node:assert/strict";
import { flag, scopeArg } from "../src/args.js";

test("flag returns the value after the flag, or undefined", () => {
  assert.equal(flag(["--date", "2026-06-29"], "--date"), "2026-06-29");
  assert.equal(flag(["--date"], "--date"), undefined);
  assert.equal(flag([], "--date"), undefined);
});

test("scopeArg returns the leading positional, skipping flag values", () => {
  assert.equal(scopeArg([]), undefined);
  assert.equal(scopeArg(["src/**"]), "src/**");
  assert.equal(scopeArg(["api", "--date", "2026-06-30"]), "api");
  assert.equal(scopeArg(["--date", "2026-06-30"]), undefined);
  assert.equal(scopeArg(["--out", "x", "api"]), undefined); // scope must be the leading arg
  assert.equal(scopeArg(["--refresh", "src/auth"]), undefined); // boolean flag first → no scope
});

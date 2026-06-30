import { test } from "node:test";
import assert from "node:assert/strict";
import { flag } from "../src/args.js";

test("flag returns the value after the flag, or undefined", () => {
  assert.equal(flag(["--date", "2026-06-29"], "--date"), "2026-06-29");
  assert.equal(flag(["--date"], "--date"), undefined);
  assert.equal(flag([], "--date"), undefined);
});

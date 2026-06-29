import { test } from "node:test";
import assert from "node:assert/strict";
import { toPosix, relPosix } from "../src/paths.js";
import { kebab } from "../src/kebab.js";

test("toPosix normalises backslashes", () => {
  assert.equal(toPosix("a\\b\\c"), "a/b/c");
  assert.equal(toPosix("a/b"), "a/b");
});

test("relPosix yields posix relative path", () => {
  assert.equal(relPosix("/repo", "/repo/api/src/app.py"), "api/src/app.py");
});

test("kebab slugifies", () => {
  assert.equal(kebab("API Src Auth"), "api-src-auth");
  assert.equal(kebab("agents/src/coordinator"), "agents-src-coordinator");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { assignTier } from "../src/tiers.js";

const tiers = {
  S: ["api/src/auth/**", "agents/src/coordinator/**"],
  A: ["**/ws/**"],
  B: ["**"],
};

test("S wins over A over B (priority order)", () => {
  assert.equal(assignTier("api/src/auth/login.py", tiers), "S");
  assert.equal(assignTier("api/src/ws/dispatcher.py", tiers), "A");
  assert.equal(assignTier("frontend/src/pages/Home.tsx", tiers), "B");
});

test("unmatched path defaults to B", () => {
  assert.equal(assignTier("random/file.py", { S: [], A: [], B: [] }), "B");
});

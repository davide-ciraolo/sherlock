import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendMode } from "../src/recommend.js";

test("small scope, no S-tier → inline", () => {
  assert.equal(recommendMode({ unitCount: 3, tiers: { S: 0, A: 0, B: 3 }, totalLoc: 100 }).mode, "inline");
});

test("moderate scope → agents", () => {
  assert.equal(recommendMode({ unitCount: 10, tiers: { S: 0, A: 2, B: 8 }, totalLoc: 5000 }).mode, "agents");
  assert.equal(recommendMode({ unitCount: 20, tiers: { S: 0, A: 0, B: 20 }, totalLoc: 5000 }).mode, "agents");
});

test("any S-tier → workflow", () => {
  assert.equal(recommendMode({ unitCount: 2, tiers: { S: 1, A: 0, B: 1 }, totalLoc: 100 }).mode, "workflow");
});

test("large scope (units or loc) → workflow", () => {
  assert.equal(recommendMode({ unitCount: 21, tiers: { S: 0, A: 0, B: 21 }, totalLoc: 5000 }).mode, "workflow");
  assert.equal(recommendMode({ unitCount: 2, tiers: { S: 0, A: 0, B: 2 }, totalLoc: 30000 }).mode, "workflow");
});

test("returns a non-empty reason string", () => {
  const r = recommendMode({ unitCount: 1, tiers: { S: 0, A: 0, B: 1 }, totalLoc: 10 });
  assert.equal(typeof r.reason, "string");
  assert.ok(r.reason.length > 0);
});

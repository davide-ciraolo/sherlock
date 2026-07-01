import { test } from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import { TIER_KEYWORDS, keywordGlobs, tailoredTiers, renderConfigYaml } from "../src/config-gen.js";

test("TIER_KEYWORDS defines S and A keyword lists", () => {
  assert.ok(Array.isArray(TIER_KEYWORDS.S) && TIER_KEYWORDS.S.includes("auth"));
  assert.ok(Array.isArray(TIER_KEYWORDS.A) && TIER_KEYWORDS.A.includes("api"));
});

test("keywordGlobs maps keywords to sorted **/kw/** globs", () => {
  const s = keywordGlobs("S");
  assert.ok(s.includes("**/auth/**"));
  assert.deepEqual(s, [...s].sort(), "sorted");
  assert.equal(s.length, TIER_KEYWORDS.S.length);
});

test("tailoredTiers keeps only globs whose keyword is present; B is always **", () => {
  const t = tailoredTiers(new Set(["auth", "api", "util"]));
  assert.deepEqual(t.S, ["**/auth/**"]);
  assert.deepEqual(t.A, ["**/api/**"]);
  assert.deepEqual(t.B, ["**"]);
});

test("tailoredTiers is deterministic and empty when nothing matches", () => {
  const t = tailoredTiers(new Set(["util", "helpers2"]));
  assert.deepEqual(t.S, []);
  assert.deepEqual(t.A, []);
  assert.deepEqual(t.B, ["**"]);
});

test("renderConfigYaml emits parseable YAML with tiers + exclude + rules.project", () => {
  const yml = renderConfigYaml({
    tiers: { S: ["**/auth/**"], A: [], B: ["**"] },
    exclude: ["**/node_modules/**"],
  });
  const doc = yaml.load(yml);
  assert.deepEqual(doc.tiers.S, ["**/auth/**"]);
  assert.deepEqual(doc.tiers.A, []);
  assert.deepEqual(doc.tiers.B, ["**"]);
  assert.deepEqual(doc.exclude, ["**/node_modules/**"]);
  assert.deepEqual(doc.rules.project, []);
  assert.equal(doc.output, "docs/reviews");
  assert.ok(yml.startsWith("#"), "leads with an explanatory comment");
});

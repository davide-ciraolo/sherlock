import { test } from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import { mkdtemp, mkdir, writeFile as fsWrite, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TIER_KEYWORDS, keywordGlobs, tailoredTiers, renderConfigYaml, scanSegments, writeStarterConfig } from "../src/config-gen.js";
import { loadConfig } from "../src/config.js";

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

async function repoWith(files) {
  const root = await mkdtemp(path.join(tmpdir(), "sherlock-gen-"));
  for (const rel of files) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await fsWrite(path.join(root, rel), "x\n");
  }
  return root;
}

test("scanSegments collects directory segments of included files", async () => {
  const root = await repoWith(["src/auth/a.ts", "lib/util/b.ts"]);
  const segs = await scanSegments(root, { include: ["**/*.ts"], exclude: [] });
  assert.ok(segs.has("auth") && segs.has("util") && segs.has("src") && segs.has("lib"));
});

test("writeStarterConfig writes a tailored config when none exists", async () => {
  const root = await repoWith(["src/auth/a.ts", "src/api/b.ts", "src/util/c.ts"]);
  const res = await writeStarterConfig(root, { include: ["**/*.ts"], exclude: ["**/node_modules/**"] });
  assert.equal(res.written, true);
  assert.deepEqual(res.tiers.S, ["**/auth/**"]);
  assert.deepEqual(res.tiers.A, ["**/api/**"]);
  // the written file loads + validates through loadConfig
  const cfg = await loadConfig(root);
  assert.ok(cfg.tiers.S.includes("**/auth/**"));
  assert.ok(cfg.tiers.A.includes("**/api/**"));
});

test("writeStarterConfig never overwrites an existing config", async () => {
  const root = await repoWith(["src/auth/a.ts"]);
  const cfgPath = path.join(root, "sherlock.config.yml");
  await fsWrite(cfgPath, "output: docs/custom\n");
  const before = await readFile(cfgPath, "utf8");
  const res = await writeStarterConfig(root, { include: ["**/*.ts"], exclude: [] });
  assert.equal(res.written, false);
  assert.equal(await readFile(cfgPath, "utf8"), before, "file left byte-identical");
});

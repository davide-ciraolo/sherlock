import { readFile, access } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { keywordGlobs } from "./config-gen.js";

export const CONFIG_FILENAME = "sherlock.config.yml";

export function defaultConfig() {
  return {
    output: "docs/reviews",
    stateDir: ".sherlock",
    include: ["**/*.py", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    exclude: [
      "**/node_modules/**",
      "**/__pycache__/**",
      "**/dist/**",
      "**/build/**",
      "**/*.test.*",
      "**/tests/**",
      "**/test_*.py",
      "**/.sherlock/**",
    ],
    maxUnitLoc: 2000,
    rules: { project: [] },
    tiers: defaultTiersConfig(),
    lensesByTier: {
      S: ["*"],
      A: ["security", "correctness", "dead-code", "refactor"],
      B: ["security", "correctness", "dead-code", "comments", "refactor"],
    },
  };
}

function defaultTiersConfig() {
  return {
    S: keywordGlobs("S"),
    A: keywordGlobs("A"),
    B: ["**"],
  };
}

export function validateConfig(c) {
  for (const k of ["output", "stateDir", "include", "exclude", "maxUnitLoc", "rules", "tiers", "lensesByTier"]) {
    if (c[k] === undefined || c[k] === null) throw new Error(`config.${k} missing`);
  }
  if (typeof c.maxUnitLoc !== "number" || c.maxUnitLoc < 1) throw new Error("config.maxUnitLoc must be >= 1");
  if (!Array.isArray(c.rules.project)) throw new Error("config.rules.project must be an array");
  for (const t of ["S", "A", "B"]) {
    if (!Array.isArray(c.tiers[t])) throw new Error(`config.tiers.${t} must be an array`);
  }
  return c;
}

export async function loadConfig(projectRoot) {
  const p = path.join(projectRoot, CONFIG_FILENAME);
  let parsed = {};
  try {
    parsed = yaml.load(await readFile(p, "utf8")) || {};
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const d = defaultConfig();
  const merged = {
    ...d,
    ...parsed,
    rules: { ...d.rules, ...(parsed.rules || {}) },
    tiers: { ...d.tiers, ...(parsed.tiers || {}) },
    lensesByTier: { ...d.lensesByTier, ...(parsed.lensesByTier || {}) },
  };
  return validateConfig(merged);
}

export async function configFileExists(cwd) {
  for (const name of ["sherlock.config.yml", "sherlock.config.json"]) {
    try {
      await access(path.join(cwd, name));
      return true;
    } catch {
      // not present — keep checking
    }
  }
  return false;
}

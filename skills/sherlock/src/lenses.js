import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export const LENS_ALIASES = { bugs: "correctness", bug: "correctness", dead: "dead-code", clean: "refactor" };
const VALID_CLASSES = new Set(["security", "correctness", "cleanup"]);

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return yaml.load(m[1]) || {};
}

export async function listLenses(lensesDir) {
  const entries = await readdir(lensesDir);
  const lenses = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".md") || name.startsWith("_")) continue;
    const fm = parseFrontmatter(await readFile(path.join(lensesDir, name), "utf8"));
    if (fm && fm.name) lenses.push({ ...fm, file: name });
  }
  return lenses;
}

export function validateLens(lens) {
  for (const k of ["name", "title", "perspective", "verification_class", "applies_to", "severity_default"]) {
    if (lens[k] === undefined) throw new Error(`lens ${lens.name || "?"} missing '${k}'`);
  }
  if (!VALID_CLASSES.has(lens.verification_class)) {
    throw new Error(`lens ${lens.name}: verification_class must be one of security|correctness|cleanup`);
  }
  if (!Array.isArray(lens.applies_to.tiers) || !Array.isArray(lens.applies_to.globs)) {
    throw new Error(`lens ${lens.name}: applies_to.tiers and applies_to.globs must be arrays`);
  }
}

export function resolveSelection(lenses, selectArg) {
  if (!selectArg) return lenses;
  const byName = new Map(lenses.map((l) => [l.name, l]));
  const out = [];
  for (const raw of selectArg.split(",").map((s) => s.trim()).filter(Boolean)) {
    const name = LENS_ALIASES[raw] || raw;
    const lens = byName.get(name);
    if (!lens) throw new Error(`unknown lens '${raw}'. Available: ${[...byName.keys()].join(", ")}`);
    if (!out.includes(lens)) out.push(lens);
  }
  return out;
}

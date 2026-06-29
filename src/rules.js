import path from "node:path";
import { walkFiles } from "./glob.js";

export const GENERAL_BUCKETS = ["common", "python", "typescript"];

async function mdUnder(absDir, root) {
  const files = await walkFiles(absDir, { include: ["**/*.md"], exclude: [] });
  return files.map((f) => path.relative(root, f.abs).split(path.sep).join("/"));
}

export async function resolveRules(projectRoot, config, skillRoot) {
  const standard = await mdUnder(path.join(skillRoot, "rules/standard"), skillRoot);

  const projectGeneral = [];
  for (const bucket of GENERAL_BUCKETS) {
    const dir = path.join(projectRoot, ".claude/rules", bucket);
    projectGeneral.push(...(await mdUnder(dir, projectRoot)));
  }

  const projectSpecific = [];
  for (const rel of config.rules?.project || []) {
    projectSpecific.push(...(await mdUnder(path.join(projectRoot, rel), projectRoot)));
  }

  return {
    standard: standard.sort(),
    projectGeneral: projectGeneral.sort(),
    projectSpecific: projectSpecific.sort(),
  };
}

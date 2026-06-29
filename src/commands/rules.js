import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { resolveRules } from "../rules.js";

const skillRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export async function cmdRules({ cwd, stdout }) {
  const config = await loadConfig(cwd);
  const r = await resolveRules(cwd, config, skillRoot);
  stdout.write(`standard (${r.standard.length}):\n${r.standard.map((f) => `  ${f}`).join("\n")}\n`);
  stdout.write(`project-general (${r.projectGeneral.length}):\n${r.projectGeneral.map((f) => `  ${f}`).join("\n")}\n`);
  stdout.write(`project-specific (${r.projectSpecific.length}):\n${r.projectSpecific.map((f) => `  ${f}`).join("\n")}\n`);
  return 0;
}

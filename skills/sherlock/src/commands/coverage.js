import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { flag } from "../args.js";

async function readJson(file, label, stderr) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      stderr.write(`coverage: ${label} not found at ${file}\n`);
      return null;
    }
    throw e;
  }
}

export async function cmdCoverage({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const findingsArg = flag(args, "--findings");
  if (!findingsArg) {
    stderr.write("coverage: --findings <report-dir> required\n");
    return 1;
  }
  const findingsDir = path.resolve(cwd, findingsArg);

  const unitsArg = flag(args, "--units");
  const unitsPath = unitsArg ? path.resolve(cwd, unitsArg) : path.join(cwd, config.stateDir, "units.json");
  const unitsDoc = await readJson(unitsPath, "units file (run 'partition' first)", stderr);
  if (!unitsDoc) return 1;
  const statusDoc = await readJson(path.join(findingsDir, "units-status.json"), "units-status.json (write it at synthesis before running coverage)", stderr);
  if (!statusDoc) return 1;

  const units = unitsDoc.units;
  const status = statusDoc.units || {};

  const gaps = [];
  for (const u of units) {
    const s = status[u.id];
    if (!s) gaps.push(`${u.id}: no status recorded`);
    else if (s.status === "error") gaps.push(`${u.id}: status=error`);
  }
  if (gaps.length) {
    stderr.write(`coverage gaps (${gaps.length}):\n${gaps.map((g) => `  - ${g}`).join("\n")}\n`);
    return 1;
  }
  stdout.write(`coverage OK: ${units.length} units accounted for\n`);
  return 0;
}

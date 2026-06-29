import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function cmdCoverage({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const findingsDir = flag(args, "--findings");
  if (!findingsDir) {
    stderr.write("coverage: --findings <report-dir> required\n");
    return 1;
  }
  const { units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, "units.json"), "utf8"));
  const status = JSON.parse(await readFile(path.join(findingsDir, "units-status.json"), "utf8")).units || {};

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

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { flag, scopeArg } from "../args.js";
import { unitsFileName, reportDirName } from "../paths.js";
import { today } from "../clock.js";

export async function cmdInit({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;

  const scope = scopeArg(args);

  const unitsFile = unitsFileName(scope);
  let units;
  try {
    ({ units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, unitsFile), "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") {
      stderr.write(`init: ${config.stateDir}/${unitsFile} not found — run 'partition${scope ? " " + scope : ""}' first\n`);
      return 1;
    }
    throw e;
  }

  const dir = path.join(cwd, out, reportDirName(date, scope));
  await mkdir(dir, { recursive: true });

  // coverage.md is the only file init writes. Claude never edits it, so there is no
  // read-before-write friction. The content-bearing report files (INVESTIGATION.md,
  // findings-*.md, appendix-refuted.md) and units-status.json are written fresh by
  // Claude at synthesis — a Write on a non-existent file needs no prior Read.
  const rows = units
    .map((u) => `| ${u.id} | ${u.path} | ${u.tier} | ${u.loc} | | pending |`)
    .join("\n");
  const coverage = `# Coverage\n\n| Unit | Path | Tier | LOC | Lenses run | Status |\n|---|---|---|---|---|---|\n${rows}\n`;
  await writeFile(path.join(dir, "coverage.md"), coverage);

  stdout.write(`initialized report at ${path.relative(cwd, dir)}\n`);
  return 0;
}

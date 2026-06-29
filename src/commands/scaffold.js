import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function cmdScaffold({ cwd, args, stdout }) {
  const config = await loadConfig(cwd);
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;
  const { units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, "units.json"), "utf8"));

  const dir = path.join(cwd, out, `${date}-codebase-review`);
  await mkdir(dir, { recursive: true });

  const rows = units
    .map((u) => `| ${u.id} | ${u.tier} | ${u.loc} | | pending |`)
    .join("\n");
  const coverage = `# Coverage\n\n| Unit | Tier | LOC | Lenses run | Status |\n|---|---|---|---|---|\n${rows}\n`;

  await writeFile(path.join(dir, "README.md"), `# Codebase Review — ${date}\n\n_Executive summary populated at synthesis._\n`);
  await writeFile(path.join(dir, "findings-security.md"), "# Security findings\n\n_None yet._\n");
  await writeFile(path.join(dir, "findings-bugs.md"), "# Correctness / bug findings\n\n_None yet._\n");
  await writeFile(path.join(dir, "findings-cleanup.md"), "# Cleanup findings (dead code / comments / refactor)\n\n_None yet._\n");
  await writeFile(path.join(dir, "appendix-refuted.md"), "# Refuted candidates\n\n_None yet._\n");
  await writeFile(path.join(dir, "coverage.md"), coverage);
  await writeFile(path.join(dir, "units-status.json"), JSON.stringify({ units: {} }, null, 2));

  stdout.write(`scaffolded report at ${path.relative(cwd, dir)}\n`);
  return 0;
}

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { flag } from "../args.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function cmdScaffold({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;

  let units;
  try {
    ({ units } = JSON.parse(await readFile(path.join(cwd, config.stateDir, "units.json"), "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") {
      stderr.write(`scaffold: ${config.stateDir}/units.json not found — run 'partition' first\n`);
      return 1;
    }
    throw e;
  }

  const dir = path.join(cwd, out, `${date}-codebase-review`);
  await mkdir(dir, { recursive: true });

  const rows = units
    .map((u) => `| ${u.id} | ${u.tier} | ${u.loc} | | pending |`)
    .join("\n");
  const coverage = `# Coverage\n\n| Unit | Tier | LOC | Lenses run | Status |\n|---|---|---|---|---|\n${rows}\n`;

  const LEGEND = "🔴 critical · 🟠 high · 🟡 medium · 🟢 low — verdicts: ✅ confirmed · 🟡 uncertain · 🚫 dismissed";

  await writeFile(
    path.join(dir, "INVESTIGATION.md"),
    `# 🕵️ Codebase Review — ${date}\n\n> ${LEGEND}\n\n` +
      `## 🗂️ The Brief\n\n_Scope, units, LOC, lines of inquiry, and counts — populated at synthesis._\n\n` +
      `## 🧾 Evidence ledger\n\n| | Location | Lead | Verdict |\n|---|---|---|---|\n\n_Populated at synthesis._\n\n` +
      `## ⚖️ The Verdict\n\n_Must-fix / to-review / dismissed summary — populated at synthesis._\n`,
  );
  await writeFile(path.join(dir, "findings-security.md"), "# 🧾 Security — Evidence\n\n_No confirmed leads yet._\n");
  await writeFile(path.join(dir, "findings-bugs.md"), "# 🧾 Correctness — Evidence\n\n_No confirmed leads yet._\n");
  await writeFile(path.join(dir, "findings-cleanup.md"), "# 🧾 Cleanup — Evidence (dead code · comments · refactor)\n\n_No confirmed leads yet._\n");
  await writeFile(path.join(dir, "appendix-refuted.md"), "# 🚫 Dismissed leads\n\n_None yet._\n");
  await writeFile(path.join(dir, "coverage.md"), coverage);
  await writeFile(path.join(dir, "units-status.json"), JSON.stringify({ units: {} }, null, 2));

  stdout.write(`scaffolded report at ${path.relative(cwd, dir)}\n`);
  return 0;
}

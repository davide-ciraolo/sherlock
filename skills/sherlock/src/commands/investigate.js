import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, configFileExists } from "../config.js";
import { flag, scopeArg } from "../args.js";
import { unitsFileName, reportDirName, toPosix } from "../paths.js";
import { recommendMode } from "../recommend.js";
import { listLenses } from "../lenses.js";
import { writeStarterConfig } from "../config-gen.js";
import { cmdPartition } from "./partition.js";
import { cmdInit } from "./init.js";
import { today } from "../clock.js";

const skillRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const NULL_SINK = { write() {} };

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function cmdInvestigate({ cwd, args, stdout, stderr }) {
  const config = await loadConfig(cwd);
  const scope = scopeArg(args);
  const date = flag(args, "--date") || today();
  const out = flag(args, "--out") || config.output;
  const mode = flag(args, "--mode");
  const lensesSel = flag(args, "--lenses");
  const tiers = flag(args, "--tiers");
  const refresh = args.includes("--refresh");

  // --- config bootstrap (first run in a repo) ---
  // No config yet → draft tailored tiers from the tree and STOP, so Claude refines the
  // S/A globs before any partition consumes them. Fires at most once per repo.
  if (!(await configFileExists(cwd))) {
    const boot = await writeStarterConfig(cwd, { include: config.include, exclude: config.exclude });
    const rel = path.relative(cwd, boot.path) || "sherlock.config.yml";
    stdout.write(
      [
        "# 🕵️ Sherlock — Config Bootstrap",
        "",
        `No sherlock.config.yml found — drafted one from your file tree at ${rel}.`,
        `Tailored tiers: S=${boot.tiers?.S.length ?? 0} A=${boot.tiers?.A.length ?? 0} keyword-dirs matched (everything else → B).`,
        "",
        "## Next step — refine, then re-run",
        "- Review sherlock.config.yml and refine the S/A tier globs to your real risk",
        "  surface (add project-specific high-risk dirs, drop false matches).",
        "- Then re-run investigate to partition + plan:",
        `  node \${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js investigate${scope ? " " + scope : ""}`,
      ].join("\n") + "\n",
    );
    return 0;
  }

  const unitsRelNative = path.join(config.stateDir, unitsFileName(scope));
  const unitsPath = path.join(cwd, unitsRelNative);
  const unitsRel = toPosix(unitsRelNative);
  const reportRelNative = path.join(out, reportDirName(date, scope));
  const reportDir = path.join(cwd, reportRelNative);
  const reportRel = toPosix(reportRelNative);

  // --- reuse-first prep ---
  let reused = false;
  if (refresh || !(await exists(unitsPath))) {
    const code = await cmdPartition({ cwd, args: scope ? [scope] : [], stdout: NULL_SINK, stderr });
    if (code !== 0) return code;
  } else {
    reused = true;
  }
  if (!(await exists(path.join(reportDir, "coverage.md")))) {
    const code = await cmdInit({
      cwd,
      args: [scope, "--date", date, "--out", out].filter(Boolean),
      stdout: NULL_SINK,
      stderr,
    });
    if (code !== 0) return code;
  }

  // --- stats ---
  const { units } = JSON.parse(await readFile(unitsPath, "utf8"));
  const tierHist = { S: 0, A: 0, B: 0 };
  let totalLoc = 0;
  for (const u of units) {
    tierHist[u.tier] = (tierHist[u.tier] || 0) + 1;
    totalLoc += u.loc || 0;
  }
  const reco = recommendMode({ unitCount: units.length, tiers: tierHist, totalLoc });

  // --- lens preview ---
  const lensNames = (await listLenses(path.join(skillRoot, "lenses"))).map((l) => l.name);

  const coverageCmd = scope
    ? `coverage --findings ${reportRel} --units ${unitsRel}`
    : `coverage --findings ${reportRel}`;

  const lines = [
    "# 🕵️ Sherlock — Investigation Plan",
    "",
    `Scope: ${scope || "(full codebase)"}`,
    `Units: ${units.length}  (S:${tierHist.S} A:${tierHist.A} B:${tierHist.B})  ·  LOC: ${totalLoc}`,
    `Units file: ${unitsRel} ${reused ? "(reused cache)" : "(freshly partitioned)"}`,
    `Report dir: ${reportRel}`,
    "",
    `Recommended mode: ${reco.mode} — ${reco.reason}`,
    "Token cost & rigor: inline < agents < workflow.",
    "Note: this skill cannot detect your Claude Code plan — weigh the recommendation against your own plan/usage.",
  ];
  if (reused) {
    lines.push("The units cache was reused — pass --refresh to rebuild it if the code changed since.");
  }
  lines.push("", `Available lenses: ${lensNames.join(", ")}`, "");
  lines.push("## Next steps (Claude drives these — the CLI does not prompt)");
  lines.push(mode ? `- Mode: ${mode} (provided).` : "- Ask the user to choose a mode (show the recommendation + cost ordering + plan caveat above).");
  lines.push(lensesSel ? `- Lenses: ${lensesSel} (provided).` : "- Ask the user which lenses to apply (default: full tier-resolved set).");
  lines.push(tiers ? `- Tier-application: ${tiers} (provided).` : "- Ask the user: apply all selected lenses to every unit ('all') or follow tier-based applicability ('strict', default).");
  lines.push(`- Execute the chosen mode per SKILL.md, write the report into ${reportRel}, then run:`);
  lines.push(`  node \${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js ${coverageCmd}`);

  stdout.write(lines.join("\n") + "\n");
  return 0;
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { walkFiles } from "../glob.js";
import { countLines } from "../loc.js";
import { assignTier } from "../tiers.js";
import { kebab } from "../kebab.js";

const TIER_RANK = { B: 0, A: 1, S: 2 };

function groupKey(rel, depth) {
  const parts = rel.split("/");
  return parts.slice(0, Math.min(depth, parts.length - 1)).join("/") || ".";
}

export async function cmdPartition({ cwd, args, stdout }) {
  const config = await loadConfig(cwd);
  const scope = args.find((a) => !a.startsWith("--"));
  const include = scope ? [scope.endsWith("/") ? `${scope}**` : scope] : config.include;
  const files = await walkFiles(cwd, { include, exclude: config.exclude });

  // group by full directory path; oversized groups are split by top-3 segment below
  const texts = await Promise.all(files.map((f) => readFile(f.abs, "utf8").catch(() => "")));
  const groups = new Map();
  files.forEach((f, i) => {
    const parts = f.rel.split("/");
    const key = parts.slice(0, parts.length - 1).join("/") || ".";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ rel: f.rel, loc: countLines(texts[i]), tier: assignTier(f.rel, config.tiers) });
  });

  // split oversized groups by next-deeper segment
  const units = [];
  for (const [key, members] of groups) {
    const total = members.reduce((n, m) => n + m.loc, 0);
    if (total <= config.maxUnitLoc) {
      units.push(makeUnit(key, members));
    } else {
      const sub = new Map();
      for (const m of members) {
        const k = groupKey(m.rel, 3);
        if (!sub.has(k)) sub.set(k, []);
        sub.get(k).push(m);
      }
      for (const [k, ms] of sub) units.push(makeUnit(k, ms));
    }
  }
  units.sort((a, b) => a.id.localeCompare(b.id));

  const stateDir = path.join(cwd, config.stateDir);
  await mkdir(stateDir, { recursive: true });
  await writeFile(path.join(stateDir, "units.json"), JSON.stringify({ units }, null, 2));
  stdout.write(`partitioned ${files.length} files into ${units.length} units\n`);
  return 0;
}

function makeUnit(pathKey, members) {
  const tier = members.reduce((t, m) => (TIER_RANK[m.tier] > TIER_RANK[t] ? m.tier : t), "B");
  return {
    id: kebab(pathKey),
    path: pathKey,
    tier,
    files: members.map((m) => m.rel).sort(),
    loc: members.reduce((n, m) => n + m.loc, 0),
  };
}

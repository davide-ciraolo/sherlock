import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { walkFiles } from "../glob.js";
import { countLines } from "../loc.js";
import { assignTier } from "../tiers.js";
import { kebab } from "../kebab.js";
import { unitsFileName } from "../paths.js";

const TIER_RANK = { B: 0, A: 1, S: 2 };

function makeUnit(id, pathKey, members) {
  const tier = members.reduce((t, m) => (TIER_RANK[m.tier] > TIER_RANK[t] ? m.tier : t), "B");
  return {
    id,
    path: pathKey,
    tier,
    files: members.map((m) => m.rel).sort(),
    loc: members.reduce((n, m) => n + m.loc, 0),
  };
}

// A group is the files directly under one directory. If it exceeds the cap, bin-pack
// the sorted file list into <=maxLoc chunks (a single over-cap file lands alone).
function unitsForGroup(pathKey, members, maxLoc) {
  const total = members.reduce((n, m) => n + m.loc, 0);
  if (total <= maxLoc) return [makeUnit(kebab(pathKey), pathKey, members)];

  const sorted = [...members].sort((a, b) => a.rel.localeCompare(b.rel));
  const chunks = [];
  let cur = [];
  let curLoc = 0;
  for (const m of sorted) {
    if (cur.length && curLoc + m.loc > maxLoc) {
      chunks.push(cur);
      cur = [];
      curLoc = 0;
    }
    cur.push(m);
    curLoc += m.loc;
  }
  if (cur.length) chunks.push(cur);
  if (chunks.length === 1) return [makeUnit(kebab(pathKey), pathKey, chunks[0])];
  return chunks.map((ms, i) => makeUnit(`${kebab(pathKey)}-${i + 1}`, pathKey, ms));
}

export async function cmdPartition({ cwd, args, stdout }) {
  const config = await loadConfig(cwd);
  const scope = args.find((a) => !a.startsWith("--"));
  const include = scope ? [scope.endsWith("/") ? `${scope}**` : scope] : config.include;
  const files = await walkFiles(cwd, { include, exclude: config.exclude });

  // group by full directory path
  const texts = await Promise.all(files.map((f) => readFile(f.abs, "utf8").catch(() => "")));
  const groups = new Map();
  files.forEach((f, i) => {
    const parts = f.rel.split("/");
    const key = parts.slice(0, parts.length - 1).join("/") || ".";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ rel: f.rel, loc: countLines(texts[i]), tier: assignTier(f.rel, config.tiers) });
  });

  const units = [];
  for (const [key, members] of groups) {
    units.push(...unitsForGroup(key, members, config.maxUnitLoc));
  }
  units.sort((a, b) => a.id.localeCompare(b.id));

  const stateDir = path.join(cwd, config.stateDir);
  await mkdir(stateDir, { recursive: true });
  await writeFile(path.join(stateDir, unitsFileName(scope)), JSON.stringify({ units }, null, 2));
  stdout.write(`partitioned ${files.length} files into ${units.length} units\n`);
  return 0;
}

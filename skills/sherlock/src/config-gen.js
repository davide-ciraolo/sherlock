import { writeFile, access } from "node:fs/promises";
import path from "node:path";
import { walkFiles } from "./glob.js";

// Single source of truth for the risk taxonomy. A keyword `k` → glob `**/${k}/**`
// (matches any directory named `k` at any depth). Directory-segment matching only —
// no fuzzy filename matching (which would catch "author" for "auth").
export const TIER_KEYWORDS = {
  S: [
    "auth", "authz", "login", "security", "secret", "secrets", "crypto",
    "credential", "credentials", "token", "tokens", "password", "passwords",
    "payment", "payments", "billing", "oauth", "jwt", "sso", "saml", "iam",
    "vault", "keys",
  ],
  A: [
    "api", "server", "route", "routes", "router", "controller", "controllers",
    "db", "database", "model", "models", "middleware", "session", "sessions",
    "tenant", "permission", "permissions", "ws", "websocket", "stream",
    "streaming", "upload", "uploads", "webhook", "webhooks", "handlers",
    "graphql", "rpc", "gateway", "queue", "queues", "worker", "workers",
    "storage", "cache",
  ],
};

export function keywordGlobs(tier) {
  return TIER_KEYWORDS[tier].map((k) => `**/${k}/**`).sort();
}

// Keep only the taxonomy globs whose keyword actually appears as a directory segment.
export function tailoredTiers(segments) {
  const pick = (tier) =>
    TIER_KEYWORDS[tier].filter((k) => segments.has(k)).map((k) => `**/${k}/**`).sort();
  return { S: pick("S"), A: pick("A"), B: ["**"] };
}

// A commented sherlock.config.yml body. Built by hand (not yaml.dump) so it can carry
// explanatory comments. Empty tier lists render as `S: []`.
export function renderConfigYaml({ tiers, exclude }) {
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const list = (name, items) =>
    items.length
      ? `  ${name}:\n${items.map((i) => `    - ${q(i)}`).join("\n")}`
      : `  ${name}: []`;
  return [
    "# sherlock.config.yml — drafted by `investigate` from your project's file tree.",
    "# The S/A tiers below were derived from directories found in the repo. REVIEW and",
    "# refine them to match your real risk surface, then re-run investigate.",
    "#   S = highest-risk (all lenses) · A = elevated · B = everything else.",
    "",
    "output: docs/reviews",
    "",
    "rules:",
    "  project: []   # paths to your project's rule/invariant docs (override standard on conflict)",
    "",
    "tiers:",
    list("S", tiers.S),
    list("A", tiers.A),
    list("B", tiers.B),
    "",
    "exclude:",
    ...exclude.map((e) => `  - ${q(e)}`),
    "",
  ].join("\n");
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Collect every directory path segment across the included files (exclude-aware walk).
export async function scanSegments(cwd, { include, exclude }) {
  const files = await walkFiles(cwd, { include, exclude });
  const segments = new Set();
  for (const f of files) {
    const parts = f.rel.split("/");
    for (const seg of parts.slice(0, -1)) segments.add(seg);
  }
  return segments;
}

// Draft a tailored sherlock.config.yml — but never overwrite an existing config.
export async function writeStarterConfig(cwd, { include, exclude }) {
  const yml = path.join(cwd, "sherlock.config.yml");
  const json = path.join(cwd, "sherlock.config.json");
  if ((await fileExists(yml)) || (await fileExists(json))) {
    return { written: false, path: yml, tiers: null };
  }
  const segments = await scanSegments(cwd, { include, exclude });
  const tiers = tailoredTiers(segments);
  await writeFile(yml, renderConfigYaml({ tiers, exclude }));
  return { written: true, path: yml, tiers };
}

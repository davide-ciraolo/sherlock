import path from "node:path";
import { createHash } from "node:crypto";
import { kebab } from "./kebab.js";

const NAME_CAP = 24;

export function toPosix(p) {
  return p.split(path.sep).join("/").split("\\").join("/");
}

export function relPosix(root, abs) {
  return toPosix(path.relative(root, abs));
}

// First 6 hex of sha256 of the (posix) path string. Deterministic across runs so the
// .sherlock/ cache and cross-run diffs stay stable; collision-safe for a review's small N.
export function shortHash(s) {
  const posix = String(s).split("\\").join("/");
  return createHash("sha256").update(posix).digest("hex").slice(0, 6);
}

// kebab of the last "real" path segment (glob wildcards, ".", and empties stripped),
// capped so a pathological directory name can't blow up the slug. Human hint only.
export function shortName(s) {
  const segs = String(s)
    .split(/[\\/]+/)
    .filter((x) => x && x !== "." && x !== "*" && x !== "**");
  const base = segs.length ? segs[segs.length - 1] : "";
  return kebab(base).slice(0, NAME_CAP);
}

// Combined short identifier for a path: "<hash>-<name>", or "<hash>" when no name.
export function scopeToken(s) {
  const name = shortName(s);
  return name ? `${shortHash(s)}-${name}` : shortHash(s);
}

export function scopeSlug(scope) {
  return scope ? scopeToken(scope) : "codebase";
}

export function unitsFileName(scope) {
  return scope ? `units-${scopeToken(scope)}.json` : "units.json";
}

export function reportDirName(date, scope) {
  return `${date}-${scopeSlug(scope)}-review`;
}

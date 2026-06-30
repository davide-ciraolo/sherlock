import path from "node:path";
import { kebab } from "./kebab.js";

export function toPosix(p) {
  return p.split(path.sep).join("/").split("\\").join("/");
}

export function relPosix(root, abs) {
  return toPosix(path.relative(root, abs));
}

export function scopeSlug(scope) {
  return scope ? kebab(scope) : "codebase";
}

export function unitsFileName(scope) {
  return scope ? `units-${kebab(scope)}.json` : "units.json";
}

export function reportDirName(date, scope) {
  return `${date}-${scopeSlug(scope)}-review`;
}

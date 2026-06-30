import { readdir } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import { relPosix } from "./paths.js";

export async function walkFiles(root, { include, exclude }) {
  const isIncluded = picomatch(include, { dot: true });
  const isExcluded = exclude && exclude.length ? picomatch(exclude, { dot: true }) : () => false;
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = relPosix(root, abs);
      if (isExcluded(rel)) continue;
      if (ent.isDirectory()) await walk(abs);
      else if (ent.isFile() && isIncluded(rel)) out.push({ abs, rel });
    }
  }
  await walk(root);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

import picomatch from "picomatch";

export function assignTier(rel, tiers) {
  for (const t of ["S", "A", "B"]) {
    const globs = tiers[t] || [];
    if (globs.length && picomatch(globs, { dot: true })(rel)) return t;
  }
  return "B";
}

export const INLINE_MAX_UNITS = 3;
export const AGENTS_MAX_UNITS = 20;
export const LARGE_LOC = 20000;

// Pure recommendation from deterministic partition stats. First match wins.
export function recommendMode({ unitCount, tiers, totalLoc }) {
  const s = (tiers && tiers.S) || 0;
  if (s > 0) {
    return { mode: "workflow", reason: "security-critical (S-tier) code present — maximum rigor" };
  }
  if (unitCount > AGENTS_MAX_UNITS || totalLoc > LARGE_LOC) {
    return { mode: "workflow", reason: "large scope — full fan-out with adversarial panels" };
  }
  if (unitCount <= INLINE_MAX_UNITS) {
    return { mode: "inline", reason: "small scope — cheapest path" };
  }
  return { mode: "agents", reason: "moderate scope — parallel review" };
}

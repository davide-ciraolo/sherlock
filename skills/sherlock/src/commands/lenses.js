import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, validateLens, resolveSelection } from "../lenses.js";
import { flag } from "../args.js";

const skillRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export async function cmdLenses({ args, stdout, stderr }) {
  const lenses = await listLenses(path.join(skillRoot, "lenses"));
  for (const l of lenses) validateLens(l);
  let selected;
  try {
    selected = resolveSelection(lenses, flag(args, "--select"));
  } catch (e) {
    stderr.write(`${e.message}\n`);
    return 1;
  }
  for (const l of selected) {
    stdout.write(`${l.name}\t[${l.verification_class}]\ttiers=${l.applies_to.tiers.join(",")}\t${l.title}\n`);
  }
  return 0;
}

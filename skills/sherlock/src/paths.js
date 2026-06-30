import path from "node:path";

export function toPosix(p) {
  return p.split(path.sep).join("/").split("\\").join("/");
}

export function relPosix(root, abs) {
  return toPosix(path.relative(root, abs));
}

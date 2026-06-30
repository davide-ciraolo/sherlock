export function kebab(s) {
  return String(s)
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

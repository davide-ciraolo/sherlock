export function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function scopeArg(args) {
  return args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
}

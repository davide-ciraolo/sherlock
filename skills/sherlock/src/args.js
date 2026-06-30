export function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function scopeArg(args) {
  return args.length && !args[0].startsWith("--") ? args[0] : undefined;
}

#!/usr/bin/env node
import { cmdPartition } from "../src/commands/partition.js";
import { cmdInit } from "../src/commands/init.js";
import { cmdCoverage } from "../src/commands/coverage.js";
import { cmdLenses } from "../src/commands/lenses.js";
import { cmdRules } from "../src/commands/rules.js";
import { cmdInvestigate } from "../src/commands/investigate.js";

const HELP = `sherlock — code-investigation skill

Commands:
  investigate [path-or-glob] [--mode m] [--lenses l] [--tiers strict|all] [--refresh]   prep + recommend + plan
  partition [path-or-glob]        walk repo → risk-tiered units.json
  init [--date YYYY-MM-DD] [--out <dir>] [path]   create report skeleton + coverage table
  coverage --findings <report-dir>             reconcile units vs recorded status (exit 1 on gap)
  lenses [--select security,bugs,...]          list / resolve investigators
  rules                            print resolved standard + project rule context

Examples:
  node \${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js partition
  node \${CLAUDE_PLUGIN_ROOT}/skills/sherlock/bin/cli.js lenses --select security,bugs
`;

const HANDLERS = { partition: cmdPartition, init: cmdInit, coverage: cmdCoverage, lenses: cmdLenses, rules: cmdRules, investigate: cmdInvestigate };

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const handler = HANDLERS[cmd];
  if (!handler) {
    process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`);
    process.exit(1);
  }
  try {
    const code = await handler({ cwd: process.cwd(), args: rest, stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
    process.exit(code ?? 0);
  } catch (e) {
    process.stderr.write(`fatal: ${e.stack || e.message}\n`);
    process.exit(1);
  }
}

main();

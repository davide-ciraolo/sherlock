import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "bin/cli.js");

test("cli --help lists commands", async () => {
  const { stdout } = await run("node", [cli, "--help"]);
  for (const c of ["partition", "init", "coverage", "lenses", "rules"]) assert.ok(stdout.includes(c));
});

test("cli unknown command exits non-zero", async () => {
  await assert.rejects(run("node", [cli, "bogus"]));
});

test("cli lenses prints the five shipped lenses", async () => {
  const { stdout } = await run("node", [cli, "lenses"]);
  for (const n of ["security", "correctness", "dead-code", "comments", "refactor"]) assert.ok(stdout.includes(n));
});

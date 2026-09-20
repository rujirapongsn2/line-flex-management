#!/usr/bin/env node
/**
 * Ensure DATABASE_URL is an absolute file: path under <cwd>/data/linedev.db
 * so Prisma CLI does not resolve relative to prisma/schema.prisma.
 */
const { spawn } = require("child_process");
const path = require("path");

if (!(process.env.DATABASE_URL || "").trim()) {
  const abs = path.join(process.cwd(), "data", "linedev.db");
  process.env.DATABASE_URL = `file:${abs}`;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: with-db-url.cjs <cmd> [args...]");
  process.exit(1);
}
const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 1));

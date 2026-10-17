import { spawn } from "node:child_process";
import path from "node:path";

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
for (const field of ["API_KEY", "BASE_URL", "MODEL"]) {
  process.env[`OPENAI_${field}`] ||= process.env[`LLM_${field}`];
  process.env[`LLM_${field}`] ||= process.env[`OPENAI_${field}`];
}
const raw = (process.env.DATABASE_URL ?? "file:./financial-associates.db").replace(/^file:/, "");
process.env.DATABASE_URL = `file:${path.isAbsolute(raw) ? raw : path.resolve("prisma", raw)}`;
const build = spawn(path.resolve("node_modules/.bin/tsc"), ["-p", "tsconfig.paper-worker.json"], { stdio: "inherit" });
const code = await new Promise(r => build.on("exit", r));
if (code !== 0) process.exit(Number(code ?? 1));
const preload = path.resolve("scripts/paper-runtime-alias.cjs");
const children = ["paper-worker", "paper-strategy-worker"].map(name => spawn(process.execPath, ["--require", preload, `.local-data/paper-runtime/scripts/${name}.js`], { stdio: "inherit", env: process.env }));
if (!process.argv.includes("--worker-only")) children.push(spawn(path.resolve("node_modules/.bin/next"), [process.argv.includes("--production") ? "start" : "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2).filter(v => v !== "--production")], { stdio: "inherit", env: process.env }));
let stopping = false;
const stop = () => { if (stopping) return; stopping = true; for (const child of children) child.kill("SIGTERM"); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
for (const child of children) child.on("exit", stop);

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { loadConfig } from "../server/src/config.js";
import { connectDatabase } from "../server/src/models.js";
import { seedDemo } from "../server/scripts/seed.js";
import { mongoBinaryOptions } from "./mongodb-runtime.mjs";

process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(".cache/mongodb-binaries");
await mkdir(".local/mongo", { recursive: true });
const mongo = await MongoMemoryReplSet.create({
  binary: await mongoBinaryOptions(),
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ dbPath: path.resolve(".local/mongo") }],
});
const env = {
  ...process.env,
  NODE_ENV: "development",
  MONGODB_URI: mongo.getUri("docchase"),
  JWT_SECRET: randomBytes(32).toString("hex"),
  DEMO_MODE: "true",
  EXTRACTOR_PROVIDER: "fixture",
  STORAGE_PROVIDER: "local",
  APP_URL: "http://localhost:5173",
  RUN_WORKER: "true",
};
await connectDatabase(env.MONGODB_URI);
await seedDemo(loadConfig(env));
await mongoose.disconnect();
const server = spawn(process.execPath, ["server/src/server.js"], {
  stdio: "inherit",
  env,
});
const client = spawn(
  process.execPath,
  [
    path.resolve("node_modules/vite/bin/vite.js"),
    "--config",
    path.resolve("client/vite.config.js"),
    "--host",
    "127.0.0.1",
  ],
  { cwd: path.resolve("client"), stdio: "inherit", env },
);
console.log(
  "\nDocChase: http://localhost:5173\nDemo: owner@docchase.demo / DocChaseDemo!2026\nSynthetic sample extraction only; other files support manual review.\n",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill();
  client.kill();
  await mongo.stop({ doCleanup: false });
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of [server, client])
  child.on("exit", (code) => {
    if (!stopping && code) stop();
  });

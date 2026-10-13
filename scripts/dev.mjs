import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { loadConfig } from "../server/src/config.js";
import { connectDatabase } from "../server/src/models.js";
import { seedDemo } from "../server/scripts/seed.js";
import { mongoBinaryOptions } from "./mongodb-runtime.mjs";

process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(".cache/mongodb-binaries");
await mkdir(".local/mongo", { recursive: true });
const binary = await mongoBinaryOptions();
let mongoPort;
try {
  mongoPort = JSON.parse(await readFile(".local/mongo-port.json", "utf8")).port;
} catch {
  // Recover the address from an existing local replica set without touching
  // any application collections. New workspaces use a stable port.
  const probe = await MongoMemoryServer.create({
    binary,
    instance: {
      dbPath: path.resolve(".local/mongo"),
      storageEngine: "wiredTiger",
    },
  });
  try {
    const connection = await mongoose.mongo.MongoClient.connect(
      probe.getUri(),
      { directConnection: true },
    );
    try {
      const previous = await connection
        .db("local")
        .collection("system.replset")
        .findOne({});
      mongoPort = previous?.members?.[0]?.host
        ? Number(previous.members[0].host.split(":").at(-1))
        : 27018;
    } finally {
      await connection.close();
    }
  } finally {
    await probe.stop({ doCleanup: false });
  }
  if (!Number.isInteger(mongoPort) || mongoPort < 1024 || mongoPort > 65535)
    throw new Error("The local MongoDB port record is invalid.");
  await writeFile(
    ".local/mongo-port.json",
    JSON.stringify({ port: mongoPort }),
  );
}
const mongo = await MongoMemoryReplSet.create({
  binary,
  replSet: { count: 1, storageEngine: "wiredTiger", name: "testset" },
  instanceOpts: [{ dbPath: path.resolve(".local/mongo"), port: mongoPort }],
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
const readyDeadline = Date.now() + 20000;
let ready = false;
while (Date.now() < readyDeadline && server.exitCode === null) {
  try {
    const response = await fetch("http://127.0.0.1:3001/readyz", {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* Server is still opening its database connection. */
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (!ready) {
  server.kill();
  await mongo.stop({ doCleanup: false });
  throw new Error(
    "The DocChase API could not start. Check that port 3001 is available.",
  );
}
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

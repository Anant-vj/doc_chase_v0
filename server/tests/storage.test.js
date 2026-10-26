import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { rm, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { connectDatabase, Document, UploadAllowance } from "../src/models.js";
import { createStorage } from "../src/storage.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { samples } from "../src/samples.js";
import { mongoBinaryOptions } from "../../scripts/mongodb-runtime.mjs";

const directory = path.resolve(".local", `storage-test-${randomUUID()}`);
const legacyFirmId = new mongoose.Types.ObjectId();
const megabyte = 1024 * 1024;
let mongo, config;
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    binary: await mongoBinaryOptions(),
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await connectDatabase(mongo.getUri("docchase-storage-tests"));
  config = loadConfig({
    NODE_ENV: "test",
    UPLOAD_DIR: directory,
    MAX_FILE_SIZE_MB: "1",
    UPLOAD_BUDGET_MB: "1",
  });
});
beforeEach(async () => {
  await UploadAllowance.deleteMany({});
  await Document.deleteMany({ firmId: legacyFirmId });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (!directory.startsWith(path.resolve(".local") + path.sep))
    throw new Error("Cleanup escaped local test directory");
  await rm(directory, { recursive: true, force: true });
});

test("oversized writes are refused before reserving allowance or creating files", async () => {
  await assert.rejects(
    createStorage(config).put(Buffer.alloc(megabyte + 1), "application/pdf"),
    { code: "FILE_TOO_LARGE", status: 413 },
  );
  assert.equal(await UploadAllowance.countDocuments({}), 0);
});

test("concurrent storage instances cannot jointly exceed the deployment allowance", async () => {
  const a = createStorage(config),
    b = createStorage(config);
  const bytes = Buffer.alloc(600 * 1024);
  const results = await Promise.allSettled([
    a.put(bytes, "application/pdf"),
    b.put(bytes, "application/pdf"),
  ]);
  const accepted = results.filter((result) => result.status === "fulfilled");
  const refused = results.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].reason.code, "UPLOAD_BUDGET_REACHED");
  assert.equal(
    (await UploadAllowance.findById("application")).consumedBytes,
    bytes.length,
  );
  assert.deepEqual(await a.get(accepted[0].value), bytes);
  await a.delete(accepted[0].value);
});

test("deletion and a new storage instance do not reset the cumulative allowance", async () => {
  const storage = createStorage(config);
  const key = await storage.put(Buffer.alloc(700 * 1024), "application/pdf");
  await storage.delete(key);
  await storage.delete(key);
  await assert.rejects(
    createStorage(config).put(Buffer.alloc(400 * 1024), "application/pdf"),
    { code: "UPLOAD_BUDGET_REACHED" },
  );
  assert.equal(
    (await UploadAllowance.findById("application")).consumedBytes,
    700 * 1024,
  );
});

test("existing document bytes are included when introducing the allowance", async () => {
  await Document.create({
    firmId: legacyFirmId,
    clientId: new mongoose.Types.ObjectId(),
    checklistId: new mongoose.Types.ObjectId(),
    size: 800 * 1024,
    sha256: "synthetic-legacy-record",
  });
  await assert.rejects(
    createStorage(config).put(Buffer.alloc(300 * 1024), "application/pdf"),
    { code: "UPLOAD_BUDGET_REACHED" },
  );
  assert.equal(
    (await UploadAllowance.findById("application")).consumedBytes,
    800 * 1024,
  );
});

test("private hosted storage uses authenticated downloads and the bucket-level delete contract", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const bytes = Buffer.from("synthetic storage contract fixture");
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return options.method === "GET" ? new Response(bytes) : new Response("[]");
  };
  try {
    const hosted = createStorage({
      ...config,
      STORAGE_PROVIDER: "supabase",
      SUPABASE_URL: "https://storage.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-only-key",
      SUPABASE_BUCKET: "private-invoices",
    });
    const key = await hosted.put(bytes, "application/pdf");
    assert.deepEqual(await hosted.get(key), bytes);
    await hosted.delete(key);
    assert.deepEqual(
      calls.map((call) => call.method),
      ["POST", "GET", "DELETE"],
    );
    assert.equal(
      calls[0].url,
      `https://storage.example.test/storage/v1/object/private-invoices/${key}`,
    );
    assert.equal(
      calls[1].url,
      `https://storage.example.test/storage/v1/object/authenticated/private-invoices/${key}`,
    );
    assert.equal(
      calls[2].url,
      "https://storage.example.test/storage/v1/object/private-invoices",
    );
    assert.equal(calls[2].headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(calls[2].body), { prefixes: [key] });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("the client portal reports an exhausted budget without storing another file or job", async () => {
  const storage = createStorage(config);
  const existingFiles = (await readdir(directory)).length;
  const key = await storage.put(Buffer.alloc(megabyte), "application/pdf");
  const { app } = createApp(config);
  const owner = request.agent(app);
  const post = (url, body) => owner.post(url).set("X-DocChase", "1").send(body);
  await post("/api/auth/register", {
    name: "Prototype Owner",
    firmName: "Prototype Test Firm",
    email: "prototype@example.com",
    password: "SyntheticTestPassword2026",
  }).expect(201);
  const { client } = (
    await post("/api/clients", { name: "Sample Client" }).expect(201)
  ).body;
  const { checklist } = (
    await post("/api/checklists", {
      clientId: client._id,
      title: "Prototype invoices",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      dueDate: "2026-10-30",
      items: [{ label: "Invoices", multiple: true }],
    }).expect(201)
  ).body;
  const { url } = (
    await post(`/api/checklists/${checklist._id}/link`, {}).expect(201)
  ).body;
  const token = url.split("/").at(-1);
  const [sample] = await samples();
  const response = await request(app)
    .post(`/api/portal/${token}/items/${checklist.items[0]._id}/upload`)
    .set("X-DocChase", "1")
    .attach("file", sample.buffer, {
      filename: sample.name,
      contentType: "application/pdf",
    })
    .expect(413);
  assert.equal(response.body.error.code, "UPLOAD_BUDGET_REACHED");
  assert.equal(await Document.countDocuments({ firmId: client.firmId }), 0);
  assert.equal((await readdir(directory)).length, existingFiles + 1);
  await storage.delete(key);
});

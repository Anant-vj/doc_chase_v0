import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  connectDatabase,
  Document,
  MagicLink,
  Audit,
  Job,
  Reminder,
  Client,
  Checklist,
} from "../src/models.js";
import { samples } from "../src/samples.js";
import { createJobRunner } from "../src/jobs.js";
import { mongoBinaryOptions } from "../../scripts/mongodb-runtime.mjs";

let mongo,
  app,
  runner,
  reminders,
  first,
  second,
  client,
  list,
  url,
  doc,
  fixtures,
  config,
  storage;
const uploadDir = path.resolve(".local", `test-${randomUUID()}`);
const post = (agent, route, body) =>
  agent.post(route).set("X-DocChase", "1").send(body);
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    binary: await mongoBinaryOptions(),
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await connectDatabase(mongo.getUri("docchase-tests"));
  config = loadConfig({
    NODE_ENV: "test",
    APP_URL: "http://localhost:5173",
    JWT_SECRET: "test-secret-that-is-over-thirty-two-characters",
    DEMO_MODE: "true",
    EXTRACTOR_PROVIDER: "fixture",
    UPLOAD_DIR: uploadDir,
    SCHEDULER_SECRET: "scheduler-secret-over-thirty-two-characters",
  });
  ({ app, runner, reminders, storage } = createApp(config));
  first = request.agent(app);
  second = request.agent(app);
  fixtures = await samples();
  await post(first, "/api/auth/register", {
    firmName: "First Firm",
    name: "First Owner",
    email: "first@example.com",
    password: "TestingPassword2026",
  }).expect(201);
  await post(second, "/api/auth/register", {
    firmName: "Second Firm",
    name: "Second Owner",
    email: "second@example.com",
    password: "TestingPassword2026",
  }).expect(201);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (!uploadDir.startsWith(path.resolve(".local") + path.sep))
    throw new Error("Cleanup escaped local test directory");
  await rm(uploadDir, { recursive: true, force: true });
});
test("client setup validates GSTIN and creates a tenant-owned request", async () => {
  await post(first, "/api/clients", {
    name: "Invalid Client",
    gstin: "INVALID",
  }).expect(400);
  client = (
    await post(first, "/api/clients", {
      name: "Testing Client",
      email: "client@example.com",
    }).expect(201)
  ).body.client;
  list = (
    await post(first, "/api/checklists", {
      clientId: client._id,
      title: "September invoices",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      dueDate: "2026-10-20",
      items: [{ label: "Purchase invoices", multiple: true }],
    }).expect(201)
  ).body.checklist;
  url = (await post(first, `/api/checklists/${list._id}/link`, {}).expect(201))
    .body.url;
});
test("cross-firm request, export, link generation and malformed IDs reveal nothing", async () => {
  await second.get(`/api/checklists/${list._id}`).expect(404);
  await post(second, `/api/checklists/${list._id}/link`, {}).expect(404);
  await second.get(`/api/exports?checklistId=${list._id}`).expect(404);
  await first.get("/api/checklists/not-an-id").expect(404);
  await post(second, "/api/checklists", {
    clientId: client._id,
    title: "Foreign",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    dueDate: "2026-10-20",
    items: [{ label: "Invoices" }],
  }).expect(404);
});
test("CSRF origin and custom-header checks reject foreign writes", async () => {
  await first.post("/api/clients").send({ name: "No header" }).expect(403);
  await first
    .post("/api/clients")
    .set("X-DocChase", "1")
    .set("Origin", "https://evil.example")
    .send({ name: "Foreign origin" })
    .expect(403);
});
test("mobile portal permits a scoped private upload and blocks corrupt or duplicate files", async () => {
  const token = url.split("/").at(-1);
  const portalConfig = await request(app).get(`/api/portal/${token}`).expect(200);
  assert.equal(portalConfig.body.maxFileSizeMb, config.MAX_FILE_SIZE_MB);
  await request(app)
    .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
    .set("X-DocChase", "1")
    .attach(
      "file",
      Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0,
        0, 0,
      ]),
      { filename: "damaged.jpg", contentType: "image/jpeg" },
    )
    .expect(400);
  await request(app)
    .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
    .set("X-DocChase", "1")
    .attach("file", Buffer.alloc(config.MAX_FILE_SIZE_MB * 1024 * 1024 + 1), {
      filename: "oversized.pdf",
      contentType: "application/pdf",
    })
    .expect(413);
  await request(app)
    .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
    .set("X-DocChase", "1")
    .attach("file", Buffer.from("not a PDF"), {
      filename: "fake.pdf",
      contentType: "application/pdf",
    })
    .expect(415);
  await request(app)
    .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
    .set("X-DocChase", "1")
    .attach("file", Buffer.from("%PDF-1.7 broken"), {
      filename: "broken.pdf",
      contentType: "application/pdf",
    })
    .expect(400);
  doc = (
    await request(app)
      .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
      .set("X-DocChase", "1")
      .attach("file", fixtures[0].buffer, {
        filename: fixtures[0].name,
        contentType: "application/pdf",
      })
      .expect(201)
  ).body.document;
  await request(app)
    .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
    .set("X-DocChase", "1")
    .attach("file", fixtures[0].buffer, {
      filename: "again.pdf",
      contentType: "application/pdf",
    })
    .expect(409);
  await request(app).get(`/api/documents/${doc._id}/file`).expect(401);
  await second.get(`/api/documents/${doc._id}/file`).expect(404);
  await first.get(`/api/documents/${doc._id}/file`).expect(200);
  const portal = (await request(app).get(`/api/portal/${token}`)).body;
  assert.equal(portal.documents[0].storageKey, undefined);
  assert.equal(portal.documents[0].extraction, undefined);
});
test("durable extraction and explicit finish lead to human approval and CSV export", async () => {
  await runner.tick();
  let current = await Document.findById(doc._id);
  assert.equal(current.status, "extracted_clean");
  const token = url.split("/").at(-1);
  await post(
    request(app),
    `/api/portal/${token}/items/${list.items[0]._id}/finish`,
    {},
  ).expect(200);
  await post(first, `/api/documents/${doc._id}/review`, {
    decision: "approve",
    version: current.version,
    fields: current.extraction.fields,
  }).expect(200);
  await post(first, `/api/documents/${doc._id}/review`, {
    decision: "approve",
    version: current.version,
    fields: current.extraction.fields,
  }).expect(409);
  assert.equal(
    (await first.get(`/api/checklists/${list._id}`)).body.checklist.status,
    "complete",
  );
  const csv = (
    await first.get(`/api/exports?checklistId=${list._id}`).expect(200)
  ).text;
  assert(csv.includes("INV-2026-104"));
  assert.equal(
    await Audit.countDocuments({
      entityId: doc._id,
      action: "document.approved",
    }),
    1,
  );
  assert.equal(
    (await reminders.send(await Checklist.findById(list._id), "completed-test"))
      .skipped,
    true,
  );
});
test("wrong totals block approval, rejection links a replacement version", async () => {
  const token = url.split("/").at(-1),
    upload = (fixture, supersedes) => {
      let req = request(app)
        .post(`/api/portal/${token}/items/${list.items[0]._id}/upload`)
        .set("X-DocChase", "1");
      if (supersedes) req = req.field("supersedes", supersedes);
      return req.attach("file", fixture.buffer, {
        filename: fixture.name,
        contentType: "application/pdf",
      });
    };
  const bad = (await upload(fixtures[1]).expect(201)).body.document;
  await runner.tick();
  const current = await Document.findById(bad._id);
  assert.equal(current.status, "needs_review");
  await post(first, `/api/documents/${bad._id}/review`, {
    decision: "approve",
    version: current.version,
    fields: current.extraction.fields,
  }).expect(422);
  await post(first, `/api/documents/${bad._id}/review`, {
    decision: "reject",
    version: current.version,
    reason: "The total is incorrect.",
  }).expect(200);
  const replacement = (await upload(fixtures[3], bad._id).expect(201)).body
    .document;
  assert.equal(
    String((await Document.findById(bad._id)).supersededBy),
    replacement._id,
  );
});
test("revoked, expired and incorrectly scoped links cannot upload", async () => {
  const token = url.split("/").at(-1);
  await post(first, `/api/checklists/${list._id}/revoke-links`, {}).expect(200);
  await request(app).get(`/api/portal/${token}`).expect(410);
  const newUrl = (await post(first, `/api/checklists/${list._id}/link`, {}))
      .body.url,
    newToken = newUrl.split("/").at(-1);
  await post(
    request(app),
    `/api/portal/${newToken}/items/${new mongoose.Types.ObjectId()}/finish`,
    {},
  ).expect(404);
  await MagicLink.updateMany(
    { checklistId: list._id },
    { $set: { expiresAt: new Date(0) } },
  );
  await request(app).get(`/api/portal/${newToken}`).expect(410);
});
test("staff cannot add users, rename the firm, or hard-delete clients", async () => {
  await post(first, "/api/settings/staff", {
    name: "Test Staff",
    email: "staff@example.com",
    password: "TestingPassword2026",
  }).expect(201);
  const staff = request.agent(app);
  await post(staff, "/api/auth/login", {
    email: "staff@example.com",
    password: "TestingPassword2026",
  }).expect(200);
  await post(staff, "/api/settings/staff", {
    name: "Another",
    email: "another@example.com",
    password: "TestingPassword2026",
  }).expect(403);
  await post(staff, "/api/settings/firm", { name: "Hacked" }).expect(403);
  await staff
    .delete(`/api/clients/${client._id}`)
    .set("X-DocChase", "1")
    .expect(403);
});
test("reminder uniqueness prevents repeated effects and paused clients skip delivery", async () => {
  const check = await Checklist.findById(list._id);
  const a = await reminders.send(check, "same-slot"),
    b = await reminders.send(check, "same-slot");
  assert.equal(a.log.status, "demo");
  assert.equal(b.duplicate, true);
  assert.equal(
    await Reminder.countDocuments({
      checklistId: list._id,
      slotKey: "same-slot",
    }),
    1,
  );
  await Client.updateOne(
    { _id: client._id },
    { $set: { remindersPaused: true } },
  );
  assert.equal((await reminders.send(check, "paused-slot")).skipped, true);
});
test("stuck extraction work is reclaimed and scheduler needs its own secret", async () => {
  const pending = await Document.findOne({ status: "queued" });
  await Job.updateOne(
    { "payload.documentId": String(pending._id) },
    { $set: { status: "running", lockedAt: new Date(0) } },
  );
  await runner.tick();
  assert.notEqual((await Document.findById(pending._id)).status, "queued");
  await request(app).post("/api/internal/tick").expect(403);
  await request(app)
    .post("/api/internal/tick")
    .set("X-Scheduler-Secret", "scheduler-secret-over-thirty-two-characters")
    .expect(200);
});

test("unknown documents have a manual fallback, and stale review versions cannot overwrite it", async () => {
  const link = (
    await post(first, `/api/checklists/${list._id}/link`, {})
  ).body.url
    .split("/")
    .at(-1);
  const unknown = Buffer.concat([
    fixtures[0].buffer,
    Buffer.from("\n% synthetic manual-entry test"),
  ]);
  const uploaded = (
    await request(app)
      .post(`/api/portal/${link}/items/${list.items[0]._id}/upload`)
      .set("X-DocChase", "1")
      .attach("file", unknown, {
        filename: "manual-entry.pdf",
        contentType: "application/pdf",
      })
      .expect(201)
  ).body.document;
  await runner.tick();
  const current = await Document.findById(uploaded._id);
  assert.equal(current.status, "failed");
  const fields = { ...fixtures[0].fields, invoiceNumber: "MANUAL-TEST-001" };
  await Document.updateOne({ _id: current._id }, { $inc: { version: 1 } });
  await post(first, `/api/documents/${current._id}/review`, {
    decision: "approve",
    version: current.version,
    fields,
  }).expect(409);
  const fresh = await Document.findById(current._id);
  await post(first, `/api/documents/${current._id}/review`, {
    decision: "approve",
    version: fresh.version,
    fields,
  }).expect(200);
  assert.equal(
    await Audit.countDocuments({
      entityId: current._id,
      action: "document.approved",
    }),
    1,
  );
});

async function queuedDocument(name, fixture) {
  const newClient = await Client.create({ firmId: client.firmId, name }),
    checklist = await Checklist.create({
      firmId: client.firmId,
      clientId: newClient._id,
      title: "Queue test",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      dueDate: "2026-10-20",
      items: [{ label: "Invoices", multiple: true }],
    });
  const document = await Document.create({
    firmId: client.firmId,
    clientId: newClient._id,
    checklistId: checklist._id,
    itemId: checklist.items[0]._id,
    sha256: fixture.sha256,
    mimeType: "application/pdf",
    storageKey: await storage.put(fixture.buffer, "application/pdf"),
    originalName: fixture.name,
    status: "queued",
  });
  const job = await Job.create({
    firmId: client.firmId,
    key: `extract:${document._id}:${document.sha256}`,
    type: "extract",
    payload: { documentId: String(document._id) },
  });
  return { document, job };
}

test("same-firm extraction cache avoids a second provider call and preserves unedited source fields", async () => {
  let calls = 0;
  const provider = {
    async extract() {
      calls++;
      return {
        fields: structuredClone(fixtures[0].fields),
        fieldConfidence: { total: 0.98 },
        provider: "gemini",
        model: "test-model",
      };
    },
  };
  const cachedRunner = createJobRunner(
    {
      ...config,
      EXTRACTOR_PROVIDER: "gemini",
      GEMINI_MODEL: "test-model",
      DAILY_EXTRACTION_LIMIT: 1,
    },
    storage,
    provider,
  );
  const a = await queuedDocument("Cache Client A", fixtures[0]);
  await cachedRunner.tick();
  await Document.updateOne(
    { _id: a.document._id },
    { $set: { "extraction.fields.total": 99999 } },
  );
  const b = await queuedDocument("Cache Client B", fixtures[0]);
  await cachedRunner.tick();
  assert.equal(calls, 1);
  assert.equal(
    (await Document.findById(b.document._id)).extraction.fields.total,
    11800,
  );
});

test("provider failures retry durably three times and leave a manual-entry option", async () => {
  const { document, job } = await queuedDocument("Retry Client", fixtures[1]);
  let calls = 0;
  const failingRunner = createJobRunner(config, storage, {
    async extract() {
      calls++;
      throw new Error("Provider unavailable");
    },
  });
  for (let i = 0; i < 3; i++) {
    await Job.updateOne({ _id: job._id }, { $set: { runAt: new Date(0) } });
    await failingRunner.tick();
  }
  assert.equal(calls, 3);
  assert.equal((await Job.findById(job._id)).status, "failed");
  assert.equal((await Document.findById(document._id)).status, "failed");
});

test("owner-triggered processing never claims another firm job", async () => {
  const { document } = await queuedDocument("Scoped Queue Client", fixtures[3]);
  const foreign = (await post(second, "/api/jobs/tick", {}).expect(200)).body;
  assert.equal(foreign.processed, 0);
  assert.equal((await Document.findById(document._id)).status, "queued");
  await post(first, "/api/jobs/tick", {}).expect(200);
  assert.equal(
    (await Document.findById(document._id)).status,
    "extracted_clean",
  );
});

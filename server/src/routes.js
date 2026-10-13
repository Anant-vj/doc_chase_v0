import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { authMiddleware, ownerOnly } from "./auth.js";
import {
  Client,
  Checklist,
  Document,
  Audit,
  MagicLink,
  Job,
  Reminder,
  Firm,
  User,
} from "./models.js";
import { AppError, missing, objectId, parse } from "./errors.js";
import {
  validGstin,
  invoiceSchema,
  invoiceKey,
  assertTransition,
  checklistView,
  csvRegister,
} from "./domain.js";
import { extractionChecks } from "./jobs.js";
import { issueLink } from "./reminders.js";

const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(100).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z
    .string()
    .regex(
      /^$|^\+[1-9]\d{7,14}$/,
      "Use an international phone number, such as +919876543210.",
    )
    .default(""),
  gstin: z
    .string()
    .transform((v) => v.toUpperCase())
    .refine((v) => !v || validGstin(v), "GSTIN format or checksum is invalid.")
    .default(""),
  pan: z
    .string()
    .regex(/^$|^[A-Z]{5}\d{4}[A-Z]$/, "PAN format is invalid.")
    .default(""),
  remindersPaused: z.boolean().default(false),
});
const checklistSchema = z
  .object({
    clientId: z.string(),
    title: z.string().trim().min(2).max(140),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    dueDate: z.iso.date(),
    items: z
      .array(
        z.object({
          label: z.string().trim().min(2).max(120),
          direction: z.enum(["purchase", "sale"]).default("purchase"),
          required: z.boolean().default(true),
          multiple: z.boolean().default(true),
        }),
      )
      .min(1)
      .max(12),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: "Period end must follow period start.",
    path: ["periodEnd"],
  })
  .refine((v) => v.items.some((i) => i.required), {
    message: "At least one required item is needed.",
    path: ["items"],
  });
const actor = (req) => String(req.user._id);
async function findChecklist(id, firmId) {
  const checklist = await Checklist.findOne({ _id: objectId(id), firmId });
  if (!checklist) throw missing();
  return checklist;
}
export async function reviewDocument(documentId, firmId, userId, input) {
  const doc = await Document.findOne({ _id: objectId(documentId), firmId });
  if (!doc) throw missing();
  assertTransition(
    doc.status,
    input.decision === "reject" ? "rejected" : "approved",
  );
  let fields, validation;
  if (input.decision !== "reject") {
    fields = parse(invoiceSchema, input.fields || doc.extraction.fields || {});
    validation = await extractionChecks(doc, fields);
    if (validation.some((v) => v.severity === "error"))
      throw new AppError(
        422,
        "VALIDATION_FAILED",
        "Resolve the invoice errors before approving.",
        validation,
      );
    if (validation.some((v) => v.severity === "warn") && !input.allowWarnings)
      throw new AppError(
        422,
        "WARNINGS_REQUIRE_CONFIRMATION",
        "Confirm that you have checked the warnings before approving.",
        validation,
      );
  }
  return mongoose.connection.transaction(async (session) => {
    const updated = await Document.findOneAndUpdate(
      { _id: doc._id, firmId, version: input.version, status: doc.status },
      {
        $set: {
          status: input.decision === "reject" ? "rejected" : "approved",
          review: {
            reviewedBy: userId,
            reviewedAt: new Date(),
            decision: input.decision,
            reason: input.reason || "",
          },
          ...(fields
            ? {
                "extraction.fields": fields,
                "extraction.validation": validation,
                invoiceKey: invoiceKey(fields),
              }
            : {}),
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after", session },
    );
    if (!updated)
      throw new AppError(
        409,
        "CONFLICT",
        "This document changed. Reload it before reviewing again.",
      );
    await Audit.create(
      [
        {
          firmId,
          actor: String(userId),
          action:
            input.decision === "reject"
              ? "document.rejected"
              : "document.approved",
          entityId: doc._id,
          entityType: "Document",
          before: { status: doc.status, fields: doc.extraction.fields },
          after: { status: updated.status, fields, reason: input.reason },
        },
      ],
      { session },
    );
    if (input.decision === "reject")
      await Checklist.updateOne(
        { _id: doc.checklistId, firmId, "items._id": doc.itemId },
        { $unset: { "items.$.submittedAt": 1 } },
        { session },
      );
    return updated;
  });
}
export function firmRoutes(config, storage, runner, reminders) {
  const router = Router();
  router.use(authMiddleware(config));
  router.get("/overview", async (req, res) => {
    const firmId = req.user.firmId;
    const [clients, checklists, activity] = await Promise.all([
      Client.find({ firmId, archivedAt: null }).sort({ name: 1 }).lean(),
      Checklist.find({ firmId }).sort({ dueDate: 1 }).limit(250).lean(),
      Audit.find({ firmId }).sort({ at: -1 }).limit(12).lean(),
    ]);
    const activeIds = new Set(clients.map((c) => String(c._id)));
    const activeChecklists = checklists.filter((c) =>
      activeIds.has(String(c.clientId)),
    );
    const reviewFilter = {
      firmId,
      clientId: { $in: clients.map((c) => c._id) },
      status: { $in: ["extracted_clean", "needs_review", "failed"] },
      supersededBy: null,
    };
    const [groups, documents, reviewCount] = await Promise.all([
      Document.aggregate([
        {
          $match: {
            firmId,
            checklistId: { $in: activeChecklists.map((c) => c._id) },
            supersededBy: null,
          },
        },
        {
          $group: {
            _id: {
              checklistId: "$checklistId",
              itemId: "$itemId",
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Document.find(reviewFilter)
        .select(
          "clientId checklistId itemId originalName mimeType size status supersededBy version createdAt extraction.fields.invoiceNumber extraction.fields.supplier.name extraction.fields.total",
        )
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
      Document.countDocuments(reviewFilter),
    ]);
    const summaries = groups.map((g) => ({ ...g._id, count: g.count }));
    const lists = checklists
      .filter((c) => activeIds.has(String(c.clientId)))
      .map((c) => ({
        ...checklistView(
          c,
          summaries.filter((d) => String(d.checklistId) === String(c._id)),
        ),
        client: clients.find((cl) => String(cl._id) === String(c.clientId)),
      }));
    res.json({
      clients,
      checklists: lists,
      documents,
      activity,
      counts: {
        clients: clients.length,
        open: lists.filter((c) => c.status !== "complete").length,
        overdue: lists.filter((c) => c.status === "overdue").length,
        review: reviewCount,
        complete: lists.filter((c) => c.status === "complete").length,
      },
    });
  });
  router.get("/clients", async (req, res) =>
    res.json({
      clients: await Client.find({ firmId: req.user.firmId })
        .sort({ createdAt: -1 })
        .limit(250),
    }),
  );
  router.post("/clients", async (req, res) => {
    const data = parse(clientSchema, req.body);
    const client = await Client.create({ ...data, firmId: req.user.firmId });
    await Audit.create({
      firmId: req.user.firmId,
      actor: actor(req),
      action: "client.created",
      entityId: client._id,
      entityType: "Client",
    });
    res.status(201).json({ client });
  });
  router.patch("/clients/:id", async (req, res) => {
    const data = parse(clientSchema.partial(), req.body);
    const client = await Client.findOneAndUpdate(
      { _id: objectId(req.params.id), firmId: req.user.firmId },
      { $set: data, $inc: { version: 1 } },
      { returnDocument: "after", runValidators: true },
    );
    if (!client) throw missing();
    res.json({ client });
  });
  router.post("/clients/:id/archive", async (req, res) => {
    const client = await Client.findOneAndUpdate(
      { _id: objectId(req.params.id), firmId: req.user.firmId },
      { $set: { archivedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!client) throw missing();
    const lists = await Checklist.find({
      firmId: req.user.firmId,
      clientId: client._id,
    }).select("_id");
    await MagicLink.updateMany(
      {
        firmId: req.user.firmId,
        checklistId: { $in: lists.map((l) => l._id) },
      },
      { $set: { revokedAt: new Date() } },
    );
    res.json({ ok: true });
  });
  router.delete("/clients/:id", ownerOnly, async (req, res) => {
    const client = await Client.findOne({
      _id: objectId(req.params.id),
      firmId: req.user.firmId,
    });
    if (!client) throw missing();
    await Client.updateOne(
      { _id: client._id, firmId: req.user.firmId },
      { $set: { archivedAt: new Date(), remindersPaused: true } },
    );
    const docs = await Document.find({
      clientId: client._id,
      firmId: req.user.firmId,
    });
    await Promise.all(docs.map((d) => storage.delete(d.storageKey)));
    const lists = await Checklist.find({
      clientId: client._id,
      firmId: req.user.firmId,
    }).select("_id");
    const ids = lists.map((l) => l._id);
    await Promise.all([
      MagicLink.deleteMany({
        firmId: req.user.firmId,
        checklistId: { $in: ids },
      }),
      Reminder.deleteMany({
        firmId: req.user.firmId,
        checklistId: { $in: ids },
      }),
      Job.deleteMany({
        firmId: req.user.firmId,
        "payload.documentId": { $in: docs.map((d) => String(d._id)) },
      }),
      Document.deleteMany({ firmId: req.user.firmId, clientId: client._id }),
      Checklist.deleteMany({ firmId: req.user.firmId, clientId: client._id }),
      Client.deleteOne({ _id: client._id, firmId: req.user.firmId }),
    ]);
    await Audit.deleteMany({
      firmId: req.user.firmId,
      entityId: { $in: [client._id, ...docs.map((d) => d._id), ...ids] },
    });
    res.json({ ok: true });
  });
  router.post("/checklists", async (req, res) => {
    const data = parse(checklistSchema, req.body),
      client = await Client.findOne({
        _id: objectId(data.clientId),
        firmId: req.user.firmId,
        archivedAt: null,
      });
    if (!client) throw missing();
    const checklist = await Checklist.create({
      ...data,
      dueDate: new Date(`${data.dueDate}T18:29:59Z`),
      firmId: req.user.firmId,
    });
    await Audit.create({
      firmId: req.user.firmId,
      actor: actor(req),
      action: "checklist.created",
      entityId: checklist._id,
      entityType: "Checklist",
    });
    res.status(201).json({ checklist: checklistView(checklist) });
  });
  router.get("/checklists/:id", async (req, res) => {
    const checklist = await findChecklist(req.params.id, req.user.firmId),
      documents = await Document.find({
        checklistId: checklist._id,
        firmId: req.user.firmId,
      })
        .select("-storageKey")
        .sort({ createdAt: 1 }),
      client = await Client.findOne({
        _id: checklist.clientId,
        firmId: req.user.firmId,
      });
    res.json({
      checklist: checklistView(checklist, documents),
      documents,
      client,
    });
  });
  router.post("/checklists/:id/link", async (req, res) =>
    res
      .status(201)
      .json(
        await issueLink(
          await findChecklist(req.params.id, req.user.firmId),
          config,
        ),
      ),
  );
  router.post("/checklists/:id/revoke-links", async (req, res) => {
    const list = await findChecklist(req.params.id, req.user.firmId);
    await MagicLink.updateMany(
      { checklistId: list._id, firmId: req.user.firmId },
      { $set: { revokedAt: new Date() } },
    );
    res.json({ ok: true });
  });
  router.post("/checklists/:id/items/:itemId/waive", async (req, res) => {
    const list = await findChecklist(req.params.id, req.user.firmId),
      item = list.items.id(objectId(req.params.itemId));
    if (!item) throw missing();
    const { reason } = parse(
      z.object({ reason: z.string().trim().min(3).max(500) }),
      req.body,
    );
    item.waivedAt = new Date();
    item.waivedBy = req.user._id;
    await list.save();
    await Audit.create({
      firmId: req.user.firmId,
      actor: actor(req),
      action: "item.waived",
      entityId: list._id,
      entityType: "Checklist",
      after: { itemId: String(item._id), reason },
    });
    res.json({ ok: true });
  });
  router.post("/checklists/:id/reminder", async (req, res) => {
    const list = await findChecklist(req.params.id, req.user.firmId);
    res.json(
      await reminders.send(
        list,
        `manual:${new Date().toISOString().slice(0, 16)}`,
      ),
    );
  });
  router.patch("/checklists/:id/reminders", async (req, res) => {
    const list = await findChecklist(req.params.id, req.user.firmId),
      data = parse(z.object({ paused: z.boolean() }), req.body);
    list.remindersPaused = data.paused;
    await list.save();
    res.json({ ok: true });
  });
  router.get("/documents", async (req, res) => {
    const filter = { firmId: req.user.firmId };
    if (req.query.status)
      filter.status = parse(
        z.enum([
          "queued",
          "processing",
          "extracted_clean",
          "needs_review",
          "failed",
          "approved",
          "rejected",
        ]),
        req.query.status,
      );
    res.json({
      documents: await Document.find(filter)
        .select("-storageKey")
        .sort({ createdAt: -1 })
        .limit(250),
    });
  });
  router.get("/documents/:id", async (req, res) => {
    const doc = await Document.findOne({
      _id: objectId(req.params.id),
      firmId: req.user.firmId,
    }).select("-storageKey");
    if (!doc) throw missing();
    res.json({
      document: doc,
      client: await Client.findOne({
        _id: doc.clientId,
        firmId: req.user.firmId,
      }),
      checklist: await Checklist.findOne({
        _id: doc.checklistId,
        firmId: req.user.firmId,
      }),
    });
  });
  router.get("/documents/:id/file", async (req, res) => {
    const doc = await Document.findOne({
      _id: objectId(req.params.id),
      firmId: req.user.firmId,
    });
    if (!doc) throw missing();
    res
      .set({
        "Content-Type": doc.mimeType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="document.${doc.mimeType === "application/pdf" ? "pdf" : "jpg"}"`,
      })
      .send(await storage.get(doc.storageKey));
  });
  router.post("/documents/:id/validate", async (req, res) => {
    const doc = await Document.findOne({
      _id: objectId(req.params.id),
      firmId: req.user.firmId,
    });
    if (!doc) throw missing();
    const fields = parse(invoiceSchema, req.body.fields);
    res.json({ validation: await extractionChecks(doc, fields) });
  });
  router.post("/documents/:id/review", async (req, res) => {
    const input = parse(
      z
        .object({
          decision: z.enum(["approve", "reject"]),
          version: z.number().int().nonnegative(),
          fields: z.unknown().optional(),
          allowWarnings: z.boolean().default(false),
          reason: z.string().trim().max(500).optional(),
        })
        .refine((d) => d.decision !== "reject" || d.reason?.length >= 3, {
          message: "Give the client a reason of at least 3 characters.",
          path: ["reason"],
        }),
      req.body,
    );
    res.json({
      document: await reviewDocument(
        req.params.id,
        req.user.firmId,
        req.user._id,
        input,
      ),
    });
  });
  router.post("/review/bulk", async (req, res) => {
    const docs = await Document.find({
      firmId: req.user.firmId,
      status: "extracted_clean",
      supersededBy: null,
    }).limit(100);
    let approved = 0,
      skipped = 0;
    for (const doc of docs) {
      try {
        await reviewDocument(String(doc._id), req.user.firmId, req.user._id, {
          decision: "approve",
          version: doc.version,
          fields: doc.extraction.fields,
        });
        approved++;
      } catch {
        skipped++;
      }
    }
    res.json({ approved, skipped });
  });
  router.post("/documents/:id/retry", async (req, res) => {
    const doc = await Document.findOne({
      _id: objectId(req.params.id),
      firmId: req.user.firmId,
    });
    if (!doc) throw missing();
    assertTransition(doc.status, "queued");
    await mongoose.connection.transaction(async (session) => {
      const changed = await Document.updateOne(
        { _id: doc._id, firmId: req.user.firmId, version: doc.version },
        { $set: { status: "queued" }, $inc: { version: 1 } },
        { session },
      );
      if (!changed.modifiedCount)
        throw new AppError(
          409,
          "CONFLICT",
          "This document changed before the retry. Reload it and try again.",
        );
      await Job.updateOne(
        { key: `extract:${doc._id}:${doc.sha256}`, firmId: req.user.firmId },
        { $set: { status: "pending", attempts: 0, runAt: new Date() } },
        { session },
      );
    });
    res.json({ ok: true });
  });
  router.get("/exports", async (req, res) => {
    const list = await findChecklist(req.query.checklistId, req.user.firmId),
      docs = await Document.find({
        firmId: req.user.firmId,
        checklistId: list._id,
        status: "approved",
      });
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="docchase-${list._id}.csv"`,
        "Cache-Control": "no-store",
      })
      .send(csvRegister(docs));
  });
  router.get("/reminders", async (req, res) =>
    res.json({
      logs: await Reminder.find({ firmId: req.user.firmId })
        .sort({ createdAt: -1 })
        .limit(100),
      emailConfigured: config.MAIL_PROVIDER === "brevo",
    }),
  );
  router.get("/activity", async (req, res) =>
    res.json({
      activity: await Audit.find({ firmId: req.user.firmId })
        .sort({ at: -1 })
        .limit(100),
    }),
  );
  router.get("/settings", async (req, res) =>
    res.json({
      firm: await Firm.findById(req.user.firmId),
      users: await User.find({ firmId: req.user.firmId }).select(
        "name email role status",
      ),
      emailConfigured: config.MAIL_PROVIDER === "brevo",
      demo: config.DEMO_MODE,
      extractionConfigured: config.EXTRACTOR_PROVIDER === "gemini",
    }),
  );
  router.post("/settings/staff", ownerOnly, async (req, res) => {
    const data = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(10).max(72),
      }),
      req.body,
    );
    const user = await User.create({
      ...data,
      firmId: req.user.firmId,
      passwordHash: await bcrypt.hash(data.password, 12),
      role: "staff",
    });
    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  });
  router.post("/settings/firm", ownerOnly, async (req, res) => {
    const data = parse(
      z.object({ name: z.string().trim().min(2).max(100) }),
      req.body,
    );
    res.json({
      firm: await Firm.findByIdAndUpdate(
        req.user.firmId,
        { $set: data },
        { returnDocument: "after" },
      ),
    });
  });
  router.post("/jobs/tick", ownerOnly, async (req, res) =>
    res.json(await runner.tick(4, req.user.firmId)),
  );
  return router;
}
export function schedulerRoute(config, runner, reminders) {
  return async (req, res) => {
    const provided = Buffer.from(req.get("X-Scheduler-Secret") || ""),
      expected = Buffer.from(config.SCHEDULER_SECRET || "");
    if (
      !expected.length ||
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    )
      throw new AppError(403, "FORBIDDEN", "Scheduler access denied.");
    res.json({ jobs: await runner.tick(), reminders: await reminders.tick() });
  };
}

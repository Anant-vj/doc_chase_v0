import { Router } from "express";
import { createHash } from "node:crypto";
import path from "node:path";
import mongoose from "mongoose";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { z } from "zod";
import {
  MagicLink,
  Checklist,
  Firm,
  Client,
  Document,
  Audit,
  Job,
} from "./models.js";
import { hashToken } from "./reminders.js";
import { checklistView } from "./domain.js";
import { AppError, missing, objectId, parse } from "./errors.js";

export function portalRoutes(storage, config) {
  const router = Router(),
    upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
    });
  router.use(
    rateLimit({
      windowMs: 15 * 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  router.use("/:token", async (req, _res, next) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new AppError(
        410,
        "LINK_UNAVAILABLE",
        "This upload link is unavailable. Ask your accountant for a new one.",
      );
    const link = await MagicLink.findOneAndUpdate(
      {
        tokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { lastUsedAt: new Date() }, $inc: { useCount: 1 } },
      { returnDocument: "after" },
    );
    if (!link)
      throw new AppError(
        410,
        "LINK_UNAVAILABLE",
        "This upload link has expired or was revoked. Ask your accountant for a new one.",
      );
    const checklist = await Checklist.findOne({
      _id: link.checklistId,
      firmId: link.firmId,
    });
    if (
      !checklist ||
      !(await Client.exists({
        _id: checklist.clientId,
        firmId: link.firmId,
        archivedAt: null,
      }))
    )
      throw new AppError(
        410,
        "LINK_UNAVAILABLE",
        "This request is no longer available. Ask your accountant for help.",
      );
    req.link = link;
    req.checklist = checklist;
    next();
  });
  router.get("/:token", async (req, res) => {
    const [firm, client, docs] = await Promise.all([
      Firm.findById(req.link.firmId).select("name"),
      Client.findOne({
        _id: req.checklist.clientId,
        firmId: req.link.firmId,
      }).select("name contactPerson"),
      Document.find({
        firmId: req.link.firmId,
        checklistId: req.checklist._id,
      }).select(
        "_id itemId originalName mimeType size status review.reason supersededBy createdAt",
      ),
    ]);
    res.set("Cache-Control", "no-store").json({
      firm,
      client,
      checklist: checklistView(req.checklist, docs),
      documents: docs,
      demo: config.DEMO_MODE,
    });
  });
  router.post(
    "/:token/items/:itemId/upload",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    upload.single("file"),
    async (req, res) => {
      const checklist = req.checklist,
        item = checklist.items.id(objectId(req.params.itemId));
      if (!item) throw missing();
      if (item.waivedAt)
        throw new AppError(
          409,
          "ITEM_WAIVED",
          "Your accountant has waived this item.",
        );
      if (!req.file)
        throw new AppError(400, "NO_FILE", "Choose a file to upload.");
      const { buffer, size } = req.file,
        type = await fileTypeFromBuffer(buffer);
      if (
        !type ||
        !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
          type.mime,
        )
      )
        throw new AppError(
          415,
          "UNSUPPORTED_FILE",
          "Choose a PDF, JPG, PNG or WebP document.",
        );
      if (type.mime === "application/pdf") {
        try {
          const pdf = await PDFDocument.load(buffer);
          if (pdf.getPageCount() > 100) throw new Error("Too many pages");
        } catch {
          throw new AppError(
            400,
            "INVALID_FILE",
            "This PDF is damaged, password-protected or exceeds 100 pages.",
          );
        }
      } else {
        try {
          await sharp(buffer, { limitInputPixels: 20000000 }).stats();
        } catch {
          throw new AppError(
            400,
            "INVALID_FILE",
            "This image is damaged or exceeds 20 megapixels. Choose another image.",
          );
        }
      }
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (
        await Document.exists({
          firmId: req.link.firmId,
          clientId: checklist.clientId,
          sha256,
        })
      )
        throw new AppError(
          409,
          "DUPLICATE_FILE",
          "This exact file has already been received for this client.",
        );
      let previous;
      if (req.body.supersedes) {
        previous = await Document.findOne({
          _id: objectId(req.body.supersedes),
          firmId: req.link.firmId,
          checklistId: checklist._id,
          itemId: item._id,
          status: "rejected",
          supersededBy: null,
        });
        if (!previous) throw missing();
      }
      if (
        !item.multiple &&
        (await Document.exists({
          firmId: req.link.firmId,
          checklistId: checklist._id,
          itemId: item._id,
          supersededBy: null,
          _id: { $ne: previous?._id },
        }))
      )
        throw new AppError(
          409,
          "ITEM_ALREADY_RECEIVED",
          "This item accepts one file. Ask your accountant to reject it if a replacement is needed.",
        );
      const key = await storage.put(buffer, type.mime);
      let document;
      try {
        await mongoose.connection.transaction(async (session) => {
          [document] = await Document.create(
            [
              {
                firmId: req.link.firmId,
                clientId: checklist.clientId,
                checklistId: checklist._id,
                itemId: item._id,
                storageKey: key,
                originalName: path
                  .basename(req.file.originalname)
                  .replace(/[\r\n]/g, "")
                  .slice(0, 180),
                mimeType: type.mime,
                size,
                sha256,
                supersedes: previous?._id,
                status: "queued",
              },
            ],
            { session },
          );
          if (previous) {
            const changed = await Document.updateOne(
              {
                _id: previous._id,
                firmId: req.link.firmId,
                supersededBy: null,
              },
              { $set: { supersededBy: document._id } },
              { session },
            );
            if (!changed.modifiedCount)
              throw new AppError(
                409,
                "CONFLICT",
                "A replacement for this file was already uploaded.",
              );
          }
          const changed = await Checklist.updateOne(
            {
              _id: checklist._id,
              firmId: req.link.firmId,
              version: checklist.version,
              "items._id": item._id,
            },
            {
              $unset: { "items.$.submittedAt": 1, "items.$.naNote": 1 },
              $inc: { version: 1 },
            },
            { session },
          );
          if (!changed.modifiedCount)
            throw new AppError(
              409,
              "CONFLICT",
              "This request changed during upload. Please retry your file.",
            );
          await Job.create(
            [
              {
                firmId: req.link.firmId,
                key: `extract:${document._id}:${sha256}`,
                type: "extract",
                payload: { documentId: String(document._id) },
              },
            ],
            { session },
          );
          await Audit.create(
            [
              {
                firmId: req.link.firmId,
                actor: "client link",
                action: previous ? "document.replaced" : "document.uploaded",
                entityId: document._id,
                entityType: "Document",
              },
            ],
            { session },
          );
        });
      } catch (error) {
        await storage.delete(key);
        if (error.code === 11000)
          throw new AppError(
            409,
            "DUPLICATE_FILE",
            "This file has already been received.",
          );
        throw error;
      }
      res.status(201).json({
        document: {
          _id: document._id,
          itemId: document.itemId,
          originalName: document.originalName,
          status: document.status,
        },
      });
    },
  );
  router.post("/:token/items/:itemId/finish", async (req, res) => {
    const item = req.checklist.items.id(objectId(req.params.itemId));
    if (!item) throw missing();
    if (
      !(await Document.exists({
        firmId: req.link.firmId,
        checklistId: req.checklist._id,
        itemId: item._id,
        supersededBy: null,
        status: { $ne: "rejected" },
      }))
    )
      throw new AppError(
        400,
        "NO_DOCUMENTS",
        "Upload at least one document before marking this item finished.",
      );
    item.submittedAt = new Date();
    await req.checklist.save();
    res.json({ ok: true });
  });
  router.post("/:token/items/:itemId/unavailable", async (req, res) => {
    const item = req.checklist.items.id(objectId(req.params.itemId));
    if (!item) throw missing();
    const { note } = parse(
      z.object({ note: z.string().trim().min(3).max(500) }),
      req.body,
    );
    item.naNote = note;
    await req.checklist.save();
    await Audit.create({
      firmId: req.link.firmId,
      actor: "client link",
      action: "item.unavailable",
      entityId: req.checklist._id,
      entityType: "Checklist",
      after: { itemId: String(item._id), note },
    });
    res.json({ ok: true });
  });
  return router;
}

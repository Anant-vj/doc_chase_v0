import { Job, Document, Checklist, Client, Firm, Usage } from "./models.js";
import {
  invoiceKey,
  validateInvoice,
  confidenceScore,
  routeInvoice,
} from "./domain.js";
import { logger } from "./errors.js";

export async function enqueue(firmId, type, key, payload) {
  return Job.findOneAndUpdate(
    { key },
    {
      $setOnInsert: {
        firmId,
        type,
        key,
        payload,
        status: "pending",
        runAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
}
export async function extractionChecks(document, fields) {
  const checklist = await Checklist.findOne({
    _id: document.checklistId,
    firmId: document.firmId,
  });
  const client = await Client.findOne({
    _id: document.clientId,
    firmId: document.firmId,
  });
  if (!checklist || !client)
    throw new Error("Document is no longer available.");
  const key = invoiceKey(fields),
    duplicate = key
      ? !!(await Document.exists({
          firmId: document.firmId,
          clientId: document.clientId,
          invoiceKey: key,
          _id: { $ne: document._id },
          status: { $ne: "rejected" },
        }))
      : false;
  return validateInvoice(fields, {
    periodStart: checklist.periodStart,
    periodEnd: checklist.periodEnd,
    clientGstin: client.gstin,
    direction: checklist.items.id(document.itemId)?.direction,
    duplicate,
  });
}
export function createJobRunner(config, storage, extractor) {
  let ticking = false;
  async function runExtraction(job) {
    const doc = await Document.findOne({
      _id: job.payload.documentId,
      firmId: job.firmId,
      status: { $in: ["queued", "processing"] },
    });
    if (!doc) return;
    await Document.updateOne(
      {
        _id: doc._id,
        firmId: job.firmId,
        status: { $in: ["queued", "processing"] },
      },
      {
        $set: { status: "processing" },
        $inc: { version: 1, "extraction.attempts": 1 },
      },
    );
    const cached =
      config.EXTRACTOR_PROVIDER === "gemini"
        ? await Document.findOne({
            firmId: job.firmId,
            sha256: doc.sha256,
            _id: { $ne: doc._id },
            "extraction.model": config.GEMINI_MODEL,
            "extraction.sourceFields": { $exists: true },
          })
            .select(
              "extraction.sourceFields extraction.fieldConfidence extraction.provider extraction.model",
            )
            .lean()
        : null;
    if (config.EXTRACTOR_PROVIDER === "gemini" && !cached) {
      const day = new Date().toISOString().slice(0, 10);
      await Usage.updateOne(
        { firmId: job.firmId, day },
        { $setOnInsert: { count: 0 } },
        { upsert: true },
      );
      const reservation = await Usage.findOneAndUpdate(
        {
          firmId: job.firmId,
          day,
          count: { $lt: config.DAILY_EXTRACTION_LIMIT },
        },
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
      if (!reservation)
        throw new Error(
          "The firm daily extraction limit has been reached. Manual entry is available.",
        );
    }
    const result = cached
      ? {
          fields: cached.extraction.sourceFields,
          fieldConfidence: cached.extraction.fieldConfidence,
          provider: cached.extraction.provider,
          model: cached.extraction.model,
        }
      : await extractor.extract(doc, await storage.get(doc.storageKey));
    const validation = await extractionChecks(doc, result.fields),
      confidence = confidenceScore(result.fieldConfidence),
      firm = await Firm.findById(job.firmId);
    await Document.updateOne(
      { _id: doc._id, firmId: job.firmId, status: "processing" },
      {
        $set: {
          status: routeInvoice(
            validation,
            confidence,
            firm.settings.confidenceThreshold,
          ),
          invoiceKey: invoiceKey(result.fields),
          extraction: {
            ...result,
            sourceFields: result.fields,
            validation,
            confidence,
            attempts: doc.extraction.attempts + 1,
            processedAt: new Date(),
          },
        },
        $inc: { version: 1 },
      },
    );
  }
  async function tick(maxJobs = 4) {
    if (ticking) return { busy: true };
    ticking = true;
    let processed = 0;
    try {
      const stale = new Date(Date.now() - 10 * 60000);
      await Job.updateMany(
        { status: "running", lockedAt: { $lt: stale } },
        { $set: { status: "pending", runAt: new Date() } },
      );
      for (let i = 0; i < maxJobs; i++) {
        const job = await Job.findOneAndUpdate(
          { status: "pending", runAt: { $lte: new Date() } },
          {
            $set: { status: "running", lockedAt: new Date() },
            $inc: { attempts: 1 },
          },
          { sort: { runAt: 1 }, returnDocument: "after" },
        );
        if (!job) break;
        try {
          if (job.type === "extract") await runExtraction(job);
          await Job.updateOne(
            { _id: job._id, status: "running", attempts: job.attempts },
            { $set: { status: "done" } },
          );
        } catch (error) {
          const manual = error.code === "MANUAL_ENTRY_REQUIRED",
            final = manual || job.attempts >= 3;
          const reason = manual
            ? error.message
            : "Extraction could not finish. You can retry or enter the invoice manually.";
          await Job.updateOne(
            { _id: job._id, status: "running", attempts: job.attempts },
            {
              $set: {
                status: final ? "failed" : "pending",
                runAt: new Date(
                  Date.now() +
                    [30000, 120000, 600000][Math.min(job.attempts - 1, 2)],
                ),
                lastError: reason,
              },
            },
          );
          await Document.updateOne(
            {
              _id: job.payload.documentId,
              firmId: job.firmId,
              status: "processing",
            },
            {
              $set: {
                status: final ? "failed" : "queued",
                "extraction.lastError": reason,
              },
              $inc: { version: 1 },
            },
          );
          logger.warn(
            { jobId: String(job._id), attempt: job.attempts, final },
            "Extraction attempt did not complete",
          );
        }
        processed++;
      }
      return { processed };
    } finally {
      ticking = false;
    }
  }
  return { tick };
}

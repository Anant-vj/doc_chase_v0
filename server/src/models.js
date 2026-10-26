import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (name, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required,
});
const base = {
  timestamps: true,
  optimisticConcurrency: true,
  versionKey: "version",
};
const tenant = { firmId: ref("Firm") };
const define = (name, schema) =>
  mongoose.models[name] || mongoose.model(name, schema);

export const Firm = define(
  "Firm",
  new Schema(
    {
      name: { type: String, required: true },
      settings: {
        quietStart: { type: Number, default: 21 },
        quietEnd: { type: Number, default: 8 },
        confidenceThreshold: { type: Number, default: 0.85 },
      },
    },
    base,
  ),
);
export const User = define(
  "User",
  new Schema(
    {
      ...tenant,
      name: String,
      email: { type: String, unique: true, required: true },
      passwordHash: { type: String, select: false, required: true },
      role: { type: String, enum: ["owner", "staff"], default: "owner" },
      tokenVersion: { type: Number, default: 0 },
      status: { type: String, default: "active" },
    },
    base,
  ),
);
export const Client = define(
  "Client",
  new Schema(
    {
      ...tenant,
      name: { type: String, required: true },
      contactPerson: String,
      email: String,
      phone: String,
      gstin: String,
      pan: String,
      remindersPaused: { type: Boolean, default: false },
      archivedAt: Date,
    },
    base,
  ),
);
const itemSchema = new Schema({
  label: { type: String, required: true },
  docType: { type: String, default: "invoice" },
  direction: { type: String, enum: ["purchase", "sale"], default: "purchase" },
  required: { type: Boolean, default: true },
  multiple: { type: Boolean, default: true },
  submittedAt: Date,
  naNote: String,
  waivedAt: Date,
  waivedBy: ref("User", false),
});
const checklistSchema = new Schema(
  {
    ...tenant,
    clientId: ref("Client"),
    title: String,
    periodStart: Date,
    periodEnd: Date,
    dueDate: Date,
    items: [itemSchema],
    remindersPaused: { type: Boolean, default: false },
  },
  base,
);
checklistSchema.index({ firmId: 1, dueDate: 1 });
export const Checklist = define("Checklist", checklistSchema);
export const MagicLink = define(
  "MagicLink",
  new Schema(
    {
      ...tenant,
      checklistId: ref("Checklist"),
      tokenHash: { type: String, unique: true, required: true },
      expiresAt: Date,
      revokedAt: Date,
      lastUsedAt: Date,
      useCount: { type: Number, default: 0 },
    },
    base,
  ),
);
const documentSchema = new Schema(
  {
    ...tenant,
    clientId: ref("Client"),
    checklistId: ref("Checklist"),
    itemId: Schema.Types.ObjectId,
    storageKey: String,
    originalName: String,
    mimeType: String,
    size: Number,
    sha256: String,
    supersedes: ref("Document", false),
    supersededBy: ref("Document", false),
    status: {
      type: String,
      enum: [
        "queued",
        "processing",
        "extracted_clean",
        "needs_review",
        "failed",
        "approved",
        "rejected",
      ],
      default: "queued",
    },
    extraction: {
      provider: String,
      model: String,
      fields: Schema.Types.Mixed,
      sourceFields: Schema.Types.Mixed,
      fieldConfidence: Schema.Types.Mixed,
      validation: [Schema.Types.Mixed],
      confidence: Number,
      attempts: { type: Number, default: 0 },
      lastError: String,
      processedAt: Date,
    },
    review: {
      reviewedBy: ref("User", false),
      reviewedAt: Date,
      decision: String,
      reason: String,
    },
    invoiceKey: String,
  },
  base,
);
documentSchema.index({ firmId: 1, clientId: 1, sha256: 1 }, { unique: true });
documentSchema.index(
  { firmId: 1, clientId: 1, invoiceKey: 1 },
  { partialFilterExpression: { invoiceKey: { $type: "string" } } },
);
documentSchema.index({ firmId: 1, status: 1, createdAt: -1 });
documentSchema.index({ firmId: 1, sha256: 1, "extraction.model": 1 });
export const Document = define("Document", documentSchema);
export const Audit = define(
  "Audit",
  new Schema(
    {
      ...tenant,
      actor: { type: String, required: true },
      action: String,
      entityId: Schema.Types.ObjectId,
      entityType: String,
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
      at: { type: Date, default: Date.now },
    },
    { versionKey: false },
  ),
);
const jobSchema = new Schema(
  {
    ...tenant,
    key: { type: String, unique: true, required: true },
    type: String,
    payload: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["pending", "running", "done", "failed"],
      default: "pending",
    },
    runAt: { type: Date, default: Date.now },
    lockedAt: Date,
    attempts: { type: Number, default: 0 },
    lastError: String,
  },
  base,
);
jobSchema.index({ status: 1, runAt: 1, lockedAt: 1 });
export const Job = define("Job", jobSchema);
const reminderSchema = new Schema(
  {
    ...tenant,
    checklistId: ref("Checklist"),
    slotKey: String,
    channel: { type: String, default: "email" },
    status: String,
    error: String,
    sentAt: Date,
  },
  base,
);
reminderSchema.index(
  { checklistId: 1, slotKey: 1, channel: 1 },
  { unique: true },
);
export const Reminder = define("Reminder", reminderSchema);
export const Usage = define(
  "Usage",
  new Schema({ ...tenant, day: String, count: { type: Number, default: 0 } }),
);
Usage.schema.index({ firmId: 1, day: 1 }, { unique: true });
// Infrastructure allowance shared by this deployment, not a tenant resource.
export const UploadAllowance = define(
  "UploadAllowance",
  new Schema({
    _id: String,
    consumedBytes: { type: Number, required: true, min: 0 },
  }),
);
export async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });
  await Promise.all(
    [
      Client,
      User,
      Document,
      MagicLink,
      Reminder,
      Job,
      Checklist,
      Usage,
      UploadAllowance,
    ].map((m) => m.init()),
  );
}
export async function audit(actor, action, entity, before, after) {
  return Audit.create({
    firmId: entity.firmId,
    actor,
    action,
    entityId: entity._id,
    entityType: entity.constructor.modelName,
    before,
    after,
  });
}

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import {
  Firm,
  User,
  Client,
  Checklist,
  Document,
  Audit,
  connectDatabase,
} from "../src/models.js";
import { samples, buyerGstin } from "../src/samples.js";
import { createStorage } from "../src/storage.js";
import { loadConfig } from "../src/config.js";
import { validateInvoice, invoiceKey } from "../src/domain.js";

export async function seedDemo(config) {
  if (!config.DEMO_MODE)
    throw new Error(
      "Seeding requires DEMO_MODE=true. This command creates synthetic demo data only.",
    );
  const existing = await User.findOne({ email: "owner@docchase.demo" });
  if (existing) return;
  const firm = await Firm.create({ name: "Sharma & Associates" });
  const passwordHash = await bcrypt.hash("DocChaseDemo!2026", 12);
  const owner = await User.create({
    firmId: firm._id,
    name: "Ananya Sharma",
    email: "owner@docchase.demo",
    passwordHash,
    role: "owner",
  });
  await User.create({
    firmId: firm._id,
    name: "Rohan Patel",
    email: "staff@docchase.demo",
    passwordHash,
    role: "staff",
  });
  const storage = createStorage(config),
    fixtures = await samples();
  const names = [
    "Mehta Trading Co.",
    "Saffron Bakehouse",
    "Studio Nila",
    "Kumar & Sons",
    "Greenleaf Foods",
    "Bluebird Consulting",
    "Jain Auto Parts",
    "Willow Textiles",
  ];
  for (const [index, name] of names.entries()) {
    const client = await Client.create({
      firmId: firm._id,
      name,
      contactPerson: name.split(" ")[0],
      email: `client${index + 1}@example.com`,
      phone: `+91980000100${index}`,
      gstin: index === 0 ? buyerGstin : "",
    });
    const dueDate = new Date();
    dueDate.setUTCDate(
      dueDate.getUTCDate() + [-1, 2, -3, -4, 3, 5, 1, 4][index],
    );
    dueDate.setUTCHours(18, 29, 59, 0);
    const checklist = await Checklist.create({
      firmId: firm._id,
      clientId: client._id,
      title: "September invoice collection",
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-09-30"),
      dueDate,
      items: [
        { label: "Purchase invoices", direction: "purchase", multiple: true },
        { label: "Sales invoices", direction: "sale", multiple: true },
      ],
    });
    if (index === 7) {
      checklist.items[1].naNote =
        "There were no sales this month. Could you check if this is needed?";
      await checklist.save();
    }
    const statuses =
      index === 0
        ? ["needs_review", "extracted_clean"]
        : index === 1
          ? ["extracted_clean"]
          : index === 2
            ? ["approved", "approved"]
            : index === 4
              ? ["failed"]
              : index === 5
                ? ["approved"]
                : [];
    for (const [j, status] of statuses.entries()) {
      const fixture =
          fixtures[index === 2 && j === 1 ? 3 : index === 0 && j === 0 ? 1 : 0],
        item = checklist.items[index === 2 ? j : 0];
      const fields = structuredClone(fixture.fields),
        validation = validateInvoice(fields, {
          periodStart: checklist.periodStart,
          periodEnd: checklist.periodEnd,
          clientGstin: client.gstin,
        });
      const doc = await Document.create({
        firmId: firm._id,
        clientId: client._id,
        checklistId: checklist._id,
        itemId: item._id,
        storageKey: await storage.put(fixture.buffer, "application/pdf"),
        originalName: fixture.name,
        mimeType: "application/pdf",
        size: fixture.buffer.length,
        sha256: fixture.sha256,
        status,
        invoiceKey: invoiceKey(fields),
        extraction: {
          provider: "synthetic sample",
          fields: status === "failed" ? {} : fields,
          validation: status === "failed" ? [] : validation,
          confidence: 0.98,
          attempts: 1,
          processedAt: new Date(),
          lastError:
            status === "failed"
              ? "Automatic extraction could not finish. Enter the invoice fields manually."
              : undefined,
        },
        review:
          status === "approved"
            ? {
                reviewedBy: owner._id,
                reviewedAt: new Date(),
                decision: "approve",
              }
            : undefined,
      });
      if (status === "approved" || index === 1) item.submittedAt = new Date();
      await Audit.create({
        firmId: firm._id,
        actor: status === "approved" ? String(owner._id) : "client link",
        action:
          status === "approved" ? "document.approved" : "document.uploaded",
        entityId: doc._id,
        entityType: "Document",
        at: new Date(Date.now() - (index + 1) * 20 * 60000),
      });
    }
    await checklist.save();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = loadConfig();
  await connectDatabase(config.MONGODB_URI);
  await seedDemo(config);
  await mongoose.disconnect();
  console.log("Synthetic demo data is ready.");
}

import { z } from "zod";
import { AppError } from "./errors.js";

export function validGstin(value) {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value || ""))
    return false;
  const state = Number(value.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99))
    return false;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0,
    factor = 2;
  for (let i = 13; i >= 0; i--) {
    const product = alphabet.indexOf(value[i]) * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return alphabet[(36 - (sum % 36)) % 36] === value[14];
}
export function gstinWithChecksum(base) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0,
    factor = 2;
  for (let i = 13; i >= 0; i--) {
    const n = alphabet.indexOf(base[i]) * factor;
    sum += Math.floor(n / 36) + (n % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return base + alphabet[(36 - (sum % 36)) % 36];
}
const money = z.number().finite().min(0).max(1e12).nullable().default(null);
export const invoiceSchema = z.object({
  invoiceNumber: z.string().max(100).default(""),
  invoiceDate: z.string().max(30).default(""),
  supplier: z
    .object({
      name: z.string().max(200).default(""),
      gstin: z.string().max(30).default(""),
    })
    .default({ name: "", gstin: "" }),
  buyer: z
    .object({
      name: z.string().max(200).default(""),
      gstin: z.string().max(30).default(""),
    })
    .default({ name: "", gstin: "" }),
  placeOfSupply: z.string().max(100).default(""),
  lineItems: z
    .array(
      z.object({
        description: z.string().max(500).default(""),
        taxableValue: money,
      }),
    )
    .max(500)
    .default([]),
  taxableValue: money,
  cgst: money,
  sgst: money,
  igst: money,
  cess: money,
  roundOff: z.number().finite().min(-100).max(100).nullable().default(0),
  total: money,
});
const paise = (n) => Math.round((n || 0) * 100);
export function validateInvoice(
  fields,
  {
    periodStart,
    periodEnd,
    clientGstin,
    direction = "purchase",
    duplicate = false,
    now = new Date(),
  } = {},
) {
  const results = [];
  const flag = (ruleId, severity, field, message) =>
    results.push({ ruleId, severity, field, message });
  if (!validGstin(fields.supplier?.gstin))
    flag(
      "INV-001",
      "error",
      "supplier.gstin",
      "Supplier GSTIN has an invalid format or checksum.",
    );
  for (const key of [
    "invoiceNumber",
    "invoiceDate",
    "supplier.name",
    "taxableValue",
    "total",
  ]) {
    const value = key.split(".").reduce((v, k) => v?.[k], fields);
    if (value === null || value === undefined || value === "")
      flag("INV-008", "error", key, "This field is required.");
  }
  if (
    fields.total !== null &&
    fields.total !== undefined &&
    fields.taxableValue !== null &&
    fields.taxableValue !== undefined
  ) {
    const expected = [
      "taxableValue",
      "cgst",
      "sgst",
      "igst",
      "cess",
      "roundOff",
    ].reduce((s, k) => s + paise(fields[k]), 0);
    if (Math.abs(expected - paise(fields.total)) > 100)
      flag(
        "INV-002",
        "error",
        "total",
        `Total does not reconcile. Expected ₹${(expected / 100).toFixed(2)} including tax.`,
      );
  }
  if (
    fields.lineItems?.length &&
    fields.lineItems.every((l) => l.taxableValue !== null) &&
    Math.abs(
      fields.lineItems.reduce((s, l) => s + paise(l.taxableValue), 0) -
        paise(fields.taxableValue),
    ) > 100
  )
    flag(
      "INV-003",
      "error",
      "taxableValue",
      "Line items do not add up to the taxable value.",
    );
  const supply = String(fields.placeOfSupply || "").match(/^\d{2}$/)?.[0],
    state = fields.supplier?.gstin?.slice(0, 2);
  if (supply && state) {
    if (
      supply === state &&
      (paise(fields.igst) > 0 || paise(fields.cgst) !== paise(fields.sgst))
    )
      flag(
        "INV-004",
        "warn",
        "placeOfSupply",
        "Check intra-state tax treatment: CGST and SGST usually match, with no IGST. Special cases need human review.",
      );
    if (supply !== state && (paise(fields.cgst) > 0 || paise(fields.sgst) > 0))
      flag(
        "INV-004",
        "warn",
        "placeOfSupply",
        "Check inter-state tax treatment: CGST/SGST appear on an inter-state invoice.",
      );
  }
  if (fields.taxableValue > 0) {
    const rate =
      (((fields.cgst || 0) + (fields.sgst || 0) + (fields.igst || 0)) /
        fields.taxableValue) *
      100;
    if (
      ![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].some(
        (r) => Math.abs(rate - r) < 0.2,
      )
    )
      flag(
        "INV-005",
        "warn",
        "taxableValue",
        "The effective tax rate is unusual. Check mixed rates and applicable tax treatment.",
      );
  }
  const date = new Date(`${fields.invoiceDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.invoiceDate || "") ||
    Number.isNaN(+date) ||
    date.toISOString().slice(0, 10) !== fields.invoiceDate
  )
    flag("INV-006", "error", "invoiceDate", "Enter a valid invoice date.");
  else {
    if (date > now)
      flag(
        "INV-006",
        "error",
        "invoiceDate",
        "The invoice date is in the future.",
      );
    if (
      (periodStart && date < new Date(periodStart)) ||
      (periodEnd && date > new Date(periodEnd))
    )
      flag(
        "INV-006",
        "warn",
        "invoiceDate",
        "Invoice date falls outside the requested period.",
      );
  }
  if (duplicate)
    flag(
      "INV-007",
      "warn",
      "invoiceNumber",
      "Another document for this client has the same supplier, invoice number and financial year.",
    );
  if (
    direction === "purchase" &&
    clientGstin &&
    fields.buyer?.gstin &&
    fields.buyer.gstin !== clientGstin
  )
    flag(
      "INV-009",
      "warn",
      "buyer.gstin",
      "Buyer GSTIN differs from this client’s GSTIN.",
    );
  return results;
}
export function invoiceKey(fields) {
  if (
    !fields.invoiceNumber ||
    !fields.supplier?.gstin ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.invoiceDate)
  )
    return undefined;
  const year =
    Number(fields.invoiceDate.slice(0, 4)) -
    (Number(fields.invoiceDate.slice(5, 7)) < 4 ? 1 : 0);
  return `${fields.supplier.gstin}:${fields.invoiceNumber.trim().toUpperCase()}:${year}`;
}
export function routeInvoice(validation, confidence = 0, threshold = 0.85) {
  return validation.some((v) => v.severity !== "info") || confidence < threshold
    ? "needs_review"
    : "extracted_clean";
}
export function confidenceScore(scores) {
  const values = Object.values(scores || {}).filter(
    (n) => Number.isFinite(n) && n >= 0 && n <= 1,
  );
  return values.length
    ? Number(
        (
          Math.min(...values) * 0.6 +
          (values.reduce((a, b) => a + b, 0) / values.length) * 0.4
        ).toFixed(4),
      )
    : 0;
}
export const transitions = {
  queued: ["processing"],
  processing: ["extracted_clean", "needs_review", "failed", "queued"],
  failed: ["queued", "approved", "rejected"],
  extracted_clean: ["approved", "rejected", "needs_review"],
  needs_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
};
export function assertTransition(from, to) {
  if (!transitions[from]?.includes(to))
    throw new AppError(
      409,
      "INVALID_STATE",
      `A ${from} document cannot become ${to}.`,
    );
}
export function checklistView(checklist, documents = [], now = new Date()) {
  const base = checklist.toObject ? checklist.toObject() : { ...checklist };
  const items = base.items.map((item) => {
    const docs = documents.filter(
      (d) => String(d.itemId) === String(item._id) && !d.supersededBy,
    );
    let state = "pending";
    if (item.waivedAt) state = "waived";
    else if (docs.some((d) => d.status === "rejected")) state = "rejected";
    else if (
      docs.length &&
      docs.every((d) => d.status === "approved") &&
      (!item.multiple || item.submittedAt)
    )
      state = "approved";
    else if (
      docs.some((d) =>
        ["needs_review", "extracted_clean", "failed"].includes(d.status),
      )
    )
      state = "under_review";
    else if (docs.length) state = "received";
    else if (item.naNote) state = "not_available";
    return {
      ...item,
      state,
      documentCount: docs.reduce((count, doc) => count + (doc.count || 1), 0),
    };
  });
  const required = items.filter((i) => i.required),
    done = required.filter((i) =>
      ["approved", "waived"].includes(i.state),
    ).length;
  const complete = required.length > 0 && done === required.length;
  return {
    ...base,
    items,
    status: complete
      ? "complete"
      : new Date(base.dueDate) < now
        ? "overdue"
        : "open",
    approvedCount: done,
    receivedCount: required.filter(
      (i) => i.documentCount > 0 || i.state === "waived",
    ).length,
    totalItems: required.length,
    needsReview: items.some((i) => i.state === "under_review"),
  };
}
export function reminderSlot(dueDate, now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000),
    hour = local.getUTCHours();
  if (hour >= 21 || hour < 8) return null;
  const day = local.toISOString().slice(0, 10),
    due = new Date(new Date(dueDate).getTime() + 330 * 60000)
      .toISOString()
      .slice(0, 10);
  const offset = Math.round((Date.parse(day) - Date.parse(due)) / 86400000);
  return [-3, -1, 0].includes(offset) || (offset > 0 && offset % 2 === 0)
    ? `${day}:${offset}`
    : null;
}
export function csvRegister(documents) {
  const keys = [
    "invoiceNumber",
    "invoiceDate",
    "supplier.name",
    "supplier.gstin",
    "taxableValue",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "roundOff",
    "total",
  ];
  const cell = (value) => {
    let s = String(value ?? "");
    if (typeof value !== "number" && /^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\ufeff" +
    [
      [
        "Invoice number",
        "Date",
        "Supplier",
        "Supplier GSTIN",
        "Taxable value",
        "CGST",
        "SGST",
        "IGST",
        "Cess",
        "Round off",
        "Total",
        "Filename",
      ],
      ...documents
        .filter((d) => d.status === "approved" && !d.supersededBy)
        .map((d) => [
          ...keys.map((k) =>
            k.split(".").reduce((v, p) => v?.[p], d.extraction?.fields),
          ),
          d.originalName,
        ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validGstin,
  validateInvoice,
  checklistView,
  assertTransition,
  reminderSlot,
  csvRegister,
  invoiceKey,
  confidenceScore,
} from "../src/domain.js";
import { sampleFields, supplierGstin } from "../src/samples.js";

test("GSTIN validates format, state, PAN and checksum", () => {
  assert.equal(validGstin("27AAPFU0939F1ZV"), true);
  assert.equal(validGstin(supplierGstin), true);
  for (const value of [
    "27AAPFU0939F1Z0",
    "00AAPFU0939F1ZV",
    "27aapfu0939f1zv",
    "27AAPFU0939F1Z",
    "not-gstin",
  ])
    assert.equal(validGstin(value), false);
});
test("a clean invoice passes deterministic checks", () => {
  assert.deepEqual(
    validateInvoice(sampleFields, {
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      now: new Date("2026-10-13"),
    }),
    [],
  );
});
test("wrong total and line item reconciliation identify the exact field", () => {
  const results = validateInvoice({
    ...sampleFields,
    total: 12800,
    lineItems: [{ taxableValue: 999 }],
  });
  assert(
    results.some(
      (v) =>
        v.ruleId === "INV-002" && v.field === "total" && v.severity === "error",
    ),
  );
  assert(results.some((v) => v.ruleId === "INV-003"));
});
test("date, duplicate, buyer, rate and tax treatment produce review flags", () => {
  const result = validateInvoice(
    {
      ...sampleFields,
      invoiceDate: "2099-01-01",
      placeOfSupply: "29",
      cgst: 100,
      sgst: 100,
      total: 10200,
      buyer: { gstin: "OTHER" },
    },
    { clientGstin: "EXPECTED", duplicate: true },
  );
  for (const id of ["INV-004", "INV-005", "INV-006", "INV-007", "INV-009"])
    assert(result.some((v) => v.ruleId === id));
  assert(
    validateInvoice({ ...sampleFields, invoiceDate: "2026-02-31" }).some(
      (v) => v.ruleId === "INV-006",
    ),
  );
  assert(
    validateInvoice(
      { ...sampleFields, invoiceDate: "2026-08-20" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
    ).some((v) => v.severity === "warn"),
  );
});
test("financial-year duplicate keys change at April 1", () => {
  assert(
    invoiceKey({ ...sampleFields, invoiceDate: "2026-03-31" }).endsWith(
      ":2025",
    ),
  );
  assert(
    invoiceKey({ ...sampleFields, invoiceDate: "2026-04-01" }).endsWith(
      ":2026",
    ),
  );
});
test("multiple-file items need explicit submission and client notes are not waivers", () => {
  const list = {
    items: [
      { _id: "i", required: true, multiple: true, naNote: "Unavailable" },
    ],
    dueDate: "2026-12-01",
  };
  assert.equal(checklistView(list).status, "open");
  assert.equal(checklistView(list).items[0].state, "not_available");
  const docs = [{ itemId: "i", status: "approved" }];
  assert.equal(checklistView(list, docs).status, "open");
  list.items[0].submittedAt = new Date();
  assert.equal(checklistView(list, docs).status, "complete");
  list.items[0].submittedAt = null;
  list.items[0].waivedAt = new Date();
  assert.equal(checklistView(list).status, "complete");
});
test("superseded rejected files no longer block a checklist", () => {
  const list = {
    items: [{ _id: "i", required: true, multiple: false }],
    dueDate: "2026-01-01",
  };
  assert.equal(
    checklistView(list, [
      { itemId: "i", status: "rejected", supersededBy: "new" },
      { itemId: "i", status: "approved" },
    ]).status,
    "complete",
  );
  assert.equal(
    checklistView(list, [{ itemId: "i", status: "rejected" }]).status,
    "overdue",
  );
});
test("illegal review and retry transitions fail with a conflict", () => {
  assert.doesNotThrow(() => assertTransition("failed", "approved"));
  assert.throws(
    () => assertTransition("approved", "rejected"),
    (e) => e.status === 409,
  );
  assert.throws(
    () => assertTransition("rejected", "queued"),
    (e) => e.status === 409,
  );
});
test("reminder scheduling respects IST, due offsets and quiet hours", () => {
  assert.equal(
    reminderSlot("2026-10-13T18:29:59Z", new Date("2026-10-13T04:00:00Z")),
    "2026-10-13:0",
  );
  assert.equal(
    reminderSlot("2026-10-13T18:29:59Z", new Date("2026-10-13T16:00:00Z")),
    null,
  );
  assert.equal(
    reminderSlot("2026-10-13", new Date("2026-10-14T04:00:00Z")),
    null,
  );
  assert.equal(
    reminderSlot("2026-10-13", new Date("2026-10-15T04:00:00Z")),
    "2026-10-15:2",
  );
});
test("CSV exports approved data only, escapes commas and neutralizes spreadsheet formulas", () => {
  const csv = csvRegister([
    {
      status: "approved",
      extraction: {
        fields: {
          ...sampleFields,
          invoiceNumber: '=HYPERLINK("bad")',
          supplier: { name: "Supplier, Inc." },
        },
      },
      originalName: "invoice.pdf",
    },
    {
      status: "needs_review",
      extraction: { fields: sampleFields },
      originalName: "UNAPPROVED.pdf",
    },
  ]);
  assert(csv.startsWith("\ufeff"));
  assert(csv.includes("'=HYPERLINK"));
  assert(csv.includes('"Supplier, Inc."'));
  assert(!csv.includes("UNAPPROVED"));
});
test("extraction confidence has a bounded documented signal formula", () => {
  assert.equal(confidenceScore({ a: 0.5, b: 1 }), 0.6);
  assert.equal(confidenceScore({}), 0);
});

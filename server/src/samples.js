import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import { gstinWithChecksum } from "./domain.js";
export const supplierGstin = gstinWithChecksum("27AAPFU0939F1Z");
export const buyerGstin = gstinWithChecksum("27ABCDE1234F1Z");
export const sampleFields = {
  invoiceNumber: "INV-2026-104",
  invoiceDate: "2026-09-18",
  supplier: { name: "Paper & Pine Supplies", gstin: supplierGstin },
  buyer: { name: "Mehta Trading Co.", gstin: buyerGstin },
  placeOfSupply: "27",
  lineItems: [{ description: "Office supplies", taxableValue: 10000 }],
  taxableValue: 10000,
  cgst: 900,
  sgst: 900,
  igst: 0,
  cess: 0,
  roundOff: 0,
  total: 11800,
};
let cached;
export async function samples() {
  if (cached) return cached;
  cached = (async () => {
    const variants = [
      { name: "sample-clean-invoice.pdf", fields: sampleFields },
      {
        name: "sample-wrong-total.pdf",
        fields: {
          ...sampleFields,
          invoiceNumber: "INV-2026-105",
          total: 12800,
        },
      },
      {
        name: "sample-invalid-gstin.pdf",
        fields: {
          ...sampleFields,
          invoiceNumber: "INV-2026-106",
          supplier: { ...sampleFields.supplier, gstin: "27AAPFU0939F1Z0" },
        },
      },
      {
        name: "sample-sales-invoice.pdf",
        fields: { ...sampleFields, invoiceNumber: "INV-2026-107" },
      },
    ];
    for (const entry of variants) {
      const pdf = await PDFDocument.create();
      pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
      pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));
      const page = pdf.addPage([595, 842]),
        font = await pdf.embedFont(StandardFonts.Helvetica),
        bold = await pdf.embedFont(StandardFonts.HelveticaBold),
        f = entry.fields;
      const text = (s, x, y, size = 12, heavy = false) =>
        page.drawText(s, {
          x,
          y,
          size,
          font: heavy ? bold : font,
          color: rgb(0.15, 0.23, 0.21),
        });
      page.drawRectangle({
        x: 0,
        y: 740,
        width: 595,
        height: 102,
        color: rgb(0.09, 0.25, 0.21),
      });
      page.drawText("PAPER & PINE", {
        x: 48,
        y: 786,
        size: 25,
        font: bold,
        color: rgb(1, 1, 1),
      });
      page.drawText("SUPPLIES / SYNTHETIC DEMO DOCUMENT", {
        x: 48,
        y: 762,
        size: 9,
        font,
        color: rgb(0.85, 0.9, 0.87),
      });
      text("TAX INVOICE", 48, 704, 20, true);
      text(f.invoiceNumber, 360, 704, 14, true);
      text(`Invoice date: ${f.invoiceDate}`, 48, 672);
      text(`Supplier GSTIN: ${f.supplier.gstin}`, 48, 648);
      text("BILLED TO", 48, 594, 9, true);
      text(f.buyer.name, 48, 568, 16, true);
      text(`GSTIN: ${f.buyer.gstin}`, 48, 543);
      text(`Place of supply: ${f.placeOfSupply}`, 360, 568);
      page.drawRectangle({
        x: 48,
        y: 467,
        width: 499,
        height: 35,
        color: rgb(0.94, 0.95, 0.92),
      });
      text("DESCRIPTION", 62, 480, 10, true);
      text("TAXABLE VALUE (INR)", 371, 480, 10, true);
      text("Office supplies", 62, 436);
      text("10,000.00", 451, 436);
      for (const [index, [label, value]] of [
        ["Taxable value", f.taxableValue],
        ["CGST", f.cgst],
        ["SGST", f.sgst],
        ["IGST", f.igst],
        ["Cess", f.cess],
        ["Round off", f.roundOff],
        ["TOTAL (INR)", f.total],
      ].entries()) {
        const y = 365 - index * 26;
        text(label, 310, y, 12, index === 6);
        text(value.toFixed(2), 465, y, 12, index === 6);
      }
      text(
        "This document is generated for coursework. It is not a real tax invoice.",
        48,
        76,
        9,
      );
      text(
        "All businesses, identities and amounts shown here are synthetic.",
        48,
        60,
        9,
      );
      entry.buffer = Buffer.from(await pdf.save());
      entry.sha256 = createHash("sha256").update(entry.buffer).digest("hex");
    }
    return variants;
  })();
  return cached;
}

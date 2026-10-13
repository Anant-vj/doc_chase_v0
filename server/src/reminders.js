import { randomBytes, createHash } from "node:crypto";
import {
  Client,
  Checklist,
  Document,
  Firm,
  MagicLink,
  Reminder,
} from "./models.js";
import { checklistView, reminderSlot } from "./domain.js";
import { AppError } from "./errors.js";

export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export async function issueLink(checklist, config) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Math.max(
      Date.now() + 86400000,
      new Date(checklist.dueDate).getTime() + 7 * 86400000,
    ),
  );
  await MagicLink.create({
    firmId: checklist.firmId,
    checklistId: checklist._id,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { url: `${config.APP_URL}/upload/${token}`, expiresAt };
}
export function createReminders(config) {
  async function send(checklist, slotKey) {
    const client = await Client.findOne({
      _id: checklist.clientId,
      firmId: checklist.firmId,
      archivedAt: null,
    });
    if (!client || client.remindersPaused || checklist.remindersPaused)
      return { skipped: true };
    const docs = await Document.find({
      checklistId: checklist._id,
      firmId: checklist.firmId,
    });
    if (checklistView(checklist, docs).status === "complete")
      return { skipped: true };
    if (!client.email)
      throw new AppError(
        400,
        "NO_EMAIL",
        "Add the client’s email before sending an email reminder.",
      );
    let log;
    try {
      log = await Reminder.create({
        firmId: checklist.firmId,
        checklistId: checklist._id,
        slotKey,
        status: "sending",
      });
    } catch (error) {
      if (error.code === 11000) return { skipped: true, duplicate: true };
      throw error;
    }
    try {
      if (config.MAIL_PROVIDER === "console") {
        log.status = "demo";
        log.error = "Email delivery is not configured. No message was sent.";
        await log.save();
        return { log };
      }
      const firm = await Firm.findById(checklist.firmId),
        link = await issueLink(checklist, config);
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": config.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: firm.name, email: config.MAIL_FROM },
          to: [{ email: client.email, name: client.name }],
          subject: `Documents needed: ${checklist.title}`,
          textContent: `Hello ${client.contactPerson || client.name},\n\n${firm.name} is waiting for documents for ${checklist.title}. Please upload them by ${new Date(checklist.dueDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}:\n${link.url}\n\nIf you have already uploaded them, your accountant will review them shortly.`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        log.status = "failed";
        log.error =
          "The email provider rejected delivery. Check sender settings.";
      } else {
        log.status = "sent";
        log.sentAt = new Date();
      }
    } catch {
      log.status = "uncertain";
      log.error =
        "Delivery was not confirmed. Check the provider before sending again.";
    }
    await log.save();
    return { log };
  }
  async function tick(now = new Date()) {
    const lists = await Checklist.find({
      remindersPaused: { $ne: true },
      dueDate: {
        $gte: new Date(now.getTime() - 90 * 86400000),
        $lte: new Date(now.getTime() + 4 * 86400000),
      },
    }).limit(250);
    let checked = 0;
    for (const checklist of lists) {
      const slot = reminderSlot(checklist.dueDate, now);
      if (slot) {
        await send(checklist, slot).catch(() => {});
        checked++;
      }
    }
    return { checked };
  }
  return { send, tick };
}

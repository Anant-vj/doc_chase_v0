export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "X-DocChase": "1",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error?.message || "The request could not finish. Try again.",
    );
    error.status = response.status;
    error.details = data.error?.details;
    throw error;
  }
  return data;
}
export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
export const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "—";
export const initials = (name) =>
  (String(name || "").match(/\p{L}+/gu) || [])
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
export const labels = {
  open: "Waiting on client",
  overdue: "Overdue",
  complete: "Complete",
  extracted_clean: "Ready to approve",
  needs_review: "Needs review",
  failed: "Manual entry",
  queued: "Received",
  processing: "Checking document",
  approved: "Approved",
  rejected: "Needs fixing",
  pending: "Not received",
  received: "Received",
  under_review: "With your accountant",
  waived: "Not needed",
  not_available: "Note sent",
};

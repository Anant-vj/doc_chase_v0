import { useState, useEffect } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  X,
  ShieldCheck,
} from "lucide-react";
import { api, date, money } from "../api";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeading,
  useToast,
} from "../ui";

export function ReviewQueue() {
  const { overview } = useOutletContext(),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    toast = useToast(),
    cache = useQueryClient();
  if (overview.isPending) return <Loading />;
  if (overview.error)
    return <ErrorNotice error={overview.error} retry={overview.refetch} />;
  const documents = overview.data.documents.filter(
      (d) =>
        ["extracted_clean", "needs_review", "failed"].includes(d.status) &&
        !d.supersededBy,
    ),
    clean = documents.filter((d) => d.status === "extracted_clean"),
    shown = documents.filter((d) => filter === "all" || d.status === filter);
  async function bulk() {
    setBusy(true);
    try {
      const result = await api("/review/bulk", { method: "POST" });
      cache.invalidateQueries({ queryKey: ["overview"] });
      toast(
        `${result.approved} document${result.approved === 1 ? "" : "s"} approved.${result.skipped ? ` ${result.skipped} changed and need another look.` : ""}`,
      );
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="THE SECOND LOOK"
        title="Make every document count."
        description="The original on one side. The details on the other. Your judgment in the middle."
      >
        {clean.length > 0 && (
          <Button variant="secondary" busy={busy} onClick={bulk}>
            <CheckCheck size={17} />
            Approve {clean.length} clean document{clean.length === 1 ? "" : "s"}
          </Button>
        )}
        {shown.length > 0 && (
          <Link to={`/review/${shown[0]._id}`} className="button primary">
            Start reviewing
            <ArrowRight size={16} />
          </Link>
        )}
      </PageHeading>
      <div className="review-summary">
        <div>
          <span className="review-summary-dot green" />
          <strong>{clean.length}</strong>
          <span>Ready to approve</span>
        </div>
        <div>
          <span className="review-summary-dot amber" />
          <strong>
            {documents.filter((d) => d.status === "needs_review").length}
          </strong>
          <span>Need your attention</span>
        </div>
        <div>
          <span className="review-summary-dot grey" />
          <strong>
            {documents.filter((d) => d.status === "failed").length}
          </strong>
          <span>Need manual entry</span>
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar roomy">
          <div className="tabs">
            {[
              ["all", "All documents"],
              ["needs_review", "Flagged"],
              ["extracted_clean", "Clean"],
              ["failed", "Manual entry"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "selected" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="helper">Nothing is approved automatically.</span>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="work-table">
              <thead>
                <tr>
                  <th>DOCUMENT</th>
                  <th>CLIENT</th>
                  <th>AMOUNT</th>
                  <th>REVIEW STATUS</th>
                  <th>
                    <span className="sr-only">Review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <Link className="client-cell" to={`/review/${d._id}`}>
                        <span className="document-icon">
                          <FileText size={20} />
                        </span>
                        <span>
                          <strong>
                            {d.extraction.fields?.invoiceNumber ||
                              d.originalName}
                          </strong>
                          <small>
                            {d.extraction.fields?.supplier?.name ||
                              d.originalName}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <div className="inline-client">
                        <Avatar
                          size="small"
                          name={
                            overview.data.clients.find(
                              (c) => c._id === d.clientId,
                            )?.name
                          }
                        />
                        {
                          overview.data.clients.find(
                            (c) => c._id === d.clientId,
                          )?.name
                        }
                      </div>
                    </td>
                    <td className="numeric">
                      {d.extraction.fields?.total != null
                        ? money(d.extraction.fields.total)
                        : "—"}
                    </td>
                    <td>
                      <Badge status={d.status} />
                    </td>
                    <td>
                      <Link className="text-button" to={`/review/${d._id}`}>
                        Review
                        <ArrowUpRightIcon />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              documents.length ? "Nothing in this view" : "You’re all caught up"
            }
            description={
              documents.length
                ? "Try another review filter."
                : "New uploads will appear here when they are ready for review."
            }
          />
        )}
      </section>
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={15} />;
}
const blank = {
  invoiceNumber: "",
  invoiceDate: "",
  supplier: { name: "", gstin: "" },
  buyer: { name: "", gstin: "" },
  placeOfSupply: "",
  lineItems: [],
  taxableValue: null,
  cgst: null,
  sgst: null,
  igst: null,
  cess: null,
  roundOff: 0,
  total: null,
};
function ReviewEditor({ data }) {
  const { document: doc, client, checklist } = data,
    navigate = useNavigate(),
    cache = useQueryClient(),
    toast = useToast(),
    { overview } = useOutletContext();
  const [fields, setFields] = useState(() => ({
      ...blank,
      ...doc.extraction.fields,
      supplier: { ...blank.supplier, ...doc.extraction.fields?.supplier },
      buyer: { ...blank.buyer, ...doc.extraction.fields?.buyer },
    })),
    [deferred, setDeferred] = useState(fields),
    [allowWarnings, setAllowWarnings] = useState(false),
    [busy, setBusy] = useState(false),
    [reject, setReject] = useState(false),
    [error, setError] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => setDeferred(fields), 400);
    return () => clearTimeout(timer);
  }, [fields]);
  const validationQuery = useQuery({
    queryKey: ["validation", doc._id, deferred],
    queryFn: () =>
      api(`/documents/${doc._id}/validate`, {
        method: "POST",
        body: { fields: deferred },
      }),
    staleTime: 0,
  });
  const validation =
      validationQuery.data?.validation || doc.extraction.validation || [],
    errors = validation.filter((v) => v.severity === "error"),
    warnings = validation.filter((v) => v.severity === "warn"),
    final = ["approved", "rejected"].includes(doc.status);
  const queue = (overview.data?.documents || []).filter(
      (d) =>
        ["needs_review", "extracted_clean", "failed"].includes(d.status) &&
        !d.supersededBy,
    ),
    position = queue.findIndex((d) => d._id === doc._id),
    next = queue.find((d) => d._id !== doc._id);
  const update = (key, value) => {
    setAllowWarnings(false);
    setFields((old) => {
      const copy = structuredClone(old);
      const parts = key.split(".");
      if (parts.length === 2) copy[parts[0]][parts[1]] = value;
      else copy[key] = value;
      return copy;
    });
  };
  async function review(decision, reason) {
    setBusy(true);
    setError(null);
    try {
      await api(`/documents/${doc._id}/review`, {
        method: "POST",
        body: { decision, fields, version: doc.version, allowWarnings, reason },
      });
      await cache.invalidateQueries({ queryKey: ["overview"] });
      cache.invalidateQueries({ queryKey: ["request", doc.checklistId] });
      toast(
        decision === "reject"
          ? "Document rejected. Your client can see the reason."
          : "Document approved. It’s ready for export.",
      );
      navigate(next ? `/review/${next._id}` : "/review");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const field = (key, label, type = "text") => {
    const value = key.split(".").reduce((v, k) => v?.[k], fields);
    return (
      <Field
        key={key}
        id={`invoice-${key.replaceAll(".", "-")}`}
        label={label}
        type={type}
        value={value ?? ""}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" && key !== "roundOff" ? 0 : undefined}
        maxLength={type === "text" ? 200 : undefined}
        disabled={final}
        onChange={(e) =>
          update(
            key,
            type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
        error={errors.find((v) => v.field === key)?.message}
      />
    );
  };
  return (
    <>
      <div className="review-page-top">
        <Link to="/review" className="back-link">
          <ChevronLeft size={16} />
          Review queue
        </Link>
        <div className="review-pagination">
          <span>
            {position >= 0
              ? `${position + 1} of ${queue.length} awaiting review`
              : "Reviewed document"}
          </span>
          <button
            className="icon-button"
            aria-label="Previous document"
            disabled={position <= 0}
            onClick={() => navigate(`/review/${queue[position - 1]._id}`)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Next document"
            disabled={!queue[position + 1]}
            onClick={() => navigate(`/review/${queue[position + 1]._id}`)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="review-title-row">
        <div>
          <p className="eyebrow">
            {client.name} / {checklist.title}
          </p>
          <h1>{doc.extraction.fields?.invoiceNumber || "Invoice review"}</h1>
          <p>
            {doc.originalName} · Received {date(doc.createdAt)}
          </p>
        </div>
        <Badge status={doc.status} />
      </div>
      <div className="review-workbench">
        <section className="document-preview">
          <div className="preview-toolbar">
            <span>
              <FileText size={17} />
              Original document
            </span>
            <a
              className="text-button"
              href={`/api/documents/${doc._id}/file`}
              target="_blank"
              rel="noreferrer"
            >
              Open original
              <ExternalLink size={14} />
            </a>
          </div>
          {doc.mimeType === "application/pdf" ? (
            <iframe
              title="Original invoice preview"
              src={`/api/documents/${doc._id}/file#toolbar=0`}
            />
          ) : (
            <img
              src={`/api/documents/${doc._id}/file`}
              alt="Original uploaded invoice"
            />
          )}
          <p className="preview-caption">
            <ShieldCheck size={14} />
            Private file · Visible to your firm
          </p>
        </section>
        <section className="review-fields">
          <div className="review-fields-heading">
            <h2>Invoice details</h2>
            <span>
              {doc.extraction.provider === "synthetic sample"
                ? "Synthetic sample"
                : doc.extraction.provider === "gemini"
                  ? "Extracted · Check against original"
                  : "Manual entry"}
            </span>
          </div>
          <div className="review-scroll">
            {doc.status === "failed" && (
              <div className="information-notice">
                <FileText size={18} />
                <span>
                  {doc.extraction.lastError ||
                    "Enter the invoice details to continue."}
                </span>
                <button
                  className="icon-button"
                  title="Retry extraction"
                  aria-label="Retry extraction"
                  onClick={async () => {
                    try {
                      await api(`/documents/${doc._id}/retry`, {
                        method: "POST",
                      });
                      cache.invalidateQueries({
                        queryKey: ["document", doc._id],
                      });
                      toast("Extraction queued again.");
                    } catch (e) {
                      toast(e.message, "error");
                    }
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            )}
            {error && <ErrorNotice error={error} />}
            {validationQuery.error && (
              <ErrorNotice
                error={validationQuery.error}
                retry={validationQuery.refetch}
              />
            )}
            <div
              className={`validation-banner ${errors.length ? "invalid" : warnings.length ? "warning" : "valid"}`}
            >
              {errors.length || warnings.length ? (
                <AlertTriangle size={18} />
              ) : (
                <Check size={18} />
              )}
              <div>
                <strong>
                  {validationQuery.isFetching
                    ? "Checking your changes…"
                    : errors.length
                      ? `${errors.length} issue${errors.length === 1 ? "" : "s"} to resolve`
                      : warnings.length
                        ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} to check`
                        : "Checks passed"}
                </strong>
                <span>
                  {errors.length
                    ? "Resolve errors before approval."
                    : warnings.length
                      ? "Read the warnings and compare with the original."
                      : "Review the original before you approve."}
                </span>
              </div>
            </div>
            {errors.length > 0 && (
              <ul className="validation-errors">
                {errors.map((issue, i) => (
                  <li key={`${issue.ruleId}-${i}`}>
                    <button
                      onClick={() =>
                        document
                          .getElementById(
                            `invoice-${issue.field.replaceAll(".", "-")}`,
                          )
                          ?.focus()
                      }
                    >
                      <span>{issue.ruleId}</span>
                      {issue.message}
                      <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="validation-warnings">
                {warnings.map((v, i) => (
                  <li key={`${v.ruleId}-${i}`}>
                    <span>{v.ruleId}</span>
                    {v.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="form-section">
              <h3>THE BASICS</h3>
              <div className="form-grid">
                {field("invoiceNumber", "Invoice number")}
                {field("invoiceDate", "Invoice date", "date")}
              </div>
              {field("supplier.name", "Supplier name")}
              <div className="form-grid">
                {field("supplier.gstin", "Supplier GSTIN")}
                {field("placeOfSupply", "Place of supply (state code)")}
              </div>
            </div>
            <div className="form-section">
              <h3>BUYER</h3>
              {field("buyer.name", "Buyer name")}
              {field("buyer.gstin", "Buyer GSTIN")}
            </div>
            <div className="form-section">
              <h3>AMOUNTS · INR</h3>
              {field("taxableValue", "Taxable value", "number")}
              <div className="form-grid">
                {field("cgst", "CGST", "number")}
                {field("sgst", "SGST", "number")}
                {field("igst", "IGST", "number")}
                {field("cess", "Cess", "number")}
              </div>
              <div className="form-grid">
                {field("roundOff", "Round off", "number")}
                {field("total", "Invoice total", "number")}
              </div>
            </div>
            {fields.lineItems?.length > 0 && (
              <div className="form-section">
                <h3>LINE ITEMS</h3>
                {fields.lineItems.map((item, i) => (
                  <div className="line-item-row" key={i}>
                    <span>{item.description}</span>
                    <input
                      aria-label={`Line item ${i + 1} taxable value`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.taxableValue ?? ""}
                      disabled={final}
                      onChange={(e) => {
                        setAllowWarnings(false);
                        setFields((old) => ({
                          ...old,
                          lineItems: old.lineItems.map((l, index) =>
                            index === i
                              ? {
                                  ...l,
                                  taxableValue:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                }
                              : l,
                          ),
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {!final && warnings.length > 0 && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={allowWarnings}
                  onChange={(e) => setAllowWarnings(e.target.checked)}
                />
                <span>
                  I checked the warnings against the original invoice.
                </span>
              </label>
            )}
          </div>
          {final ? (
            <div className="review-final">
              <Badge status={doc.status} />
              <p>
                {doc.review.reason ||
                  "This review is saved in the activity history."}
              </p>
            </div>
          ) : (
            <div className="review-actions">
              <Button
                variant="secondary"
                onClick={() => setReject(true)}
                disabled={busy}
              >
                <X size={16} />
                Reject
              </Button>
              <Button
                busy={busy}
                disabled={
                  errors.length > 0 ||
                  (warnings.length > 0 && !allowWarnings) ||
                  validationQuery.isFetching ||
                  !!validationQuery.error ||
                  fields !== deferred
                }
                onClick={() => review("approve")}
              >
                <Check size={16} />
                Approve document
              </Button>
            </div>
          )}
        </section>
      </div>
      {reject && (
        <Modal title="Ask for a replacement" onClose={() => setReject(false)}>
          <p className="modal-description">
            Explain what needs fixing. Your client will see this reason next to
            the file.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review("reject", new FormData(e.currentTarget).get("reason"));
            }}
          >
            {error && <ErrorNotice error={error} />}
            <label className="field">
              <span>Reason for rejection</span>
              <textarea
                autoFocus
                name="reason"
                minLength={3}
                maxLength={500}
                required
                placeholder="For example: The invoice is missing its second page."
              />
            </label>
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setReject(false)}
              >
                Cancel
              </Button>
              <Button busy={busy} variant="danger">
                Reject document
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ReviewPage() {
  const { id } = useParams(),
    query = useQuery({
      queryKey: ["document", id],
      queryFn: () => api(`/documents/${id}`),
    });
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  if (["queued", "processing"].includes(query.data.document.status))
    return (
      <Empty
        title="This document is being checked"
        description="Check again in a moment to load the invoice details."
      >
        <Button busy={query.isFetching} onClick={() => query.refetch()}>
          Check again
        </Button>
      </Empty>
    );
  return (
    <ReviewEditor
      key={`${id}:${query.data.document.version}`}
      data={query.data}
    />
  );
}

import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  Check,
  FileText,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  MessageSquare,
  LoaderCircle,
} from "lucide-react";
import { api, date } from "../api";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  Modal,
  useToast,
} from "../ui";

async function downscale(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (
      bitmap.width <= 2048 &&
      bitmap.height <= 2048 &&
      file.size <= 3 * 1024 * 1024
    )
      return file;
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    return blob && blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
        })
      : file;
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
function sendUpload(path, file, supersedes, onProgress) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);
    if (supersedes) body.append("supersedes", supersedes);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.setRequestHeader("X-DocChase", "1");
    xhr.timeout = 90000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let response = {};
      try {
        response = JSON.parse(xhr.responseText);
      } catch {
        /* The server may return a gateway error. */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(response);
      else
        reject(
          new Error(
            response.error?.message || "The upload did not finish. Try again.",
          ),
        );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "The connection was interrupted. Your file is ready to retry.",
        ),
      );
    xhr.ontimeout = () =>
      reject(new Error("The upload took too long. Please try again."));
    xhr.send(body);
  });
}
function UploadItem({ item, documents, token, refresh }) {
  const input = useRef(),
    replacement = useRef(),
    [entries, setEntries] = useState([]),
    [note, setNote] = useState(false),
    [error, setError] = useState(null),
    [noting, setNoting] = useState(false),
    toast = useToast();
  const busy = entries.some((e) => e.status === "uploading"),
    docs = documents.filter((d) => d.itemId === item._id && !d.supersededBy);
  function update(id, patch) {
    setEntries((old) => old.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  async function upload(entry) {
    update(entry.id, { status: "uploading", error: null, progress: 0 });
    try {
      const file = await downscale(entry.file);
      await sendUpload(
        `/portal/${token}/items/${item._id}/upload`,
        file,
        entry.supersedes,
        (p) => update(entry.id, { progress: p }),
      );
      update(entry.id, { status: "done", progress: 100 });
      await refresh();
    } catch (e) {
      update(entry.id, { status: "error", error: e.message });
    }
  }
  async function select(event) {
    const newEntries = Array.from(event.target.files).map((file) => ({
      file,
      id: crypto.randomUUID(),
      status: "waiting",
      progress: 0,
      supersedes: replacement.current,
    }));
    replacement.current = undefined;
    setEntries((old) => [...old, ...newEntries]);
    event.target.value = "";
    for (const entry of newEntries) await upload(entry);
  }
  function choose(supersedes) {
    replacement.current = supersedes;
    input.current.multiple = item.multiple && !supersedes;
    input.current.click();
  }
  return (
    <section
      className={`portal-item ${["approved", "waived"].includes(item.state) ? "done" : ""}`}
    >
      <div className="portal-item-heading">
        <span className="portal-item-icon">
          {["approved", "waived"].includes(item.state) ? (
            <Check size={22} />
          ) : (
            <FileText size={22} />
          )}
        </span>
        <div>
          <h2>{item.label}</h2>
          <p>
            {item.multiple
              ? "Send all the invoices for this period."
              : "Send one file for this item."}
          </p>
        </div>
        <Badge status={item.state} />
      </div>
      <input
        className="sr-only"
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple={item.multiple}
        onChange={select}
        tabIndex={-1}
        aria-label={`Choose files for ${item.label}`}
      />
      {docs.map((d) => (
        <div
          className={`portal-file ${d.status === "rejected" ? "rejected" : ""}`}
          key={d._id}
        >
          <FileText size={19} />
          <div>
            <strong>{d.originalName}</strong>
            <small>
              {d.status === "failed"
                ? "Received — your accountant will enter the details"
                : d.status === "rejected"
                  ? d.review?.reason
                  : d.status === "approved"
                    ? "Checked and approved"
                    : d.status === "processing" || d.status === "queued"
                      ? "Received — being checked"
                      : "Received — waiting for your accountant"}
            </small>
          </div>
          {d.status === "rejected" ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => choose(d._id)}
            >
              Replace file
            </Button>
          ) : d.status === "approved" ? (
            <Check size={19} />
          ) : (
            <span className="status-dot" />
          )}
        </div>
      ))}
      {entries
        .filter((e) => e.status !== "done")
        .map((e) => (
          <div className="upload-progress-row" key={e.id}>
            <span>
              {e.status === "uploading" ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <AlertCircle size={18} />
              )}
            </span>
            <div>
              <strong>{e.file.name}</strong>
              {e.status === "error" ? (
                <small className="field-error">{e.error}</small>
              ) : (
                <>
                  <small>
                    {e.status === "waiting"
                      ? "Waiting to upload"
                      : `${e.progress}% uploaded`}
                  </small>
                  <div className="progress-track">
                    <span style={{ width: `${e.progress}%` }} />
                  </div>
                </>
              )}
            </div>
            {e.status === "error" && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => upload(e)}
              >
                Retry
              </Button>
            )}
          </div>
        ))}
      {!item.waivedAt && (
        <>
          <button
            className="upload-zone"
            onClick={() => choose()}
            disabled={busy || (!item.multiple && docs.length > 0)}
          >
            <span className="upload-zone-symbol">
              <Upload size={22} />
            </span>
            <strong>
              {busy
                ? "Sending your documents…"
                : docs.length
                  ? "Add another document"
                  : "Choose a file or photo"}
            </strong>
            <span>PDF, JPG, PNG or WebP · Up to 10 MB per file</span>
          </button>
          {item.multiple && docs.length > 0 && !item.submittedAt && (
            <div className="portal-finish">
              <span>Sent everything for this item?</span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    await api(`/portal/${token}/items/${item._id}/finish`, {
                      method: "POST",
                    });
                    await refresh();
                    toast(
                      "Marked as finished. Your accountant will review the documents.",
                    );
                  } catch (e) {
                    toast(e.message, "error");
                  }
                }}
              >
                I’ve sent everything
                <Check size={15} />
              </Button>
            </div>
          )}
          {item.submittedAt && !["approved", "waived"].includes(item.state) && (
            <p className="portal-sent-note">
              <Check size={15} />
              You marked this item finished. Your accountant will review it.
            </p>
          )}
          <button
            className="text-button portal-unavailable"
            onClick={() => setNote(true)}
          >
            <MessageSquare size={14} />
            {item.naNote ? "Update your note" : "I don’t have this"}
          </button>
        </>
      )}
      {item.naNote && (
        <div className="portal-note">
          <strong>Your note</strong>
          <p>{item.naNote}</p>
          <small>Your accountant will decide if this item is needed.</small>
        </div>
      )}
      {note && (
        <Modal title="Let your accountant know" onClose={() => setNote(false)}>
          <p className="modal-description">
            Tell them why you don’t have {item.label.toLowerCase()} for this
            period.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setNoting(true);
              try {
                await api(`/portal/${token}/items/${item._id}/unavailable`, {
                  method: "POST",
                  body: { note: new FormData(e.currentTarget).get("note") },
                });
                await refresh();
                setNote(false);
                toast("Your note has been sent.");
              } catch (err) {
                setError(err);
              } finally {
                setNoting(false);
              }
            }}
          >
            {error && <ErrorNotice error={error} />}
            <label className="field">
              <span>Your note</span>
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={500}
                autoFocus
                defaultValue={item.naNote}
                placeholder="For example: We didn’t make any sales this month."
              />
            </label>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNote(false)}
              >
                Cancel
              </Button>
              <Button busy={noting}>
                Send note
                <ArrowRight size={15} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function Portal() {
  const { token } = useParams(),
    query = useQuery({
      queryKey: ["portal", token],
      queryFn: () => api(`/portal/${token}`),
      retry: false,
      refetchInterval: 6000,
    });
  if (query.isPending)
    return (
      <main className="portal-page">
        <Loading />
      </main>
    );
  if (query.error)
    return (
      <main className="portal-page">
        <header className="portal-header">
          <span className="portal-wordmark">
            <FileText size={23} />
            docchase.
          </span>
        </header>
        <Empty
          title="This link needs a fresh start."
          description={query.error.message}
        >
          {query.error.status !== 410 && (
            <Button onClick={() => query.refetch()}>Try again</Button>
          )}
        </Empty>
        <p className="portal-security">
          <ShieldCheck size={15} />
          Ask your accountant for a new upload link if this one has expired.
        </p>
      </main>
    );
  const { firm, client, checklist, documents, demo } = query.data;
  return (
    <main className="portal-page">
      <header className="portal-header">
        <span className="portal-firm">
          <span className="portal-firm-symbol">
            <FileText size={22} />
          </span>
          <strong>{firm.name}</strong>
        </span>
        <span className="portal-powered">
          Collected with <strong>docchase.</strong>
        </span>
      </header>
      <div className="portal-content">
        <div className="portal-intro">
          <p className="eyebrow">YOUR DOCUMENT CHECKLIST</p>
          <h1>Hello, {client.contactPerson || client.name}.</h1>
          <p>
            Your accountant needs a few documents for{" "}
            <strong>{checklist.title}</strong>. Upload them here, whenever
            you’re ready.
          </p>
          <div className="portal-meta">
            <span>
              Due <strong>{date(checklist.dueDate)}</strong>
            </span>
            <span>
              <ShieldCheck size={15} />
              Private upload link
            </span>
          </div>
        </div>
        {demo && (
          <div className="demo-banner">
            <strong>Coursework demo</strong>
            <span>Please use synthetic documents only.</span>
            <a href="/api/samples/sample-clean-invoice.pdf">
              Download a sample invoice
              <DownloadIcon />
            </a>
          </div>
        )}
        <div className="portal-progress">
          <div>
            <strong>
              {checklist.receivedCount} of {checklist.totalItems} items received
            </strong>
            <span>
              {checklist.status === "complete"
                ? "All checked and approved"
                : `${checklist.approvedCount} approved or waived`}
            </span>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: `${(checklist.receivedCount / checklist.totalItems) * 100}%`,
              }}
            />
          </div>
        </div>
        {checklist.status === "complete" && (
          <div className="portal-complete">
            <Check size={22} />
            <div>
              <strong>You’re all set.</strong>
              <p>
                Your accountant has approved everything needed for this request.
              </p>
            </div>
          </div>
        )}
        <div className="portal-items">
          {checklist.items.map((item) => (
            <UploadItem
              key={item._id}
              item={item}
              documents={documents}
              token={token}
              refresh={query.refetch}
            />
          ))}
        </div>
        <div className="portal-security">
          <ShieldCheck size={17} />
          <p>
            Your documents go directly to your accounting firm.
            <br />
            You can return to this link to check their progress.
          </p>
        </div>
      </div>
      <footer className="portal-footer">
        A little less paperwork. A little more peace of mind.
        <span>docchase.</span>
      </footer>
    </main>
  );
}
function DownloadIcon() {
  return <ArrowRight size={14} />;
}

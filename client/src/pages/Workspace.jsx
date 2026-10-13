import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Download,
  Check,
  Clock3,
  FileText,
  Mail,
  Pause,
  Play,
  Users,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { api, date } from "../api";
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

export function useOverview() {
  return useOutletContext().overview;
}
export function ShareDialog({ share, onClose }) {
  const toast = useToast(),
    [busy, setBusy] = useState(false);
  const message = `Hello ${share.client?.contactPerson || share.client?.name || ""}, please upload your documents for ${share.title} by ${date(share.dueDate)}: ${share.url}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(share.url);
      toast("Secure link copied.");
    } catch {
      toast("Select the link below and copy it manually.", "error");
    }
  }
  async function email() {
    setBusy(true);
    try {
      const data = await api(`/checklists/${share._id}/reminder`, {
        method: "POST",
      });
      toast(
        data.log?.status === "sent"
          ? "Email reminder sent."
          : data.reason === "waiting_on_review"
            ? "Your client has finished responding. Review the request before following up."
            : data.reason === "complete"
              ? "This request is already complete."
              : data.log?.error || "A reminder was already requested.",
        data.log?.status === "sent" ? "success" : "error",
      );
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Share this request" onClose={onClose}>
      <p className="modal-description">
        A private upload link for <strong>{share.client?.name}</strong>. Your
        client can send documents without creating an account.
      </p>
      <div className="share-link">
        <Link2 size={18} />
        <input
          aria-label="Secure upload link"
          value={share.url}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <button
          className="icon-button"
          aria-label="Copy secure link"
          onClick={copy}
        >
          <Copy size={17} />
        </button>
      </div>
      <p className="helper">
        <ShieldCheck size={14} />
        This link expires {date(share.expiresAt)}.
      </p>
      <div className="share-options">
        <a
          className="button secondary"
          href={share.url}
          target="_blank"
          rel="noreferrer"
        >
          Preview client page
          <ExternalLink size={15} />
        </a>
        {share.client?.phone ? (
          <a
            className="button primary"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/${share.client.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`}
          >
            Open WhatsApp
            <ArrowUpRight size={15} />
          </a>
        ) : (
          <span className="helper">
            Add a client phone number to share on WhatsApp.
          </span>
        )}
      </div>
      <Button variant="secondary" busy={busy} onClick={email}>
        <Mail size={16} />
        Send email reminder
      </Button>
      <div className="modal-foot">
        <span className="helper">
          Anyone with this link can access this request.
        </span>
        <button
          className="text-button danger"
          onClick={async () => {
            if (
              !window.confirm(
                "Revoke every upload link for this request? Your client will need a new link.",
              )
            )
              return;
            try {
              await api(`/checklists/${share._id}/revoke-links`, {
                method: "POST",
              });
              toast("Upload links revoked.");
              onClose();
            } catch (e) {
              toast(e.message, "error");
            }
          }}
        >
          Revoke links
        </button>
      </div>
    </Modal>
  );
}
export function ClientDialog({ client, onClose }) {
  const cache = useQueryClient(),
    toast = useToast(),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    data.gstin = data.gstin.toUpperCase();
    try {
      await api(client ? `/clients/${client._id}` : "/clients", {
        method: client ? "PATCH" : "POST",
        body: data,
      });
      await cache.invalidateQueries({ queryKey: ["overview"] });
      toast(
        client
          ? "Client updated."
          : "Client added. Create a request when you’re ready.",
      );
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (name) =>
    error?.details?.find((d) => d.field === name)?.message;
  return (
    <Modal title={client ? "Edit client" : "Add a client"} onClose={onClose}>
      <p className="modal-description">
        Keep the details you need to request documents and follow up.
      </p>
      <form onSubmit={submit}>
        {error && <ErrorNotice error={error} />}
        <Field
          label="Business or client name"
          name="name"
          required
          minLength={2}
          defaultValue={client?.name}
          placeholder="Mehta Trading Co."
          error={fieldError("name")}
        />
        <div className="form-grid">
          <Field
            label="Contact person"
            name="contactPerson"
            defaultValue={client?.contactPerson}
            placeholder="Ravi Mehta"
          />
          <Field
            label="Phone number"
            name="phone"
            type="tel"
            defaultValue={client?.phone}
            placeholder="+919876543210"
            hint="Include the country code."
            error={fieldError("phone")}
          />
        </div>
        <Field
          label="Email address"
          name="email"
          type="email"
          defaultValue={client?.email}
          placeholder="ravi@example.com"
          error={fieldError("email")}
        />
        <Field
          label="GSTIN (optional)"
          name="gstin"
          defaultValue={client?.gstin}
          maxLength={15}
          placeholder="15-character GSTIN"
          error={fieldError("gstin")}
          hint="Used to check the buyer details on purchase invoices."
        />
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy}>
            {client ? "Save changes" : "Add client"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function RequestDialog({ clients, onClose, clientId }) {
  const cache = useQueryClient(),
    toast = useToast(),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState([
      { label: "Purchase invoices", direction: "purchase" },
      { label: "Sales invoices", direction: "sale" },
    ]);
  const today = new Date(),
    start = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1)),
    end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 0)),
    due = new Date(today.getTime() + 7 * 86400000);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      items: items.map((i) => ({ ...i, required: true, multiple: true })),
    };
    try {
      await api("/checklists", { method: "POST", body });
      await cache.invalidateQueries({ queryKey: ["overview"] });
      toast("Request created. Share its upload link with your client.");
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Create a document request" onClose={onClose}>
      <p className="modal-description">
        Give your client a clear list and a deadline. Each item can receive
        multiple invoices.
      </p>
      {!clients.length ? (
        <Empty
          title="Add your first client"
          description="A document request belongs to a client."
        >
          <Link className="button primary" to="/clients" onClick={onClose}>
            Go to clients
          </Link>
        </Empty>
      ) : (
        <form onSubmit={submit}>
          {error && <ErrorNotice error={error} />}
          <label className="field">
            <span>Client</span>
            <select
              name="clientId"
              required
              defaultValue={clientId || clients[0]._id}
            >
              {clients.map((c) => (
                <option value={c._id} key={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Request title"
            name="title"
            required
            defaultValue={`${start.toLocaleDateString("en-IN", { month: "long" })} invoice collection`}
          />
          <div className="form-grid">
            <Field
              label="Period begins"
              type="date"
              name="periodStart"
              required
              defaultValue={start.toISOString().slice(0, 10)}
            />
            <Field
              label="Period ends"
              type="date"
              name="periodEnd"
              required
              defaultValue={end.toISOString().slice(0, 10)}
            />
          </div>
          <Field
            label="Documents due"
            type="date"
            name="dueDate"
            required
            defaultValue={due.toISOString().slice(0, 10)}
          />
          <div className="field">
            <span>Documents to request</span>
            <div className="request-item-inputs">
              {items.map((item, index) => (
                <div key={index}>
                  <input
                    aria-label={`Item ${index + 1} label`}
                    required
                    minLength={2}
                    value={item.label}
                    onChange={(e) =>
                      setItems(
                        items.map((i, n) =>
                          n === index ? { ...i, label: e.target.value } : i,
                        ),
                      )
                    }
                  />
                  <select
                    aria-label={`Item ${index + 1} invoice direction`}
                    value={item.direction}
                    onChange={(e) =>
                      setItems(
                        items.map((i, n) =>
                          n === index ? { ...i, direction: e.target.value } : i,
                        ),
                      )
                    }
                  >
                    <option value="purchase">Purchase</option>
                    <option value="sale">Sale</option>
                  </select>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() =>
                        setItems(items.filter((_, n) => n !== index))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="text-button"
              type="button"
              disabled={items.length >= 12}
              onClick={() =>
                setItems([...items, { label: "", direction: "purchase" }])
              }
            >
              <Plus size={14} />
              Add another item
            </button>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={busy}>
              Create request
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export function RequestTable({ lists, onShare }) {
  return (
    <div className="table-scroll">
      <table className="work-table">
        <thead>
          <tr>
            <th>CLIENT & REQUEST</th>
            <th>COLLECTION</th>
            <th>DUE DATE</th>
            <th>STATUS</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lists.map((list) => (
            <tr key={list._id}>
              <td>
                <Link className="client-cell" to={`/requests/${list._id}`}>
                  <Avatar name={list.client?.name} />
                  <span>
                    <strong>{list.client?.name}</strong>
                    <small>{list.title}</small>
                  </span>
                </Link>
              </td>
              <td>
                <div className="collection-cell">
                  <span>
                    <strong>{list.receivedCount}</strong> of {list.totalItems}{" "}
                    received
                  </span>
                  <span className="progress-track">
                    <span
                      style={{
                        width: `${(list.receivedCount / list.totalItems) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              </td>
              <td>
                <span
                  className={list.status === "overdue" ? "overdue-date" : ""}
                >
                  {date(list.dueDate)}
                </span>
              </td>
              <td>
                <Badge
                  status={
                    list.status === "open" && list.needsReview
                      ? "needs_review"
                      : list.status
                  }
                />
              </td>
              <td>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    title="Share upload link"
                    aria-label={`Share request for ${list.client?.name}`}
                    onClick={() => onShare(list)}
                  >
                    <Link2 size={17} />
                  </button>
                  <Link
                    className="icon-button"
                    aria-label={`Open request for ${list.client?.name}`}
                    to={`/requests/${list._id}`}
                  >
                    <ChevronRight size={18} />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Dashboard() {
  const { user } = useOutletContext(),
    query = useOverview(),
    [newRequest, setNewRequest] = useState(false),
    [share, setShare] = useState(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    toast = useToast();
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  const { checklists, counts, clients, activity } = query.data;
  const lists = checklists.filter(
    (c) =>
      (filter === "all" ||
        (filter === "review" ? c.needsReview : c.status === filter)) &&
      `${c.client?.name} ${c.title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function openShare(list) {
    try {
      setShare({
        ...list,
        ...(await api(`/checklists/${list._id}/link`, { method: "POST" })),
      });
    } catch (e) {
      toast(e.message, "error");
    }
  }
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }).format(new Date())}
        title={`${greeting}, ${user.name.split(" ")[0]}.`}
        description="A clear view of what’s in, what’s missing, and what needs you."
      >
        <Button onClick={() => setNewRequest(true)}>
          <Plus size={17} />
          New request
        </Button>
      </PageHeading>
      <div className="stats-strip">
        {[
          ["Active clients", counts.clients, "In your practice"],
          ["Open requests", counts.open, "Still in progress"],
          ["Awaiting review", counts.review, "Ready for a closer look"],
          ["Overdue requests", counts.overdue, "A follow-up could help"],
        ].map(([label, count, note], i) => (
          <div
            className={`stat ${i === 3 && count ? "attention" : ""}`}
            key={label}
          >
            <span>{label}</span>
            <strong>{String(count).padStart(2, "0")}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      {counts.review > 0 && (
        <div className="review-callout">
          <span className="callout-icon">
            <FileText size={21} />
          </span>
          <div>
            <strong>
              {counts.review} document{counts.review === 1 ? "" : "s"} waiting
              for your eye.
            </strong>
            <span>
              Check the details, resolve the flags, and keep things moving.
            </span>
          </div>
          <Link to="/review">
            Open review queue
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel collection-panel">
          <div className="panel-heading">
            <div>
              <h2>Your collection desk</h2>
              <p>One list. Every client. No loose ends.</p>
            </div>
            <Link to="/requests" className="text-button">
              View all
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="table-toolbar">
            <div className="tabs">
              {[
                ["all", "All requests", checklists.length],
                ["overdue", "Overdue", counts.overdue],
                [
                  "review",
                  "Needs review",
                  checklists.filter((c) => c.needsReview).length,
                ],
              ].map(([key, label, count]) => (
                <button
                  className={filter === key ? "selected" : ""}
                  key={key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Search requests"
                placeholder="Find a client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {lists.length ? (
            <RequestTable lists={lists} onShare={openShare} />
          ) : (
            <Empty
              title={
                checklists.length
                  ? "Nothing in this view"
                  : "Your first request starts here"
              }
              description={
                checklists.length
                  ? "Try another filter or search."
                  : "Add a client, then ask for the documents you need."
              }
            >
              {!checklists.length && (
                <Link className="button secondary" to="/clients">
                  Add your first client
                </Link>
              )}
            </Empty>
          )}
          <div className="table-foot">
            <span>
              {lists.length} request{lists.length === 1 ? "" : "s"} in this view
            </span>
            <span>
              <span className="tiny-green-dot" />
              Updated as documents arrive
            </span>
          </div>
        </section>
        <aside className="desk-rail">
          <section className="rail-section">
            <div className="rail-heading">
              <h2>On the horizon</h2>
              <Clock3 size={17} />
            </div>
            <p className="rail-description">
              The next deadlines to keep in view.
            </p>
            {checklists
              .filter((c) => c.status !== "complete")
              .slice(0, 3)
              .map((c) => (
                <Link
                  className="deadline-row"
                  key={c._id}
                  to={`/requests/${c._id}`}
                >
                  <span
                    className={`date-tile ${c.status === "overdue" ? "late" : ""}`}
                  >
                    <strong>{new Date(c.dueDate).getUTCDate()}</strong>
                    <small>
                      {new Date(c.dueDate).toLocaleDateString("en-IN", {
                        month: "short",
                      })}
                    </small>
                  </span>
                  <span>
                    <strong>{c.client?.name}</strong>
                    <small>
                      {c.status === "overdue"
                        ? "Past the due date"
                        : "Invoice collection"}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            {!checklists.length && (
              <p className="helper">Upcoming deadlines will appear here.</p>
            )}
          </section>
          <section className="rail-section activity-section">
            <div className="rail-heading">
              <h2>Latest activity</h2>
              <span className="tiny-green-dot" />
            </div>
            <div className="activity-list">
              {activity.slice(0, 4).map((a) => (
                <div className="activity-row" key={a._id}>
                  <span
                    className={`activity-icon ${a.action.includes("approved") ? "approved" : ""}`}
                  >
                    {a.action.includes("approved") ? (
                      <Check size={13} />
                    ) : (
                      <FileText size={13} />
                    )}
                  </span>
                  <div>
                    <p>
                      {a.action
                        .replaceAll(".", " ")
                        .replace("document", "A document")
                        .replace("client created", "A client was added")
                        .replace("checklist created", "A request was created")}
                    </p>
                    <small>{date(a.at)}</small>
                  </div>
                </div>
              ))}
            </div>
            {!activity.length && (
              <p className="helper">
                Your workspace activity will appear here.
              </p>
            )}
          </section>
          <div className="desk-note">
            <span>THE SMALL THINGS ADD UP.</span>
            <p>
              A clear checklist saves
              <br />
              another follow-up.
            </p>
            <Link to="/requests">
              Keep your clients moving
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
      {newRequest && (
        <RequestDialog clients={clients} onClose={() => setNewRequest(false)} />
      )}{" "}
      {share && <ShareDialog share={share} onClose={() => setShare(null)} />}
    </>
  );
}
export function Clients() {
  const query = useOverview(),
    [dialog, setDialog] = useState(null),
    [requestClient, setRequestClient] = useState(null),
    [search, setSearch] = useState(""),
    toast = useToast(),
    cache = useQueryClient();
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  const clients = query.data.clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR PRACTICE"
        title="Good work starts with your clients."
        description="Contact details, active requests, and a little more context."
      >
        <Button onClick={() => setDialog({})}>
          <Plus size={17} />
          Add client
        </Button>
      </PageHeading>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            Client directory{" "}
            <span className="quiet-count">{clients.length}</span>
          </h2>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a client…"
            />
          </label>
        </div>
        {clients.length ? (
          <div className="table-scroll">
            <table className="work-table">
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>CONTACT</th>
                  <th>OPEN REQUESTS</th>
                  <th>FOLLOW-UPS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <button
                        className="client-cell unstyled"
                        onClick={() => setDialog(c)}
                      >
                        <Avatar name={c.name} />
                        <span>
                          <strong>{c.name}</strong>
                          <small>{c.gstin || "GSTIN not added"}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span>{c.contactPerson || "—"}</span>
                      <small className="block muted">
                        {c.email || "No email added"}
                      </small>
                    </td>
                    <td>
                      {
                        query.data.checklists.filter(
                          (l) =>
                            l.clientId === c._id && l.status !== "complete",
                        ).length
                      }
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api(`/clients/${c._id}`, {
                              method: "PATCH",
                              body: { remindersPaused: !c.remindersPaused },
                            });
                            cache.invalidateQueries({ queryKey: ["overview"] });
                            toast(
                              c.remindersPaused
                                ? "Follow-ups resumed."
                                : "Follow-ups paused.",
                            );
                          } catch (e) {
                            toast(e.message, "error");
                          }
                        }}
                      >
                        {c.remindersPaused ? (
                          <Pause size={14} />
                        ) : (
                          <Check size={14} />
                        )}{" "}
                        {c.remindersPaused ? "Paused" : "Enabled"}
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() => setRequestClient(c._id)}
                        >
                          Request files
                          <ArrowUpRight size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Archive ${c.name}`}
                          title="Archive client"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Archive ${c.name}? Their upload links will be revoked.`,
                              )
                            )
                              return;
                            try {
                              await api(`/clients/${c._id}/archive`, {
                                method: "POST",
                              });
                              cache.invalidateQueries({
                                queryKey: ["overview"],
                              });
                              toast("Client archived and links revoked.");
                            } catch (e) {
                              toast(e.message, "error");
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              search ? "No matching clients" : "Who are you collecting for?"
            }
            description={
              search
                ? "Try another name."
                : "Add your first client to start collecting documents."
            }
          >
            {!search && (
              <Button onClick={() => setDialog({})}>
                <Plus size={16} />
                Add client
              </Button>
            )}
          </Empty>
        )}
      </section>
      {dialog && (
        <ClientDialog
          client={dialog._id ? dialog : null}
          onClose={() => setDialog(null)}
        />
      )}{" "}
      {requestClient && (
        <RequestDialog
          clients={query.data.clients}
          clientId={requestClient}
          onClose={() => setRequestClient(null)}
        />
      )}
    </>
  );
}
export function Requests() {
  const query = useOverview(),
    [create, setCreate] = useState(false),
    [share, setShare] = useState(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    toast = useToast();
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  const lists = query.data.checklists.filter(
    (l) =>
      (filter === "all" || l.status === filter) &&
      `${l.client?.name} ${l.title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="DOCUMENT COLLECTION"
        title="Every request, accounted for."
        description="Follow each client from the first upload to the final approval."
      >
        <Button onClick={() => setCreate(true)}>
          <Plus size={17} />
          New request
        </Button>
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar roomy">
          <div className="tabs">
            {[
              ["all", "All requests"],
              ["open", "In progress"],
              ["overdue", "Overdue"],
              ["complete", "Complete"],
            ].map(([key, label]) => (
              <button
                className={filter === key ? "selected" : ""}
                key={key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search requests"
              placeholder="Search client or request…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {lists.length ? (
          <RequestTable
            lists={lists}
            onShare={async (list) => {
              try {
                setShare({
                  ...list,
                  ...(await api(`/checklists/${list._id}/link`, {
                    method: "POST",
                  })),
                });
              } catch (e) {
                toast(e.message, "error");
              }
            }}
          />
        ) : (
          <Empty
            title="No requests in this view"
            description="Create a request or try another filter."
          />
        )}
      </section>
      {create && (
        <RequestDialog
          clients={query.data.clients}
          onClose={() => setCreate(false)}
        />
      )}{" "}
      {share && <ShareDialog share={share} onClose={() => setShare(null)} />}
    </>
  );
}
export function RequestDetail() {
  const { id } = useParams(),
    cache = useQueryClient(),
    toast = useToast(),
    [share, setShare] = useState(null),
    [waive, setWaive] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const query = useQuery({
    queryKey: ["request", id],
    queryFn: () => api(`/checklists/${id}`),
    refetchInterval: 6000,
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  const { checklist: list, documents, client } = query.data;
  return (
    <>
      <Link to="/requests" className="back-link">
        ← All requests
      </Link>
      <PageHeading
        eyebrow={client.name}
        title={list.title}
        description={`${date(list.periodStart)} – ${date(list.periodEnd)} · Due ${date(list.dueDate)}`}
      >
        <a className="button secondary" href={`/api/exports?checklistId=${id}`}>
          <Download size={16} />
          Export approved CSV
        </a>
        <Button
          onClick={async () => {
            try {
              setShare({
                ...list,
                client,
                ...(await api(`/checklists/${id}/link`, { method: "POST" })),
              });
            } catch (e) {
              toast(e.message, "error");
            }
          }}
        >
          <Link2 size={16} />
          Share request
        </Button>
      </PageHeading>
      <div className="request-detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Requested documents</h2>
            <Badge status={list.status} />
          </div>
          {list.items.map((item) => (
            <div className="detail-item" key={item._id}>
              <div className="detail-item-heading">
                <span className="item-number">
                  <FileText size={19} />
                </span>
                <div>
                  <h3>{item.label}</h3>
                  <p>
                    {item.multiple
                      ? "Multiple invoices accepted"
                      : "One file required"}{" "}
                    · {item.documentCount} received
                  </p>
                </div>
                <Badge status={item.state} />
              </div>
              {item.naNote && (
                <div className="client-note">
                  <strong>Client’s note</strong>
                  <p>{item.naNote}</p>
                  {!item.waivedAt && (
                    <button
                      className="text-button"
                      onClick={() => setWaive(item)}
                    >
                      Mark as not required
                      <Check size={14} />
                    </button>
                  )}
                </div>
              )}
              <div className="file-list">
                {documents
                  .filter((d) => d.itemId === item._id && !d.supersededBy)
                  .map((d) => (
                    <Link
                      className="file-row"
                      key={d._id}
                      to={`/review/${d._id}`}
                    >
                      <FileText size={19} />
                      <span>
                        <strong>{d.originalName}</strong>
                        <small>
                          {Math.round(d.size / 1024)} KB · {date(d.createdAt)}
                        </small>
                      </span>
                      <Badge status={d.status} />
                      <ChevronRight size={17} />
                    </Link>
                  ))}
              </div>
              {!item.documentCount && !item.naNote && (
                <p className="helper indented">
                  Waiting for your client to upload.
                </p>
              )}
              {item.multiple &&
                item.documentCount > 0 &&
                !item.submittedAt &&
                !item.waivedAt && (
                  <p className="helper indented">
                    The client hasn’t marked this item finished yet.
                  </p>
                )}
            </div>
          ))}
        </section>
        <aside>
          <section className="panel request-summary">
            <h2>Collection progress</h2>
            <div className="big-progress">
              {list.approvedCount}
              <span> / {list.totalItems}</span>
            </div>
            <p>required items approved or waived</p>
            <div className="progress-track">
              <span
                style={{
                  width: `${(list.approvedCount / list.totalItems) * 100}%`,
                }}
              />
            </div>
            <hr />
            <div className="summary-line">
              <span>Contact</span>
              <strong>{client.contactPerson || client.name}</strong>
            </div>
            <div className="summary-line">
              <span>Email</span>
              <strong>{client.email || "Not added"}</strong>
            </div>
            <div className="summary-line">
              <span>Phone</span>
              <strong>{client.phone || "Not added"}</strong>
            </div>
            <Button
              variant="secondary"
              className="full-width"
              onClick={async () => {
                try {
                  await api(`/checklists/${id}/reminders`, {
                    method: "PATCH",
                    body: { paused: !list.remindersPaused },
                  });
                  await query.refetch();
                  toast(
                    list.remindersPaused
                      ? "Reminders resumed."
                      : "Reminders paused.",
                  );
                } catch (e) {
                  toast(e.message, "error");
                }
              }}
            >
              {list.remindersPaused ? <Play size={16} /> : <Pause size={16} />}{" "}
              {list.remindersPaused ? "Resume reminders" : "Pause reminders"}
            </Button>
          </section>
          <p className="aside-note">
            <ShieldCheck size={16} />
            Only approved documents appear in the CSV export.
          </p>
        </aside>
      </div>
      {share && (
        <ShareDialog share={share} onClose={() => setShare(null)} />
      )}{" "}
      {waive && (
        <Modal title="Waive this item" onClose={() => setWaive(null)}>
          <p className="modal-description">
            Confirm that {waive.label.toLowerCase()} are not required for this
            request.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/checklists/${id}/items/${waive._id}/waive`, {
                  method: "POST",
                  body: { reason: new FormData(e.currentTarget).get("reason") },
                });
                await query.refetch();
                cache.invalidateQueries({ queryKey: ["overview"] });
                setWaive(null);
                toast("Item waived.");
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNotice error={error} />}
            <label className="field">
              <span>Reason</span>
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={500}
                defaultValue={waive.naNote}
              />
            </label>
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setWaive(null)}
              >
                Cancel
              </Button>
              <Button busy={busy}>Confirm waiver</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Reminders() {
  const query = useQuery({
      queryKey: ["reminders"],
      queryFn: () => api("/reminders"),
    }),
    overview = useOverview(),
    [share, setShare] = useState(null),
    toast = useToast();
  if (query.isPending || overview.isPending) return <Loading />;
  if (query.error || overview.error)
    return (
      <ErrorNotice
        error={query.error || overview.error}
        retry={() => {
          query.refetch();
          overview.refetch();
        }}
      />
    );
  const outstanding = overview.data.checklists.filter(
    (c) => c.status !== "complete",
  );
  return (
    <>
      <PageHeading
        eyebrow="A GENTLE NUDGE"
        title="Follow up, without the guesswork."
        description="Reminders stop when a request is complete. Quiet hours: 9 PM–8 AM IST."
      />
      {!query.data.emailConfigured && (
        <div className="information-notice">
          <Mail size={19} />
          <span>
            Email delivery isn’t connected yet. You can still share a reminder
            through WhatsApp or copy an upload link.
          </span>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Outstanding requests</h2>
          <span className="quiet-count">{outstanding.length}</span>
        </div>
        {outstanding.length ? (
          <RequestTable
            lists={outstanding}
            onShare={async (list) => {
              try {
                setShare({
                  ...list,
                  ...(await api(`/checklists/${list._id}/link`, {
                    method: "POST",
                  })),
                });
              } catch (e) {
                toast(e.message, "error");
              }
            }}
          />
        ) : (
          <Empty
            title="No chasing needed"
            description="All current requests are complete."
          />
        )}
      </section>
      <section className="panel spaced-panel">
        <div className="panel-heading">
          <h2>Email history</h2>
        </div>
        {query.data.logs.length ? (
          <div className="table-scroll">
            <table className="work-table">
              <thead>
                <tr>
                  <th>REQUEST</th>
                  <th>DATE</th>
                  <th>DELIVERY</th>
                  <th>DETAILS</th>
                </tr>
              </thead>
              <tbody>
                {query.data.logs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      {overview.data.checklists.find(
                        (c) => c._id === log.checklistId,
                      )?.client?.name || "Archived request"}
                    </td>
                    <td>{date(log.createdAt)}</td>
                    <td>
                      <Badge status={log.status}>
                        {
                          {
                            sent: "Sent",
                            demo: "Not sent",
                            failed: "Failed",
                            sending: "Awaiting confirmation",
                            uncertain: "Check delivery",
                          }[log.status]
                        }
                      </Badge>
                    </td>
                    <td className="muted">
                      {log.error || "Accepted by the email provider"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="A clean slate"
            description="Email reminder attempts will appear here, with their delivery status."
          />
        )}
      </section>
      {share && <ShareDialog share={share} onClose={() => setShare(null)} />}
    </>
  );
}
export function SettingsPage() {
  const query = useQuery({
      queryKey: ["settings"],
      queryFn: () => api("/settings"),
    }),
    { user } = useOutletContext(),
    [staff, setStaff] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    toast = useToast(),
    cache = useQueryClient();
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  return (
    <>
      <PageHeading
        eyebrow="YOUR FIRM"
        title="A workspace that feels like yours."
        description="The essentials for your practice and the people who work here."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>Firm details</h2>
          <p className="muted">The name clients see on their upload page.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/settings/firm", {
                  method: "POST",
                  body: { name: new FormData(e.currentTarget).get("name") },
                });
                cache.invalidateQueries({ queryKey: ["session"] });
                query.refetch();
                toast("Firm details saved.");
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNotice error={error} />}
            <Field
              label="Firm name"
              name="name"
              defaultValue={query.data.firm.name}
              disabled={user.role !== "owner"}
              required
            />
            {user.role === "owner" && <Button busy={busy}>Save changes</Button>}
          </form>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading compact">
            <h2>Your team</h2>
            {user.role === "owner" && (
              <Button variant="secondary" onClick={() => setStaff(true)}>
                <Plus size={15} />
                Add member
              </Button>
            )}
          </div>
          {query.data.users.map((u) => (
            <div className="team-row" key={u._id}>
              <Avatar name={u.name} />
              <div>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </div>
              <span className="role-tag">{u.role}</span>
            </div>
          ))}
        </section>
        <section className="panel settings-panel">
          <h2>Workspace readiness</h2>
          <div className="readiness-row">
            <Mail size={19} />
            <div>
              <strong>Email reminders</strong>
              <p>
                {query.data.emailConfigured
                  ? "Connected and ready to send."
                  : "Not connected. WhatsApp sharing is available."}
              </p>
            </div>
            <Badge status={query.data.emailConfigured ? "complete" : "open"}>
              {query.data.emailConfigured ? "Connected" : "Not connected"}
            </Badge>
          </div>
          <div className="readiness-row">
            <FileText size={19} />
            <div>
              <strong>Invoice extraction</strong>
              <p>
                {query.data.extractionConfigured
                  ? "Automatic extraction with human review."
                  : query.data.demo
                    ? "Synthetic samples extract automatically. Other documents use manual entry."
                    : "Manual entry is available for every invoice."}
              </p>
            </div>
          </div>
          <div className="readiness-row">
            <ShieldCheck size={19} />
            <div>
              <strong>Private documents</strong>
              <p>
                Uploads require a client link. File access requires a firm
                account.
              </p>
            </div>
          </div>
        </section>
      </div>
      {staff && (
        <Modal title="Add a team member" onClose={() => setStaff(false)}>
          <p className="modal-description">
            Staff can manage clients, review documents and export approved data.
            Share their initial credentials securely.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api("/settings/staff", {
                  method: "POST",
                  body: Object.fromEntries(new FormData(e.currentTarget)),
                });
                query.refetch();
                setStaff(false);
                toast("Team member added.");
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNotice error={error} />}
            <Field label="Name" name="name" required minLength={2} />
            <Field label="Email" name="email" type="email" required />
            <Field
              label="Initial password"
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={72}
            />
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setStaff(false)}
              >
                Cancel
              </Button>
              <Button busy={busy}>
                <Users size={16} />
                Add member
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

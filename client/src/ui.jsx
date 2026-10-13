import {
  useEffect,
  useId,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { labels, initials } from "./api";

const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null),
    timer = useRef();
  const notify = (text, type = "success") => {
    setMessage({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 5000);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {message && (
        <div
          className={`toast ${message.type}`}
          role={message.type === "error" ? "alert" : "status"}
        >
          {message.type === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{message.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Badge({ status, children }) {
  return (
    <span className={`badge ${status}`}>
      <span className="status-dot" />
      {children || labels[status] || status}
    </span>
  );
}
export function Avatar({ name, size = "normal" }) {
  return (
    <span className={`avatar ${size} color-${(name || "").length % 5}`}>
      {initials(name)}
    </span>
  );
}
export function Logo({ small = false }) {
  return (
    <a
      className={`logo ${small ? "small" : ""}`}
      href="/workspace"
      aria-label="DocChase workspace"
    >
      <span className="logo-symbol">
        <FileText size={23} strokeWidth={1.7} />
      </span>
      <span>
        docchase<span className="logo-period">.</span>
      </span>
    </a>
  );
}
export function Button({
  children,
  busy = false,
  variant = "primary",
  className = "",
  ...props
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      {...props}
      disabled={busy || props.disabled}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Field({ label, error, hint, ...props }) {
  const generated = useId(),
    id = props.id || generated;
  return (
    <label className="field">
      <span id={`${id}-label`}>{label}</span>
      <input
        {...props}
        id={id}
        aria-labelledby={`${id}-label`}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </label>
  );
}
export function ErrorNotice({ error, retry }) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>{error?.message || "Something went wrong."}</strong>
        {retry && (
          <button className="text-button" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" aria-label="Loading workspace">
      <div className="skeleton title" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function Empty({ title, description, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FileText size={28} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({ title, children, onClose }) {
  const dialog = useRef();
  const titleId = useId();
  useEffect(() => {
    dialog.current.showModal();
    const node = dialog.current;
    return () => {
      node.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}

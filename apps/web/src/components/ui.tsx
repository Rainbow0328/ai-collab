import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";

/* ==================== Badge ==================== */

export type BadgeVariant = "success" | "warning" | "error" | "info" | "accent" | "neutral";

export function Badge({
  variant = "neutral",
  dot = false,
  children,
}: {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${variant}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

/* ==================== Status Badge ==================== */

const STATUS_MAP: Record<string, BadgeVariant> = {
  active: "success", online: "success", completed: "success", processed: "success", running: "success",
  working: "accent", claimed: "accent", in_progress: "accent",
  waiting: "warning", pending: "warning", idle: "warning", paused: "warning", stopped: "warning",
  error: "error", failed: "error", offline: "error",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = STATUS_MAP[status] ?? "neutral";
  return (
    <Badge variant={variant} dot>
      {label ?? status}
    </Badge>
  );
}

/* ==================== Role Badge ==================== */

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  host: "accent",
  worker: "info",
  knowledge_keeper: "success",
  observer: "neutral",
};

const ROLE_LABEL: Record<string, string> = {
  host: "Host",
  worker: "Worker",
  knowledge_keeper: "Keeper",
  observer: "Observer",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={ROLE_VARIANT[role] ?? "neutral"} dot>
      {ROLE_LABEL[role] ?? role}
    </Badge>
  );
}

/* ==================== Dialog / Modal ==================== */

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(2px)",
        animation: "fadeIn var(--t-base) ease-out",
      }}
      onClick={onClose}
    >
      <div
        className="card animate-slide-up"
        style={{
          width: "90%", maxWidth: width,
          maxHeight: "85vh", overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "var(--shadow-xl)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "var(--sp-4) var(--sp-5)",
          borderBottom: "1px solid var(--c-border-subtle)",
        }}>
          <h2 style={{ fontSize: "var(--fs-md)", fontWeight: 600 }}>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ padding: "var(--sp-5)", overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ==================== Field ==================== */

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--sp-1)",
        marginBottom: "var(--sp-1)",
        fontSize: "var(--fs-sm)", fontWeight: 500,
        color: "var(--c-text-secondary)",
      }}>
        {label}
        {required && <span style={{ color: "var(--c-error)" }}>*</span>}
      </div>
      {children}
      {hint && (
        <div style={{ marginTop: "var(--sp-1)", fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

/* ==================== Confirm Dialog ==================== */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width={400}>
      <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)", lineHeight: 1.6 }}>
        {message}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-5)" }}>
        <button className="btn btn-secondary" onClick={onClose}>{cancelText}</button>
        <button
          className={danger ? "btn btn-danger" : "btn btn-primary"}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmText}
        </button>
      </div>
    </Dialog>
  );
}

/* ==================== Empty State ==================== */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
      {action && <div style={{ marginTop: "var(--sp-4)" }}>{action}</div>}
    </div>
  );
}

/* ==================== Loading ==================== */

export function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "var(--sp-2)", padding: "var(--sp-8)",
      color: "var(--c-text-tertiary)", fontSize: "var(--fs-sm)",
    }}>
      <div className="spinner" />
      {text}
    </div>
  );
}

export function PageLoading() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", minHeight: 200,
    }}>
      <div className="spinner spinner-lg" />
    </div>
  );
}

/* ==================== Toast ==================== */

type Toast = { id: number; message: string; type: "success" | "error" | "info" | "warning" };
let toastCounter = 0;
const toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notifyToasts() { toastListeners.forEach((l) => l([...toasts])); }

export function pushToast(message: string, type: Toast["type"] = "info") {
  const id = ++toastCounter;
  toasts = [...toasts, { id, message, type }];
  notifyToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyToasts();
  }, 3000);
}

export function ToastContainer() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    toastListeners.push(setList);
    return () => { toastListeners.splice(toastListeners.indexOf(setList), 1); };
  }, []);

  return (
    <div style={{
      position: "fixed", bottom: "var(--sp-5)", right: "var(--sp-5)",
      zIndex: 2000, display: "flex", flexDirection: "column", gap: "var(--sp-2)",
      pointerEvents: "none",
    }}>
      {list.map((t) => (
        <div
          key={t.id}
          className="card animate-slide-up"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            display: "flex", alignItems: "center", gap: "var(--sp-2)",
            fontSize: "var(--fs-sm)", fontWeight: 500,
            boxShadow: "var(--shadow-lg)",
            borderLeft: `3px solid var(--c-${t.type === "success" ? "success" : t.type === "error" ? "error" : t.type === "warning" ? "warning" : "info"})`,
            pointerEvents: "auto",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

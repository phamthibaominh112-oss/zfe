import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</header>;
}

export function MetricCard({ label, value, note, tone = "blue" }: { label: string; value: ReactNode; note?: string; tone?: "blue" | "yellow" | "green" | "red" | "neutral" }) {
  return <article className={`metric-card metric-${tone}`}><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>;
}

export function Panel({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action ? <div className="panel-actions">{action}</div> : null}</div><div className="panel-body">{children}</div></section>;
}

export function Status({ value }: { value: string | null | undefined }) {
  const normalized = String(value || "").toLowerCase();
  const tone = normalized.includes("active") || normalized.includes("completed") || normalized.includes("approved") || normalized.includes("published") || normalized.includes("present") || normalized.includes("paid")
    ? "green"
    : normalized.includes("pending") || normalized.includes("scheduled") || normalized.includes("submitted") || normalized.includes("draft")
      ? "blue"
      : normalized.includes("risk") || normalized.includes("late") || normalized.includes("overdue") || normalized.includes("cancel") || normalized.includes("absent") || normalized.includes("rejected")
        ? "red"
        : normalized.includes("pause") || normalized.includes("revision") || normalized.includes("partial")
          ? "yellow"
          : "neutral";
  return <span className={`status status-${tone}`}>{value || "—"}</span>;
}

export function Flash({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return <div className={`message ${error ? "error" : "success"}`}>{error || message}</div>;
}

export function Empty({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>;
}

export function FormDetails({ title, children }: { title: string; children: ReactNode }) {
  return <details className="form-details"><summary className="button button-primary">{title}</summary><div className="form-details-body">{children}</div></details>;
}

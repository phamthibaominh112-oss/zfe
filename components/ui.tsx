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

const STATUS_LABELS: Record<string, string> = {
  active: "Đang hoạt động",
  completed: "Hoàn thành",
  approved: "Đã duyệt",
  published: "Đã gửi",
  present: "Có mặt",
  paid: "Đã thanh toán",
  pending: "Đang chờ",
  scheduled: "Đã xếp lịch",
  submitted: "Đã gửi",
  draft: "Bản nháp",
  ready: "Sẵn sàng",
  late: "Trễ",
  overdue: "Quá hạn",
  cancelled: "Đã huỷ",
  canceled: "Đã huỷ",
  absent: "Vắng",
  rejected: "Không duyệt",
  paused: "Tạm dừng",
  "revision required": "Cần chỉnh sửa",
  partial: "Chưa hoàn tất",
  "joined partially": "Tham gia một phần",
  matched: "Đã phân công",
  "not submitted": "Chưa nộp",
  closed: "Đã đóng",
  processing: "Đang xử lý",
  "partially paid": "Đã thanh toán một phần",
  unread: "Chưa đọc",
  read: "Đã đọc",
  issued: "Đã phát hành",
  void: "Đã huỷ",
  contacted: "Đã liên hệ",
  "call back": "Hẹn liên hệ lại",
  renewed: "Đã tái phí",
  "not renewing": "Không tái phí",
  "pending review": "Chờ xác nhận",
  disputed: "Có sai lệch",
  "chưa mở": "Chưa mở",
  "chưa tạo": "Chưa tạo",
  "checked in": "Đã check-in",
  adjusted: "Đã điều chỉnh",
  planned: "Đã đăng ký"
};

export function Status({ value }: { value: string | null | undefined }) {
  const raw = String(value || "");
  const normalized = raw.toLowerCase();
  const tone = normalized.includes("active") || normalized.includes("completed") || normalized.includes("approved") || normalized.includes("published") || normalized.includes("present") || normalized.includes("paid") || normalized.includes("matched")
    ? "green"
    : normalized.includes("pending") || normalized.includes("chờ") || normalized.includes("scheduled") || normalized.includes("submitted") || normalized.includes("draft") || normalized.includes("ready")
      ? "blue"
      : normalized.includes("risk") || normalized.includes("disputed") || normalized.includes("sai lệch") || normalized.includes("late") || normalized.includes("overdue") || normalized.includes("cancel") || normalized.includes("absent") || normalized.includes("rejected")
        ? "red"
        : normalized.includes("pause") || normalized.includes("revision") || normalized.includes("partial") || normalized.includes("not submitted")
          ? "yellow"
          : "neutral";
  return <span className={`status status-${tone}`}>{STATUS_LABELS[normalized] || value || "—"}</span>;
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

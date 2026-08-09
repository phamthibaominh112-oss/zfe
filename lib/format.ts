export function formatMoney(value: number | string | null | undefined) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(number);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function toNumber(value: FormDataEntryValue | null, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function text(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}


export function sessionDisplayLabel(status: string | null | undefined, sessionNo: number | string | null | undefined) {
  if (status === "Cancelled") return "Buổi hủy · không tính số";
  return `Buổi ${sessionNo || "—"}`;
}

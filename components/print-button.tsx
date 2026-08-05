"use client";

export function PrintButton({ label = "In / Lưu PDF" }: { label?: string }) {
  return <button className="button button-primary no-print" type="button" onClick={() => window.print()}>{label}</button>;
}

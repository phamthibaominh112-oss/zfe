"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="access-denied"><span className="chip chip-red">System error</span><h2>Không thể tải dữ liệu</h2><p>{error.message || "Đã xảy ra lỗi không xác định."}</p><button className="button button-primary" onClick={reset}>Thử lại</button></main>;
}

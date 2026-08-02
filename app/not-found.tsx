import Link from "next/link";

export default function NotFound() {
  return <main className="access-denied"><span className="chip chip-yellow">404</span><h2>Không tìm thấy nội dung</h2><p>Record có thể đã được archive, hoặc tài khoản hiện tại không có quyền truy cập.</p><Link className="button button-primary" href="/dashboard">Về Dashboard</Link></main>;
}

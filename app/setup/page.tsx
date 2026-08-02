import { getSupabaseEnvironmentStatus, isPlatformConfigured } from "@/lib/env";
import { redirect } from "next/navigation";

function StatusRow({ ok, label, required = true }: { ok: boolean; label: string; required?: boolean }) {
  return (
    <div className="setup-status-row">
      <span className={`setup-dot ${ok ? "is-ready" : "is-missing"}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{ok ? "Đã cấu hình" : required ? "Đang thiếu" : "Chưa cấu hình — không bắt buộc"}</small>
      </div>
      <span className={`status ${ok ? "status-green" : required ? "status-red" : "status-yellow"}`}>
        {ok ? "READY" : required ? "REQUIRED" : "OPTIONAL"}
      </span>
    </div>
  );
}

export default function SetupPage() {
  if (isPlatformConfigured()) redirect("/login");

  const status = getSupabaseEnvironmentStatus();

  return (
    <main className="auth-page setup-page">
      <section className="auth-brand setup-brand">
        <div className="auth-logo"><img src="/zest-logo.png" alt="ZEST for English" /></div>
        <p className="eyebrow">ZE CenterOS · Production setup</p>
        <h1>Deployment đã hoạt động.</h1>
        <p>
          Giao diện đã được deploy thành công. Hệ thống chưa kết nối database nên đang ở chế độ
          thiết lập an toàn thay vì trả về Internal Server Error.
        </p>
        <div className="auth-feature-grid">
          <div><strong>Không có demo data</strong><span>Dữ liệu chỉ xuất hiện sau khi kết nối Supabase thật.</span></div>
          <div><strong>RBAC + RLS</strong><span>Quyền được khóa ở cả ứng dụng và PostgreSQL.</span></div>
          <div><strong>Không lộ secret</strong><span>Trang này chỉ hiển thị trạng thái, không hiển thị giá trị key.</span></div>
        </div>
      </section>

      <section className="auth-card setup-card">
        <div className="auth-logo"><img src="/zest-logo.png" alt="ZEST for English" /></div>
        <span className="auth-kicker">Backend connection required</span>
        <h2>Kết nối Supabase</h2>
        <p>Thêm các biến dưới đây trong Vercel rồi redeploy project.</p>

        <div className="setup-status-list">
          <StatusRow ok={status.url} label="NEXT_PUBLIC_SUPABASE_URL" />
          <StatusRow ok={status.publishableKey} label="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" />
          <StatusRow ok={status.serviceRoleKey} label="SUPABASE_SERVICE_ROLE_KEY" />
          <StatusRow ok={status.appUrl} label="NEXT_PUBLIC_APP_URL" required={false} />
        </div>

        <ol className="setup-steps">
          <li>Tạo Supabase project.</li>
          <li>Chạy ba migration SQL trong thư mục <code>supabase/migrations</code>.</li>
          <li>Vào Vercel → Settings → Environment Variables và nhập các biến trên.</li>
          <li>Redeploy deployment mới nhất, sau đó tạo Admin đầu tiên theo README.</li>
        </ol>

        <div className="note-box">
          <strong>Lưu ý:</strong> Không đưa <code>SUPABASE_SERVICE_ROLE_KEY</code> vào biến có tiền tố
          <code>NEXT_PUBLIC_</code>. Key này chỉ được dùng phía server.
        </div>
      </section>
    </main>
  );
}

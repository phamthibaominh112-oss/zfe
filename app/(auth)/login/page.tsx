import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo"><img src="/zest-logo.png" alt="ZEST for English" /></div>
        <p className="eyebrow">ZEST for English</p>
        <h1>ZE CenterOS</h1>
        <p>Nền tảng quản lý vận hành trung tâm: lớp học, lịch, học viên, chất lượng, học phí và tái phí trên cùng một database.</p>
        <div className="auth-feature-grid">
          <div><strong>RBAC thật</strong><span>Mỗi tài khoản chỉ thấy dữ liệu đúng vai trò.</span></div>
          <div><strong>Database thật</strong><span>Supabase PostgreSQL, Auth, Storage và RLS.</span></div>
          <div><strong>Audit trail</strong><span>Không xoá ngoài Admin; mọi thay đổi quan trọng được lưu.</span></div>
        </div>
      </section>
      <section className="auth-card">
        <div>
          <span className="auth-kicker">Secure workspace</span>
          <h2>Đăng nhập hệ thống</h2>
          <p>Dùng tài khoản do Admin trung tâm cấp.</p>
        </div>
        {params.message ? <div className="message success">Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.</div> : null}
        {params.error ? <div className="message error">{params.error === "account_not_ready" ? "Tài khoản chưa được cấu hình role hoặc đang bị khoá." : params.error}</div> : null}
        <form action={signIn} className="form-stack">
          <input type="hidden" name="next" value={params.next || "/dashboard"} />
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button button-primary button-full" type="submit">Đăng nhập</button>
        </form>
        <a className="auth-link" href="/forgot-password">Quên mật khẩu?</a>
      </section>
    </main>
  );
}

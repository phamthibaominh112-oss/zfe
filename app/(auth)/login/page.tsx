import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo"><img src="/zest-logo.png" alt="ZEST for English" /></div>
        <p className="eyebrow">ZEST for English</p>
        <h1>ZE CenterOS</h1>
        <p>Nền tảng quản lý lịch học, lớp, học viên, chất lượng và học phí tại một nơi.</p>
        <div className="auth-feature-grid">
          <div><strong>Lịch rõ ràng</strong><span>Xem nhanh lịch hôm nay và kế hoạch trong tuần.</span></div>
          <div><strong>Đúng vai trò</strong><span>Mỗi người có workspace phù hợp với công việc.</span></div>
          <div><strong>Một nơi duy nhất</strong><span>Lớp học, tiến độ, chất lượng và học phí được kết nối.</span></div>
        </div>
      </section>
      <section className="auth-card">
        <div>
          <span className="auth-kicker">ZE CenterOS</span>
          <h2>Đăng nhập hệ thống</h2>
          <p>Dùng tài khoản do Admin trung tâm cấp.</p>
        </div>
        {params.message ? <div className="message success">Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.</div> : null}
        {params.error ? <div className="message error">{params.error === "account_not_ready" ? "Tài khoản chưa được phân quyền hoặc đang bị khoá." : params.error}</div> : null}
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

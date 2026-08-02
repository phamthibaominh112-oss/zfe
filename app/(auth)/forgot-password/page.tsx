import { requestPasswordReset } from "../login/actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <main className="auth-page simple-auth">
      <section className="auth-card">
        <div className="auth-logo"><img src="/zest-logo.png" alt="ZEST for English" /></div>
        <span className="auth-kicker">Account recovery</span>
        <h2>Khôi phục mật khẩu</h2>
        <p>Nhập email tài khoản. Supabase sẽ gửi đường dẫn đặt lại mật khẩu.</p>
        {params.message ? <div className="message success">Đã gửi email khôi phục. Vui lòng kiểm tra hộp thư.</div> : null}
        {params.error ? <div className="message error">{params.error}</div> : null}
        <form action={requestPasswordReset} className="form-stack">
          <label>Email<input name="email" type="email" required /></label>
          <button className="button button-primary button-full">Gửi email</button>
        </form>
        <a className="auth-link" href="/login">Quay lại đăng nhập</a>
      </section>
    </main>
  );
}

import { updatePassword } from "../login/actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return <main className="auth-page simple-auth"><section className="auth-card">
    <div className="auth-logo"><img src="/zest-logo.png" alt="ZEST for English" /></div>
    <span className="auth-kicker">Secure account recovery</span>
    <h2>Đặt mật khẩu mới</h2>
    <p>Mật khẩu phải có ít nhất 8 ký tự. Link khôi phục phải được mở trước khi dùng màn hình này.</p>
    {params.error ? <div className="message error">{params.error}</div> : null}
    <form action={updatePassword} className="form-stack">
      <label>Mật khẩu mới<input name="password" type="password" minLength={8} required /></label>
      <label>Xác nhận mật khẩu<input name="confirm_password" type="password" minLength={8} required /></label>
      <button className="button button-primary button-full">Cập nhật mật khẩu</button>
    </form>
  </section></main>;
}

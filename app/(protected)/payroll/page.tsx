import Link from "next/link";
import {
  adminApproveTeacherPayroll,
  adminMarkTeacherPayrollPaid,
  generateTeacherPayrollMonth,
  teacherReviewPayroll,
  updateTeacherHourlyRate
} from "@/app/actions";
import { Field, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function monthValue(value?: string) {
  return /^\d{4}-\d{2}$/.test(value || "")
    ? String(value)
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
}

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `Tháng ${Number(value)}/${year}`;
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "teacher"]);
  const params = await searchParams;
  const supabase = await createClient();
  const month = monthValue(params.month);
  const monthDate = `${month}-01`;

  if (profile.role === "teacher") {
    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .select("id,code,full_name")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!teacher) {
      return <><PageHeader eyebrow="Lương giáo viên" title="Chưa có hồ sơ giáo viên" description="Tài khoản chưa được liên kết với hồ sơ giáo viên." /><Flash error={teacherError?.message} /></>;
    }

    const [{ data: statement }, { data: live }, { data: compensation }, { data: history }] = await Promise.all([
      supabase.from("teacher_payroll_statements")
        .select("id,payroll_month,completed_hours,hourly_rate_snapshot,gross_amount,teacher_status,teacher_note,teacher_reviewed_at,admin_status,admin_note,admin_approved_at")
        .eq("teacher_id", teacher.id).eq("payroll_month", monthDate).maybeSingle(),
      supabase.from("teacher_payroll_live_monthly")
        .select("completed_hours,hourly_rate,estimated_payroll")
        .eq("teacher_id", teacher.id).eq("payroll_month", monthDate).maybeSingle(),
      supabase.from("teacher_compensation_settings")
        .select("hourly_rate,effective_from,note")
        .eq("teacher_id", teacher.id).maybeSingle(),
      supabase.from("teacher_payroll_statements")
        .select("id,payroll_month,completed_hours,gross_amount,teacher_status,admin_status")
        .eq("teacher_id", teacher.id).order("payroll_month", { ascending: false }).limit(12)
    ]);

    const hours = Number(statement?.completed_hours ?? live?.completed_hours ?? 0);
    const rate = Number(statement?.hourly_rate_snapshot ?? live?.hourly_rate ?? compensation?.hourly_rate ?? 0);
    const amount = Number(statement?.gross_amount ?? live?.estimated_payroll ?? hours * rate);
    const isApprovedByTeacher = statement?.teacher_status === "Approved";

    return <>
      <PageHeader eyebrow="Thu nhập của tôi" title={`Bảng lương ${monthLabel(month)}`} description="Kiểm tra số giờ đã hoàn thành, đơn giá và xác nhận bảng lương trước khi Admin duyệt." />
      <Flash message={params.message} error={params.error} />
      <form className="month-filter" method="get"><label>Chọn tháng<input type="month" name="month" defaultValue={month} /></label><button className="button button-primary">Xem</button></form>

      <section className={`payroll-hero ${statement ? "payroll-ready" : ""}`}>
        <div><span>{statement ? "Bảng lương đã được chốt" : "Số liệu tạm tính trong tháng"}</span><h2>{teacher.full_name}</h2><p>{statement ? "Vui lòng kiểm tra trước khi xác nhận." : "Hệ thống tự chốt bảng lương vào ngày cuối tháng."}</p></div>
        <div className="payroll-amount"><small>{isApprovedByTeacher ? "Mức lương đã xác nhận" : "Mức lương dự kiến"}</small><strong>{formatMoney(amount)}</strong><span>{hours.toLocaleString("vi-VN")} giờ × {formatMoney(rate)}</span></div>
      </section>

      <div className="metrics-grid section-gap">
        <MetricCard label="Giờ hoàn thành" value={`${hours.toLocaleString("vi-VN")}h`} tone="green" />
        <MetricCard label="Đơn giá giờ dạy" value={formatMoney(rate)} note={compensation?.effective_from ? `Hiệu lực từ ${compensation.effective_from}` : undefined} />
        <MetricCard label="Xác nhận của GV" value={<Status value={statement?.teacher_status || "Chưa mở"} />} tone={statement?.teacher_status === "Disputed" ? "red" : "yellow"} />
        <MetricCard label="Duyệt của Admin" value={<Status value={statement?.admin_status || "Chưa mở"} />} tone={statement?.admin_status === "Approved" || statement?.admin_status === "Paid" ? "green" : "neutral"} />
      </div>

      <Panel className="section-gap" title="Xác nhận bảng lương" description="Chỉ xác nhận sau khi đã đối chiếu lịch sử buổi dạy trong tháng.">
        {!statement ? <Empty title="Chưa đến kỳ chốt lương" description="Số giờ và mức lương đang được tạm tính. Bảng xác nhận sẽ tự mở vào cuối tháng; Admin cũng có thể tạo thủ công khi cần." /> : statement.admin_status !== "Pending" ?
          <div className="payroll-confirmed"><Status value={statement.admin_status} /><strong>{formatMoney(statement.gross_amount)}</strong><p>Admin duyệt lúc {formatDateTime(statement.admin_approved_at)}.</p></div> :
          statement.teacher_status === "Approved" ? <div className="payroll-confirmed"><Status value="Approved" /><strong>Bạn đã xác nhận {formatMoney(statement.gross_amount)}</strong><p>Đang chờ Admin kiểm tra và duyệt vào bảng chi phí.</p></div> :
          <div className="payroll-review-actions">
            {statement.teacher_status === "Disputed" ? <div className="message error">Bạn đã báo sai lệch: {statement.teacher_note || "Không có ghi chú"}. Có thể xác nhận lại sau khi Admin điều chỉnh.</div> : null}
            <form action={teacherReviewPayroll}>
              <input type="hidden" name="statement_id" value={statement.id} />
              <input type="hidden" name="decision" value="Approved" />
              <input type="hidden" name="return_month" value={month} />
              <button className="button button-primary">Tôi xác nhận số giờ & mức lương</button>
            </form>
            <FormDetails title="Báo sai lệch">
              <form action={teacherReviewPayroll} className="form-stack">
                <input type="hidden" name="statement_id" value={statement.id} />
                <input type="hidden" name="decision" value="Disputed" />
                <input type="hidden" name="return_month" value={month} />
                <TextAreaField label="Nội dung cần kiểm tra" name="note" required placeholder="Ví dụ: thiếu session ngày 25/08 hoặc sai hệ số giờ dạy..." />
                <button className="button button-danger">Gửi Admin kiểm tra</button>
              </form>
            </FormDetails>
          </div>}
      </Panel>

      <Panel className="section-gap" title="Lịch sử bảng lương" description="12 kỳ gần nhất">
        {history?.length ? <div className="table-wrap"><table><thead><tr><th>Tháng</th><th>Số giờ</th><th>Mức lương</th><th>GV xác nhận</th><th>Admin</th></tr></thead><tbody>{history.map((row: any) => <tr key={row.id}><td><Link className="text-link" href={`/payroll?month=${String(row.payroll_month).slice(0, 7)}`}>{monthLabel(String(row.payroll_month).slice(0, 7))}</Link></td><td>{Number(row.completed_hours || 0).toLocaleString("vi-VN")}h</td><td><strong>{formatMoney(row.gross_amount)}</strong></td><td><Status value={row.teacher_status} /></td><td><Status value={row.admin_status} /></td></tr>)}</tbody></table></div> : <Empty title="Chưa có lịch sử lương" description="Bảng lương đầu tiên sẽ xuất hiện sau kỳ chốt tháng." />}
      </Panel>
    </>;
  }

  const [{ data: teachers }, { data: statements }, { data: liveRows }] = await Promise.all([
    supabase.from("teachers")
      .select("id,code,full_name,employment_status,teacher_compensation_settings(hourly_rate,effective_from,note)")
      .is("archived_at", null).order("full_name"),
    supabase.from("teacher_payroll_statements")
      .select("id,teacher_id,payroll_month,completed_hours,hourly_rate_snapshot,gross_amount,teacher_status,teacher_note,teacher_reviewed_at,admin_status,admin_note,admin_approved_at,expense_transaction_id,teachers(code,full_name)")
      .eq("payroll_month", monthDate).order("created_at"),
    supabase.from("teacher_payroll_live_monthly")
      .select("teacher_id,completed_hours,hourly_rate,estimated_payroll")
      .eq("payroll_month", monthDate)
  ]);

  const statementMap = new Map((statements || []).map((row: any) => [row.teacher_id, row]));
  const liveMap = new Map((liveRows || []).map((row: any) => [row.teacher_id, row]));
  const totalHours = (statements || []).reduce((sum: number, row: any) => sum + Number(row.completed_hours || 0), 0);
  const totalPayroll = (statements || []).reduce((sum: number, row: any) => sum + Number(row.gross_amount || 0), 0);
  const teacherApproved = (statements || []).filter((row: any) => row.teacher_status === "Approved").length;
  const adminPending = (statements || []).filter((row: any) => row.teacher_status === "Approved" && row.admin_status === "Pending").length;

  return <>
    <PageHeader eyebrow="Quản trị lương" title={`Lương giáo viên · ${monthLabel(month)}`} description="Admin thiết lập đơn giá, tạo bảng lương, theo dõi xác nhận của GV và duyệt chi phí." actions={<form action={generateTeacherPayrollMonth}><input type="hidden" name="payroll_month" value={month} /><button className="button button-primary">Tổng kết lại tháng này</button></form>} />
    <Flash message={params.message} error={params.error} />
    <nav className="finance-subnav"><Link href="/finance">Thu phí & tái phí</Link><Link href="/finance/expenses">Chi phí</Link><Link className="finance-subnav-active" href="/payroll">Lương giáo viên</Link><Link href="/finance/reports">Báo cáo thu chi</Link></nav>
    <form className="month-filter" method="get"><label>Tháng lương<input type="month" name="month" defaultValue={month} /></label><button className="button button-primary">Xem tháng</button></form>
    <div className="metrics-grid"><MetricCard label="Bảng lương đã tạo" value={statements?.length || 0} /><MetricCard label="Tổng giờ chốt" value={`${totalHours.toLocaleString("vi-VN")}h`} tone="green" /><MetricCard label="Tổng lương dự kiến" value={formatMoney(totalPayroll)} tone="yellow" /><MetricCard label="Chờ Admin duyệt" value={adminPending} note={`${teacherApproved} GV đã xác nhận`} tone={adminPending ? "red" : "neutral"} /></div>

    <Panel className="section-gap" title="Đơn giá giờ dạy" description="Đơn giá được cập nhật tại đây và tự động hiển thị trên giao diện của giáo viên.">
      {teachers?.length ? <div className="rate-settings-grid">{teachers.map((teacher: any) => { const compensation = joined(teacher.teacher_compensation_settings); return <form action={updateTeacherHourlyRate} className="rate-setting-card" key={teacher.id}><input type="hidden" name="teacher_id" value={teacher.id} /><input type="hidden" name="return_month" value={month} /><div><strong>{teacher.full_name}</strong><small>{teacher.code} · {teacher.employment_status}</small></div><Field label="Đơn giá / giờ" name="hourly_rate" type="number" min="1" step="1000" defaultValue={Number(compensation?.hourly_rate || 0) || ""} required /><Field label="Hiệu lực từ" name="effective_from" type="date" defaultValue={compensation?.effective_from || monthDate} required /><Field label="Ghi chú" name="note" defaultValue={compensation?.note || ""} /><button className="button button-secondary button-small">Lưu đơn giá</button></form>; })}</div> : <Empty title="Chưa có giáo viên" description="Tạo hồ sơ giáo viên trước khi thiết lập đơn giá." />}
    </Panel>

    <Panel className="section-gap" title="Duyệt bảng lương" description="Admin chỉ duyệt sau khi giáo viên xác nhận. Khi duyệt, khoản lương tự động nhảy vào bảng chi phí tháng.">
      {teachers?.length ? <div className="table-wrap"><table><thead><tr><th>Giáo viên</th><th>Giờ dạy</th><th>Đơn giá</th><th>Mức lương</th><th>GV xác nhận</th><th>Admin</th><th>Thao tác</th></tr></thead><tbody>{teachers.map((teacher: any) => {
        const row: any = statementMap.get(teacher.id);
        const live: any = liveMap.get(teacher.id);
        const compensation = joined(teacher.teacher_compensation_settings);
        const hours = Number(row?.completed_hours ?? live?.completed_hours ?? 0);
        const rate = Number(row?.hourly_rate_snapshot ?? live?.hourly_rate ?? compensation?.hourly_rate ?? 0);
        const gross = Number(row?.gross_amount ?? live?.estimated_payroll ?? hours * rate);
        return <tr key={teacher.id}><td><strong>{teacher.full_name}</strong><br/><span className="muted">{teacher.code}</span></td><td>{hours.toLocaleString("vi-VN")}h</td><td>{formatMoney(rate)}</td><td><strong>{formatMoney(gross)}</strong></td><td>{row ? <><Status value={row.teacher_status} />{row.teacher_note ? <small className="payroll-note">{row.teacher_note}</small> : null}</> : <Status value="Chưa tạo" />}</td><td>{row ? <Status value={row.admin_status} /> : <Status value="Chưa tạo" />}</td><td>{!row ? <span className="muted">Bấm Tổng kết tháng</span> : row.admin_status === "Pending" && row.teacher_status === "Approved" ? <form action={adminApproveTeacherPayroll}><input type="hidden" name="statement_id" value={row.id} /><input type="hidden" name="return_month" value={month} /><button className="button button-primary button-small">Duyệt & ghi chi phí</button></form> : row.admin_status === "Approved" ? <form action={adminMarkTeacherPayrollPaid}><input type="hidden" name="statement_id" value={row.id} /><input type="hidden" name="return_month" value={month} /><button className="button button-secondary button-small">Đánh dấu đã trả</button></form> : row.teacher_status === "Disputed" ? <span className="status status-red">Cần kiểm tra</span> : <span className="muted">Chờ GV xác nhận</span>}</td></tr>;
      })}</tbody></table></div> : <Empty title="Chưa có giáo viên" description="Không có dữ liệu để tổng kết lương." />}
    </Panel>
  </>;
}

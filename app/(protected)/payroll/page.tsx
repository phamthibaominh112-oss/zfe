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
        .select("id,payroll_month,completed_hours,teaching_hours,ta_hours,tutoring_hours,group_hours,hourly_rate_snapshot,tutoring_rate_snapshot,group_rate_snapshot,ta_hourly_rate_snapshot,tutoring_amount,group_amount,teaching_amount,ta_amount,gross_amount,teacher_status,teacher_note,teacher_reviewed_at,admin_status,admin_note,admin_approved_at")
        .eq("teacher_id", teacher.id).eq("payroll_month", monthDate).maybeSingle(),
      supabase.from("teacher_payroll_live_monthly")
        .select("completed_hours,hourly_rate,estimated_payroll,teaching_hours,ta_hours,tutoring_hours,group_hours,teaching_rate,tutoring_rate,group_rate,ta_hourly_rate,tutoring_amount,group_amount,teaching_amount,ta_amount")
        .eq("teacher_id", teacher.id).eq("payroll_month", monthDate).maybeSingle(),
      supabase.from("teacher_compensation_settings")
        .select("hourly_rate,tutoring_hourly_rate,group_hourly_rate,ta_hourly_rate,effective_from,note")
        .eq("teacher_id", teacher.id).maybeSingle(),
      supabase.from("teacher_payroll_statements")
        .select("id,payroll_month,completed_hours,teaching_hours,ta_hours,tutoring_hours,group_hours,gross_amount,teacher_status,admin_status")
        .eq("teacher_id", teacher.id).order("payroll_month", { ascending: false }).limit(12)
    ]);

    const lockedSnapshot = statement && (statement.teacher_status === "Approved" || statement.admin_status !== "Pending");
    const hours = Number(lockedSnapshot ? statement?.completed_hours : live?.completed_hours ?? statement?.completed_hours ?? 0);
    const rate = Number(lockedSnapshot ? statement?.hourly_rate_snapshot : live?.hourly_rate ?? statement?.hourly_rate_snapshot ?? compensation?.hourly_rate ?? 0);
    const amount = Number(lockedSnapshot ? statement?.gross_amount : live?.estimated_payroll ?? statement?.gross_amount ?? hours * rate);
    const teachingHours = Number(lockedSnapshot ? statement?.teaching_hours : live?.teaching_hours ?? statement?.teaching_hours ?? hours);
    const taHours = Number(lockedSnapshot ? statement?.ta_hours : live?.ta_hours ?? statement?.ta_hours ?? 0);
    const teachingRate = Number(lockedSnapshot ? statement?.hourly_rate_snapshot : live?.teaching_rate ?? statement?.hourly_rate_snapshot ?? rate);
    const taRate = Number(lockedSnapshot ? statement?.ta_hourly_rate_snapshot : live?.ta_hourly_rate ?? statement?.ta_hourly_rate_snapshot ?? compensation?.ta_hourly_rate ?? 0);
    const teachingAmount = Number(lockedSnapshot ? statement?.teaching_amount : live?.teaching_amount ?? statement?.teaching_amount ?? teachingHours * teachingRate);
    const taAmount = Number(lockedSnapshot ? statement?.ta_amount : live?.ta_amount ?? statement?.ta_amount ?? taHours * taRate);
    const tutoringHours = Number(lockedSnapshot ? statement?.tutoring_hours : live?.tutoring_hours ?? statement?.tutoring_hours ?? 0);
    const groupHours = Number(lockedSnapshot ? statement?.group_hours : live?.group_hours ?? statement?.group_hours ?? 0);
    const tutoringRate = Number(lockedSnapshot ? statement?.tutoring_rate_snapshot : live?.tutoring_rate ?? statement?.tutoring_rate_snapshot ?? compensation?.tutoring_hourly_rate ?? compensation?.hourly_rate ?? 0);
    const groupRate = Number(lockedSnapshot ? statement?.group_rate_snapshot : live?.group_rate ?? statement?.group_rate_snapshot ?? compensation?.group_hourly_rate ?? compensation?.hourly_rate ?? 0);
    const tutoringAmount = Number(lockedSnapshot ? statement?.tutoring_amount : live?.tutoring_amount ?? statement?.tutoring_amount ?? tutoringHours*tutoringRate);
    const groupAmount = Number(lockedSnapshot ? statement?.group_amount : live?.group_amount ?? statement?.group_amount ?? groupHours*groupRate);
    const isApprovedByTeacher = statement?.teacher_status === "Approved";

    return <>
      <PageHeader eyebrow="Thu nhập của tôi" title={`Bảng lương ${monthLabel(month)}`} description="Kiểm tra số giờ đã hoàn thành, đơn giá và xác nhận bảng lương trước khi Admin duyệt." actions={<div className="page-actions"><Link className="button button-secondary" href={`/payroll/timesheet?month=${month}`}>Bảng công / PDF</Link><Link className="button button-secondary" href={`/payroll/slip?month=${month}`}>Phiếu lương / PDF</Link><Link className="button button-secondary" href={`/workforce/kpi?month=${month}`}>KPI / PDF</Link></div>} />
      <Flash message={params.message} error={params.error} />
      <form className="month-filter" method="get"><label>Chọn tháng<input type="month" name="month" defaultValue={month} /></label><button className="button button-primary">Xem</button></form>

      <section className={`payroll-hero ${statement ? "payroll-ready" : ""}`}>
        <div><span>{statement ? "Bảng lương đã được chốt" : "Số liệu tạm tính trong tháng"}</span><h2>{teacher.full_name}</h2><p>{statement ? "Vui lòng kiểm tra trước khi xác nhận." : "Hệ thống tự chốt bảng lương vào ngày cuối tháng."}</p></div>
        <div className="payroll-amount"><small>{isApprovedByTeacher ? "Mức lương đã xác nhận" : "Mức lương dự kiến"}</small><strong>{formatMoney(amount)}</strong><span>Kèm {tutoringHours.toLocaleString("vi-VN")}h · Nhóm {groupHours.toLocaleString("vi-VN")}h · TA {taHours.toLocaleString("vi-VN")}h</span></div>
      </section>

      <div className="metrics-grid section-gap">
        <MetricCard label="Kèm · 1–3 HV" value={`${tutoringHours.toLocaleString("vi-VN")}h`} note={`${formatMoney(tutoringRate)}/h · ${formatMoney(tutoringAmount)}`} tone="green" />
        <MetricCard label="Nhóm · >3 HV" value={`${groupHours.toLocaleString("vi-VN")}h`} note={`${formatMoney(groupRate)}/h · ${formatMoney(groupAmount)}`} />
        <MetricCard label="TA / Co-teacher" value={`${taHours.toLocaleString("vi-VN")}h`} note={`${formatMoney(taRate)}/h · ${formatMoney(taAmount)}`} tone="yellow" />
        <MetricCard label="Tổng lương" value={formatMoney(amount)} note={`GV ${statement?.teacher_status || "Chưa mở"} · Admin ${statement?.admin_status || "Chưa mở"}`} tone="neutral" />
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
        {history?.length ? <div className="table-wrap"><table><thead><tr><th>Tháng</th><th>Kèm</th><th>Nhóm</th><th>TA</th><th>Mức lương</th><th>GV xác nhận</th><th>Admin</th></tr></thead><tbody>{history.map((row: any) => <tr key={row.id}><td><Link className="text-link" href={`/payroll?month=${String(row.payroll_month).slice(0, 7)}`}>{monthLabel(String(row.payroll_month).slice(0, 7))}</Link></td><td>{Number(row.tutoring_hours || 0).toLocaleString("vi-VN")}h</td><td>{Number(row.group_hours || 0).toLocaleString("vi-VN")}h</td><td>{Number(row.ta_hours || 0).toLocaleString("vi-VN")}h</td><td><strong>{formatMoney(row.gross_amount)}</strong></td><td><Status value={row.teacher_status} /></td><td><Status value={row.admin_status} /></td></tr>)}</tbody></table></div> : <Empty title="Chưa có lịch sử lương" description="Bảng lương đầu tiên sẽ xuất hiện sau kỳ chốt tháng." />}
      </Panel>
    </>;
  }

  const [{ data: teachers }, { data: statements }, { data: liveRows }] = await Promise.all([
    supabase.from("teachers")
      .select("id,code,full_name,employment_status,teacher_compensation_settings(hourly_rate,tutoring_hourly_rate,group_hourly_rate,ta_hourly_rate,effective_from,note)")
      .is("archived_at", null).order("full_name"),
    supabase.from("teacher_payroll_statements")
      .select("id,teacher_id,payroll_month,completed_hours,teaching_hours,ta_hours,tutoring_hours,group_hours,hourly_rate_snapshot,tutoring_rate_snapshot,group_rate_snapshot,ta_hourly_rate_snapshot,tutoring_amount,group_amount,teaching_amount,ta_amount,gross_amount,teacher_status,teacher_note,teacher_reviewed_at,admin_status,admin_note,admin_approved_at,expense_transaction_id,teachers(code,full_name)")
      .eq("payroll_month", monthDate).order("created_at"),
    supabase.from("teacher_payroll_live_monthly")
      .select("teacher_id,completed_hours,hourly_rate,estimated_payroll,teaching_hours,ta_hours,tutoring_hours,group_hours,teaching_rate,tutoring_rate,group_rate,ta_hourly_rate,tutoring_amount,group_amount,teaching_amount,ta_amount")
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
      {teachers?.length ? <div className="rate-settings-grid rate-card-grid">{teachers.map((teacher: any) => { const compensation = joined(teacher.teacher_compensation_settings); return <form action={updateTeacherHourlyRate} className="rate-setting-card rate-card-setting" key={teacher.id}><input type="hidden" name="teacher_id" value={teacher.id} /><input type="hidden" name="return_month" value={month} /><div className="rate-card-teacher"><strong>{teacher.full_name}</strong><small>{teacher.code} · {teacher.employment_status}</small></div><Field label="Kèm · 1–3 HV / giờ" name="tutoring_hourly_rate" type="number" min="50000" max="1500000" step="1000" defaultValue={Number(compensation?.tutoring_hourly_rate || compensation?.hourly_rate || 0) || ""} required /><Field label="Nhóm · >3 HV / giờ" name="group_hourly_rate" type="number" min="50000" max="1500000" step="1000" defaultValue={Number(compensation?.group_hourly_rate || compensation?.hourly_rate || 0) || ""} required /><Field label="TA / giờ" name="ta_hourly_rate" type="number" min="0" max="1500000" step="1000" defaultValue={Number(compensation?.ta_hourly_rate || 0) || ""} required /><Field label="Hiệu lực từ" name="effective_from" type="date" defaultValue={compensation?.effective_from || monthDate} required /><Field label="Ghi chú" name="note" defaultValue={compensation?.note || ""} /><button className="button button-primary rate-save-button">Lưu Rate Card</button></form>; })}</div> : <Empty title="Chưa có giáo viên" description="Tạo hồ sơ giáo viên trước khi thiết lập Rate Card." />}
    </Panel>

    <Panel className="section-gap" title="Duyệt bảng lương" description="Admin chỉ duyệt sau khi giáo viên xác nhận. Khi duyệt, khoản lương tự động nhảy vào bảng chi phí tháng.">
      {teachers?.length ? <div className="table-wrap payroll-admin-table-wrap"><table className="payroll-admin-table"><thead><tr><th>Giáo viên</th><th>Kèm 1–3</th><th>Nhóm &gt;3</th><th>TA</th><th>Mức lương</th><th>GV xác nhận</th><th>Admin</th><th>Thao tác</th></tr></thead><tbody>{teachers.map((teacher: any) => {
        const row: any = statementMap.get(teacher.id);
        const live: any = liveMap.get(teacher.id);
        const compensation = joined(teacher.teacher_compensation_settings);
        const hours = Number(row?.completed_hours ?? live?.completed_hours ?? 0);
        const rate = Number(row?.hourly_rate_snapshot ?? live?.hourly_rate ?? compensation?.hourly_rate ?? 0);
        const gross = Number(row?.gross_amount ?? live?.estimated_payroll ?? hours * rate);
        const teachingHours=Number(row?.teaching_hours ?? live?.teaching_hours ?? hours); const taHours=Number(row?.ta_hours ?? live?.ta_hours ?? 0); const teachingRate=Number(row?.hourly_rate_snapshot ?? live?.teaching_rate ?? rate); const taRate=Number(row?.ta_hourly_rate_snapshot ?? live?.ta_hourly_rate ?? compensation?.ta_hourly_rate ?? 0); const teachingAmount=Number(row?.teaching_amount ?? live?.teaching_amount ?? teachingHours*teachingRate); const taAmount=Number(row?.ta_amount ?? live?.ta_amount ?? taHours*taRate); const tutoringHours=Number(row?.tutoring_hours ?? live?.tutoring_hours ?? 0); const groupHours=Number(row?.group_hours ?? live?.group_hours ?? 0); const tutoringRate=Number(row?.tutoring_rate_snapshot ?? live?.tutoring_rate ?? compensation?.tutoring_hourly_rate ?? compensation?.hourly_rate ?? 0); const groupRate=Number(row?.group_rate_snapshot ?? live?.group_rate ?? compensation?.group_hourly_rate ?? compensation?.hourly_rate ?? 0); const tutoringAmount=Number(row?.tutoring_amount ?? live?.tutoring_amount ?? tutoringHours*tutoringRate); const groupAmount=Number(row?.group_amount ?? live?.group_amount ?? groupHours*groupRate);
        return <tr key={teacher.id}><td><strong>{teacher.full_name}</strong><br/><span className="muted">{teacher.code}</span></td><td><strong>{tutoringHours.toLocaleString("vi-VN")}h</strong><br/><span className="muted">{formatMoney(tutoringRate)}/h · {formatMoney(tutoringAmount)}</span></td><td><strong>{groupHours.toLocaleString("vi-VN")}h</strong><br/><span className="muted">{formatMoney(groupRate)}/h · {formatMoney(groupAmount)}</span></td><td><strong>{taHours.toLocaleString("vi-VN")}h</strong><br/><span className="muted">{formatMoney(taRate)}/h · {formatMoney(taAmount)}</span></td><td><strong>{formatMoney(gross)}</strong><br/><span className="muted">Kèm {formatMoney(tutoringAmount)} · Nhóm {formatMoney(groupAmount)} · TA {formatMoney(taAmount)}</span></td><td>{row ? <><Status value={row.teacher_status} />{row.teacher_note ? <small className="payroll-note">{row.teacher_note}</small> : null}</> : <Status value="Chưa tạo" />}</td><td>{row ? <Status value={row.admin_status} /> : <Status value="Chưa tạo" />}</td><td><div className="payroll-row-actions"><Link className="button button-ghost button-small" href={`/payroll/timesheet?month=${month}&teacher_id=${teacher.id}`}>Bảng công</Link><Link className="button button-ghost button-small" href={`/payroll/slip?month=${month}&teacher_id=${teacher.id}`}>Phiếu lương</Link><Link className="button button-ghost button-small" href={`/workforce/kpi?month=${month}&teacher_id=${teacher.id}`}>KPI</Link>{!row ? <span className="muted">Bấm Tổng kết tháng</span> : row.admin_status === "Pending" && row.teacher_status === "Approved" ? <form action={adminApproveTeacherPayroll}><input type="hidden" name="statement_id" value={row.id} /><input type="hidden" name="return_month" value={month} /><button className="button button-primary button-small">Duyệt & ghi chi phí</button></form> : row.admin_status === "Approved" ? <form action={adminMarkTeacherPayrollPaid}><input type="hidden" name="statement_id" value={row.id} /><input type="hidden" name="return_month" value={month} /><button className="button button-secondary button-small">Đánh dấu đã trả</button></form> : row.teacher_status === "Disputed" ? <span className="status status-red">Cần kiểm tra</span> : <span className="muted">Chờ GV xác nhận</span>}</div></td></tr>;
      })}</tbody></table></div> : <Empty title="Chưa có giáo viên" description="Không có dữ liệu để tổng kết lương." />}
    </Panel>
  </>;
}

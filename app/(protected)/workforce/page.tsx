import Link from "next/link";
import {
  adminApproveStaffPayroll,
  adminMarkStaffPayrollPaid,
  createStaffWorkSchedule,
  generateStaffPayrollMonth,
  staffReviewPayroll,
  staffWorkCheckIn,
  staffWorkCheckOut,
  teacherSessionCheckIn,
  teacherSessionCheckOut,
  updateStaffHourlyRate
} from "@/app/actions";
import { Field, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { dateOnlyString, vietnamTodayString, vietnamWeek } from "@/lib/vietnam-date";
import { createClient } from "@/lib/supabase/server";

function monthValue(value?: string) {
  return /^\d{4}-\d{2}$/.test(value || "")
    ? String(value)
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
}

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return `Tháng ${Number(m)}/${year}`;
}

function pct(value: unknown) {
  return value == null ? "—" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "academic_manager", "customer_service", "teacher"]);
  const params = await searchParams;
  const supabase = await createClient();
  const month = monthValue(params.month);
  const monthDate = `${month}-01`;
  const today = vietnamTodayString();
  const week = vietnamWeek(Number(params.week || 0));
  const weekStart = dateOnlyString(week[0]);
  const weekEnd = dateOnlyString(week[6]);

  if (profile.role === "teacher") {
    const { data: teacher } = await supabase.from("teachers").select("id,code,full_name").eq("user_id", profile.id).maybeSingle();
    if (!teacher) return <><PageHeader eyebrow="Chấm công giảng dạy" title="Chưa có hồ sơ giáo viên" description="Tài khoản chưa được liên kết với hồ sơ giáo viên." /></>;

    const [{ data: sessionRows }, { data: kpiLive }, { data: kpiSnapshot }, { data: payrollLive }] = await Promise.all([
      supabase.from("teacher_session_compliance")
        .select("session_id,class_code,session_no,scheduled_date,start_time,end_time,duration_hours,session_status,check_in_at,check_out_at,late_minutes,payroll_eligible,punctual,assignment_published_at,assignment_compliant")
        .eq("teacher_id", teacher.id).gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd).order("scheduled_date").order("start_time"),
      supabase.from("teacher_kpi_live_monthly").select("*").eq("teacher_id", teacher.id).eq("kpi_month", monthDate).maybeSingle(),
      supabase.from("teacher_kpi_snapshots").select("*").eq("teacher_id", teacher.id).eq("kpi_month", monthDate).maybeSingle(),
      supabase.from("teacher_payroll_live_monthly").select("completed_hours,hourly_rate,estimated_payroll").eq("teacher_id", teacher.id).eq("payroll_month", monthDate).maybeSingle()
    ]);
    const kpi = kpiSnapshot || kpiLive;
    const todaySessions = (sessionRows || []).filter((row: any) => row.scheduled_date === today);
    const eligibleHours = Number(payrollLive?.completed_hours || 0);

    return <>
      <PageHeader eyebrow="Chấm công & KPI" title={`Giảng dạy · ${teacher.full_name}`} description="Check-in trước giờ học, Check-out khi kết thúc. Từ ngày áp dụng, chỉ buổi có đủ Check-in/Check-out mới được tính vào giờ lương." actions={<Link className="button button-secondary" href={`/workforce/kpi?month=${month}`}>Xem / in KPI tháng</Link>} />
      <Flash message={params.message} error={params.error} />
      <form className="month-filter" method="get"><label>Tháng theo dõi<input type="month" name="month" defaultValue={month} /></label><button className="button button-primary">Xem tháng</button></form>

      <div className="metrics-grid">
        <MetricCard label="Giờ đủ điều kiện lương" value={`${eligibleHours.toLocaleString("vi-VN")}h`} note="Completed + đủ Check-in/Check-out" tone="green" />
        <MetricCard label="Punctuality" value={pct(kpi?.punctuality_rate)} note={`${Number(kpi?.punctual_sessions || 0)}/${Number(kpi?.total_sessions || 0)} buổi đúng giờ`} />
        <MetricCard label="Giao BTVN ≤ 24h" value={pct(kpi?.assignment_compliance_rate)} note={`${Number(kpi?.assignment_compliant_sessions || 0)}/${Number(kpi?.total_sessions || 0)} session`} tone="yellow" />
        <MetricCard label="Chấm bài ≤ 7 ngày" value={pct(kpi?.grading_compliance_rate)} note={`${Number(kpi?.grading_pending_count || 0)} bài chưa tới hạn`} tone="green" />
      </div>

      <Panel className="section-gap" title="Buổi dạy hôm nay" description="Check-in mở trong vòng 60 phút trước giờ học. Check-out mở từ 10 phút trước giờ kết thúc để xác nhận hoàn thành ca dạy.">
        {todaySessions.length ? <div className="workforce-session-list">{todaySessions.map((row: any) => <article className="workforce-session-card" key={row.session_id}>
          <div className="workforce-session-main"><span>{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}</span><strong>{row.class_code} · Buổi {row.session_no}</strong><small>{Number(row.duration_hours || 0).toLocaleString("vi-VN")} giờ · <Status value={row.session_status} /></small></div>
          <div className="workforce-clock-state">
            <span>Check-in</span><strong>{row.check_in_at ? formatDateTime(row.check_in_at) : "Chưa check-in"}</strong>
            {row.late_minutes ? <small className="text-danger">Trễ {row.late_minutes} phút</small> : row.check_in_at ? <small>Đúng giờ</small> : null}
          </div>
          <div className="workforce-clock-state"><span>Check-out</span><strong>{row.check_out_at ? formatDateTime(row.check_out_at) : "Chưa check-out"}</strong><small>{row.payroll_eligible ? "Đủ điều kiện lương" : "Chưa đủ điều kiện"}</small></div>
          <div className="workforce-clock-actions">
            {!row.check_in_at ? <form action={teacherSessionCheckIn}><input type="hidden" name="session_id" value={row.session_id}/><input type="hidden" name="return_path" value="/workforce"/><button className="button button-primary">Check-in</button></form> : null}
            {row.check_in_at && !row.check_out_at ? <form action={teacherSessionCheckOut} className="workforce-checkout-form"><input type="hidden" name="session_id" value={row.session_id}/><input type="hidden" name="return_path" value="/workforce"/><input className="input" name="topic" placeholder="Topic đã dạy (optional)"/><button className="button button-yellow">Check-out & kết thúc</button></form> : null}
            {row.check_out_at ? <Status value="Completed"/> : null}
          </div>
        </article>)}</div> : <Empty title="Hôm nay chưa có buổi dạy" description="Kiểm tra Lịch dạy để xem các session trong tuần." />}
      </Panel>

      <Panel className="section-gap" title={`KPI tuân thủ · ${monthLabel(month)}`} description="Tự động tính từ dữ liệu portal, không nhập tay." action={<Link className="text-link" href={`/workforce/kpi?month=${month}`}>Chi tiết & lưu PDF →</Link>}>
        {kpi ? <div className="compliance-grid"><div><span>Punctuality</span><strong>{pct(kpi.punctuality_rate)}</strong><small>Check-in đúng giờ</small></div><div><span>Assignment compliance</span><strong>{pct(kpi.assignment_compliance_rate)}</strong><small>Publish BTVN trong 24h sau session</small></div><div><span>Grading compliance</span><strong>{pct(kpi.grading_compliance_rate)}</strong><small>Chấm bài trong 7 ngày từ lúc HV nộp</small></div><div className="compliance-overall"><span>KPI tổng hợp</span><strong>{pct(kpi.overall_compliance_rate)}</strong><small>{kpiSnapshot ? "Đã chốt snapshot" : "Số liệu live"}</small></div></div> : <Empty title="Chưa có KPI trong tháng" description="KPI bắt đầu tính từ ngày áp dụng Check-in/Check-out và các session hoàn thành sau đó." />}
      </Panel>

      <Panel className="section-gap" title="Quy chuẩn tuân thủ" description="Áp dụng tự động cho các buổi thuộc KPI.">
        <div className="policy-cards"><div><b>01</b><strong>Đúng giờ</strong><span>Check-in không muộn hơn giờ bắt đầu session.</span></div><div><b>02</b><strong>Giao BTVN trong 24 giờ</strong><span>Assignment phải gắn đúng session và được Publish trong 24h sau giờ kết thúc.</span></div><div><b>03</b><strong>Chấm trong 7 ngày</strong><span>Bài HV đã nộp phải có graded_at trong 7 ngày tính từ submitted_at.</span></div></div>
      </Panel>
    </>;
  }

  if (profile.role === "academic_manager" || profile.role === "customer_service") {
    const [{ data: schedules }, { data: live }, { data: compensation }, { data: statement }] = await Promise.all([
      supabase.from("staff_work_schedules").select("id,work_date,start_time,end_time,work_mode,location,note,status,staff_work_logs(id,check_in_at,check_out_at,late_minutes,status)").eq("user_id", profile.id).gte("work_date", weekStart).lte("work_date", weekEnd).order("work_date").order("start_time"),
      supabase.from("staff_work_live_monthly").select("worked_hours,completed_shifts,punctual_shifts,hourly_rate,estimated_payroll").eq("user_id", profile.id).eq("work_month", monthDate).maybeSingle(),
      supabase.from("staff_compensation_settings").select("hourly_rate,effective_from,note").eq("user_id", profile.id).maybeSingle(),
      supabase.from("staff_payroll_statements").select("id,worked_hours,hourly_rate_snapshot,gross_amount,employee_status,employee_note,admin_status,admin_approved_at").eq("user_id", profile.id).eq("payroll_month", monthDate).maybeSingle()
    ]);
    const hours = Number(statement?.worked_hours ?? live?.worked_hours ?? 0);
    const rate = Number(statement?.hourly_rate_snapshot ?? live?.hourly_rate ?? compensation?.hourly_rate ?? 0);
    const amount = Number(statement?.gross_amount ?? live?.estimated_payroll ?? hours * rate);
    const todayRows = (schedules || []).filter((row:any)=>row.work_date===today);

    return <>
      <PageHeader eyebrow="Lịch làm & chấm công" title={`Chào ${profile.full_name}`} description="Đăng ký lịch làm theo tuần, Check-in/Check-out và theo dõi tổng giờ công tháng." actions={<FormDetails title="+ Đăng ký lịch làm"><form action={createStaffWorkSchedule} className="form-stack"><Field label="Ngày làm" name="work_date" type="date" defaultValue={today} required/><Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/><SelectField label="Hình thức" name="work_mode" required defaultValue="Office" options={["Office","Remote","Hybrid"].map(v=>({value:v,label:v}))}/><Field label="Địa điểm" name="location" placeholder="Văn phòng / cơ sở"/><TextAreaField label="Ghi chú" name="note"/><button className="button button-primary">Lưu lịch làm</button></form></FormDetails>} />
      <Flash message={params.message} error={params.error}/>
      <form className="month-filter" method="get"><label>Tháng công<input type="month" name="month" defaultValue={month}/></label><button className="button button-primary">Xem</button></form>
      <div className="metrics-grid"><MetricCard label="Giờ công tháng" value={`${hours.toLocaleString("vi-VN")}h`} tone="green"/><MetricCard label="Ca đã hoàn tất" value={Number(live?.completed_shifts || 0)} /><MetricCard label="Đơn giá / giờ" value={formatMoney(rate)} note={compensation?.effective_from ? `Hiệu lực ${formatDate(compensation.effective_from)}` : "Admin chưa thiết lập"} tone="yellow"/><MetricCard label="Lương dự kiến" value={formatMoney(amount)} tone="green"/></div>

      <Panel className="section-gap" title="Ca làm hôm nay" description="Giờ công được tính trong khung giờ đã đăng ký. Check-in sớm không làm tăng giờ công.">
        {todayRows.length ? <div className="workforce-session-list">{todayRows.map((row:any)=>{ const log=joined(row.staff_work_logs); return <article className="workforce-session-card" key={row.id}><div className="workforce-session-main"><span>{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}</span><strong>{row.work_mode} · {row.location || "Chưa ghi địa điểm"}</strong><small><Status value={row.status}/></small></div><div className="workforce-clock-state"><span>Check-in</span><strong>{log?.check_in_at ? formatDateTime(log.check_in_at) : "Chưa check-in"}</strong>{log?.late_minutes ? <small className="text-danger">Trễ {log.late_minutes} phút</small> : null}</div><div className="workforce-clock-state"><span>Check-out</span><strong>{log?.check_out_at ? formatDateTime(log.check_out_at) : "Chưa check-out"}</strong></div><div className="workforce-clock-actions">{!log?.check_in_at ? <form action={staffWorkCheckIn}><input type="hidden" name="schedule_id" value={row.id}/><button className="button button-primary">Check-in</button></form> : null}{log?.check_in_at && !log?.check_out_at ? <form action={staffWorkCheckOut}><input type="hidden" name="schedule_id" value={row.id}/><button className="button button-yellow">Check-out</button></form> : null}{log?.check_out_at ? <Status value="Completed"/> : null}</div></article>;})}</div> : <Empty title="Hôm nay chưa đăng ký ca làm" description="Bấm + Đăng ký lịch làm để tạo ca và chấm công."/>}
      </Panel>

      <Panel className="section-gap" title="Lịch làm tuần này" description={`${formatDate(weekStart)} – ${formatDate(weekEnd)}`}>
        {schedules?.length ? <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Giờ</th><th>Hình thức</th><th>Check-in</th><th>Check-out</th><th>Trạng thái</th></tr></thead><tbody>{schedules.map((row:any)=>{ const log=joined(row.staff_work_logs); return <tr key={row.id}><td>{formatDate(row.work_date)}</td><td>{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}</td><td>{row.work_mode}<br/><span className="muted">{row.location || "—"}</span></td><td>{formatDateTime(log?.check_in_at)}</td><td>{formatDateTime(log?.check_out_at)}</td><td><Status value={log?.status || row.status}/></td></tr>;})}</tbody></table></div> : <Empty title="Chưa có lịch làm tuần này" description="Đăng ký ca làm để Admin theo dõi và hệ thống tính giờ công."/>}
      </Panel>

      <Panel className="section-gap" title={`Tất toán lương · ${monthLabel(month)}`} description="Cuối tháng hệ thống chốt giờ công × đơn giá. Nhân sự xác nhận trước khi Admin duyệt vào chi phí.">
        {!statement ? <Empty title="Chưa mở bảng lương" description="Giờ công vẫn được cộng live. Bảng xác nhận sẽ được tạo vào cuối tháng hoặc khi Admin tổng kết."/> : statement.admin_status!=="Pending" ? <div className="payroll-confirmed"><Status value={statement.admin_status}/><strong>{formatMoney(statement.gross_amount)}</strong><p>Đã được Admin xử lý.</p></div> : statement.employee_status==="Approved" ? <div className="payroll-confirmed"><Status value="Approved"/><strong>{formatMoney(statement.gross_amount)}</strong><p>Đang chờ Admin duyệt vào bảng chi phí.</p></div> : <div className="payroll-review-actions">{statement.employee_status==="Disputed" ? <div className="message error">Đã báo sai lệch: {statement.employee_note || "Không có ghi chú"}</div> : null}<form action={staffReviewPayroll}><input type="hidden" name="statement_id" value={statement.id}/><input type="hidden" name="decision" value="Approved"/><button className="button button-primary">Xác nhận giờ công & mức lương</button></form><FormDetails title="Báo sai lệch"><form action={staffReviewPayroll} className="form-stack"><input type="hidden" name="statement_id" value={statement.id}/><input type="hidden" name="decision" value="Disputed"/><TextAreaField label="Nội dung cần kiểm tra" name="note" required/><button className="button button-danger">Gửi Admin</button></form></FormDetails></div>}
      </Panel>
    </>;
  }

  const [{ data: staff }, { data: schedules }, { data: liveRows }, { data: statements }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,role,is_active,staff_compensation_settings(hourly_rate,effective_from,note)").in("role", ["academic_manager","customer_service"]).eq("is_active", true).order("full_name"),
    supabase.from("staff_work_schedules").select("id,user_id,role,work_date,start_time,end_time,work_mode,location,status,profiles(full_name,role),staff_work_logs(check_in_at,check_out_at,late_minutes,status)").gte("work_date", weekStart).lte("work_date", weekEnd).order("work_date").order("start_time"),
    supabase.from("staff_work_live_monthly").select("user_id,full_name,role,worked_hours,completed_shifts,punctual_shifts,hourly_rate,estimated_payroll").eq("work_month", monthDate),
    supabase.from("staff_payroll_statements").select("id,user_id,role,worked_hours,hourly_rate_snapshot,gross_amount,employee_status,employee_note,admin_status,expense_transaction_id,profiles(full_name)").eq("payroll_month", monthDate)
  ]);
  const liveMap=new Map((liveRows||[]).map((row:any)=>[row.user_id,row]));
  const statementMap=new Map((statements||[]).map((row:any)=>[row.user_id,row]));
  const staffOptions=(staff||[]).map((row:any)=>({value:row.id,label:`${row.full_name} · ${row.role==="academic_manager"?"Academic":"CSKH"}`}));
  const totalHours=(liveRows||[]).reduce((sum:number,row:any)=>sum+Number(row.worked_hours||0),0);
  const totalPayroll=(liveRows||[]).reduce((sum:number,row:any)=>sum+Number(row.estimated_payroll||0),0);

  return <>
    <PageHeader eyebrow="Workforce Operations" title="Lịch làm, chấm công & lương nhân sự" description="Theo dõi lịch làm của Academic/CSKH, giờ công tháng và tất toán lương." actions={<div className="page-actions"><FormDetails title="+ Xếp lịch nhân sự"><form action={createStaffWorkSchedule} className="form-stack"><SelectField label="Nhân sự" name="user_id" options={staffOptions} required/><Field label="Ngày làm" name="work_date" type="date" defaultValue={today} required/><Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/><SelectField label="Hình thức" name="work_mode" required defaultValue="Office" options={["Office","Remote","Hybrid"].map(v=>({value:v,label:v}))}/><Field label="Địa điểm" name="location"/><TextAreaField label="Ghi chú" name="note"/><button className="button button-primary">Lưu lịch</button></form></FormDetails><Link className="button button-secondary" href={`/workforce/kpi?month=${month}`}>KPI giáo viên</Link></div>} />
    <Flash message={params.message} error={params.error}/>
    <form className="month-filter" method="get"><label>Tháng tính công<input type="month" name="month" defaultValue={month}/></label><button className="button button-primary">Xem</button></form>
    <div className="metrics-grid"><MetricCard label="Nhân sự chấm công" value={staff?.length||0}/><MetricCard label="Tổng giờ công tháng" value={`${totalHours.toLocaleString("vi-VN")}h`} tone="green"/><MetricCard label="Lương live dự kiến" value={formatMoney(totalPayroll)} tone="yellow"/><MetricCard label="Bảng lương chờ duyệt" value={(statements||[]).filter((x:any)=>x.employee_status==="Approved"&&x.admin_status==="Pending").length} tone="red"/></div>

    <Panel className="section-gap" title="Đơn giá nhân sự" description="Admin set đơn giá theo giờ cho Academic và CSKH. Mức này hiển thị ngay trên tài khoản nhân sự.">
      {staff?.length ? <div className="rate-settings-grid">{staff.map((row:any)=>{ const comp=joined(row.staff_compensation_settings); return <form action={updateStaffHourlyRate} className={`rate-setting-card ${Number(comp?.hourly_rate||0)<=0?"rate-missing":""}`} key={row.id}><input type="hidden" name="user_id" value={row.id}/><div><strong>{row.full_name}</strong><small>{row.role==="academic_manager"?"Academic":"CSKH"}</small></div><Field label="Đơn giá / giờ" name="hourly_rate" type="number" min="20000" max="1500000" step="1000" defaultValue={Number(comp?.hourly_rate||0)||""} required/><Field label="Hiệu lực từ" name="effective_from" type="date" defaultValue={comp?.effective_from||monthDate} required/><Field label="Ghi chú" name="note" defaultValue={comp?.note||""}/><button className="button button-primary rate-save-button">Lưu đơn giá</button></form>;})}</div> : <Empty title="Chưa có nhân sự Academic/CSKH" description="Tạo tài khoản và role trước khi thiết lập đơn giá."/>}
    </Panel>

    <Panel className="section-gap" title="Lịch làm tuần này" description={`${formatDate(weekStart)} – ${formatDate(weekEnd)} · Admin xem toàn bộ Academic và CSKH`}>
      {schedules?.length ? <div className="table-wrap"><table><thead><tr><th>Nhân sự</th><th>Ngày</th><th>Ca</th><th>Check-in</th><th>Check-out</th><th>Trễ</th></tr></thead><tbody>{schedules.map((row:any)=>{ const p=joined(row.profiles); const log=joined(row.staff_work_logs); return <tr key={row.id}><td><strong>{p?.full_name||"—"}</strong><br/><span className="muted">{p?.role==="academic_manager"?"Academic":"CSKH"}</span></td><td>{formatDate(row.work_date)}</td><td>{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}<br/><span className="muted">{row.work_mode} · {row.location||"—"}</span></td><td>{formatDateTime(log?.check_in_at)}</td><td>{formatDateTime(log?.check_out_at)}</td><td>{log?.late_minutes ? `${log.late_minutes} phút` : log?.check_in_at ? "Đúng giờ" : "—"}</td></tr>;})}</tbody></table></div> : <Empty title="Chưa có lịch làm tuần này" description="Nhân sự có thể tự đăng ký hoặc Admin xếp lịch."/>}
    </Panel>

    <Panel className="section-gap" title={`Tất toán lương nhân sự · ${monthLabel(month)}`} description="Tổng kết giờ công, chờ nhân sự xác nhận, sau đó Admin duyệt để tự ghi vào chi phí.">
      <div className="panel-toolbar"><form action={generateStaffPayrollMonth}><input type="hidden" name="payroll_month" value={month}/><button className="button button-primary">Tổng kết lương nhân sự</button></form></div>
      {staff?.length ? <div className="table-wrap"><table><thead><tr><th>Nhân sự</th><th>Giờ công</th><th>Đơn giá</th><th>Lương</th><th>Nhân sự</th><th>Admin</th><th>Thao tác</th></tr></thead><tbody>{staff.map((row:any)=>{ const live:any=liveMap.get(row.id); const statement:any=statementMap.get(row.id); const comp=joined(row.staff_compensation_settings); const hours=Number(statement?.worked_hours??live?.worked_hours??0); const rate=Number(statement?.hourly_rate_snapshot??live?.hourly_rate??comp?.hourly_rate??0); const gross=Number(statement?.gross_amount??live?.estimated_payroll??hours*rate); return <tr key={row.id}><td><strong>{row.full_name}</strong><br/><span className="muted">{row.role==="academic_manager"?"Academic":"CSKH"}</span></td><td>{hours.toLocaleString("vi-VN")}h</td><td>{formatMoney(rate)}</td><td><strong>{formatMoney(gross)}</strong></td><td><Status value={statement?.employee_status||"Chưa tạo"}/>{statement?.employee_note?<small className="payroll-note">{statement.employee_note}</small>:null}</td><td><Status value={statement?.admin_status||"Chưa tạo"}/></td><td>{!statement?<span className="muted">Chưa tổng kết</span>:statement.employee_status==="Approved"&&statement.admin_status==="Pending"?<form action={adminApproveStaffPayroll}><input type="hidden" name="statement_id" value={statement.id}/><button className="button button-primary button-small">Duyệt & ghi chi phí</button></form>:statement.admin_status==="Approved"?<form action={adminMarkStaffPayrollPaid}><input type="hidden" name="statement_id" value={statement.id}/><button className="button button-secondary button-small">Đánh dấu đã trả</button></form>:statement.employee_status==="Disputed"?<span className="status status-red">Cần kiểm tra</span>:<span className="muted">Chờ xác nhận</span>}</td></tr>;})}</tbody></table></div> : <Empty title="Chưa có nhân sự" description="Không có dữ liệu để tính lương."/>}
    </Panel>
  </>;
}

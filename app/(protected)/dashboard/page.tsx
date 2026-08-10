import { rateTeacher, submitAssignment, teacherReviewPayroll, updateTeacherHourlyRate } from "@/app/actions";
import Link from "next/link";
import { PageHeader, MetricCard, Panel, Status, Flash, Empty } from "@/components/ui";
import { Field } from "@/components/forms";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, sessionDisplayLabel } from "@/lib/format";
import { dateOnlyString, vietnamTodayDate, vietnamTodayString } from "@/lib/vietnam-date";
import type { CSSProperties, ReactNode } from "react";

function weekRange() {
  const now = vietnamTodayDate();
  const day = now.getUTCDay() || 7;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [dateOnlyString(start), dateOnlyString(end)];
}

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function teacherNames(session: any) {
  return (session?.session_teachers || []).map((link: any) => joined(link.teachers)?.full_name).filter(Boolean).join(", ") || "Chưa phân giáo viên";
}

function QuickAction({ href, icon, title, description, tone = "blue" }: { href: string; icon: string; title: string; description: string; tone?: "blue" | "yellow" | "green" }) {
  return <Link className={`quick-action quick-${tone}`} href={href}><span className="quick-icon">{icon}</span><div><strong>{title}</strong><small>{description}</small></div><b>→</b></Link>;
}

function DashboardHero({ label, title, description, meta, actions }: { label: string; title: string; description: string; meta?: ReactNode; actions?: ReactNode }) {
  return <section className="dashboard-hero"><div className="dashboard-hero-copy"><span>{label}</span><h2>{title}</h2><p>{description}</p>{meta ? <div className="hero-meta">{meta}</div> : null}</div>{actions ? <div className="hero-actions">{actions}</div> : null}</section>;
}

function SessionList({ sessions, emptyTitle, emptyDescription }: { sessions: any[]; emptyTitle: string; emptyDescription: string }) {
  if (!sessions.length) return <Empty title={emptyTitle} description={emptyDescription} />;
  return <div className="agenda-list">{sessions.map((item: any) => {
    const classRow = joined(item.classes);
    return <div className="agenda-item" key={item.id}><div className="agenda-time"><strong>{item.start_time?.slice(0,5) || "—"}</strong><span>{formatDate(item.scheduled_date)}</span></div><div className="agenda-main"><strong>{classRow?.code || "Lớp"} · {sessionDisplayLabel(item.status,item.session_no)}</strong><span>{classRow?.name || item.topic || "Buổi học"} · {teacherNames(item)}</span></div><Status value={item.status} /></div>;
  })}</div>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;
  const [weekStart, weekEnd] = weekRange();
  const today = vietnamTodayString();

  if (profile.role === "admin" || profile.role === "academic_manager") {
    const [students, activeClasses, waitingStudents, weekSessions, pendingFeedback, observations] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("status", "Active").is("archived_at", null),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "Waiting for class").is("archived_at", null),
      supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,topic,classes(code,name),session_teachers(role,teachers(id,full_name))").gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd).is("archived_at", null).order("scheduled_date").order("start_time"),
      supabase.from("progress_feedback").select("id,enrollment_id,milestone,status", { count: "exact" }).eq("status", "Submitted").limit(8),
      supabase.from("teacher_observations").select("id,total_score,status,teachers(full_name),created_at").order("created_at", { ascending: false }).limit(6)
    ]);
    const todaySessions = (weekSessions.data || []).filter((item: any) => item.scheduled_date === today);
    const upcoming = (weekSessions.data || []).filter((item: any) => item.scheduled_date >= today && !String(item.status).toLowerCase().includes("cancel"));
    const nextSession = upcoming[0];
    const nextClass = joined(nextSession?.classes);
    let adminFinance = { revenue: 0, expenses: 0, outstanding: 0, renewalAlerts: 0 };
    let adminTeacherRates: any[] = [];
    let adminPayrollStatements: any[] = [];
    let importedMonthlyBalance: any = null;
    if (profile.role === "admin") {
      const monthStart = `${today.slice(0,7)}-01`;
      const nextMonthDate = new Date(`${monthStart}T00:00:00Z`);
      nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
      const monthEnd = nextMonthDate.toISOString().slice(0,10);
      const next14Date = vietnamTodayDate();
      next14Date.setUTCDate(next14Date.getUTCDate()+14);
      const [monthPayments, monthExpenses, tuitionRows, renewalRows, teacherRates, payrollStatements, monthlyBalance] = await Promise.all([
        supabase.from("payment_transactions").select("amount").gte("paid_at", `${monthStart}T00:00:00Z`).lt("paid_at", `${monthEnd}T00:00:00Z`),
        supabase.from("expense_transactions").select("amount").gte("expense_date", monthStart).lt("expense_date", monthEnd).is("archived_at", null).neq("status", "Void"),
        supabase.from("tuition_accounts").select("balance_amount").is("archived_at", null),
        supabase.from("tuition_accounts").select("id", { count: "exact", head: true }).gte("renewal_due_date", today).lte("renewal_due_date", dateOnlyString(next14Date)).is("archived_at", null),
        supabase.from("teachers").select("id,code,full_name,teacher_compensation_settings(hourly_rate,effective_from)").is("archived_at", null).order("full_name"),
        supabase.from("teacher_payroll_statements").select("id,teacher_id,teacher_status,admin_status,gross_amount").eq("payroll_month", monthStart),
        supabase.from("monthly_financial_balance").select("month,revenue_amount,total_expense,operating_result,source").eq("month", monthStart).maybeSingle()
      ]);
      adminTeacherRates = teacherRates.data || [];
      adminPayrollStatements = payrollStatements.data || [];
      importedMonthlyBalance = monthlyBalance.data || null;
      adminFinance = {
        revenue: (monthPayments.data || []).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0),
        expenses: (monthExpenses.data || []).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0),
        outstanding: (tuitionRows.data || []).reduce((sum:number,row:any)=>sum+Number(row.balance_amount||0),0),
        renewalAlerts: renewalRows.count || 0
      };
    }

    return <>
      <PageHeader eyebrow="Trung tâm hôm nay" title={`Chào ${profile.full_name}`} description="Lịch học, việc cần xử lý và các chỉ số quan trọng được gom vào một nơi." />
      <Flash message={params.message} error={params.error} />
      <DashboardHero
        label={`${formatDate(today)} · ${todaySessions.length} buổi học`}
        title={nextSession ? `Tiếp theo: ${nextSession.start_time?.slice(0,5)} · ${nextClass?.code || "Lớp học"}` : "Hôm nay chưa có buổi học sắp tới"}
        description={nextSession ? `${nextClass?.name || "Buổi học"} · ${teacherNames(nextSession)}` : "Bạn có thể kiểm tra lịch tuần hoặc tạo session mới cho lớp."}
        meta={<><span>{(weekSessions.data || []).length} buổi trong tuần</span><span>{pendingFeedback.count || 0} feedback chờ duyệt</span><span>{waitingStudents.count || 0} HV chờ xếp lớp</span></>}
        actions={<><Link className="button button-yellow" href="/schedule">Mở lịch tuần</Link><Link className="button hero-secondary" href="/classes">Xem lớp học</Link></>}
      />
      <div className="quick-actions-grid">
        <QuickAction href="/schedule" icon="◷" title="Xếp lịch" description="Tạo session và kiểm tra lịch tuần" />
        <QuickAction href="/workforce" icon="CC" title={profile.role === "admin" ? "Chấm công nhân sự" : "Lịch làm & chấm công"} description={profile.role === "admin" ? "Academic, CSKH và KPI giáo viên" : "Đăng ký ca và theo dõi giờ công"} tone="yellow" />
        <QuickAction href="/students" icon="HV" title="Xử lý học viên" description="Hồ sơ, lịch rảnh và xếp lớp" tone="yellow" />
        <QuickAction href="/academic" icon="✓" title="Duyệt học thuật" description="Attendance, điểm và feedback" tone="green" />
        <QuickAction href="/sop" icon="SOP" title="SOP & Training" description="Quy trình, Placement Test và hướng dẫn vận hành" />
      </div>
      <div className="metrics-grid compact-metrics">
        <MetricCard label="Học viên" value={students.count || 0} note={`${waitingStudents.count || 0} đang chờ xếp lớp`} />
        <MetricCard label="Lớp đang hoạt động" value={activeClasses.count || 0} tone="green" />
        <MetricCard label="Buổi tuần này" value={(weekSessions.data || []).length} note={`${formatDate(weekStart)} – ${formatDate(weekEnd)}`} tone="yellow" />
        <MetricCard label="Feedback chờ duyệt" value={pendingFeedback.count || 0} tone={(pendingFeedback.count || 0) > 0 ? "red" : "neutral"} />
      </div>
      <div className="dashboard-main-grid">
        <Panel title="Lịch hôm nay" description="Theo thứ tự thời gian" action={<Link className="text-link" href="/schedule">Xem toàn bộ lịch →</Link>}>
          <SessionList sessions={todaySessions} emptyTitle="Hôm nay chưa có lịch" emptyDescription="Lịch mới sẽ xuất hiện ngay khi session được tạo." />
        </Panel>
        <Panel title="Việc cần chú ý" description="Ưu tiên xử lý trong ngày">
          <div className="task-stack">
            <Link href="/academic" className="task-card"><span className="task-number">{pendingFeedback.count || 0}</span><div><strong>Feedback chờ duyệt</strong><small>Phản hồi của GV trước khi gửi HV</small></div></Link>
            <Link href="/students" className="task-card"><span className="task-number yellow">{waitingStudents.count || 0}</span><div><strong>Học viên chờ xếp lớp</strong><small>Kiểm tra lịch rảnh và lớp phù hợp</small></div></Link>
            <Link href="/quality" className="task-card"><span className="task-number green">{observations.data?.length || 0}</span><div><strong>Observation gần đây</strong><small>Theo dõi chất lượng và coaching</small></div></Link>
          </div>
        </Panel>
      </div>
      {profile.role === "admin" ? <Panel className="section-gap" title="Tài chính tháng này" description="Thu, chi, công nợ và cảnh báo tái phí" action={<Link className="text-link" href="/finance/reports">Mở báo cáo →</Link>}>
        <div className="metrics-grid compact-metrics">
          <MetricCard label="Đã thu" value={formatMoney(adminFinance.revenue)} tone="green" />
          <MetricCard label="Đã chi" value={formatMoney(adminFinance.expenses)} tone="red" />
          <MetricCard label="Chênh lệch" value={formatMoney(adminFinance.revenue-adminFinance.expenses)} tone={adminFinance.revenue-adminFinance.expenses>=0?"blue":"red"} />
          <MetricCard label="Tái phí 14 ngày" value={adminFinance.renewalAlerts} tone="yellow" />
        </div>
        <div className="quick-actions-grid section-gap">
          <QuickAction href="/finance" icon="₫" title="Thu phí & phiếu thu" description="Giao dịch, công nợ và thông báo" />
          <QuickAction href="/finance/expenses" icon="−" title="Ghi nhận chi phí" description="Cố định, biến đổi và lương" tone="yellow" />
          <QuickAction href="/payroll" icon="LG" title="Chốt lương giáo viên" description={`${adminPayrollStatements.filter((row:any)=>row.teacher_status === "Approved" && row.admin_status === "Pending").length} bảng chờ duyệt`} tone="green" />
        </div>
      </Panel> : null}
      {profile.role === "admin" ? <div className="dashboard-main-grid section-gap">
        <Panel title="Đơn giá giờ dạy" description="Chỉnh nhanh tại Dashboard; mức mới hiển thị ngay trên tài khoản GV." action={<Link className="text-link" href="/payroll">Quản lý lương →</Link>}>
          {adminTeacherRates.length ? <div className="dashboard-rate-list">{adminTeacherRates.slice(0,8).map((teacher:any)=>{const setting=joined(teacher.teacher_compensation_settings);return <form action={updateTeacherHourlyRate} className="dashboard-rate-row" key={teacher.id}><input type="hidden" name="teacher_id" value={teacher.id}/><input type="hidden" name="return_month" value={today.slice(0,7)}/><input type="hidden" name="return_path" value="/dashboard"/><input type="hidden" name="effective_from" value={setting?.effective_from || `${today.slice(0,7)}-01`}/><div><strong>{teacher.full_name}</strong><small>{teacher.code}</small></div><Field label="Teaching / giờ" name="hourly_rate" type="number" min="50000" max="1500000" step="1000" defaultValue={Number(setting?.hourly_rate || 0) || ""} required/><Field label="TA / giờ" name="ta_hourly_rate" type="number" min="0" max="1500000" step="1000" defaultValue={Number(setting?.ta_hourly_rate || 0) || ""} required/><button className="button button-secondary button-small">Lưu</button></form>})}</div> : <Empty title="Chưa có giáo viên" description="Đơn giá sẽ xuất hiện sau khi hồ sơ giáo viên được tạo."/>}
        </Panel>
        <Panel title="Cân đối doanh thu – chi phí" description="Khu vực dữ liệu tổng hợp theo tháng, sẵn sàng cho import sau này." action={<Link className="text-link" href="/finance/reports">Mở báo cáo →</Link>}>
          {importedMonthlyBalance ? <div className="metrics-grid compact-metrics"><MetricCard label="Doanh thu" value={formatMoney(importedMonthlyBalance.revenue_amount)} tone="green"/><MetricCard label="Tổng chi" value={formatMoney(importedMonthlyBalance.total_expense)} tone="red"/><MetricCard label="Kết quả" value={formatMoney(importedMonthlyBalance.operating_result)} tone={Number(importedMonthlyBalance.operating_result)>=0?"blue":"red"}/></div> : <Empty title="Chưa có dữ liệu cân đối tháng" description="Hiện đang để trống. Mẫu CSV và hàm đồng bộ đã được chuẩn bị để nhập dữ liệu sau."/>}
        </Panel>
      </div> : null}
    </>;
  }

  if (profile.role === "teacher") {
    const { data: teacher } = await supabase.from("teachers").select("id,full_name,is_placement_assessor").eq("user_id", profile.id).single();
    const { data: classAssignments } = teacher ? await supabase.from("class_teachers").select("class_id,classes(id,code,name,status)").eq("teacher_id", teacher.id) : { data: [] as any[] };
    const assignedClassIds = (classAssignments || []).map((x: any) => x.class_id);
    const [sessionQuery, hours, feedback, observations, payrollStatement, compensation, livePayroll, kpiLive, placementBookings] = await Promise.all([
      teacher ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,topic,classes(code,name),session_teachers(role,teachers(id,code,full_name))").gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd).is("archived_at", null).order("scheduled_date").order("start_time") : Promise.resolve({ data: [] as any[] }),
      teacher ? supabase.from("teacher_monthly_hours").select("completed_hours").eq("teacher_id", teacher.id).eq("month", `${today.slice(0,7)}-01`).maybeSingle() : Promise.resolve({ data: null as any }),
      supabase.from("progress_feedback").select("id,status,milestone,enrollments(students(full_name),classes(code))").eq("submitted_by", profile.id).order("updated_at", { ascending: false }).limit(8),
      teacher ? supabase.from("teacher_observations").select("id,total_score,status,strengths,areas_to_improve,shared_at").eq("teacher_id", teacher.id).order("created_at", { ascending: false }).limit(4) : Promise.resolve({ data: [] as any[] }),
      teacher ? supabase.from("teacher_payroll_statements").select("id,completed_hours,hourly_rate_snapshot,gross_amount,teacher_status,admin_status").eq("teacher_id", teacher.id).eq("payroll_month", `${today.slice(0,7)}-01`).maybeSingle() : Promise.resolve({ data: null as any }),
      teacher ? supabase.from("teacher_compensation_settings").select("hourly_rate,effective_from").eq("teacher_id", teacher.id).maybeSingle() : Promise.resolve({ data: null as any }),
      teacher ? supabase.from("teacher_payroll_live_monthly").select("completed_hours,hourly_rate,estimated_payroll").eq("teacher_id", teacher.id).eq("payroll_month", `${today.slice(0,7)}-01`).maybeSingle() : Promise.resolve({ data: null as any }),
      teacher ? supabase.from("teacher_kpi_live_monthly").select("overall_compliance_rate,punctuality_rate,assignment_compliance_rate,grading_compliance_rate").eq("teacher_id", teacher.id).eq("kpi_month", `${today.slice(0,7)}-01`).maybeSingle() : Promise.resolve({ data: null as any }),
      teacher ? supabase.from("placement_speaking_bookings").select("id,scheduled_start,status,placement_tests(students(code,full_name))").eq("teacher_id",teacher.id).gte("scheduled_start",`${weekStart}T00:00:00+07:00`).lte("scheduled_start",`${weekEnd}T23:59:59+07:00`).order("scheduled_start") : Promise.resolve({data:[] as any[]})
    ]);
    const teacherSessions = (sessionQuery.data || []).filter((item:any)=>(item.session_teachers || []).some((link:any)=>joined(link.teachers)?.id === teacher?.id));
    const sessionClassIds = teacherSessions.map((item:any)=>item.class_id);
    const classIds = Array.from(new Set([...assignedClassIds, ...sessionClassIds]));
    const { data: rosterRows } = classIds.length ? await supabase.from("enrollments").select("class_id,status,students(id,code,full_name)").in("class_id", classIds).is("archived_at", null) : { data: [] as any[] };
    const sessions = { data: teacherSessions };
    const teacherStudentMap = new Map<string, any>();
    for (const row of rosterRows || []) {
      const studentRow = joined((row as any).students);
      if (studentRow?.id) teacherStudentMap.set(String(studentRow.id), studentRow);
    }
    const teacherStudents = Array.from(teacherStudentMap.values());
    const todaySessions = (sessions.data || []).filter((item: any) => item.scheduled_date === today);
    const todayPlacement=(placementBookings.data||[]).filter((b:any)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(b.scheduled_start))===today&&b.status!=="Cancelled");
    const nextSession = (sessions.data || []).find((item: any) => item.scheduled_date >= today && !String(item.status).toLowerCase().includes("cancel"));
    const nextClass = joined(nextSession?.classes);
    const pendingFeedback = (feedback.data || []).filter((x: any) => !["Published", "Approved"].includes(x.status)).length;
    const payrollHours = Number(payrollStatement.data?.completed_hours ?? livePayroll.data?.completed_hours ?? 0);
    const payrollRate = Number(payrollStatement.data?.hourly_rate_snapshot ?? livePayroll.data?.hourly_rate ?? compensation.data?.hourly_rate ?? 0);
    const payrollAmount = Number(payrollStatement.data?.gross_amount ?? livePayroll.data?.estimated_payroll ?? payrollHours * payrollRate);

    return <>
      <PageHeader eyebrow="Lịch dạy của tôi" title={`Chào ${profile.full_name}`} description="Bắt đầu từ lịch hôm nay, sau đó xử lý điểm danh, bài tập và feedback." />
      <Flash message={params.message} error={params.error} />
      <DashboardHero
        label={`${todaySessions.length} buổi lớp hôm nay · ${todayPlacement.length} Placement Speaking hôm nay`}
        title={nextSession ? `${nextSession.start_time?.slice(0,5)} · ${nextClass?.code || "Lớp học"}` : "Hôm nay bạn chưa có lịch dạy"}
        description={nextSession ? `${nextClass?.name || "Buổi học"} · Buổi ${nextSession.session_no || "—"}` : "Kiểm tra lịch tuần hoặc cập nhật lịch rảnh cho học vụ."}
        meta={<><span>{classIds.length} lớp phụ trách</span><span>{teacherStudents.length} học viên</span><span>{payrollHours.toLocaleString("vi-VN")} giờ đủ điều kiện lương</span></>}
        actions={<><Link className="button button-yellow" href="/workforce">Check-in buổi dạy</Link><Link className="button hero-secondary" href="/schedule">Xem lịch tuần</Link></>}
      />
      <div className="quick-actions-grid">
        <QuickAction href="/workforce" icon="KPI" title="Check-in & KPI" description="Chấm công buổi dạy và xem KPI tuân thủ" />
        {teacher?.is_placement_assessor ? <QuickAction href="/placement" icon="PT" title="Placement Speaking" description="Xem booking Speaking 15 phút được CSKH phân công" tone="yellow" /> : null}
        <QuickAction href="/academic" icon="✓" title="Điểm danh & bài tập" description="Attendance, BTVN và chấm chữa" />
        <QuickAction href="/schedule" icon="◷" title="Lịch rảnh" description="Book lịch rảnh cho các tuần tới" tone="yellow" />
        <QuickAction href="/payroll" icon="₫" title="Lương tháng" description={`${payrollHours.toLocaleString("vi-VN")} giờ · ${formatMoney(payrollAmount)}`} tone="green" />
      </div>
      <div className="metrics-grid compact-metrics">
        <MetricCard label="Lớp phụ trách" value={classIds.length} />
        <MetricCard label="Buổi tuần này" value={(sessions.data || []).length} tone="yellow" />
        <MetricCard label="Giờ đủ điều kiện lương" value={`${payrollHours.toLocaleString("vi-VN")}h`} note="Từ ngày áp dụng: cần Check-in/Check-out" tone="green" />
        <MetricCard label="KPI tuân thủ tháng" value={kpiLive.data?.overall_compliance_rate == null ? "—" : `${Number(kpiLive.data.overall_compliance_rate).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`} note={kpiLive.data ? `P ${Number(kpiLive.data.punctuality_rate || 0).toFixed(0)}% · BT ${Number(kpiLive.data.assignment_compliance_rate || 0).toFixed(0)}% · Chấm ${Number(kpiLive.data.grading_compliance_rate || 0).toFixed(0)}%` : "Chưa có dữ liệu KPI"} tone="yellow" />
      </div>
      <Panel className="section-gap" title="Tổng kết lương tháng" description={payrollStatement.data ? "Bảng lương đã được chốt; vui lòng kiểm tra và xác nhận." : "Số liệu đang tạm tính và sẽ tự chốt vào ngày cuối tháng."} action={<Link className="text-link" href="/payroll">Xem chi tiết →</Link>}>
        <div className="payroll-dashboard-summary"><div><span>Giờ hoàn thành</span><strong>{payrollHours.toLocaleString("vi-VN")}h</strong></div><div><span>Đơn giá</span><strong>{formatMoney(payrollRate)}</strong></div><div><span>{payrollStatement.data?.teacher_status === "Approved" ? "Mức lương đã xác nhận" : "Mức lương dự kiến"}</span><strong>{formatMoney(payrollAmount)}</strong></div><div><span>Trạng thái</span><Status value={payrollStatement.data?.teacher_status || "Chưa mở"}/></div></div>
        {payrollStatement.data && payrollStatement.data.teacher_status !== "Approved" && payrollStatement.data.admin_status === "Pending" ? <form action={teacherReviewPayroll} className="payroll-dashboard-action"><input type="hidden" name="statement_id" value={payrollStatement.data.id}/><input type="hidden" name="decision" value="Approved"/><input type="hidden" name="return_month" value={today.slice(0,7)}/><input type="hidden" name="return_path" value="/dashboard"/><button className="button button-primary">Xác nhận số giờ & mức lương</button></form> : null}
      </Panel>
      {todayPlacement.length ? <Panel className="section-gap" title="Placement Speaking hôm nay" description="Booking từ CSKH đã đồng bộ vào lịch GV" action={<Link className="text-link" href="/placement">Mở Placement →</Link>}><div className="compact-list">{todayPlacement.map((b:any)=>{const pt=joined(b.placement_tests);const st=joined(pt?.students);return <div className="compact-row" key={b.id}><div><strong>{new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"}).format(new Date(b.scheduled_start))} · {st?.full_name}</strong><span>{st?.code} · Speaking 15 phút</span></div><Status value={b.status}/></div>})}</div></Panel>:null}
      <div className="dashboard-main-grid">
        <Panel title="Lịch dạy hôm nay" description="Các lớp theo thứ tự thời gian" action={<Link className="text-link" href="/schedule">Lịch cả tuần →</Link>}>
          <SessionList sessions={todaySessions} emptyTitle="Hôm nay chưa có lớp" emptyDescription="Lịch tuần vẫn có thể được xem tại mục Lịch dạy." />
        </Panel>
        <Panel title="Cần hoàn thành" description="Các đầu việc quan trọng">
          <div className="task-stack">
            <Link href="/academic" className="task-card"><span className="task-number">{todaySessions.length}</span><div><strong>Buổi cần cập nhật</strong><small>Điểm danh, homework và teaching note</small></div></Link>
            <Link href="/academic" className="task-card"><span className="task-number yellow">{pendingFeedback}</span><div><strong>Feedback đang xử lý</strong><small>Hoàn thiện theo milestone của lớp</small></div></Link>
            <Link href="/quality" className="task-card"><span className="task-number green">{observations.data?.length || 0}</span><div><strong>Đánh giá đã nhận</strong><small>Xem điểm và nội dung coaching</small></div></Link>
          </div>
        </Panel>
      </div>
      <Panel className="section-gap" title="Học viên của tôi" description={`${teacherStudents.length} học viên thuộc các lớp đang phụ trách`} action={<Link className="text-link" href="/students">Xem danh sách →</Link>}>
        {teacherStudents.length ? <div className="people-strip">{teacherStudents.slice(0,10).map((student:any) => <Link href={`/students/${student.id}`} className="person-chip" key={student.id}><span>{String(student.full_name || "HV").slice(0,2).toUpperCase()}</span><div><strong>{student.full_name}</strong><small>{student.code}</small></div></Link>)}</div> : <Empty title="Chưa có học viên trong lớp" description="Học viên sẽ xuất hiện khi được xếp vào lớp bạn phụ trách." />}
      </Panel>
    </>;
  }

  if (profile.role === "customer_service") {
    const next14Date = vietnamTodayDate();
    next14Date.setUTCDate(next14Date.getUTCDate() + 14);
    const next14 = dateOnlyString(next14Date);
    const [students, waitingStudents, accounts, renewals, followups] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "Waiting for class").is("archived_at", null),
      supabase.from("tuition_accounts").select("id,balance_amount,renewal_due_date,status,students(full_name,code)").order("renewal_due_date").limit(20),
      supabase.from("tuition_accounts").select("id", { count: "exact", head: true }).gte("renewal_due_date", today).lte("renewal_due_date", next14),
      supabase.from("renewal_followups").select("id,due_at,status,note,tuition_accounts(students(full_name,code))").eq("status", "Pending").order("due_at").limit(12)
    ]);
    const outstanding = (accounts.data || []).reduce((sum: number, x: any) => sum + Number(x.balance_amount || 0), 0);
    const dueToday = (followups.data || []).filter((item: any) => String(item.due_at || "").slice(0,10) <= today);

    return <>
      <PageHeader eyebrow="CSKH hôm nay" title={`Chào ${profile.full_name}`} description="Theo dõi học viên mới, học phí và các lịch tái phí cần xử lý." />
      <Flash message={params.message} error={params.error} />
      <DashboardHero
        label={`${dueToday.length} việc đến hạn hôm nay`}
        title={dueToday.length ? "Ưu tiên liên hệ các học viên đến hạn" : "Hôm nay không có follow-up quá hạn"}
        description={`${renewals.count || 0} tài khoản dự kiến tái phí trong 14 ngày tới.`}
        meta={<><span>{students.count || 0} hồ sơ học viên</span><span>{waitingStudents.count || 0} HV chờ xếp lớp</span><span>{formatMoney(outstanding)} công nợ đang theo dõi</span></>}
        actions={<><Link className="button button-yellow" href="/finance">Mở danh sách tái phí</Link><Link className="button hero-secondary" href="/students">Hồ sơ học viên</Link></>}
      />
      <div className="quick-actions-grid">
        <QuickAction href="/workforce" icon="CC" title="Lịch làm & chấm công" description="Đăng ký ca, Check-in/Check-out và giờ công" />
        <QuickAction href="/students" icon="+" title="Thêm học viên" description="Tạo hồ sơ và nhập lịch rảnh" />
        <QuickAction href="/finance" icon="₫" title="Ghi nhận thanh toán" description="Cập nhật tiền đóng và công nợ" tone="yellow" />
        <QuickAction href="/finance" icon="↻" title="Tái phí" description="Theo dõi và tạo follow-up" tone="green" />
        <QuickAction href="/sop" icon="SOP" title="SOP & Training" description="Xem lại quy trình và hướng dẫn thao tác" />
      </div>
      <div className="metrics-grid compact-metrics">
        <MetricCard label="Hồ sơ học viên" value={students.count || 0} />
        <MetricCard label="Chờ xếp lớp" value={waitingStudents.count || 0} tone="yellow" />
        <MetricCard label="Tái phí trong 14 ngày" value={renewals.count || 0} tone="green" />
        <MetricCard label="Công nợ đang theo dõi" value={formatMoney(outstanding)} tone="red" />
      </div>
      <div className="dashboard-main-grid">
        <Panel title="Follow-up cần xử lý" description="Sắp xếp theo thời hạn" action={<Link className="text-link" href="/finance">Xem pipeline →</Link>}>
          {followups.data?.length ? <div className="agenda-list">{followups.data.map((item: any) => {
            const account = joined(item.tuition_accounts);
            const studentRow = joined(account?.students);
            return <div className="agenda-item" key={item.id}><div className="agenda-time"><strong>{new Date(item.due_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</strong><span>{new Date(item.due_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span></div><div className="agenda-main"><strong>{studentRow?.full_name || "Học viên"}</strong><span>{item.note || "Liên hệ tái phí"}</span></div><Status value={item.status} /></div>;
          })}</div> : <Empty title="Không có follow-up đang chờ" description="Các task tái phí mới sẽ xuất hiện tại đây." />}
        </Panel>
        <Panel title="Ưu tiên hôm nay" description="Tập trung vào các nhóm cần hành động">
          <div className="task-stack">
            <Link href="/finance" className="task-card"><span className="task-number">{dueToday.length}</span><div><strong>Follow-up đến hạn</strong><small>Liên hệ và cập nhật kết quả</small></div></Link>
            <Link href="/students" className="task-card"><span className="task-number yellow">{waitingStudents.count || 0}</span><div><strong>Học viên chờ lớp</strong><small>Kiểm tra lịch rảnh và tiến độ xếp lớp</small></div></Link>
            <Link href="/finance" className="task-card"><span className="task-number green">{renewals.count || 0}</span><div><strong>Sắp đến kỳ tái phí</strong><small>Chuẩn bị nội dung chăm sóc</small></div></Link>
          </div>
        </Panel>
      </div>
    </>;
  }

  const { data: student } = await supabase.from("students").select("id,full_name,code,target,entry_level").eq("user_id", profile.id).single();
  if (!student) return <><PageHeader eyebrow="Trang học viên" title="Hồ sơ của bạn chưa sẵn sàng" description="Vui lòng liên hệ trung tâm để liên kết tài khoản với hồ sơ học viên." /><div className="message error">Chưa tìm thấy hồ sơ học viên cho tài khoản này.</div></>;

  const { data: enrollments } = await supabase.from("enrollments").select("id,class_id,status,start_date,end_date,classes(id,code,name,total_sessions,target,status,start_date,expected_end_date)").eq("student_id", student.id).is("archived_at", null);
  const classIds = (enrollments || []).map((x: any) => x.class_id);
  const activeEnrollments = (enrollments || []).filter((item: any) => {
    const classRow = joined(item.classes);
    return item.status === "Active" || ["Active", "Ready", "Paused"].includes(String(classRow?.status || ""));
  });
  const completedEnrollments = (enrollments || []).filter((item: any) => {
    const classRow = joined(item.classes);
    return item.status === "Completed" || ["Completed", "Closed"].includes(String(classRow?.status || ""));
  });

  const [upcomingSessions, recentSessions, allClassSessions, tuition, feedback, assignments, recentAttendance, myRatings, teacherLinks] = await Promise.all([
    classIds.length ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,mode,meeting_url,classes(code,name),session_teachers(role,teachers(id,code,full_name))").in("class_id", classIds).gte("scheduled_date", today).is("archived_at", null).order("scheduled_date").order("start_time").limit(8) : Promise.resolve({ data: [] as any[] }),
    classIds.length ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,classes(code,name),session_teachers(role,teachers(id,code,full_name))").in("class_id", classIds).lt("scheduled_date", today).is("archived_at", null).order("scheduled_date", { ascending: false }).order("start_time", { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
    classIds.length ? supabase.from("sessions").select("id,class_id,status").in("class_id", classIds).is("archived_at", null) : Promise.resolve({ data: [] as any[] }),
    supabase.from("tuition_accounts").select("id,package_name,balance_amount,renewal_due_date,status").eq("student_id", student.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("progress_feedback").select("id,milestone,strengths,areas_to_improve,current_performance,recommendation,status,published_at,enrollments!inner(student_id,classes(code,name))").eq("enrollments.student_id", student.id).eq("status", "Published").order("published_at", { ascending: false }).limit(4),
    classIds.length ? supabase.from("assignments").select("id,title,due_at,max_score,class_id,classes(code),assignment_submissions(id,status,score,student_id)").in("class_id", classIds).not("published_at", "is", null).order("due_at").limit(8) : Promise.resolve({ data: [] as any[] }),
    supabase.from("attendance").select("session_id,status,sessions(id,session_no,scheduled_date,class_id,classes(code,name),session_teachers(teachers(id,full_name)))").eq("student_id", student.id).in("status", ["Present","Late","Joined partially"]).order("marked_at", { ascending: false }).limit(12),
    supabase.from("teacher_ratings").select("id,session_id,teacher_id,overall").eq("student_id", student.id),
    classIds.length ? supabase.from("class_teachers").select("class_id,role,teachers(id,code,full_name)").in("class_id", classIds) : Promise.resolve({ data: [] as any[] })
  ]);
  const matchedTeacherMap = new Map<string, any>();
  for (const row of teacherLinks.data || []) {
    const teacherRow = joined((row as any).teachers);
    if (teacherRow?.id) matchedTeacherMap.set(String(teacherRow.id), { ...teacherRow, role: (row as any).role });
  }
  const matchedTeachers = Array.from(matchedTeacherMap.values());
  const nextSession = (upcomingSessions.data || [])[0];
  const nextClass = joined(nextSession?.classes);
  const primaryEnrollment = activeEnrollments[0] || completedEnrollments[0];
  const primaryClass = joined(primaryEnrollment?.classes);
  const primaryClassSessions = (allClassSessions.data || []).filter((item: any) => item.class_id === primaryEnrollment?.class_id);
  const completedCount = primaryClassSessions.filter((item: any) => String(item.status).toLowerCase() === "completed").length;
  const totalSessions = Number(primaryClass?.total_sessions || primaryClassSessions.length || 0);
  const progress = totalSessions ? Math.min(100, Math.round((completedCount / totalSessions) * 100)) : 0;
  const tuitionBalance = (tuition.data || []).reduce((sum: number, item: any) => sum + Number(item.balance_amount || 0), 0);

  return <>
    <PageHeader eyebrow="Lịch học của tôi" title={`Xin chào ${student.full_name}`} description="Xem buổi học tiếp theo, tiến độ lớp và những việc bạn cần hoàn thành." />
    <Flash message={params.message} error={params.error} />
    <DashboardHero
      label={nextSession ? `${formatDate(nextSession.scheduled_date)} · ${nextSession.start_time?.slice(0,5)}–${nextSession.end_time?.slice(0,5)}` : "Chưa có lịch học mới"}
      title={nextSession ? `${nextClass?.code || "Lớp học"} · Buổi ${nextSession.session_no || "—"}` : primaryClass ? `${primaryClass.code} · ${progress}% tiến độ` : "Trung tâm đang cập nhật lộ trình của bạn"}
      description={nextSession ? `${nextClass?.name || "Buổi học"} · ${teacherNames(nextSession)}` : primaryClass ? `${completedCount}/${totalSessions || "—"} buổi đã hoàn thành` : "Lịch và lớp học sẽ xuất hiện tại đây sau khi được xếp."}
      meta={<><span>{activeEnrollments.length} lớp đang học</span><span>{matchedTeachers.length} giáo viên phụ trách</span><span>{assignments.data?.length || 0} bài tập</span></>}
      actions={<><Link className="button button-yellow" href="/schedule">Xem lịch học</Link>{nextSession?.meeting_url ? <a className="button hero-secondary" href={nextSession.meeting_url} target="_blank" rel="noreferrer">Vào lớp online</a> : <Link className="button hero-secondary" href="/classes">Xem lộ trình</Link>}</>}
    />
    <div className="quick-actions-grid">
      <QuickAction href="/schedule" icon="◷" title="Lịch học" description="Lịch tuần và các buổi sắp tới" />
      <QuickAction href="/classes" icon="▦" title="Tiến độ lớp" description="Số buổi, mục tiêu và kết quả" tone="yellow" />
      <QuickAction href="/finance" icon="₫" title="Học phí" description="Số dư và kỳ tái phí" tone="green" />
    </div>
    <div className="metrics-grid compact-metrics">
      <MetricCard label="Tiến độ lớp chính" value={`${progress}%`} note={primaryClass ? `${completedCount}/${totalSessions || "—"} buổi` : "Chưa có lớp"} />
      <MetricCard label="Buổi sắp tới" value={upcomingSessions.data?.length || 0} tone="yellow" />
      <MetricCard label="Feedback đã nhận" value={feedback.data?.length || 0} tone="green" />
      <MetricCard label="Học phí còn lại" value={formatMoney(tuitionBalance)} tone="red" />
    </div>
    <div className="dashboard-main-grid">
      <Panel title="Lịch học sắp tới" description="Các buổi học gần nhất" action={<Link className="text-link" href="/schedule">Xem lịch tuần →</Link>}>
        <SessionList sessions={upcomingSessions.data || []} emptyTitle="Chưa có lịch học sắp tới" emptyDescription="Trung tâm sẽ cập nhật khi lớp có lịch mới." />
      </Panel>
      <Panel title="Việc cần làm" description="Bài tập và thông báo học tập">
        {assignments.data?.length ? <div className="task-stack">{assignments.data.slice(0,4).map((item: any) => {
          const own = (item.assignment_submissions || []).find((x: any) => x.student_id === student.id);
          const classRow = joined(item.classes);
          return <div className="task-card task-static" key={item.id}><span className="task-number">{classRow?.code?.slice(0,2) || "BT"}</span><div><strong>{item.title}</strong><small>{own ? `Trạng thái: ${own.status}` : `Hạn: ${item.due_at ? new Date(item.due_at).toLocaleDateString("vi-VN") : "Không giới hạn"}`}</small></div></div>;
        })}</div> : <Empty title="Chưa có bài tập mới" description="Bài tập sẽ xuất hiện sau khi giáo viên giao." />}
      </Panel>
    </div>
    <div className="grid-2 section-gap">
      <Panel title="Lớp & tiến độ" description="Lộ trình hiện tại của bạn" action={<Link className="text-link" href="/classes">Chi tiết →</Link>}>
        {primaryClass ? <div className="student-progress-card"><div><span>{primaryClass.code}</span><h3>{primaryClass.name}</h3><p>Mục tiêu: {primaryClass.target || student.target || "Đang cập nhật"}</p></div><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}><strong>{progress}%</strong></div><div className="progress-wide"><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><span>{completedCount} buổi hoàn thành · {Math.max(0, totalSessions - completedCount)} buổi còn lại</span></div></div> : <Empty title="Chưa có lớp học" description="Trung tâm sẽ cập nhật ngay khi bạn được xếp lớp." />}
      </Panel>
      <Panel title="Giáo viên phụ trách" description="Giáo viên của các lớp bạn tham gia">
        {matchedTeachers.length ? <div className="people-strip vertical">{matchedTeachers.map((teacher:any) => <div className="person-chip" key={teacher.id}><span>{String(teacher.full_name || "GV").slice(0,2).toUpperCase()}</span><div><strong>{teacher.full_name}</strong><small>{teacher.code || "Giáo viên"}</small></div></div>)}</div> : <Empty title="Chưa có giáo viên phụ trách" description="Tên giáo viên sẽ hiện sau khi trung tâm phân công lớp." />}
      </Panel>
    </div>
    <Panel className="section-gap" title="Nộp bài tập" description="Chọn file và gửi trực tiếp cho giáo viên">
      {assignments.data?.length ? <div className="alert-list">{assignments.data.map((item: any) => {
        const own = (item.assignment_submissions || []).find((x: any)=>x.student_id===student.id);
        const classRow = joined(item.classes);
        return <div className="alert-item" key={item.id}><i /><div><strong>{classRow?.code || "Lớp"} · {item.title}</strong><span>Hạn: {item.due_at ? new Date(item.due_at).toLocaleString("vi-VN") : "Không giới hạn"}</span>{(!own || own.status === "Revision required") ? <form action={submitAssignment} className="inline-form section-gap"><input type="hidden" name="assignment_id" value={item.id}/><input className="input" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx" required/><button className="button button-secondary">Nộp bài</button></form> : own.score != null ? <span>Điểm: {own.score}/{item.max_score}</span> : null}</div><Status value={own?.status || "Not submitted"} /></div>;
      })}</div> : <Empty title="Chưa có bài tập" description="Bạn chưa được giao bài tập nào." />}
    </Panel>
    <details className="secondary-section section-gap">
      <summary>Xem lịch sử buổi học và đánh giá giáo viên</summary>
      <div className="secondary-section-body">
        <Panel title="Lịch sử buổi học" description="Các buổi gần đây">
          <SessionList sessions={recentSessions.data || []} emptyTitle="Chưa có lịch sử buổi học" emptyDescription="Lịch sử sẽ xuất hiện khi lớp bắt đầu học." />
        </Panel>
        <Panel className="section-gap" title="Đánh giá giáo viên" description="Chỉ mở sau các buổi đã được điểm danh">
          {recentAttendance.data?.length ? <div className="alert-list">{recentAttendance.data.flatMap((record:any) => {
            const session = joined(record.sessions);
            const classRow = joined(session?.classes);
            return (session?.session_teachers || []).map((link:any) => {
              const teacher = joined(link.teachers);
              if (!teacher) return null;
              const existing = (myRatings.data || []).find((rating:any) => rating.session_id === record.session_id && rating.teacher_id === teacher.id);
              return <div className="alert-item" key={`${record.session_id}-${teacher.id}`}><i/><div><strong>{classRow?.code || "Lớp"} · {teacher.full_name}</strong><span>{formatDate(session?.scheduled_date)} · Điểm danh: {record.status}</span>{!existing ? <form action={rateTeacher} className="inline-form section-gap"><input type="hidden" name="session_id" value={record.session_id}/><input type="hidden" name="teacher_id" value={teacher.id}/>{["overall","clarity","engagement","supportiveness","pace"].map((name)=><label className="form-group rating-field" key={name}><span>{name}</span><select className="select" name={name} defaultValue="5" required>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}<input className="input" name="comment" placeholder="Nhận xét (không bắt buộc)"/><button className="button button-secondary">Gửi đánh giá</button></form> : <span>Đã đánh giá: {existing.overall}/5</span>}</div><Status value={existing ? "Submitted" : "Pending"}/></div>;
            });
          })}</div> : <Empty title="Chưa có buổi để đánh giá" description="Bạn có thể đánh giá sau khi buổi học được điểm danh." />}
        </Panel>
      </div>
    </details>
  </>;
}

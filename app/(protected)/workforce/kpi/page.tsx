import Link from "next/link";
import { generateTeacherKpiMonth } from "@/app/actions";
import { PrintButton } from "@/components/print-button";
import { Empty, Flash, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function monthValue(value?: string) {
  return /^\d{4}-\d{2}$/.test(value || "") ? String(value) : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
}
function monthLabel(month: string) { const [y,m]=month.split("-"); return `Tháng ${Number(m)}/${y}`; }
function pct(value: unknown) { return value == null ? "—" : `${Number(value).toLocaleString("vi-VN",{maximumFractionDigits:1})}%`; }
function nextMonth(month: string) { const [y,m]=month.split("-").map(Number); const d=new Date(Date.UTC(y,m,1)); return d.toISOString().slice(0,10); }

export default async function TeacherKpiPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile=await requireRole(["admin","academic_manager","teacher"]);
  const params=await searchParams;
  const supabase=await createClient();
  const month=monthValue(params.month);
  const monthDate=`${month}-01`;
  const monthEnd=nextMonth(month);
  const manager=profile.role!=="teacher";

  const { data: teacherList } = manager
    ? await supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name")
    : { data: [] as any[] };
  let teacherId=params.teacher_id || "";
  let teacher:any=null;
  if (profile.role==="teacher") {
    const { data }=await supabase.from("teachers").select("id,code,full_name").eq("user_id",profile.id).maybeSingle();
    teacher=data; teacherId=data?.id||"";
  } else {
    if (!teacherId) teacherId=teacherList?.[0]?.id||"";
    teacher=(teacherList||[]).find((x:any)=>x.id===teacherId)||null;
  }

  if (!teacherId || !teacher) return <><PageHeader eyebrow="KPI tuân thủ" title="Chưa có giáo viên" description="Không tìm thấy hồ sơ giáo viên để xuất báo cáo."/></>;

  const [{ data: snapshot }, { data: live }, { data: sessions }, { data: grading }] = await Promise.all([
    supabase.from("teacher_kpi_snapshots").select("*").eq("teacher_id",teacherId).eq("kpi_month",monthDate).maybeSingle(),
    supabase.from("teacher_kpi_live_monthly").select("*").eq("teacher_id",teacherId).eq("kpi_month",monthDate).maybeSingle(),
    supabase.from("teacher_session_compliance").select("session_id,class_code,session_no,scheduled_date,start_time,end_time,session_status,check_in_at,check_out_at,late_minutes,payroll_eligible,punctual,assignment_published_at,assignment_compliant").eq("teacher_id",teacherId).gte("scheduled_date",monthDate).lt("scheduled_date",monthEnd).order("scheduled_date").order("start_time"),
    supabase.from("teacher_grading_compliance").select("assignment_id,session_id,scheduled_date,submission_id,submitted_at,graded_at,graded_by,grading_deadline_at,grading_due,graded_on_time").eq("teacher_id",teacherId).gte("scheduled_date",monthDate).lt("scheduled_date",monthEnd).order("submitted_at")
  ]);
  const kpi=snapshot||live;
  const completedSessions=(sessions||[]).filter((x:any)=>["Completed","Make-up completed"].includes(x.session_status));

  return <div className="kpi-report">
    <PageHeader eyebrow="Teacher Compliance Report" title={`KPI ${teacher.full_name} · ${monthLabel(month)}`} description="Tổng hợp tự động từ lịch dạy, Check-in/Check-out, assignment và dữ liệu chấm bài trên ZE CenterOS." actions={<div className="page-actions no-print"><Link className="button button-secondary" href="/workforce">← Chấm công</Link><PrintButton label="In / Lưu PDF"/>{manager?<form action={generateTeacherKpiMonth}><input type="hidden" name="kpi_month" value={month}/><button className="button button-primary">Chốt lại KPI tháng</button></form>:null}</div>}/>
    <Flash message={params.message} error={params.error}/>
    <div className="kpi-report-meta"><img src="/zest-logo.png" alt="ZEST for English"/><div><strong>{teacher.full_name}</strong><span>{teacher.code}</span><span>{monthLabel(month)}</span><span>{snapshot?`Snapshot ${formatDateTime(snapshot.generated_at)}`:"Số liệu live"}</span></div></div>

    <form className="month-filter no-print" method="get"><label>Tháng KPI<input type="month" name="month" defaultValue={month}/></label>{manager?<label>Giáo viên<select className="select input" name="teacher_id" defaultValue={teacherId}>{(teacherList||[]).map((t:any)=><option key={t.id} value={t.id}>{t.full_name} · {t.code}</option>)}</select></label>:null}<button className="button button-primary">Xem</button></form>

    <div className="metrics-grid kpi-metrics">
      <MetricCard label="KPI tổng hợp" value={pct(kpi?.overall_compliance_rate)} tone="green"/>
      <MetricCard label="Punctuality" value={pct(kpi?.punctuality_rate)} note={`${Number(kpi?.punctual_sessions||0)}/${Number(kpi?.total_sessions||0)} session`} />
      <MetricCard label="Giao BTVN ≤ 24h" value={pct(kpi?.assignment_compliance_rate)} note={`${Number(kpi?.assignment_compliant_sessions||0)}/${Number(kpi?.total_sessions||0)} session`} tone="yellow"/>
      <MetricCard label="Chấm bài ≤ 7 ngày" value={pct(kpi?.grading_compliance_rate)} note={`${Number(kpi?.grading_pending_count||0)} submission chưa tới hạn`} tone="green"/>
    </div>

    <Panel className="section-gap" title="Quy chuẩn KPI" description="Các quy tắc được áp dụng thống nhất và tính từ timestamp trên hệ thống.">
      <div className="policy-cards"><div><b>P</b><strong>Punctuality</strong><span>Check-in không muộn hơn giờ bắt đầu session. Số phút trễ được lưu tự động.</span></div><div><b>A</b><strong>Assignment ≤ 24h</strong><span>Mỗi session hoàn thành phải có assignment gắn session và Publish trong 24 giờ sau khi kết thúc.</span></div><div><b>G</b><strong>Grading ≤ 7 ngày</strong><span>Mỗi bài HV đã nộp phải được chính GV phụ trách chấm/chữa trong 7 ngày từ submitted_at. Bài chưa tới deadline không bị tính fail.</span></div></div>
    </Panel>

    <Panel className="section-gap" title="Tuân thủ theo session" description={`${completedSessions.length} session hoàn thành trong tháng`}>
      {completedSessions.length?<div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Lớp / buổi</th><th>Check-in</th><th>Punctuality</th><th>Check-out</th><th>Đủ lương</th><th>BTVN ≤24h</th></tr></thead><tbody>{completedSessions.map((row:any)=><tr key={row.session_id}><td>{formatDate(row.scheduled_date)}<br/><span className="muted">{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}</span></td><td><strong>{row.class_code}</strong><br/><span className="muted">Buổi {row.session_no}</span></td><td>{formatDateTime(row.check_in_at)}{row.late_minutes?<><br/><span className="text-danger">+{row.late_minutes} phút</span></>:null}</td><td><Status value={row.punctual?"Approved":"Late"}/></td><td>{formatDateTime(row.check_out_at)}</td><td><Status value={row.payroll_eligible?"Approved":"Pending"}/></td><td><Status value={row.assignment_compliant?"Approved":"Overdue"}/>{row.assignment_published_at?<><br/><span className="muted">{formatDateTime(row.assignment_published_at)}</span></>:null}</td></tr>)}</tbody></table></div>:<Empty title="Chưa có session KPI" description="KPI bắt đầu tính từ ngày chính sách Check-in/Check-out có hiệu lực."/>}
    </Panel>

    <Panel className="section-gap" title="Tuân thủ chấm bài" description="Deadline = submitted_at + 7 ngày. Chỉ bài đã tới hạn hoặc đã chấm mới vào mẫu số KPI.">
      {grading?.length?<div className="table-wrap"><table><thead><tr><th>Session</th><th>Nộp lúc</th><th>Deadline chấm</th><th>Chấm lúc</th><th>Kết quả</th></tr></thead><tbody>{grading.map((row:any)=><tr key={row.submission_id}><td>{formatDate(row.scheduled_date)}</td><td>{formatDateTime(row.submitted_at)}</td><td>{formatDateTime(row.grading_deadline_at)}</td><td>{formatDateTime(row.graded_at)}</td><td>{row.grading_due?<Status value={row.graded_on_time?"Approved":"Overdue"}/>:<Status value="Pending"/>}</td></tr>)}</tbody></table></div>:<Empty title="Chưa có submission để đánh giá" description="KPI chấm bài sẽ xuất hiện khi học viên nộp assignment được giáo viên giao."/>}
    </Panel>
    <footer className="kpi-print-footer">ZE CenterOS · ZEST for English · Báo cáo được sinh từ dữ liệu vận hành trên hệ thống</footer>
  </div>;
}

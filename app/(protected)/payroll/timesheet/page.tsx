import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Empty, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function monthValue(value?: string) {
  return /^\d{4}-\d{2}$/.test(value || "") ? String(value) : new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);
}
function nextMonth(month:string){const [y,m]=month.split("-").map(Number);const d=new Date(Date.UTC(y,m,1));return d.toISOString().slice(0,10);}
function monthLabel(month:string){const [y,m]=month.split("-");return `Tháng ${Number(m)}/${y}`;}

export default async function TeacherTimesheetPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const profile=await requireRole(["admin","teacher"]);
  const params=await searchParams;
  const supabase=await createClient();
  const month=monthValue(params.month);
  const monthDate=`${month}-01`;
  const monthEnd=nextMonth(month);
  const manager=profile.role==="admin";

  const {data:teacherList}=manager
    ? await supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name")
    : {data:[] as any[]};

  let teacherId=params.teacher_id||"";
  let teacher:any=null;
  if(profile.role==="teacher"){
    const {data}=await supabase.from("teachers").select("id,code,full_name").eq("user_id",profile.id).maybeSingle();
    teacher=data;teacherId=data?.id||"";
  } else {
    if(!teacherId) teacherId=teacherList?.[0]?.id||"";
    teacher=(teacherList||[]).find((x:any)=>x.id===teacherId)||null;
  }

  if(!teacherId||!teacher){
    return <PageHeader eyebrow="Bảng công" title="Chưa có giáo viên" description="Không tìm thấy hồ sơ giáo viên."/>;
  }

  const [{data:rows},{data:live},{data:statement}]=await Promise.all([
    supabase.from("teacher_payroll_session_detail")
      .select("session_id,class_code,class_name,class_category,session_no,scheduled_date,start_time,end_time,duration_hours,session_status,teacher_role,payroll_factor,check_in_at,check_out_at,late_minutes,class_size,rate_type,applied_rate,payroll_eligible,payable_hours,pay_amount")
      .eq("teacher_id",teacherId).gte("scheduled_date",monthDate).lt("scheduled_date",monthEnd)
      .order("scheduled_date").order("start_time"),
    supabase.from("teacher_payroll_live_monthly")
      .select("completed_hours,teaching_hours,ta_hours,tutoring_hours,group_hours,tutoring_rate,group_rate,ta_hourly_rate,tutoring_amount,group_amount,teaching_amount,ta_amount,estimated_payroll")
      .eq("teacher_id",teacherId).eq("payroll_month",monthDate).maybeSingle(),
    supabase.from("teacher_payroll_statements")
      .select("teacher_status,admin_status,gross_amount,teacher_reviewed_at,admin_approved_at")
      .eq("teacher_id",teacherId).eq("payroll_month",monthDate).maybeSingle()
  ]);

  const eligible=(rows||[]).filter((x:any)=>x.payroll_eligible && x.session_status!=="Cancelled");
  const missing=(rows||[]).filter((x:any)=>x.session_status!=="Cancelled" && (!x.check_in_at || !x.check_out_at));

  return <div className="timesheet-report">
    <PageHeader eyebrow="Teacher Timesheet" title={`Bảng công ${teacher.full_name} · ${monthLabel(month)}`} description="Chỉ giờ có đủ Check-in + Check-out hợp lệ mới được tính lương." actions={<div className="page-actions no-print"><Link className="button button-secondary" href={`/payroll?month=${month}`}>← Bảng lương</Link><Link className="button button-secondary" href={`/workforce/kpi?month=${month}${manager?`&teacher_id=${teacherId}`:""}`}>KPI PDF</Link><PrintButton label="Xuất Bảng công PDF"/></div>}/>
    <div className="timesheet-print-brand"><img src="/zest-logo.png" alt="ZEST for English"/><div><strong>ZE CenterOS · BẢNG CÔNG GIÁO VIÊN</strong><span>{teacher.full_name} · {teacher.code}</span><span>{monthLabel(month)}</span></div></div>

    <form className="month-filter no-print" method="get"><label>Tháng<input type="month" name="month" defaultValue={month}/></label>{manager?<label>Giáo viên<select className="select input" name="teacher_id" defaultValue={teacherId}>{(teacherList||[]).map((t:any)=><option key={t.id} value={t.id}>{t.full_name} · {t.code}</option>)}</select></label>:null}<button className="button button-primary">Xem</button></form>

    <div className="metrics-grid">
      <MetricCard label="Giờ đủ điều kiện" value={`${Number(live?.completed_hours||0).toLocaleString("vi-VN")}h`} tone="green"/>
      <MetricCard label="Kèm · 1–3 HV" value={`${Number(live?.tutoring_hours||0).toLocaleString("vi-VN")}h`} note={`${formatMoney(live?.tutoring_rate||0)}/h`} tone="green"/>
      <MetricCard label="Nhóm · >3 HV" value={`${Number(live?.group_hours||0).toLocaleString("vi-VN")}h`} note={`${formatMoney(live?.group_rate||0)}/h`}/>
      <MetricCard label="TA" value={`${Number(live?.ta_hours||0).toLocaleString("vi-VN")}h`} note={`${formatMoney(live?.ta_hourly_rate||0)}/h`} tone="yellow"/>
      <MetricCard label="Lương live" value={formatMoney(live?.estimated_payroll||0)} note={`${missing.length} session thiếu IN/OUT`} tone={missing.length?"red":"green"}/>
    </div>

    <Panel className="section-gap" title="Chi tiết bảng công" description={`${eligible.length} session đủ điều kiện · ${missing.length} session thiếu chấm công`}>
      {(rows||[]).length?<div className="table-wrap timesheet-table-wrap"><table className="timesheet-table"><thead><tr><th>Ngày</th><th>Lớp / buổi</th><th>Sĩ số</th><th>Rate type</th><th>Role</th><th>Giờ lịch</th><th>Check-in</th><th>Check-out</th><th>Rate</th><th>Giờ tính lương</th><th>Thành tiền</th><th>Kết quả</th></tr></thead><tbody>{(rows||[]).map((row:any)=><tr key={`${row.session_id}-${row.teacher_role}`}><td>{formatDate(row.scheduled_date)}</td><td><strong>{row.class_code}</strong><br/><span className="muted">Buổi {row.session_no}</span></td><td>{row.class_size||"—"}</td><td><strong>{row.rate_type==="Tutoring"?"Kèm":row.rate_type==="Group"?"Nhóm":"TA"}</strong></td><td>{row.teacher_role==="Assistant"?"TA":"Teaching"}</td><td>{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}<br/><span className="muted">{Number(row.duration_hours||0).toLocaleString("vi-VN")}h</span></td><td>{formatDateTime(row.check_in_at)}</td><td>{formatDateTime(row.check_out_at)}</td><td>{formatMoney(row.applied_rate||0)}/h</td><td><strong>{Number(row.payable_hours||0).toLocaleString("vi-VN")}h</strong></td><td><strong>{formatMoney(row.pay_amount||0)}</strong></td><td><Status value={row.session_status==="Cancelled"?"Cancelled":row.payroll_eligible?"Approved":"Missing clock"}/></td></tr>)}</tbody></table></div>:<Empty title="Chưa có session trong tháng" description="Không có dữ liệu bảng công cho kỳ này."/>}
    </Panel>

    <Panel className="section-gap" title="Đối chiếu lương" description="Giá trị live từ chính bảng công phía trên.">
      <div className="timesheet-pay-summary"><div><span>Kèm · 1–3 HV</span><strong>{Number(live?.tutoring_hours||0).toLocaleString("vi-VN")}h × {formatMoney(live?.tutoring_rate||0)}</strong><b>{formatMoney(live?.tutoring_amount||0)}</b></div><div><span>Nhóm · &gt;3 HV</span><strong>{Number(live?.group_hours||0).toLocaleString("vi-VN")}h × {formatMoney(live?.group_rate||0)}</strong><b>{formatMoney(live?.group_amount||0)}</b></div><div><span>TA</span><strong>{Number(live?.ta_hours||0).toLocaleString("vi-VN")}h × {formatMoney(live?.ta_hourly_rate||0)}</strong><b>{formatMoney(live?.ta_amount||0)}</b></div><div className="total"><span>Tổng</span><strong>{Number(live?.completed_hours||0).toLocaleString("vi-VN")}h</strong><b>{formatMoney(live?.estimated_payroll||0)}</b></div></div>
      {statement?<div className="timesheet-statement-status"><span>GV: <Status value={statement.teacher_status}/></span><span>Admin: <Status value={statement.admin_status}/></span></div>:null}
    </Panel>

    <footer className="kpi-print-footer">ZE CenterOS · ZEST for English · Bảng công sinh tự động từ Check-in/Check-out trên hệ thống</footer>
  </div>;
}

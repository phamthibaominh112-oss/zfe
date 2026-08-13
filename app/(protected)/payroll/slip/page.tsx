import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Empty, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function monthValue(value?:string){return /^\d{4}-\d{2}$/.test(value||"")?String(value):new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);}
function monthLabel(month:string){const [y,m]=month.split("-");return `Tháng ${Number(m)}/${y}`;}
function nextMonth(month:string){const [y,m]=month.split("-").map(Number);const d=new Date(Date.UTC(y,m,1));return d.toISOString().slice(0,10);}

export default async function PayrollSlipPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const profile=await requireRole(["admin","teacher"]);
  const params=await searchParams;
  const supabase=await createClient();
  const month=monthValue(params.month);
  const monthDate=`${month}-01`;
  const isAdmin=profile.role==="admin";

  const {data:teacherList}=isAdmin
    ? await supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name")
    : {data:[] as any[]};

  let teacherId=params.teacher_id||"";
  let teacher:any=null;
  if(isAdmin){
    if(!teacherId) teacherId=teacherList?.[0]?.id||"";
    teacher=(teacherList||[]).find((x:any)=>x.id===teacherId)||null;
  }else{
    const {data}=await supabase.from("teachers").select("id,code,full_name").eq("user_id",profile.id).maybeSingle();
    teacher=data;teacherId=data?.id||"";
  }
  if(!teacherId||!teacher) return <Empty title="Không tìm thấy giáo viên" description="Không thể xuất phiếu lương."/>;

  const [{data:statement},{data:live},{data:details}]=await Promise.all([
    supabase.from("teacher_payroll_statements")
      .select("id,payroll_month,tutoring_hours,group_hours,ta_hours,tutoring_rate_snapshot,group_rate_snapshot,ta_hourly_rate_snapshot,tutoring_amount,group_amount,ta_amount,gross_amount,teacher_status,admin_status,teacher_reviewed_at,admin_approved_at")
      .eq("teacher_id",teacherId).eq("payroll_month",monthDate).maybeSingle(),
    supabase.from("teacher_payroll_live_monthly")
      .select("tutoring_hours,group_hours,ta_hours,tutoring_rate,group_rate,ta_hourly_rate,tutoring_amount,group_amount,ta_amount,estimated_payroll")
      .eq("teacher_id",teacherId).eq("payroll_month",monthDate).maybeSingle(),
    supabase.from("teacher_payroll_session_detail")
      .select("session_id,class_code,session_no,scheduled_date,rate_type,class_size,payable_hours,applied_rate,pay_amount,payroll_eligible")
      .eq("teacher_id",teacherId).gte("scheduled_date",monthDate).lt("scheduled_date",nextMonth(month)).eq("payroll_eligible",true)
      .order("scheduled_date")
  ]);

  const locked=!!statement && (statement.teacher_status==="Approved" || statement.admin_status!=="Pending");
  const tutoringHours=Number(locked?statement?.tutoring_hours:live?.tutoring_hours??statement?.tutoring_hours??0);
  const groupHours=Number(locked?statement?.group_hours:live?.group_hours??statement?.group_hours??0);
  const taHours=Number(locked?statement?.ta_hours:live?.ta_hours??statement?.ta_hours??0);
  const tutoringRate=Number(locked?statement?.tutoring_rate_snapshot:live?.tutoring_rate??statement?.tutoring_rate_snapshot??0);
  const groupRate=Number(locked?statement?.group_rate_snapshot:live?.group_rate??statement?.group_rate_snapshot??0);
  const taRate=Number(locked?statement?.ta_hourly_rate_snapshot:live?.ta_hourly_rate??statement?.ta_hourly_rate_snapshot??0);
  const tutoringAmount=Number(locked?statement?.tutoring_amount:live?.tutoring_amount??statement?.tutoring_amount??0);
  const groupAmount=Number(locked?statement?.group_amount:live?.group_amount??statement?.group_amount??0);
  const taAmount=Number(locked?statement?.ta_amount:live?.ta_amount??statement?.ta_amount??0);
  const total=Number(locked?statement?.gross_amount:live?.estimated_payroll??statement?.gross_amount??0);

  return <div className="salary-slip-report">
    <PageHeader eyebrow="Payroll Slip" title={`Phiếu lương · ${monthLabel(month)}`} description={`${teacher.full_name} · ${teacher.code}`} actions={<div className="page-actions no-print"><Link className="button button-secondary" href={`/payroll?month=${month}`}>← Bảng lương</Link><Link className="button button-secondary" href={`/payroll/timesheet?month=${month}${isAdmin?`&teacher_id=${teacherId}`:""}`}>Bảng công</Link><PrintButton label="Xuất Phiếu lương PDF"/></div>}/>
    <div className="salary-slip-brand"><img src="/zest-logo.png" alt="ZEST for English"/><div><strong>ZEST FOR ENGLISH</strong><span>ZE CenterOS · PHIẾU LƯƠNG GIÁO VIÊN</span></div></div>

    {isAdmin?<form className="month-filter no-print" method="get"><label>Tháng<input type="month" name="month" defaultValue={month}/></label><label>Giáo viên<select className="select input" name="teacher_id" defaultValue={teacherId}>{(teacherList||[]).map((row:any)=><option key={row.id} value={row.id}>{row.full_name} · {row.code}</option>)}</select></label><button className="button button-primary">Xem</button></form>:null}

    <section className="salary-slip-meta"><div><span>Giáo viên</span><strong>{teacher.full_name}</strong><small>{teacher.code}</small></div><div><span>Kỳ lương</span><strong>{monthLabel(month)}</strong></div><div><span>GV xác nhận</span><Status value={statement?.teacher_status||"Live"}/></div><div><span>Admin</span><Status value={statement?.admin_status||"Chưa duyệt"}/></div></section>

    <Panel className="section-gap" title="Chi tiết thu nhập" description="Rate Card tự áp dụng theo sĩ số từng session.">
      <div className="salary-slip-lines">
        <div><span>Kèm · 1–3 HV</span><strong>{tutoringHours.toLocaleString("vi-VN")}h × {formatMoney(tutoringRate)}</strong><b>{formatMoney(tutoringAmount)}</b></div>
        <div><span>Nhóm · &gt;3 HV</span><strong>{groupHours.toLocaleString("vi-VN")}h × {formatMoney(groupRate)}</strong><b>{formatMoney(groupAmount)}</b></div>
        <div><span>TA / Co-teacher</span><strong>{taHours.toLocaleString("vi-VN")}h × {formatMoney(taRate)}</strong><b>{formatMoney(taAmount)}</b></div>
        <div className="salary-slip-total"><span>THỰC NHẬN / GROSS</span><strong>{(tutoringHours+groupHours+taHours).toLocaleString("vi-VN")} giờ</strong><b>{formatMoney(total)}</b></div>
      </div>
    </Panel>

    <Panel className="section-gap" title="Session tính lương" description={`${(details||[]).length} session đủ Check-in/Check-out`}>
      {(details||[]).length?<div className="table-wrap salary-slip-table-wrap"><table className="salary-slip-table"><thead><tr><th>Ngày</th><th>Lớp</th><th>Buổi</th><th>Sĩ số</th><th>Loại rate</th><th>Giờ</th><th>Rate</th><th>Thành tiền</th></tr></thead><tbody>{(details||[]).map((row:any)=><tr key={`${row.session_id}-${row.rate_type}`}><td>{formatDate(row.scheduled_date)}</td><td><strong>{row.class_code}</strong></td><td>{row.session_no}</td><td>{row.class_size||"—"}</td><td>{row.rate_type==="Tutoring"?"Kèm":row.rate_type==="Group"?"Nhóm":"TA"}</td><td>{Number(row.payable_hours||0).toLocaleString("vi-VN")}h</td><td>{formatMoney(row.applied_rate||0)}</td><td><strong>{formatMoney(row.pay_amount||0)}</strong></td></tr>)}</tbody></table></div>:<Empty title="Chưa có giờ đủ điều kiện" description="Chỉ session có đủ Check-in + Check-out mới xuất hiện."/>}
    </Panel>

    <div className="salary-slip-signatures"><div><span>Giáo viên</span><strong>{teacher.full_name}</strong><small>Xác nhận trên ZE CenterOS</small></div><div><span>Admin / Trung tâm</span><strong>ZEST for English</strong><small>Phê duyệt trên ZE CenterOS</small></div></div>
    <footer className="kpi-print-footer">ZE CenterOS · Phiếu lương sinh tự động từ bảng công và Rate Card</footer>
  </div>;
}

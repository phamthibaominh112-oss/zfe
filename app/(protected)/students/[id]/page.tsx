import { notFound } from "next/navigation";
import { createStudentAvailability, updateEnrollmentTimeline, updateStudent } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { PageHeader, Panel, Status, Flash, FormDetails, Empty } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

const WEEKDAYS = [
  { value: "1", label: "Thứ hai" }, { value: "2", label: "Thứ ba" }, { value: "3", label: "Thứ tư" },
  { value: "4", label: "Thứ năm" }, { value: "5", label: "Thứ sáu" }, { value: "6", label: "Thứ bảy" }, { value: "7", label: "Chủ nhật" }
];

export default async function StudentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();

  const studentQuery = profile.role === "teacher"
    ? supabase.from("students").select("id,code,full_name,status,entry_level,target,notes,created_at")
    : supabase.from("students").select("id,code,full_name,date_of_birth,phone,email,guardian_name,guardian_phone,source,status,entry_level,target,notes,created_at");
  const { data: student } = await studentQuery.eq("id", id).is("archived_at", null).maybeSingle();
  if (!student) notFound();

  const { data: enrollments } = await supabase.from("enrollments").select("id,class_id,start_date,end_date,status,target,classes(id,code,name,category,mode,status,total_sessions,total_hours,target)").eq("student_id", id).is("archived_at", null).order("created_at", { ascending: false });
  const enrollmentIds = (enrollments || []).map((x: any) => x.id);
  const classIds = (enrollments || []).map((x: any) => x.class_id);

  const canAcademic = ["admin","academic_manager","customer_service","teacher","student"].includes(profile.role);
  const canFinance = ["admin","customer_service","student"].includes(profile.role);
  const canEditProfile = ["admin","academic_manager","customer_service"].includes(profile.role);

  const [availability, attendance, homework, results, feedback, tuition, upcomingSessions] = await Promise.all([
    ["admin","academic_manager","customer_service","student"].includes(profile.role)
      ? supabase.from("student_availability").select("id,weekday,start_time,end_time,effective_from,effective_to,is_recurring,note").eq("student_id", id).order("weekday")
      : Promise.resolve({ data: [] as any[] }),
    canAcademic
      ? supabase.from("attendance").select("id,status,late_minutes,reason,marked_at,sessions(session_no,scheduled_date,start_time,classes(code,name))").eq("student_id", id).order("marked_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as any[] }),
    canAcademic
      ? supabase.from("homework_records").select("id,status,note,marked_at,sessions(session_no,scheduled_date,classes(code,name))").eq("student_id", id).order("marked_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as any[] }),
    canAcademic
      ? supabase.from("assessment_results").select("id,score,band,cefr,comment,published_at,graded_at,assessments(name,type,max_score,assessment_date,classes(code,name))").eq("student_id", id).order("graded_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as any[] }),
    enrollmentIds.length && canAcademic
      ? supabase.from("progress_feedback").select("id,milestone,status,strengths,areas_to_improve,current_performance,recommendation,risk_level,published_at,enrollment_id").in("enrollment_id", enrollmentIds).order("milestone", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    canFinance
      ? supabase.from("tuition_accounts").select("id,package_name,gross_amount,discount_amount,net_amount,paid_amount,balance_amount,purchased_hours,used_hours,renewal_due_date,status,created_at").eq("student_id", id).is("archived_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    classIds.length
      ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,classes(code,name)").in("class_id", classIds).gte("scheduled_date", new Date().toISOString().slice(0,10)).order("scheduled_date").limit(10)
      : Promise.resolve({ data: [] as any[] })
  ]);

  const actions = <div className="page-actions"><a className="button button-secondary" href={`/students/${student.id}/learning`}>Học tập & tiến bộ</a>
    {canEditProfile ? <FormDetails title="Chỉnh sửa hồ sơ"><form action={updateStudent}><input type="hidden" name="student_id" value={student.id}/><FormGrid>
      <Field label="Họ và tên" name="full_name" required defaultValue={student.full_name} />
      <Field label="Ngày sinh" name="date_of_birth" type="date" defaultValue={(student as any).date_of_birth || ""} />
      <Field label="Số điện thoại" name="phone" defaultValue={(student as any).phone || ""} />
      <Field label="Email" name="email" type="email" defaultValue={(student as any).email || ""} />
      <Field label="Người liên hệ" name="guardian_name" defaultValue={(student as any).guardian_name || ""} />
      <Field label="SĐT người liên hệ" name="guardian_phone" defaultValue={(student as any).guardian_phone || ""} />
      <Field label="Nguồn lead" name="source" defaultValue={(student as any).source || ""} />
      <Field label="Level đầu vào" name="entry_level" defaultValue={student.entry_level || ""} />
      <Field label="Target" name="target" defaultValue={student.target || ""} />
      <SelectField label="Trạng thái" name="status" required defaultValue={student.status} options={[
        {value:"Waiting for class",label:"Chờ xếp lớp"},{value:"Active",label:"Đang học"},{value:"Paused",label:"Tạm dừng"},{value:"Completed",label:"Hoàn thành"},{value:"Stopped",label:"Ngưng học"}
      ]} />
      <TextAreaField label="Ghi chú" name="notes" defaultValue={student.notes || ""} />
      <div className="form-actions"><button className="button button-primary">Lưu thay đổi</button></div>
    </FormGrid></form></FormDetails> : null}
    {["admin","academic_manager","customer_service"].includes(profile.role) ? <FormDetails title="Thêm lịch rảnh"><form action={createStudentAvailability}><input type="hidden" name="student_id" value={student.id}/><FormGrid>
      <SelectField label="Ngày trong tuần" name="weekday" required options={WEEKDAYS} />
      <Field label="Từ giờ" name="start_time" type="time" required />
      <Field label="Đến giờ" name="end_time" type="time" required />
      <Field label="Hiệu lực từ" name="effective_from" type="date" required defaultValue={new Date().toISOString().slice(0,10)} />
      <Field label="Hiệu lực đến" name="effective_to" type="date" />
      <label className="form-group"><span>Lặp hàng tuần</span><input name="is_recurring" type="checkbox" defaultChecked /></label>
      <TextAreaField label="Ghi chú" name="note" />
      <div className="form-actions"><button className="button button-primary">Lưu lịch rảnh</button></div>
    </FormGrid></form></FormDetails> : null}
  </div>;

  return <>
    <PageHeader eyebrow="Hồ sơ học viên" title={`${student.code} · ${student.full_name}`} description={profile.role === "teacher" ? "Theo dõi lớp học, điểm danh, bài tập và kết quả học tập." : "Thông tin tổng hợp về lớp học, tiến độ, lịch và học phí của học viên."} actions={actions} />
    <Flash message={messages.message} error={messages.error} />

    {(()=>{const active=(enrollments||[]).find((x:any)=>x.status==="Active"&&x.end_date);if(!active)return null;const days=Math.ceil((new Date(`${active.end_date}T00:00:00`).getTime()-Date.now())/86400000);return days<=30?<div className={`student-renewal-warning ${days<0?"overdue":days<=7?"urgent":""}`}><strong>{days<0?"Đã qua End date":days===0?"End date hôm nay":`Còn ${days} ngày tới End date`}</strong><span>{active.classes?.code} · CSKH cần chuẩn bị tái phí / gia hạn.</span></div>:null;})()}
    <Panel title="Thông tin tổng quan" description="Dữ liệu hồ sơ gốc">
      <div className="profile-grid">
        <div className="profile-item"><span>Trạng thái</span><strong><Status value={student.status}/></strong></div>
        <div className="profile-item"><span>Level đầu vào</span><strong>{student.entry_level || "—"}</strong></div>
        <div className="profile-item"><span>Target</span><strong>{student.target || "—"}</strong></div>
        <div className="profile-item"><span>Số lớp tham gia</span><strong>{enrollments?.length || 0}</strong></div>
        {profile.role !== "teacher" ? <>
          <div className="profile-item"><span>Điện thoại</span><strong>{(student as any).phone || "—"}</strong></div>
          <div className="profile-item"><span>Email</span><strong>{(student as any).email || "—"}</strong></div>
          <div className="profile-item"><span>Người liên hệ</span><strong>{(student as any).guardian_name || "—"}</strong></div>
          <div className="profile-item"><span>Nguồn lead</span><strong>{(student as any).source || "—"}</strong></div>
        </> : null}
      </div>
    </Panel>

    <div className="grid-2 section-gap">
      <Panel title="Lớp học & lộ trình" description="Các lớp học viên đang hoặc đã tham gia">
        {enrollments?.length ? <div className="enrollment-timeline-list">{enrollments.map((item: any) => <div className="enrollment-timeline-card" key={item.id}><div className="enrollment-timeline-main"><div><strong>{item.classes?.code} · {item.classes?.name}</strong><span>{item.classes?.category} · {item.classes?.mode} · Target: {item.target || item.classes?.target || "—"}</span></div><Status value={item.status}/></div><div className="enrollment-date-strip"><div><span>Start date</span><strong>{formatDate(item.start_date)}</strong></div><div><span>End date</span><strong>{item.end_date?formatDate(item.end_date):"Chưa set"}</strong></div></div>{canEditProfile?<details className="inline-details enrollment-date-edit"><summary className="button button-secondary button-small">Sửa Start / End date</summary><form action={updateEnrollmentTimeline} className="form-stack"><input type="hidden" name="enrollment_id" value={item.id}/><input type="hidden" name="student_id" value={student.id}/><Field label="Start date" name="start_date" type="date" required defaultValue={item.start_date}/><Field label="End date / hạn dự kiến" name="end_date" type="date" defaultValue={item.end_date||""}/><button className="button button-primary">Lưu timeline</button></form></details>:null}</div>)}</div> : <Empty title="Chưa được xếp lớp" description="Học vụ sẽ xếp học viên vào lớp phù hợp." />}
      </Panel>
      <Panel title="Lịch học sắp tới" description="Session-level schedule">
        {upcomingSessions.data?.length ? <div className="alert-list">{upcomingSessions.data.map((item: any) => <div className="alert-item" key={item.id}><i/><div><strong>{item.classes?.code} · Session {item.session_no}</strong><span>{formatDate(item.scheduled_date)} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span></div><Status value={item.status}/></div>)}</div> : <Empty title="Chưa có lịch" description="Session mới sẽ xuất hiện sau khi học vụ tạo lịch." />}
      </Panel>
    </div>

    {["admin","academic_manager","customer_service","student"].includes(profile.role) ? <Panel className="section-gap" title="Lịch rảnh học viên" description="Dùng để tìm khung giờ học phù hợp">
      {availability.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Ngày</th><th>Khung giờ</th><th>Hiệu lực</th><th>Lặp</th><th>Ghi chú</th></tr></thead><tbody>{availability.data.map((item: any) => <tr key={item.id}><td>{WEEKDAYS.find(x=>x.value===String(item.weekday))?.label}</td><td>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</td><td>{formatDate(item.effective_from)} → {formatDate(item.effective_to)}</td><td>{item.is_recurring ? "Hàng tuần" : "Một lần"}</td><td>{item.note || "—"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa khai báo lịch rảnh" description="CSKH hoặc Học vụ có thể thêm lịch rảnh cho học viên." />}
    </Panel> : null}

    {canAcademic ? <div className="grid-2 section-gap">
      <Panel title="Attendance gần đây" description="CSKH không có quyền đọc bảng attendance">
        {attendance.data?.length ? <div className="alert-list">{attendance.data.map((item: any) => <div className="alert-item" key={item.id}><i/><div><strong>{item.sessions?.classes?.code} · Session {item.sessions?.session_no}</strong><span>{formatDate(item.sessions?.scheduled_date)} · {item.reason || "Không có ghi chú"}</span></div><Status value={item.status}/></div>)}</div> : <Empty title="Chưa có attendance" description="Giáo viên check attendance theo từng session." />}
      </Panel>
      <Panel title="Homework completion" description="Theo từng buổi học">
        {homework.data?.length ? <div className="alert-list">{homework.data.map((item: any) => <div className="alert-item" key={item.id}><i/><div><strong>{item.sessions?.classes?.code} · Session {item.sessions?.session_no}</strong><span>{item.note || formatDate(item.sessions?.scheduled_date)}</span></div><Status value={item.status}/></div>)}</div> : <Empty title="Chưa có dữ liệu homework" description="Giáo viên cập nhật sau mỗi buổi." />}
      </Panel>
    </div> : null}

    {canAcademic ? <div className="grid-2 section-gap">
      <Panel title="Assessment results" description="Student chỉ thấy kết quả đã publish">
        {results.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Bài đánh giá</th><th>Điểm</th><th>Band / CEFR</th><th>Ngày</th></tr></thead><tbody>{results.data.map((item: any) => <tr key={item.id}><td><strong>{item.assessments?.name}</strong><br/><span className="muted-text">{item.assessments?.type} · {item.assessments?.classes?.code}</span></td><td>{item.score ?? "—"} / {item.assessments?.max_score}</td><td>{item.band || "—"} · {item.cefr || "—"}</td><td>{formatDate(item.assessments?.assessment_date)}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có kết quả" description="Điểm mid-final và assessment sẽ được lưu tại đây." />}
      </Panel>
      <Panel title="Progress feedback" description="Workflow 30% · 50% · 70% · 100%">
        {feedback.data?.length ? <div className="alert-list">{feedback.data.map((item: any) => <div className="alert-item" key={item.id}><i/><div><strong>Milestone {item.milestone}% · {item.risk_level} risk</strong><span>{item.current_performance}</span></div><Status value={item.status}/></div>)}</div> : <Empty title="Chưa có feedback" description="Teacher submit → Học vụ duyệt → Student nhận bản publish." />}
      </Panel>
    </div> : null}

    {canFinance ? <Panel className="section-gap" title="Học phí & tái phí" description="Chỉ Admin, CSKH và chính học viên được xem">
      {tuition.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Gói học</th><th>Giá trị</th><th>Đã đóng</th><th>Còn lại</th><th>Tái phí</th><th>Trạng thái</th></tr></thead><tbody>{tuition.data.map((item: any) => <tr key={item.id}><td><strong>{item.package_name}</strong></td><td>{formatMoney(item.net_amount)}</td><td>{formatMoney(item.paid_amount)}</td><td>{formatMoney(item.balance_amount)}</td><td>{formatDate(item.renewal_due_date)}</td><td><Status value={item.status}/></td></tr>)}</tbody></table></div> : <Empty title="Chưa có tài khoản học phí" description="CSKH tạo tuition account sau khi chốt và nhận phí." />}
    </Panel> : null}
  </>;
}

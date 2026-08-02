import { createSession, createTeacherAvailability } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const DAY_LABELS = ["Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy","Chủ nhật"];

function getWeek(offset: number) {
  const today = new Date();
  const day = today.getDay() || 7;
  const start = new Date(today); start.setDate(today.getDate() - day + 1 + offset * 7);
  const days = Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
  return days;
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireRole(["admin","academic_manager","teacher","student"]);
  const params = await searchParams;
  const offset = Number(params.week || 0);
  const days = getWeek(Number.isFinite(offset) ? offset : 0);
  const start = days[0].toISOString().slice(0,10);
  const end = days[6].toISOString().slice(0,10);
  const supabase = await createClient();

  const canManage = ["admin","academic_manager"].includes(profile.role);
  const [sessions, availability, studentAvailability, teachers, classes, students] = await Promise.all([
    supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,duration_hours,mode,status,topic,classes(code,name),session_teachers(role,teachers(id,full_name))").gte("scheduled_date",start).lte("scheduled_date",end).is("archived_at",null).order("scheduled_date").order("start_time"),
    profile.role === "student" ? Promise.resolve({data:[] as any[]}) : supabase.from("teacher_availability").select("id,weekday,start_time,end_time,mode,campus,effective_from,effective_to,is_recurring,note,teachers(id,code,full_name)").order("weekday").order("start_time"),
    canManage ? supabase.from("student_availability").select("id,student_id,weekday,start_time,end_time,effective_from,effective_to,is_recurring,note,students(id,code,full_name,status)").order("weekday").order("start_time") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("classes").select("id,code,name,mode,status").in("status",["Ready","Active"]).is("archived_at",null).order("code") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("students").select("id,code,full_name,status").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]})
  ]);

  const selectedStudentId = canManage ? String(params.student || "") : "";
  const selectedStudentSlots = (studentAvailability.data || []).filter((slot:any) => slot.student_id === selectedStudentId);
  const matchingRows = selectedStudentSlots.flatMap((studentSlot:any) => (availability.data || []).filter((teacherSlot:any) => teacherSlot.weekday === studentSlot.weekday && teacherSlot.start_time < studentSlot.end_time && teacherSlot.end_time > studentSlot.start_time).map((teacherSlot:any) => ({ studentSlot, teacherSlot })));

  const actions = <div className="page-actions">
    {profile.role !== "student" ? <FormDetails title="Đăng ký lịch rảnh"><form action={createTeacherAvailability}><FormGrid>
      {canManage ? <SelectField label="Giáo viên" name="teacher_id" required options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/> : null}
      <SelectField label="Ngày" name="weekday" required options={DAY_LABELS.map((label,index)=>({value:String(index+1),label}))}/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/>
      <SelectField label="Mode" name="mode" options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/><Field label="Cơ sở" name="campus"/>
      <Field label="Hiệu lực từ" name="effective_from" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/><Field label="Hiệu lực đến" name="effective_to" type="date"/>
      <label className="form-group"><span>Lặp hàng tuần</span><input name="is_recurring" type="checkbox" defaultChecked/></label><TextAreaField label="Ghi chú" name="note"/>
      <div className="form-actions"><button className="button button-primary">Lưu availability</button></div>
    </FormGrid></form></FormDetails> : null}
    {canManage ? <FormDetails title="Tạo session"><form action={createSession}><FormGrid>
      <SelectField label="Lớp" name="class_id" required options={(classes.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
      <Field label="Session number" name="session_no" type="number" required/><Field label="Ngày" name="scheduled_date" type="date" required/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/><Field label="Duration" name="duration_hours" type="number" step="0.25" required/>
      <SelectField label="Mode" name="mode" required options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/><SelectField label="Giáo viên" name="teacher_id" options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <Field label="Cơ sở" name="campus"/><Field label="Phòng" name="room"/><Field label="Meeting URL" name="meeting_url"/><Field label="Topic" name="topic"/>
      <div className="form-actions"><button className="button button-primary">Tạo session</button></div>
    </FormGrid></form></FormDetails> : null}
  </div>;

  return <>
    <PageHeader eyebrow="Scheduling engine" title="Lịch & Matching" description={profile.role === "student" ? "Chỉ lịch thuộc các lớp bạn đang enroll được hiển thị." : profile.role === "teacher" ? "Bạn chỉ thấy lịch dạy và availability của chính mình." : "So sánh session schedule với teacher availability để kiểm soát conflict và workload."} actions={actions}/>
    <Flash message={params.message} error={params.error}/>
    {canManage ? <Panel title="Availability Matching Board" description="Chọn học viên để tìm các slot giáo viên overlap theo weekday và thời gian" className="section-gap"><form className="inline-form" method="get"><label className="form-group"><span>Học viên</span><select className="select" name="student" defaultValue={selectedStudentId}><option value="">Chọn học viên...</option>{(students.data || []).map((student:any)=><option value={student.id} key={student.id}>{student.code} · {student.full_name} · {student.status}</option>)}</select></label><input type="hidden" name="week" value={offset}/><button className="button button-primary">Tìm lịch match</button></form>{selectedStudentId ? <div className="section-gap">{matchingRows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Ngày</th><th>Lịch rảnh HV</th><th>Giáo viên</th><th>Lịch rảnh GV</th><th>Mode / Campus</th></tr></thead><tbody>{matchingRows.map((row:any,index:number)=><tr key={`${row.teacherSlot.id}-${row.studentSlot.id}-${index}`}><td>{DAY_LABELS[row.studentSlot.weekday-1]}</td><td>{row.studentSlot.start_time?.slice(0,5)}–{row.studentSlot.end_time?.slice(0,5)}</td><td><strong>{row.teacherSlot.teachers?.code} · {row.teacherSlot.teachers?.full_name}</strong></td><td>{row.teacherSlot.start_time?.slice(0,5)}–{row.teacherSlot.end_time?.slice(0,5)}</td><td>{row.teacherSlot.mode || "Any"} · {row.teacherSlot.campus || "Any campus"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có slot overlap" description="Cập nhật availability của học viên hoặc giáo viên để hệ thống tìm match."/>}</div> : <div className="note-box section-gap">Matching chỉ dùng dữ liệu availability đã đăng ký. Học vụ vẫn cần kiểm tra workload, program/level, campus và conflict session trước khi assign.</div>}</Panel> : null}
    <div className="week-toolbar">
      <a className="button button-ghost" href={`/schedule?week=${offset-1}`}>← Tuần trước</a>
      <div className="week-title"><strong>{formatDate(start)} – {formatDate(end)}</strong><span>{sessions.data?.length || 0} session có quyền truy cập</span></div>
      <a className="button button-ghost" href={`/schedule?week=${offset+1}`}>Tuần sau →</a>
    </div>
    <div className="week-grid">
      {days.map((day,index)=>{ const key=day.toISOString().slice(0,10); const items=(sessions.data||[]).filter((x:any)=>x.scheduled_date===key); return <section className="day-column" key={key}><div className="day-header"><span>{DAY_LABELS[index]}</span><strong>{day.getDate().toString().padStart(2,"0")}/{(day.getMonth()+1).toString().padStart(2,"0")}</strong></div><div className="day-events">{items.length ? items.map((item:any)=><article className={`session-card ${item.mode === "Offline" ? "offline" : ""}`} key={item.id}><strong>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)} · {item.duration_hours}h</strong><span>{item.classes?.code} · #{item.session_no}</span><small>{(item.session_teachers||[]).map((x:any)=>x.teachers?.full_name).filter(Boolean).join(", ") || "Chưa phân GV"}</small><small><Status value={item.status}/></small></article>) : <span className="muted-text">Không có lịch</span>}</div></section>; })}
    </div>
    {profile.role !== "student" ? <Panel className="section-gap" title="Teacher availability" description={canManage ? "Học vụ thấy toàn bộ availability để match; giáo viên chỉ thấy của mình." : "Availability của chính bạn"}>
      {availability.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{canManage ? <th>Giáo viên</th> : null}<th>Ngày</th><th>Khung giờ</th><th>Mode / Cơ sở</th><th>Hiệu lực</th><th>Ghi chú</th></tr></thead><tbody>{availability.data.map((item:any)=><tr key={item.id}>{canManage ? <td><strong>{item.teachers?.code} · {item.teachers?.full_name}</strong></td> : null}<td>{DAY_LABELS[item.weekday-1]}</td><td>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</td><td>{item.mode || "Any"} · {item.campus || "Any campus"}</td><td>{formatDate(item.effective_from)} → {formatDate(item.effective_to)}</td><td>{item.note || "—"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có availability" description="Giáo viên cần book lịch rảnh hàng tuần."/>}
    </Panel> : null}
    {canManage ? <Panel className="section-gap" title="Student availability" description="Lịch rảnh do CSKH/Học vụ ghi nhận để xếp lớp và match giáo viên">{studentAvailability.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Học viên</th><th>Ngày</th><th>Khung giờ</th><th>Hiệu lực</th><th>Ghi chú</th></tr></thead><tbody>{studentAvailability.data.map((item:any)=><tr key={item.id}><td><strong>{item.students?.code} · {item.students?.full_name}</strong><br/><span className="muted-text">{item.students?.status}</span></td><td>{DAY_LABELS[item.weekday-1]}</td><td>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</td><td>{formatDate(item.effective_from)} → {formatDate(item.effective_to)}</td><td>{item.note || "—"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có lịch rảnh học viên" description="CSKH hoặc Học vụ thêm availability trong Student Profile."/>}</Panel> : null}
  </>;
}

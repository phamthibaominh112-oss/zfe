import { notFound } from "next/navigation";
import { createSession, enrollStudent, rescheduleSession, setClassTeachingTeam, updateClass } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDate, sessionDisplayLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function getJoinedName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" && "name" in first
      ? String((first as { name?: unknown }).name ?? "") || null
      : null;
  }

  return value && typeof value === "object" && "name" in value
    ? String((value as { name?: unknown }).name ?? "") || null
    : null;
}

export default async function ClassDetailPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();

  const [{ data: classRow }, { data: progress }] = await Promise.all([
    supabase.from("classes").select("id,code,name,category,program_id,level_id,mode,campus,room,start_date,expected_end_date,total_hours,total_sessions,target,capacity,status,notes,programs(name),levels(name)").eq("id",id).is("archived_at",null).maybeSingle(),
    supabase.from("class_progress").select("completed_sessions,progress_percent").eq("id",id).maybeSingle()
  ]);
  if (!classRow) notFound();

  const canManage = ["admin","academic_manager"].includes(profile.role);
  const canSeeRoster = ["admin","academic_manager","teacher","customer_service"].includes(profile.role);
  const [teacherAssignments, enrollments, sessions, programs, levels, allTeachers, allStudents, sessionChanges] = await Promise.all([
    supabase.from("class_teachers").select("id,role,payroll_factor,teachers(id,code,full_name,specialization)").eq("class_id",id),
    supabase.from("enrollments").select("id,status,target,start_date,students(id,code,full_name,entry_level,target)").eq("class_id",id).is("archived_at",null),
    supabase.from("sessions").select("id,session_no,scheduled_date,start_time,end_time,duration_hours,mode,status,topic,session_teachers(role,teachers(full_name))").eq("class_id",id).is("archived_at",null).order("scheduled_date"),
    canManage ? supabase.from("programs").select("id,code,name").eq("is_active",true) : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("levels").select("id,code,name").eq("is_active",true) : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("students").select("id,code,full_name,status").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    supabase.from("session_changes").select("id,session_id,old_date,new_date,old_start_time,new_start_time,old_end_time,new_end_time,reason,created_at,sessions!inner(class_id,session_no)").eq("sessions.class_id", id).order("created_at", { ascending: false }).limit(20)
  ]);

  const mainClassTeacher = (teacherAssignments.data || []).find((x:any)=>x.role === "Main teacher");
  const assistantClassTeacher = (teacherAssignments.data || []).find((x:any)=>x.role === "Assistant");
  const activeSessionCount = (sessions.data || []).filter((x:any)=>x.status !== "Cancelled").length;

  const actions = canManage ? <div className="page-actions">
    <FormDetails title="Chỉnh sửa lớp"><form action={updateClass}><input type="hidden" name="class_id" value={id}/><FormGrid>
      <Field label="Tên lớp" name="name" required defaultValue={classRow.name}/>
      <SelectField label="Category" name="category" required defaultValue={classRow.category} options={["ZE","ZK","B2B","Workshop","Mock Test","Trial","Other"].map(v=>({value:v,label:v}))}/>
      <SelectField label="Hình thức" name="mode" required defaultValue={classRow.mode} options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/>
      <SelectField label="Program" name="program_id" defaultValue={classRow.program_id || ""} options={(programs.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
      <SelectField label="Level" name="level_id" defaultValue={classRow.level_id || ""} options={(levels.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
      <Field label="Cơ sở" name="campus" defaultValue={classRow.campus || ""}/><Field label="Phòng" name="room" defaultValue={classRow.room || ""}/>
      <Field label="Ngày bắt đầu" name="start_date" type="date" defaultValue={classRow.start_date || ""}/><Field label="Ngày kết thúc" name="expected_end_date" type="date" defaultValue={classRow.expected_end_date || ""}/>
      <Field label="Tổng giờ" name="total_hours" type="number" step="0.25" required defaultValue={classRow.total_hours}/><Field label="Tổng session" name="total_sessions" type="number" required defaultValue={classRow.total_sessions}/>
      <Field label="Capacity" name="capacity" type="number" required defaultValue={classRow.capacity}/><SelectField label="Trạng thái" name="status" required defaultValue={classRow.status} options={["Draft","Waiting","Ready","Active","Paused","Completed","Closed"].map(v=>({value:v,label:v}))}/>
      <Field label="Target" name="target" defaultValue={classRow.target || ""}/><TextAreaField label="Ghi chú" name="notes" defaultValue={classRow.notes || ""}/>
      <div className="form-actions"><button className="button button-primary">Lưu thay đổi</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Đội ngũ giảng dạy"><form action={setClassTeachingTeam}><input type="hidden" name="class_id" value={id}/><FormGrid>
      <SelectField label="Giáo viên chính" name="main_teacher_id" required defaultValue={mainClassTeacher?.teachers?.id || ""} options={(allTeachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <SelectField label="Trợ giảng (TA)" name="assistant_teacher_id" defaultValue={assistantClassTeacher?.teachers?.id || ""} options={(allTeachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <Field label="Hệ số GV chính" name="main_payroll_factor" type="number" step="0.1" defaultValue={mainClassTeacher?.payroll_factor ?? 1}/>
      <Field label="Hệ số TA" name="assistant_payroll_factor" type="number" step="0.1" defaultValue={assistantClassTeacher?.payroll_factor ?? 1}/>
      <div className="form-actions"><button className="button button-primary">Lưu đội ngũ lớp</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Xếp học viên"><form action={enrollStudent}><input type="hidden" name="class_id" value={id}/><FormGrid>
      <SelectField label="Học viên" name="student_id" required options={(allStudents.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name} · ${x.status}`}))}/>
      <Field label="Ngày bắt đầu" name="start_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/><Field label="Target riêng" name="target"/>
      <div className="form-actions"><button className="button button-primary">Enroll</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Tạo session"><form action={createSession}><input type="hidden" name="class_id" value={id}/><FormGrid>
      <Field label="Số buổi học thực tế" name="session_no" type="number" required defaultValue={activeSessionCount+1}/><Field label="Ngày học" name="scheduled_date" type="date" required/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/><Field label="Duration hours" name="duration_hours" type="number" step="0.25" required/>
      <SelectField label="Hình thức" name="mode" required defaultValue={classRow.mode} options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/>
      <SelectField label="Giáo viên chính" name="teacher_id" defaultValue={mainClassTeacher?.teachers?.id || ""} options={(allTeachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/><SelectField label="Trợ giảng (TA)" name="assistant_teacher_id" defaultValue={assistantClassTeacher?.teachers?.id || ""} options={(allTeachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <Field label="Cơ sở" name="campus" defaultValue={classRow.campus || ""}/><Field label="Phòng" name="room" defaultValue={classRow.room || ""}/><Field label="Meeting URL" name="meeting_url"/><Field label="Topic" name="topic"/>
      <div className="form-actions"><button className="button button-primary">Tạo session</button></div>
    </FormGrid></form></FormDetails>
  </div> : undefined;

  return <>
    <PageHeader eyebrow="Chi tiết lớp học" title={`${classRow.code} · ${classRow.name}`} description="Theo dõi giáo viên, học viên, lịch học và tiến độ của lớp tại một nơi." actions={actions}/>
    <Flash message={messages.message} error={messages.error}/>
    <div className="metrics-grid">
      <article className="metric-card metric-blue"><span>Tiến độ</span><strong>{progress?.progress_percent || 0}%</strong><small>{progress?.completed_sessions || 0}/{classRow.total_sessions} session completed</small></article>
      <article className="metric-card metric-yellow"><span>Sĩ số</span><strong>{enrollments.data?.length || 0}/{classRow.capacity}</strong><small>Học viên trong lớp</small></article>
      <article className="metric-card metric-green"><span>Tổng giờ</span><strong>{classRow.total_hours}h</strong><small>{classRow.mode} · {classRow.campus || "No campus"}</small></article>
      <article className="metric-card metric-neutral"><span>Target</span><strong style={{fontSize:18}}>{classRow.target || "Chưa set"}</strong><small>{getJoinedName(classRow.programs) || "No program"} · {getJoinedName(classRow.levels) || "No level"}</small></article>
    </div>
    <div className="grid-2">
      <Panel title="Đội ngũ giảng dạy" description="Mỗi lớp có 1 Giáo viên chính và tối đa 1 Trợ giảng (TA)">
        {teacherAssignments.data?.length ? <div className="alert-list">{teacherAssignments.data.map((item:any)=><div className="alert-item" key={item.id}><i/><div><strong>{item.teachers?.full_name}</strong><span>{item.teachers?.code} · Hệ số giờ dạy {item.payroll_factor}</span></div><Status value={item.role}/></div>)}</div> : <Empty title="Chưa phân công giáo viên" description="Học vụ cần phân công giáo viên trước khi mở lớp."/>}
      </Panel>
      <Panel title="Thông tin lớp" description="Thiết lập hiện tại">
        <div className="detail-list"><div className="detail-row"><span>Category / Mode</span><strong>{classRow.category} · {classRow.mode}</strong></div><div className="detail-row"><span>Thời gian</span><strong>{formatDate(classRow.start_date)} → {formatDate(classRow.expected_end_date)}</strong></div><div className="detail-row"><span>Cơ sở / Phòng</span><strong>{classRow.campus || "—"} · {classRow.room || "—"}</strong></div><div className="detail-row"><span>Trạng thái</span><strong><Status value={classRow.status}/></strong></div></div>
      </Panel>
    </div>
    {canSeeRoster ? <Panel className="section-gap" title="Danh sách học viên" description="Học viên đang tham gia lớp">
      {enrollments.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Học viên</th><th>Entry level</th><th>Target</th><th>Start</th><th>Trạng thái</th></tr></thead><tbody>{enrollments.data.map((item:any)=><tr key={item.id}><td><strong>{item.students?.code} · {item.students?.full_name}</strong></td><td>{item.students?.entry_level || "—"}</td><td>{item.target || item.students?.target || "—"}</td><td>{formatDate(item.start_date)}</td><td><Status value={item.status}/></td></tr>)}</tbody></table></div> : <Empty title="Chưa có học viên" description="Xếp học viên phù hợp vào lớp để bắt đầu vận hành."/>}
    </Panel> : null}
    <Panel className="section-gap" title="Session schedule" description="Mọi thay đổi lịch cần giữ audit trail; không ghi đè lịch sử">
      {sessions.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Ngày / Giờ</th><th>GV</th><th>Mode</th><th>Topic</th><th>Trạng thái</th>{canManage ? <th>Điều chỉnh</th> : null}</tr></thead><tbody>{sessions.data.map((item:any)=><tr key={item.id}><td><strong>{sessionDisplayLabel(item.status,item.session_no)}</strong></td><td>{formatDate(item.scheduled_date)}<br/><span className="muted-text">{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)} · {item.duration_hours}h</span></td><td>{(item.session_teachers||[]).length ? (item.session_teachers||[]).map((x:any)=><div key={`${item.id}-${x.role}-${x.teachers?.full_name}`}><strong>{x.role === "Assistant" ? "TA" : x.role === "Main teacher" ? "GV" : x.role}:</strong> {x.teachers?.full_name}</div>) : "Chưa phân công"}</td><td>{item.mode}</td><td>{item.topic || "—"}</td><td><Status value={item.status}/></td>{canManage ? <td><details className="inline-details"><summary className="button button-secondary">Reschedule</summary><form action={rescheduleSession} className="inline-edit-form"><input type="hidden" name="session_id" value={item.id}/><input type="hidden" name="class_id" value={id}/><Field label="Ngày mới" name="new_date" type="date" required defaultValue={item.scheduled_date}/><Field label="Giờ bắt đầu" name="new_start" type="time" required defaultValue={item.start_time?.slice(0,5)}/><Field label="Giờ kết thúc" name="new_end" type="time" required defaultValue={item.end_time?.slice(0,5)}/><TextAreaField label="Lý do thay đổi" name="reason" required/><button className="button button-primary">Xác nhận đổi lịch</button></form></details></td> : null}</tr>)}</tbody></table></div> : <Empty title="Chưa có session" description="Tạo session theo lịch cố định hoặc từng buổi."/>}
    </Panel>
    {sessionChanges.data?.length ? <Panel className="section-gap" title="Lịch sử đổi session" description="Audit trail của các lần reschedule"><div className="table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Lịch cũ</th><th>Lịch mới</th><th>Lý do</th><th>Thời điểm đổi</th></tr></thead><tbody>{sessionChanges.data.map((change:any)=><tr key={change.id}><td><strong>#{change.sessions?.session_no}</strong></td><td>{formatDate(change.old_date)} · {change.old_start_time?.slice(0,5)}–{change.old_end_time?.slice(0,5)}</td><td>{formatDate(change.new_date)} · {change.new_start_time?.slice(0,5)}–{change.new_end_time?.slice(0,5)}</td><td>{change.reason}</td><td>{new Date(change.created_at).toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div></Panel> : null}
  </>;
}

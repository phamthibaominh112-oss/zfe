import { archiveSessionSchedule, createSession, createTeacherAvailability, deleteTeacherAvailability, updateSessionSchedule, updateTeacherAvailability } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { dateOnlyString, vietnamTodayString, vietnamWeek } from "@/lib/vietnam-date";
import { createClient } from "@/lib/supabase/server";

const DAY_LABELS = ["Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy","Chủ nhật"];
const UNASSIGNED_TEACHER = "__unassigned__";

function getWeek(offset: number) {
  return vietnamWeek(offset);
}

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireRole(["admin","academic_manager","teacher","student"]);
  const params = await searchParams;
  const offset = Number(params.week || 0);
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const days = getWeek(safeOffset);
  const start = dateOnlyString(days[0]);
  const end = dateOnlyString(days[6]);
  const today = vietnamTodayString();
  const supabase = await createClient();

  const canManage = ["admin","academic_manager"].includes(profile.role);
  const [sessions, availability, studentAvailability, teachers, classes, students] = await Promise.all([
    supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,duration_hours,mode,campus,room,status,topic,meeting_url,classes(code,name),session_teachers(role,teachers(id,code,full_name))").gte("scheduled_date",start).lte("scheduled_date",end).is("archived_at",null).order("scheduled_date").order("start_time"),
    profile.role === "student" ? Promise.resolve({data:[] as any[]}) : supabase.from("teacher_availability").select("id,weekday,start_time,end_time,mode,campus,effective_from,effective_to,is_recurring,note,teachers(id,code,full_name)").order("weekday").order("start_time"),
    canManage ? supabase.from("student_availability").select("id,student_id,weekday,start_time,end_time,effective_from,effective_to,is_recurring,note,students(id,code,full_name,status)").order("weekday").order("start_time") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("classes").select("id,code,name,mode,status").in("status",["Ready","Active"]).is("archived_at",null).order("code") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("students").select("id,code,full_name,status").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]})
  ]);

  const selectedStudentId = canManage ? String(params.student || "") : "";
  const selectedTeacherId = canManage ? String(params.teacher || "") : "";
  const teacherRows = teachers.data || [];
  const selectedTeacher = selectedTeacherId && selectedTeacherId !== UNASSIGNED_TEACHER
    ? teacherRows.find((teacher:any) => teacher.id === selectedTeacherId)
    : null;
  const selectedTeacherLabel = selectedTeacherId === UNASSIGNED_TEACHER
    ? "Chưa phân giáo viên"
    : selectedTeacher
      ? `${selectedTeacher.code} · ${selectedTeacher.full_name}`
      : "Tất cả giáo viên";

  function scheduleHref(nextWeek: number, options?: { keepStudent?: boolean; clearTeacher?: boolean }) {
    const query = new URLSearchParams();
    if (nextWeek !== 0) query.set("week", String(nextWeek));
    if (selectedTeacherId && !options?.clearTeacher) query.set("teacher", selectedTeacherId);
    if (selectedStudentId && options?.keepStudent) query.set("student", selectedStudentId);
    const suffix = query.toString();
    return `/schedule${suffix ? `?${suffix}` : ""}`;
  }

  const selectedStudentSlots = (studentAvailability.data || []).filter((slot:any) => slot.student_id === selectedStudentId);
  const matchingRows = selectedStudentSlots.flatMap((studentSlot:any) => (availability.data || [])
    .filter((teacherSlot:any) => teacherSlot.weekday === studentSlot.weekday && teacherSlot.start_time < studentSlot.end_time && teacherSlot.end_time > studentSlot.start_time)
    .map((teacherSlot:any) => ({ studentSlot, teacherSlot })));

  const allSessions = sessions.data || [];
  const visibleSessions = selectedTeacherId === UNASSIGNED_TEACHER
    ? allSessions.filter((item:any) => !(item.session_teachers || []).some((link:any) => joined(link.teachers)?.id))
    : selectedTeacherId
      ? allSessions.filter((item:any) => (item.session_teachers || []).some((link:any) => joined(link.teachers)?.id === selectedTeacherId))
      : allSessions;
  const totalHours = visibleSessions.reduce((sum: number, item: any) => sum + Number(item.duration_hours || 0), 0);
  const onlineCount = visibleSessions.filter((item: any) => item.mode === "Online").length;
  const offlineCount = visibleSessions.filter((item: any) => item.mode === "Offline").length;
  const todayCount = visibleSessions.filter((item: any) => item.scheduled_date === today).length;

  const pageTitle = profile.role === "student" ? "Lịch học của tôi" : profile.role === "teacher" ? "Lịch dạy của tôi" : "Lịch trung tâm";
  const pageDescription = profile.role === "student"
    ? "Theo dõi lịch học theo tuần và mở link lớp online khi được cập nhật."
    : profile.role === "teacher"
      ? "Xem lịch dạy theo tuần và cập nhật lịch rảnh khi có thay đổi."
      : "Điều phối session theo tuần, kiểm tra tải lịch và mở công cụ xếp lịch khi cần.";

  const actions = <div className="page-actions">
    {profile.role !== "student" ? <FormDetails title={profile.role === "teacher" ? "Cập nhật lịch rảnh" : "Thêm lịch rảnh GV"}><form action={createTeacherAvailability}><FormGrid>
      {canManage ? <SelectField label="Giáo viên" name="teacher_id" required options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/> : null}
      <SelectField label="Ngày" name="weekday" required options={DAY_LABELS.map((label,index)=>({value:String(index+1),label}))}/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/>
      <SelectField label="Hình thức" name="mode" options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/><Field label="Cơ sở" name="campus"/>
      <Field label="Hiệu lực từ" name="effective_from" type="date" required defaultValue={today}/><Field label="Hiệu lực đến" name="effective_to" type="date"/>
      <label className="checkbox-row"><input name="is_recurring" type="checkbox" defaultChecked/>Lặp hàng tuần</label><TextAreaField label="Ghi chú" name="note"/>
      <div className="form-actions"><button className="button button-primary">Lưu lịch rảnh</button></div>
    </FormGrid></form></FormDetails> : null}
    {canManage ? <FormDetails title="Tạo buổi học"><form action={createSession}><FormGrid>
      <SelectField label="Lớp" name="class_id" required options={(classes.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
      <Field label="Số buổi" name="session_no" type="number" required/><Field label="Ngày" name="scheduled_date" type="date" required/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/><Field label="Số giờ" name="duration_hours" type="number" step="0.25" required/>
      <SelectField label="Hình thức" name="mode" required options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/><SelectField label="Giáo viên" name="teacher_id" options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <Field label="Cơ sở" name="campus"/><Field label="Phòng" name="room"/><Field label="Link lớp" name="meeting_url"/><Field label="Nội dung" name="topic"/>
      <div className="form-actions"><button className="button button-primary">Tạo buổi học</button></div>
    </FormGrid></form></FormDetails> : null}
  </div>;

  return <>
    <PageHeader eyebrow="Lịch tuần" title={pageTitle} description={pageDescription} actions={actions}/>
    <Flash message={params.message} error={params.error}/>
    {canManage ? <section className="teacher-schedule-filter">
      <div className="teacher-filter-copy">
        <span>Xem lịch theo giáo viên</span>
        <strong>{selectedTeacherLabel}</strong>
        <small>Chọn một giáo viên để xem riêng lịch tuần, tổng số buổi và tổng giờ được phân công.</small>
      </div>
      <form method="get" className="teacher-filter-form">
        {safeOffset !== 0 ? <input type="hidden" name="week" value={safeOffset}/> : null}
        <label className="form-group teacher-filter-select"><span>Giáo viên</span><select className="select" name="teacher" defaultValue={selectedTeacherId}>
          <option value="">Tất cả giáo viên</option>
          <option value={UNASSIGNED_TEACHER}>Chưa phân giáo viên</option>
          {teacherRows.map((teacher:any)=><option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.full_name}</option>)}
        </select></label>
        <button className="button button-primary">Xem lịch</button>
        {selectedTeacherId ? <a className="button button-ghost" href={scheduleHref(safeOffset, { clearTeacher: true })}>Xem tất cả</a> : null}
      </form>
    </section> : null}
    <div className="metrics-grid compact-metrics schedule-metrics">
      <MetricCard label="Buổi trong tuần" value={visibleSessions.length} note={`${formatDate(start)} – ${formatDate(end)}`} />
      <MetricCard label="Hôm nay" value={todayCount} tone="yellow" />
      <MetricCard label="Tổng số giờ" value={`${totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}h`} tone="green" />
      <MetricCard label="Online / Offline" value={`${onlineCount} / ${offlineCount}`} tone="neutral" />
    </div>

    <section className="calendar-shell">
      <div className="week-toolbar calendar-toolbar">
        <a className="button button-ghost" href={scheduleHref(safeOffset-1)}>← Tuần trước</a>
        <div className="week-title"><strong>{formatDate(start)} – {formatDate(end)}</strong><span>{safeOffset === 0 ? "Tuần hiện tại" : safeOffset > 0 ? `Sau ${safeOffset} tuần` : `Trước ${Math.abs(safeOffset)} tuần`}</span></div>
        <div className="week-nav"><a className="button button-secondary" href={scheduleHref(0)}>Tuần này</a><a className="button button-ghost" href={scheduleHref(safeOffset+1)}>Tuần sau →</a></div>
      </div>
      <div className="week-grid focus-calendar">
        {days.map((day,index)=>{
          const key=dateOnlyString(day);
          const items=visibleSessions.filter((x:any)=>x.scheduled_date===key);
          const isToday = key === today;
          return <section className={`day-column ${isToday ? "day-today" : ""}`} key={key}>
            <div className="day-header"><span>{DAY_LABELS[index]}{isToday ? " · Hôm nay" : ""}</span><strong>{day.getUTCDate().toString().padStart(2,"0")}/{(day.getUTCMonth()+1).toString().padStart(2,"0")}</strong><small>{items.length} buổi</small></div>
            <div className="day-events">{items.length ? items.map((item:any)=>{
              const classRow = joined(item.classes);
              const teacherLinks = item.session_teachers || [];
              const teacherText = teacherLinks.map((x:any)=>joined(x.teachers)?.full_name).filter(Boolean).join(", ") || "Chưa phân GV";
              const mainTeacherLink = teacherLinks.find((x:any)=>x.role === "Main teacher") || teacherLinks[0];
              const mainTeacher = joined(mainTeacherLink?.teachers);
              return <article className={`session-card ${item.mode === "Offline" ? "offline" : ""}`} key={item.id}>
                <div className="session-time-row"><strong>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</strong><span>{item.duration_hours}h</span></div>
                <h3>{classRow?.code || "Lớp"} · Buổi {item.session_no}</h3>
                <p>{classRow?.name || item.topic || "Buổi học"}</p>
                <small>{teacherText}</small>
                <div className="session-footer"><span className={`mode-dot ${item.mode === "Offline" ? "offline" : ""}`}>{item.mode}</span><Status value={item.status}/></div>
                {profile.role === "student" && item.meeting_url ? <a className="session-link" href={item.meeting_url} target="_blank" rel="noreferrer">Vào lớp online →</a> : null}
                {canManage ? <details className="session-manage-details">
                  <summary>Điều chỉnh lịch</summary>
                  <div className="session-manage-body">
                    <form action={updateSessionSchedule}><input type="hidden" name="session_id" value={item.id}/><FormGrid>
                      <Field label="Số buổi" name="session_no" type="number" required defaultValue={item.session_no}/>
                      <Field label="Ngày dạy" name="scheduled_date" type="date" required defaultValue={item.scheduled_date}/>
                      <Field label="Bắt đầu" name="start_time" type="time" required defaultValue={item.start_time?.slice(0,5)}/>
                      <Field label="Kết thúc" name="end_time" type="time" required defaultValue={item.end_time?.slice(0,5)}/>
                      <Field label="Số giờ" name="duration_hours" type="number" step="0.25" required defaultValue={item.duration_hours}/>
                      <SelectField label="Hình thức" name="mode" required defaultValue={item.mode} options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/>
                      <SelectField label="Giáo viên chính" name="teacher_id" defaultValue={mainTeacher?.id || ""} options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
                      <SelectField label="Trạng thái" name="status" required defaultValue={item.status} options={["Scheduled","Rescheduled","Cancelled","Make-up required","Make-up completed"].map(v=>({value:v,label:v}))}/>
                      <Field label="Cơ sở" name="campus" defaultValue={item.campus || ""}/>
                      <Field label="Phòng" name="room" defaultValue={item.room || ""}/>
                      <Field label="Link lớp" name="meeting_url" defaultValue={item.meeting_url || ""}/>
                      <Field label="Nội dung" name="topic" defaultValue={item.topic || ""}/>
                      <TextAreaField label="Lý do điều chỉnh" name="reason" required placeholder="Ví dụ: GV xin đổi ca, học viên đổi lịch, chuyển phòng..."/>
                      <div className="form-actions"><button className="button button-primary">Lưu thay đổi</button></div>
                    </FormGrid></form>
                    <form action={archiveSessionSchedule} className="session-remove-form">
                      <input type="hidden" name="session_id" value={item.id}/>
                      <label className="form-group"><span>Lý do xóa khỏi lịch</span><textarea className="textarea" name="reason" required placeholder="Nêu rõ lý do để lưu lịch sử"/></label>
                      <label className="checkbox-row"><input type="checkbox" name="confirm" required/>Tôi xác nhận xóa buổi này khỏi lịch hiển thị</label>
                      <button className="button button-danger">Xóa khỏi lịch</button>
                    </form>
                  </div>
                </details> : null}
              </article>;
            }) : <span className="calendar-empty">Không có lịch</span>}</div>
          </section>;
        })}
      </div>
    </section>

    {canManage ? <details className="tool-drawer section-gap">
      <summary><div><strong>Công cụ xếp lịch</strong><span>Match lịch rảnh học viên với giáo viên và kiểm tra dữ liệu availability</span></div><b>+</b></summary>
      <div className="tool-drawer-body">
        <Panel title="Tìm khung giờ phù hợp" description="Chọn học viên để xem các slot GV trùng lịch rảnh">
          <form className="inline-form" method="get"><label className="form-group"><span>Học viên</span><select className="select" name="student" defaultValue={selectedStudentId}><option value="">Chọn học viên...</option>{(students.data || []).map((student:any)=><option value={student.id} key={student.id}>{student.code} · {student.full_name} · {student.status}</option>)}</select></label><input type="hidden" name="week" value={safeOffset}/>{selectedTeacherId ? <input type="hidden" name="teacher" value={selectedTeacherId}/> : null}<button className="button button-primary">Tìm lịch phù hợp</button></form>
          {selectedStudentId ? <div className="section-gap">{matchingRows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Ngày</th><th>Lịch rảnh HV</th><th>Giáo viên</th><th>Lịch rảnh GV</th><th>Hình thức / Cơ sở</th></tr></thead><tbody>{matchingRows.map((row:any,index:number)=>{
            const teacherRow = joined(row.teacherSlot.teachers);
            return <tr key={`${row.teacherSlot.id}-${row.studentSlot.id}-${index}`}><td>{DAY_LABELS[row.studentSlot.weekday-1]}</td><td>{row.studentSlot.start_time?.slice(0,5)}–{row.studentSlot.end_time?.slice(0,5)}</td><td><strong>{teacherRow?.code} · {teacherRow?.full_name}</strong></td><td>{row.teacherSlot.start_time?.slice(0,5)}–{row.teacherSlot.end_time?.slice(0,5)}</td><td>{row.teacherSlot.mode || "Linh hoạt"} · {row.teacherSlot.campus || "Mọi cơ sở"}</td></tr>;
          })}</tbody></table></div> : <Empty title="Chưa tìm thấy khung giờ chung" description="Cập nhật lại lịch rảnh của học viên hoặc giáo viên."/>}</div> : <Empty title="Chọn một học viên" description="Hệ thống sẽ so sánh các khung giờ đã đăng ký." />}
        </Panel>
        <div className="grid-2 section-gap">
          <Panel title="Lịch rảnh giáo viên" description="Học vụ và Admin có thể điều chỉnh hoặc xóa slot khi cần">
            {availability.data?.length ? <div className="compact-list">{availability.data.map((item:any)=>{ const teacherRow = joined(item.teachers); return <div className="compact-row availability-manage-row" key={item.id}>
              <div><strong>{teacherRow?.full_name || "Giáo viên"}</strong><span>{DAY_LABELS[item.weekday-1]} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span><small>{item.mode || "Linh hoạt"} · {item.campus || "Mọi cơ sở"}</small></div>
              <details className="inline-details"><summary className="button button-ghost button-small">Điều chỉnh</summary><div className="inline-edit-form availability-edit-panel">
                <form action={updateTeacherAvailability} className="form-stack"><input type="hidden" name="availability_id" value={item.id}/>
                  <SelectField label="Giáo viên" name="teacher_id" required defaultValue={teacherRow?.id || ""} options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
                  <SelectField label="Ngày" name="weekday" required defaultValue={String(item.weekday)} options={DAY_LABELS.map((label,index)=>({value:String(index+1),label}))}/>
                  <Field label="Bắt đầu" name="start_time" type="time" required defaultValue={item.start_time?.slice(0,5)}/>
                  <Field label="Kết thúc" name="end_time" type="time" required defaultValue={item.end_time?.slice(0,5)}/>
                  <SelectField label="Hình thức" name="mode" defaultValue={item.mode || ""} options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/>
                  <Field label="Cơ sở" name="campus" defaultValue={item.campus || ""}/>
                  <Field label="Hiệu lực từ" name="effective_from" type="date" required defaultValue={item.effective_from}/>
                  <Field label="Hiệu lực đến" name="effective_to" type="date" defaultValue={item.effective_to || ""}/>
                  <label className="checkbox-row"><input name="is_recurring" type="checkbox" defaultChecked={item.is_recurring}/>Lặp hàng tuần</label>
                  <TextAreaField label="Ghi chú" name="note" defaultValue={item.note || ""}/>
                  <button className="button button-primary">Lưu thay đổi</button>
                </form>
                <form action={deleteTeacherAvailability} className="availability-delete-form"><input type="hidden" name="availability_id" value={item.id}/><label className="checkbox-row"><input name="confirm" type="checkbox" required/>Xác nhận xóa slot này</label><button className="button button-danger">Xóa lịch rảnh</button></form>
              </div></details>
            </div>; })}</div> : <Empty title="Chưa có lịch rảnh GV" description="Thêm availability để bắt đầu matching."/>}
          </Panel>
          <Panel title="Lịch rảnh học viên" description="Dữ liệu dùng để xếp lớp">
            {studentAvailability.data?.length ? <div className="compact-list">{studentAvailability.data.slice(0,12).map((item:any)=>{ const studentRow = joined(item.students); return <div className="compact-row" key={item.id}><div><strong>{studentRow?.full_name || "Học viên"}</strong><span>{DAY_LABELS[item.weekday-1]} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span></div><small>{item.note || "Không có ghi chú"}</small></div>; })}</div> : <Empty title="Chưa có lịch rảnh HV" description="CSKH hoặc Học vụ có thể cập nhật trong hồ sơ học viên."/>}
          </Panel>
        </div>
      </div>
    </details> : profile.role === "teacher" ? <details className="tool-drawer section-gap">
      <summary><div><strong>Lịch rảnh của tôi</strong><span>Xem lại các khung giờ đã đăng ký</span></div><b>+</b></summary>
      <div className="tool-drawer-body">{availability.data?.length ? <div className="compact-list">{availability.data.map((item:any)=><div className="compact-row" key={item.id}><div><strong>{DAY_LABELS[item.weekday-1]} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</strong><span>{formatDate(item.effective_from)} → {formatDate(item.effective_to)}</span></div><small>{item.mode || "Linh hoạt"} · {item.campus || "Mọi cơ sở"}</small></div>)}</div> : <Empty title="Bạn chưa đăng ký lịch rảnh" description="Bấm Cập nhật lịch rảnh ở đầu trang để thêm khung giờ."/>}</div>
    </details> : null}
  </>;
}

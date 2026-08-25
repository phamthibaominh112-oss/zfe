import { archiveSessionSchedule, createSession, createTeacherAvailability, deleteTeacherAvailability, duplicatePreviousWeekSchedule, updateSessionObserver, updateSessionSchedule, updateSessionTeachingTeam, updateTeacherAvailability } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { TeacherAvailabilityWeekForm } from "@/components/teacher-availability-week-form";
import { requireRole } from "@/lib/auth";
import { formatDate, sessionDisplayLabel } from "@/lib/format";
import { dateOnlyString, vietnamTodayString, vietnamWeek } from "@/lib/vietnam-date";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_LABELS = ["Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy","Chủ nhật"];
const UNASSIGNED_TEACHER = "__unassigned__";
const UNASSIGNED_OBSERVER = "__unassigned_observer__";

function getWeek(offset: number) {
  return vietnamWeek(offset);
}

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function overlapsPeriod(slot: any, start: string, end: string) {
  const from = String(slot.effective_from || "");
  const to = String(slot.effective_to || "");
  return (!from || from <= end) && (!to || to >= start);
}

function intersectTimeSets(left: Array<{start:string;end:string}>, right: Array<{start:string;end:string}>) {
  const result: Array<{start:string;end:string}> = [];
  for (const a of left) for (const b of right) {
    const start = a.start > b.start ? a.start : b.start;
    const end = a.end < b.end ? a.end : b.end;
    if (start < end && !result.some((x)=>x.start === start && x.end === end)) result.push({ start, end });
  }
  return result;
}

function commonStudentAvailability(studentIds: string[], slots: any[], weekStart: string, weekEnd: string) {
  if (!studentIds.length) return [] as Array<{weekday:number;start:string;end:string}>;
  const valid = slots.filter((slot:any)=>studentIds.includes(slot.student_id) && overlapsPeriod(slot, weekStart, weekEnd));
  const rows: Array<{weekday:number;start:string;end:string}> = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const byStudent = studentIds.map((studentId)=>valid.filter((slot:any)=>slot.student_id === studentId && slot.weekday === weekday));
    if (byStudent.some((group)=>group.length === 0)) continue;
    let common = byStudent[0].map((slot:any)=>({start:String(slot.start_time),end:String(slot.end_time)}));
    for (let index = 1; index < byStudent.length; index++) {
      common = intersectTimeSets(common, byStudent[index].map((slot:any)=>({start:String(slot.start_time),end:String(slot.end_time)})));
      if (!common.length) break;
    }
    for (const interval of common) rows.push({weekday,start:interval.start,end:interval.end});
  }
  return rows;
}

function placementDateParts(value:string){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const v=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return {date:`${v.year}-${v.month}-${v.day}`,time:`${v.hour}:${v.minute}`};
}

function modeMatches(classMode: string | null | undefined, teacherMode: string | null | undefined) {
  if (!teacherMode || teacherMode === "Hybrid" || !classMode || classMode === "Hybrid") return true;
  return classMode === teacherMode;
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
  const { data: ownTeacher } = profile.role === "teacher"
    ? await supabase.from("teachers").select("id,code,full_name,email,is_placement_assessor").eq("user_id", profile.id).maybeSingle()
    : { data: null as any };

  const canManage = ["admin","academic_manager"].includes(profile.role);
  const admin = canManage ? createAdminClient() : null;
  const [sessions, availability, studentAvailability, teachers, classes, students, enrollments, placementBookings, observerAssignments, observerCandidates, fullPlacementTests, syllabusMasters, syllabusOverrides] = await Promise.all([
    supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,duration_hours,mode,campus,room,status,topic,meeting_url,classes(code,name),session_teachers(role,teachers(id,code,full_name))").gte("scheduled_date",start).lte("scheduled_date",end).is("archived_at",null).order("scheduled_date").order("start_time"),
    profile.role === "student" ? Promise.resolve({data:[] as any[]}) : supabase.from("teacher_availability").select("id,weekday,start_time,end_time,mode,campus,effective_from,effective_to,is_recurring,note,teachers(id,code,full_name)").order("weekday").order("start_time"),
    canManage ? supabase.from("student_availability").select("id,student_id,weekday,start_time,end_time,effective_from,effective_to,is_recurring,note,students(id,code,full_name,status)").order("weekday").order("start_time") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("classes").select("id,code,name,mode,status,capacity,programs(name),levels(name)").in("status",["Draft","Waiting","Ready","Active","Paused"]).is("archived_at",null).order("code") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("students").select("id,code,full_name,status").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    canManage ? supabase.from("enrollments").select("id,class_id,student_id,status,students(id,code,full_name)").eq("status","Active").is("archived_at",null) : Promise.resolve({data:[] as any[]}),
    profile.role==="student" ? Promise.resolve({data:[] as any[]}) : supabase.from("placement_speaking_bookings").select("id,teacher_id,scheduled_start,duration_minutes,status,placement_tests(id,status,students(id,code,full_name)),teachers(id,code,full_name)").gte("scheduled_start",`${start}T00:00:00+07:00`).lte("scheduled_start",`${end}T23:59:59+07:00`).order("scheduled_start"),
    profile.role==="student" ? Promise.resolve({data:[] as any[]}) : supabase.from("session_observers").select("id,session_id,observer_user_id,observer_name,note"),
    canManage && admin ? admin.from("profiles").select("id,full_name,role,is_active").in("role",["admin","academic_manager"]).eq("is_active",true).order("full_name") : Promise.resolve({data:[] as any[]}),
    ownTeacher ? supabase.from("placement_tests").select("id,assigned_teacher_id,scheduled_start,duration_minutes,status,external_token,students(code,full_name)").eq("assigned_teacher_id",ownTeacher.id).gte("scheduled_start",`${start}T00:00:00+07:00`).lte("scheduled_start",`${end}T23:59:59+07:00`).neq("status","Cancelled").order("scheduled_start") : Promise.resolve({data:[] as any[]}),
    supabase.from("syllabus_templates").select("id,program_code,status,syllabus_template_items(id,session_no,title,learning_objectives,content,homework,slide_url,material_file_path)").not("program_code","is",null).is("archived_at",null),
    supabase.from("class_syllabus_overrides").select("id,class_id,session_no,title,learning_objectives,content,homework,slide_url,material_file_path,override_reason").is("archived_at",null)
  ]);

  const selectedClassId = canManage ? String(params.class || "") : "";
  const selectedTeacherId = canManage ? String(params.teacher || "") : "";
  const selectedObserverId = canManage ? String(params.observer || "") : "";
  const teacherRows = teachers.data || [];
  const classRows = classes.data || [];
  const selectedClass = selectedClassId ? classRows.find((item:any)=>item.id === selectedClassId) : null;
  const selectedTeacher = selectedTeacherId && selectedTeacherId !== UNASSIGNED_TEACHER
    ? teacherRows.find((teacher:any) => teacher.id === selectedTeacherId)
    : null;
  const selectedTeacherLabel = selectedTeacherId === UNASSIGNED_TEACHER
    ? "Chưa phân giáo viên"
    : selectedTeacher
      ? `${selectedTeacher.code} · ${selectedTeacher.full_name}`
      : "Tất cả giáo viên";
  const selectedObserver = selectedObserverId && selectedObserverId !== UNASSIGNED_OBSERVER
    ? (observerCandidates.data||[]).find((row:any)=>String(row.id)===selectedObserverId)
    : null;
  const selectedObserverLabel = selectedObserverId === UNASSIGNED_OBSERVER
    ? "Chưa phân Observer"
    : selectedObserver
      ? `${selectedObserver.full_name} · ${selectedObserver.role === "academic_manager" ? "Academic" : "Admin"}`
      : "Tất cả Observer";

  function scheduleHref(nextWeek: number, options?: { clearTeacher?: boolean; clearClass?: boolean; clearObserver?: boolean }) {
    const query = new URLSearchParams();
    if (nextWeek !== 0) query.set("week", String(nextWeek));
    if (selectedTeacherId && !options?.clearTeacher) query.set("teacher", selectedTeacherId);
    if (selectedClassId && !options?.clearClass) query.set("class", selectedClassId);
    if (selectedObserverId && !options?.clearObserver) query.set("observer", selectedObserverId);
    const suffix = query.toString();
    return `/schedule${suffix ? `?${suffix}` : ""}`;
  }

  const selectedClassEnrollments = selectedClassId
    ? (enrollments.data || []).filter((row:any)=>row.class_id === selectedClassId)
    : [];
  const selectedClassStudentIds = selectedClassEnrollments.map((row:any)=>row.student_id);
  const commonClassSlots = selectedClassId
    ? commonStudentAvailability(selectedClassStudentIds, studentAvailability.data || [], start, end)
    : [];
  const activeTeacherSlots = (availability.data || []).filter((slot:any)=>overlapsPeriod(slot,start,end));
  const classMatchingRows = commonClassSlots.flatMap((classSlot:any)=>activeTeacherSlots
    .filter((teacherSlot:any)=>teacherSlot.weekday === classSlot.weekday && teacherSlot.start_time < classSlot.end && teacherSlot.end_time > classSlot.start && modeMatches(selectedClass?.mode, teacherSlot.mode))
    .map((teacherSlot:any)=>({
      classSlot,
      teacherSlot,
      overlapStart: teacherSlot.start_time > classSlot.start ? teacherSlot.start_time : classSlot.start,
      overlapEnd: teacherSlot.end_time < classSlot.end ? teacherSlot.end_time : classSlot.end
    })));

  const observerBySession = new Map<string,any>((observerAssignments.data||[]).map((row:any)=>[row.session_id,row]));
  const observerOptions = (observerCandidates.data||[]).map((row:any)=>({
    value: String(row.id),
    label: `${row.full_name} · ${row.role === "academic_manager" ? "Academic" : "Admin"}`
  }));

  const allSessions = sessions.data || [];
  const ownTeacherSessions = profile.role === "teacher"
    ? allSessions.filter((item:any)=>(item.session_teachers || []).some((link:any)=>joined(link.teachers)?.id === ownTeacher?.id))
    : allSessions;
  const classFilteredSessions = selectedClassId ? ownTeacherSessions.filter((item:any)=>item.class_id === selectedClassId) : ownTeacherSessions;
  const teacherFilteredSessions = selectedTeacherId === UNASSIGNED_TEACHER
    ? classFilteredSessions.filter((item:any) => !(item.session_teachers || []).some((link:any) => joined(link.teachers)?.id))
    : selectedTeacherId
      ? classFilteredSessions.filter((item:any) => (item.session_teachers || []).some((link:any) => joined(link.teachers)?.id === selectedTeacherId))
      : classFilteredSessions;
  const visibleSessions = selectedObserverId === UNASSIGNED_OBSERVER
    ? teacherFilteredSessions.filter((item:any)=>!observerBySession.has(item.id))
    : selectedObserverId
      ? teacherFilteredSessions.filter((item:any)=>observerBySession.get(item.id)?.observer_user_id === selectedObserverId)
      : teacherFilteredSessions;
  const allPlacementBookings=(placementBookings.data||[]).filter((b:any)=>joined(b.placement_tests)?.status!=="Cancelled");
  const masterMap=new Map<string,any>();
  for(const master of syllabusMasters.data||[]){
    for(const item of master.syllabus_template_items||[]) masterMap.set(`${master.program_code}|${item.session_no}`,{...item,program_code:master.program_code});
  }
  const overrideMap=new Map((syllabusOverrides.data||[]).map((x:any)=>[`${x.class_id}|${x.session_no}`,x]));
  const fullPlacementRows=fullPlacementTests.data||[];
  const visiblePlacementBookings = selectedObserverId
    ? []
    : profile.role==="teacher"
      ? allPlacementBookings.filter((b:any)=>b.teacher_id===ownTeacher?.id)
      : selectedTeacherId&&selectedTeacherId!==UNASSIGNED_TEACHER
        ? allPlacementBookings.filter((b:any)=>b.teacher_id===selectedTeacherId)
        : selectedTeacherId===UNASSIGNED_TEACHER ? [] : allPlacementBookings;

  const totalHours = visibleSessions.reduce((sum: number, item: any) => sum + Number(item.duration_hours || 0), 0);
  const onlineCount = visibleSessions.filter((item: any) => item.mode === "Online").length;
  const offlineCount = visibleSessions.filter((item: any) => item.mode === "Offline").length;
  const todayCount = visibleSessions.filter((item: any) => item.scheduled_date === today).length;

  const pageTitle = profile.role === "student" ? "Lịch học của tôi" : profile.role === "teacher" ? "Lịch dạy của tôi" : "Lịch trung tâm";
  const pageDescription = profile.role === "student"
    ? "Theo dõi lịch học theo tuần và mở link lớp online khi được cập nhật."
    : profile.role === "teacher"
      ? "Xem lịch lớp + Placement Speaking theo tuần và cập nhật lịch rảnh khi có thay đổi."
      : "Xếp session theo LỚP, sau đó gán GV/TA. Học viên nhận lịch thông qua enrollment vào lớp.";

  const actions = <div className="page-actions">
    {profile.role === "teacher" ? <a className="button button-primary" href="#weekly-availability">Đăng ký lịch rảnh cả tuần</a> : canManage ? <FormDetails title="Thêm lịch rảnh GV"><form action={createTeacherAvailability}><input type="hidden" name="return_week" value={String(safeOffset)}/><input type="hidden" name="return_teacher" value={selectedTeacherId}/><input type="hidden" name="return_class" value={selectedClassId}/><input type="hidden" name="return_observer" value={selectedObserverId}/><FormGrid>
      <SelectField label="Giáo viên" name="teacher_id" required options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <SelectField label="Ngày" name="weekday" required options={DAY_LABELS.map((label,index)=>({value:String(index+1),label}))}/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/>
      <SelectField label="Hình thức" name="mode" options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/><Field label="Cơ sở" name="campus"/>
      <Field label="Hiệu lực từ" name="effective_from" type="date" required defaultValue={start}/><Field label="Hiệu lực đến" name="effective_to" type="date"/>
      <label className="checkbox-row"><input name="is_recurring" type="checkbox" defaultChecked/>Lặp hàng tuần</label><TextAreaField label="Ghi chú" name="note"/>
      <div className="form-actions"><button className="button button-primary">Lưu lịch rảnh</button></div>
    </FormGrid></form></FormDetails> : null}
    {canManage ? <FormDetails title="Tạo buổi học"><form action={createSession}><FormGrid>
      <SelectField label="Lớp" name="class_id" required defaultValue={selectedClassId} options={(classes.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
      <Field label="Số buổi học thực tế" name="session_no" type="number" required/><Field label="Ngày" name="scheduled_date" type="date" required/>
      <Field label="Bắt đầu" name="start_time" type="time" required/><Field label="Kết thúc" name="end_time" type="time" required/><Field label="Số giờ" name="duration_hours" type="number" step="0.25" required/>
      <SelectField label="Hình thức" name="mode" required options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/><div className="session-team-heading"><strong>Đội ngũ buổi học</strong><span>Chọn đồng thời GV chính và TA cho cùng session</span></div><SelectField label="Giáo viên chính (GV)" name="teacher_id" options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/><SelectField label="Co-teacher / Trợ giảng (TA)" name="assistant_teacher_id" options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
      <Field label="Cơ sở" name="campus"/><Field label="Phòng" name="room"/><Field label="Link lớp" name="meeting_url"/><Field label="Nội dung" name="topic"/>
      <div className="form-actions"><button className="button button-primary">Tạo buổi học</button></div>
    </FormGrid></form></FormDetails> : null}
    {canManage ? <form action={duplicatePreviousWeekSchedule}><input type="hidden" name="target_week_start" value={start}/><input type="hidden" name="return_week" value={String(safeOffset)}/><button className="button button-secondary" title="Copy tuần trước sang tuần đang xem và tự tăng số buổi">⧉ Duplicate tuần trước + tăng buổi</button></form> : null}
  </div>;

  return <>
    <PageHeader eyebrow="Lịch tuần" title={pageTitle} description={pageDescription} actions={actions}/>
    <Flash message={params.message} error={params.error}/>
    {profile.role==="teacher"?<section id="weekly-availability" className="weekly-availability-inline-panel"><div className="weekly-availability-inline-title"><div><strong>Đăng ký lịch rảnh · tuần đang xem</strong><span>Thứ Năm hàng tuần chốt lịch rảnh GV. Form nằm trong luồng trang, không che lịch phía sau.</span></div></div><TeacherAvailabilityWeekForm weekStart={start} weekEnd={end} weekOffset={safeOffset} existing={(availability.data||[]).filter((slot:any)=>overlapsPeriod(slot,start,end)).map((slot:any)=>({weekday:slot.weekday,start_time:slot.start_time,end_time:slot.end_time}))}/></section>:null}
    {canManage ? <div className="session-team-capability-banner"><strong>v1.4.0 · DIRECT SESSION ASSIGNMENT + TA</strong><span>Mỗi session = 1 buổi duy nhất, có thể gán đồng thời 1 GV chính + 1 Co-teacher/TA. Không tạo buổi thứ hai cho TA.</span></div> : null}
    {canManage ? <section className="teacher-schedule-filter class-schedule-filter">
      <div className="teacher-filter-copy">
        <span>Xếp lịch theo lớp</span>
        <strong>{selectedClass ? `${selectedClass.code} · ${selectedClass.name}` : "Tất cả lớp"}</strong>
        <small>ZE / ZB / ZK… là mã lớp. Chọn lớp trước rồi mới xếp GV và session.</small>
      </div>
      <form method="get" className="teacher-filter-form">
        {safeOffset !== 0 ? <input type="hidden" name="week" value={safeOffset}/> : null}
        {selectedTeacherId ? <input type="hidden" name="teacher" value={selectedTeacherId}/> : null}
        {selectedObserverId ? <input type="hidden" name="observer" value={selectedObserverId}/> : null}
        <label className="form-group teacher-filter-select"><span>Lớp</span><select className="select" name="class" defaultValue={selectedClassId}>
          <option value="">Tất cả lớp</option>
          {classRows.map((item:any)=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
        </select></label>
        <button className="button button-primary">Xem lịch lớp</button>
        {selectedClassId ? <a className="button button-ghost" href={scheduleHref(safeOffset,{clearClass:true})}>Bỏ lọc lớp</a> : null}
      </form>
    </section> : null}
    {canManage ? <section className="teacher-schedule-filter">
      <div className="teacher-filter-copy">
        <span>Xem lịch theo giáo viên</span>
        <strong>{selectedTeacherLabel}</strong>
        <small>Chọn một giáo viên để xem riêng lịch tuần, tổng số buổi và tổng giờ được phân công.</small>
      </div>
      <form method="get" className="teacher-filter-form">
        {safeOffset !== 0 ? <input type="hidden" name="week" value={safeOffset}/> : null}
        {selectedClassId ? <input type="hidden" name="class" value={selectedClassId}/> : null}
        {selectedObserverId ? <input type="hidden" name="observer" value={selectedObserverId}/> : null}
        <label className="form-group teacher-filter-select"><span>Giáo viên</span><select className="select" name="teacher" defaultValue={selectedTeacherId}>
          <option value="">Tất cả giáo viên</option>
          <option value={UNASSIGNED_TEACHER}>Chưa phân giáo viên</option>
          {teacherRows.map((teacher:any)=><option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.full_name}</option>)}
        </select></label>
        <button className="button button-primary">Xem lịch</button>
        {selectedTeacherId ? <a className="button button-ghost" href={scheduleHref(safeOffset, { clearTeacher: true })}>Xem tất cả</a> : null}
      </form>
    </section> : null}
    {canManage ? <section className="teacher-schedule-filter observer-schedule-filter">
      <div className="teacher-filter-copy">
        <span>Xem lịch theo Observer</span>
        <strong>{selectedObserverLabel}</strong>
        <small>Lọc đúng các buổi được phân observation. Có thể kết hợp cùng filter Lớp và Giáo viên.</small>
      </div>
      <form method="get" className="teacher-filter-form">
        {safeOffset !== 0 ? <input type="hidden" name="week" value={safeOffset}/> : null}
        {selectedClassId ? <input type="hidden" name="class" value={selectedClassId}/> : null}
        {selectedTeacherId ? <input type="hidden" name="teacher" value={selectedTeacherId}/> : null}
        <label className="form-group teacher-filter-select"><span>Observer</span><select className="select" name="observer" defaultValue={selectedObserverId}>
          <option value="">Tất cả Observer</option>
          <option value={UNASSIGNED_OBSERVER}>Chưa phân Observer</option>
          {(observerCandidates.data||[]).map((row:any)=><option key={row.id} value={row.id}>{row.full_name} · {row.role === "academic_manager" ? "Academic" : "Admin"}</option>)}
        </select></label>
        <button className="button button-primary">Xem lịch Observe</button>
        {selectedObserverId ? <a className="button button-ghost" href={scheduleHref(safeOffset,{clearObserver:true})}>Bỏ lọc Observer</a> : null}
      </form>
    </section> : null}
    <div className="metrics-grid compact-metrics schedule-metrics">
      <MetricCard label="Lịch trong tuần" value={visibleSessions.length + visiblePlacementBookings.length} note={`${visibleSessions.length} buổi lớp · ${visiblePlacementBookings.length} Placement`} />
      <MetricCard label="Hôm nay" value={todayCount} tone="yellow" />
      <MetricCard label="Tổng số giờ" value={`${totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}h`} tone="green" />
      <MetricCard label="Online / Offline" value={`${onlineCount} / ${offlineCount}`} tone="neutral" />
    </div>

    <section className={`calendar-shell ${!canManage ? "calendar-shell-compact" : ""}`}>
      <div className="week-toolbar calendar-toolbar">
        <a className="button button-ghost" href={scheduleHref(safeOffset-1)}>← Tuần trước</a>
        <div className="week-title"><strong>{formatDate(start)} – {formatDate(end)}</strong><span>{safeOffset === 0 ? "Tuần hiện tại" : safeOffset > 0 ? `Sau ${safeOffset} tuần` : `Trước ${Math.abs(safeOffset)} tuần`}</span></div>
        <div className="week-nav"><a className="button button-secondary" href={scheduleHref(0)}>Tuần này</a><a className="button button-ghost" href={scheduleHref(safeOffset+1)}>Tuần sau →</a></div>
      </div>
      <div className="week-grid focus-calendar">
        {days.map((day,index)=>{
          const key=dateOnlyString(day);
          const items=visibleSessions.filter((x:any)=>x.scheduled_date===key);
          const placementItems=visiblePlacementBookings.filter((x:any)=>placementDateParts(x.scheduled_start).date===key); const fullPlacementItems=fullPlacementRows.filter((x:any)=>placementDateParts(x.scheduled_start).date===key);
          const isToday = key === today;
          return <section className={`day-column ${isToday ? "day-today" : ""}`} key={key}>
            <div className="day-header"><span>{DAY_LABELS[index]}{isToday ? " · Hôm nay" : ""}</span><strong>{day.getUTCDate().toString().padStart(2,"0")}/{(day.getUTCMonth()+1).toString().padStart(2,"0")}</strong><small>{items.length + placementItems.length + fullPlacementItems.length} lịch</small></div>
            <div className="day-events">
              {fullPlacementItems.map((pt:any)=>{const st=joined(pt.students);const dt=placementDateParts(pt.scheduled_start);return <article className="session-card placement-calendar-card full-placement" key={`full-placement-${pt.id}`}><div className="session-time-row"><strong>{dt.time}</strong><span>{pt.duration_minutes}p</span></div><h3>Placement Full Test</h3><p>{st?.code} · {st?.full_name}</p><small>{pt.external_token}</small><div className="session-footer"><span className="mode-dot placement-mode">Placement</span><Status value={pt.status}/></div><a className="session-link" href="/placement">Mở Placement →</a></article>})}
              {placementItems.map((booking:any)=>{const pt=joined(booking.placement_tests);const st=joined(pt?.students);const dt=placementDateParts(booking.scheduled_start);return <article className={`session-card placement-calendar-card ${booking.status==="Cancelled"?"cancelled":""}`} key={`placement-${booking.id}`}><div className="session-time-row"><strong>{dt.time}</strong><span>15p</span></div><h3>Placement Speaking</h3><p>{st?.code} · {st?.full_name}</p><small>Assessor: {joined(booking.teachers)?.full_name || ownTeacher?.full_name || "GV"}</small><div className="session-footer"><span className="mode-dot placement-mode">Placement</span><Status value={booking.status}/></div><a className="session-link" href="/placement">Mở Placement →</a></article>})}
              {items.length ? items.map((item:any)=>{
              const classRow = joined(item.classes);
              const teacherLinks = item.session_teachers || [];
              const mainTeacherLink = teacherLinks.find((x:any)=>x.role === "Main teacher") || teacherLinks[0];
              const assistantTeacherLink = teacherLinks.find((x:any)=>x.role === "Assistant");
              const mainTeacher = joined(mainTeacherLink?.teachers);
              const assistantTeacher = joined(assistantTeacherLink?.teachers);
              const observer = observerBySession.get(item.id);
              const teacherText = mainTeacher ? `GV chính: ${mainTeacher.full_name}` : "Chưa phân GV chính";
              return <article className={`session-card ${item.mode === "Offline" ? "offline" : ""}`} key={item.id}>
                <div className="session-time-row"><strong>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</strong><span>{item.duration_hours}h</span></div>
                <h3>{classRow?.code || "Lớp"} · {sessionDisplayLabel(item.status,item.session_no)}</h3>
                <p>{classRow?.name || item.topic || "Buổi học"}</p>
                <div className="session-staff-lines"><small>{teacherText}</small><small className={assistantTeacher ? "session-ta assigned" : "session-ta empty"}>TA: {assistantTeacher?.full_name || "Chưa phân TA"}</small>{observer ? <small className="session-observer assigned">Observer: {observer.observer_name}</small> : canManage ? <small className="session-observer empty">Observer: Chưa phân</small> : null}</div>
                {canManage ? <details className="session-observer-quick">
                  <summary><span className="observer-summary-icon">👁</span><span>Phân Observer</span></summary>
                  <form action={updateSessionObserver} className="session-observer-form">
                    <input type="hidden" name="session_id" value={item.id}/>
                    <div className="observer-field">
                      <label htmlFor={`observer-${item.id}`}>Observer</label>
                      <select id={`observer-${item.id}`} className="observer-select" name="observer_user_id" defaultValue={observer?.observer_user_id || ""}>
                        <option value="">Chưa phân Observer</option>
                        {observerOptions.map((opt:any)=><option value={opt.value} key={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    <div className="observer-field">
                      <label htmlFor={`observer-note-${item.id}`}>Ghi chú</label>
                      <textarea id={`observer-note-${item.id}`} className="observer-textarea" name="observer_note" defaultValue={observer?.note || ""} placeholder="Class management, interaction, lesson delivery..."/>
                    </div>
                    <button className="button button-primary observer-save-button">Lưu Observer</button>
                    {observer ? <small className="session-observer-help">Chọn “Chưa phân Observer” rồi Lưu để gỡ khỏi buổi này.</small> : <small className="session-observer-help">Chỉ áp dụng cho buổi này.</small>}
                  </form>
                </details> : null}
                {canManage ? <details className="session-team-quick">
                  <summary>👥 Quản lý GV + Co-teacher/TA</summary>
                  <form action={updateSessionTeachingTeam} className="session-team-quick-form">
                    <input type="hidden" name="session_id" value={item.id}/>
                    <SelectField label="Giáo viên chính" name="teacher_id" required defaultValue={mainTeacher?.id || ""} options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
                    <SelectField label="Co-teacher / Trợ giảng (TA)" name="assistant_teacher_id" defaultValue={assistantTeacher?.id || ""} options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
                    <button className="button button-primary session-team-save">Lưu đội ngũ buổi học</button>
                    <small className="session-team-help">Không tạo session thứ hai. Co-teacher/TA được gắn vào chính buổi học này.</small>
                  </form>
                </details> : null}
                <div className="session-footer"><span className={`mode-dot ${item.mode === "Offline" ? "offline" : ""}`}>{item.mode}</span><Status value={item.status}/></div>
                {profile.role === "student" && item.meeting_url ? <a className="session-link" href={item.meeting_url} target="_blank" rel="noreferrer">Vào lớp online →</a> : null}
                {canManage ? <details className="session-manage-details">
                  <summary>Điều chỉnh lịch</summary>
                  <div className="session-manage-body">
                    <form action={updateSessionSchedule}><input type="hidden" name="session_id" value={item.id}/><FormGrid>
                      <Field label="Số buổi học thực tế" name="session_no" type="number" required defaultValue={item.session_no}/>
                      <Field label="Ngày dạy" name="scheduled_date" type="date" required defaultValue={item.scheduled_date}/>
                      <Field label="Bắt đầu" name="start_time" type="time" required defaultValue={item.start_time?.slice(0,5)}/>
                      <Field label="Kết thúc" name="end_time" type="time" required defaultValue={item.end_time?.slice(0,5)}/>
                      <Field label="Số giờ" name="duration_hours" type="number" step="0.25" required defaultValue={item.duration_hours}/>
                      <SelectField label="Hình thức" name="mode" required defaultValue={item.mode} options={["Online","Offline","Hybrid"].map(v=>({value:v,label:v}))}/>
                      <div className="session-team-heading"><strong>Đội ngũ buổi học</strong><span>GV chính và TA cùng tham gia session này</span></div><SelectField label="Giáo viên chính (GV)" name="teacher_id" defaultValue={mainTeacher?.id || ""} options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/><SelectField label="Co-teacher / Trợ giảng (TA)" name="assistant_teacher_id" defaultValue={assistantTeacher?.id || ""} options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
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
            }) : placementItems.length ? null : <span className="calendar-empty">Không có lịch</span>}</div>
          </section>;
        })}
      </div>
    </section>

    {canManage ? <details className="tool-drawer section-gap">
      <summary><div><strong>Công cụ xếp lịch theo lớp</strong><span>Match lịch chung của roster trong lớp với availability giáo viên</span></div><b>+</b></summary>
      <div className="tool-drawer-body">
        <Panel title="Tìm GV phù hợp cho lớp" description="Lấy giao của availability tất cả HV trong roster rồi so với availability giáo viên">
          <form className="inline-form" method="get"><label className="form-group"><span>Lớp cần xếp</span><select className="select" name="class" defaultValue={selectedClassId}><option value="">Chọn lớp...</option>{classRows.map((item:any)=><option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label><input type="hidden" name="week" value={safeOffset}/>{selectedTeacherId ? <input type="hidden" name="teacher" value={selectedTeacherId}/> : null}{selectedObserverId ? <input type="hidden" name="observer" value={selectedObserverId}/> : null}<button className="button button-primary">Tìm GV cho lớp</button></form>
          {selectedClassId ? <div className="section-gap">
            <div className="class-match-roster"><strong>{selectedClass?.code} · {selectedClassEnrollments.length} học viên</strong><span>{selectedClassEnrollments.map((row:any)=>joined(row.students)?.full_name).filter(Boolean).join(" · ") || "Chưa có học viên trong lớp"}</span></div>
            {!selectedClassEnrollments.length ? <Empty title="Lớp chưa có học viên" description="Vào Xếp lớp & GV để kéo học viên vào lớp trước khi matching giáo viên."/> : !commonClassSlots.length ? <Empty title="Chưa có khung giờ chung của cả lớp" description="Kiểm tra availability của từng học viên trong roster; lớp 2–3 HV cần ít nhất một khoảng giờ giao nhau."/> : classMatchingRows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Ngày</th><th>Lịch chung lớp</th><th>Giáo viên</th><th>GV rảnh</th><th>Khung có thể xếp</th></tr></thead><tbody>{classMatchingRows.map((row:any,index:number)=>{ const teacherRow = joined(row.teacherSlot.teachers); return <tr key={`${row.teacherSlot.id}-${row.classSlot.weekday}-${row.classSlot.start}-${index}`}><td>{DAY_LABELS[row.classSlot.weekday-1]}</td><td><strong>{row.classSlot.start.slice(0,5)}–{row.classSlot.end.slice(0,5)}</strong><small className="table-subline">{selectedClassEnrollments.length} HV cùng rảnh</small></td><td><strong>{teacherRow?.code} · {teacherRow?.full_name}</strong></td><td>{row.teacherSlot.start_time?.slice(0,5)}–{row.teacherSlot.end_time?.slice(0,5)} · {row.teacherSlot.mode || "Linh hoạt"}</td><td><strong>{row.overlapStart.slice(0,5)}–{row.overlapEnd.slice(0,5)}</strong></td></tr>; })}</tbody></table></div> : <Empty title="Chưa có GV trùng lịch chung của lớp" description="Giữ roster, thử tuần khác hoặc cập nhật availability GV."/>}
          </div> : <Empty title="Chọn một lớp" description="Matching giờ chạy theo lớp, không chạy theo từng học viên riêng lẻ."/>}
        </Panel>
        <div className="grid-2 section-gap">
          <Panel title="Lịch rảnh giáo viên" description="Học vụ và Admin có thể điều chỉnh hoặc xóa slot khi cần">
            {availability.data?.length ? <div className="compact-list">{availability.data.map((item:any)=>{ const teacherRow = joined(item.teachers); return <div className="compact-row availability-manage-row" key={item.id}>
              <div><strong>{teacherRow?.full_name || "Giáo viên"}</strong><span>{DAY_LABELS[item.weekday-1]} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span><small>{item.mode || "Linh hoạt"} · {item.campus || "Mọi cơ sở"}</small></div>
              <details className="inline-details"><summary className="button button-ghost button-small">Điều chỉnh</summary><div className="inline-edit-form availability-edit-panel">
                <form action={updateTeacherAvailability} className="form-stack"><input type="hidden" name="availability_id" value={item.id}/><input type="hidden" name="return_week" value={String(safeOffset)}/><input type="hidden" name="return_teacher" value={selectedTeacherId}/><input type="hidden" name="return_class" value={selectedClassId}/>
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
                <form action={deleteTeacherAvailability} className="availability-delete-form"><input type="hidden" name="availability_id" value={item.id}/><input type="hidden" name="return_week" value={String(safeOffset)}/><input type="hidden" name="return_teacher" value={selectedTeacherId}/><input type="hidden" name="return_class" value={selectedClassId}/><label className="checkbox-row"><input name="confirm" type="checkbox" required/>Xác nhận xóa slot này</label><button className="button button-danger">Xóa lịch rảnh</button></form>
              </div></details>
            </div>; })}</div> : <Empty title="Chưa có lịch rảnh GV" description="Thêm availability để bắt đầu matching."/>}
          </Panel>
          <Panel title="Availability học viên" description={selectedClass ? `Roster của ${selectedClass.code}` : "Chọn lớp để kiểm tra lịch rảnh roster"}>
            {selectedClassId ? (studentAvailability.data || []).filter((item:any)=>selectedClassStudentIds.includes(item.student_id)).length ? <div className="compact-list">{(studentAvailability.data || []).filter((item:any)=>selectedClassStudentIds.includes(item.student_id)).slice(0,20).map((item:any)=>{ const studentRow = joined(item.students); return <div className="compact-row" key={item.id}><div><strong>{studentRow?.full_name || "Học viên"}</strong><span>{DAY_LABELS[item.weekday-1]} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span></div><small>{item.note || "Không có ghi chú"}</small></div>; })}</div> : <Empty title="Roster chưa có availability" description="CSKH hoặc Học vụ cập nhật lịch rảnh từng học viên trong lớp."/> : <Empty title="Chưa chọn lớp" description="Chọn lớp ở trên để chỉ xem availability của các HV thuộc lớp đó."/>}
          </Panel>
        </div>
      </div>
    </details> : profile.role === "teacher" ? <details className="tool-drawer section-gap">
      <summary><div><strong>Lịch rảnh của tôi</strong><span>Xem lại các khung giờ đã đăng ký</span></div><b>+</b></summary>
      <div className="tool-drawer-body"><div className="availability-week-overview">{DAY_LABELS.map((label,index)=>{const rows=(availability.data||[]).filter((item:any)=>item.weekday===index+1&&overlapsPeriod(item,start,end));return <div className={`availability-overview-day ${rows.length?"has-slots":""}`} key={label}><strong>{label}</strong>{rows.length?rows.map((item:any)=><span key={item.id}>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span>):<span>—</span>}</div>})}</div><small className="availability-week-caption">Overview tuần {formatDate(start)} – {formatDate(end)}. Cập nhật nhiều ngày bằng một lần lưu ở đầu trang.</small></div>
    </details> : null}
  </>;
}

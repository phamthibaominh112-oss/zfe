import Link from "next/link";
import { setClassTeachingTeam } from "@/app/actions";
import { ClassRosterDropzone, WaitingStudentPool, type PlannerStudent } from "@/components/class-roster-dnd";
import { SelectField } from "@/components/forms";
import { Flash, PageHeader, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ClassPlannerPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireRole(["admin","academic_manager"]);
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: classes, error }, { data: students }, { data: enrollments }, { data: teacherLinks }, { data: teachers }, { data: upcomingSessions }] = await Promise.all([
    supabase.from("classes").select("id,code,name,category,mode,campus,capacity,status,programs(name),levels(name)").in("status",["Draft","Waiting","Ready","Active","Paused"]).is("archived_at",null).order("code"),
    supabase.from("students").select("id,code,full_name,status,entry_level,target").is("archived_at",null).order("full_name"),
    supabase.from("enrollments").select("id,class_id,student_id,status,students(id,code,full_name,status)").is("archived_at",null).eq("status","Active"),
    supabase.from("class_teachers").select("class_id,role,payroll_factor,teachers(id,code,full_name)").in("role",["Main teacher","Assistant"]),
    supabase.from("teachers").select("id,code,full_name,employment_status").eq("employment_status","Active").is("archived_at",null).order("full_name"),
    supabase.from("sessions").select("id,class_id,scheduled_date,status").gte("scheduled_date",new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})).neq("status","Cancelled").is("archived_at",null)
  ]);

  const activeStudentIds = new Set((enrollments || []).map((x:any)=>x.student_id));
  const waitingStudents: PlannerStudent[] = (students || []).filter((student:any)=>!activeStudentIds.has(student.id));

  const rosterByClass = new Map<string, PlannerStudent[]>();
  for (const enrollment of enrollments || []) {
    const student = (enrollment as any).students;
    if (!student) continue;
    const rows = rosterByClass.get((enrollment as any).class_id) || [];
    rows.push({ id: student.id, code: student.code, full_name: student.full_name, status: student.status });
    rosterByClass.set((enrollment as any).class_id, rows);
  }

  const scheduledClassIds=new Set((upcomingSessions||[]).map((x:any)=>x.class_id));

  const teamByClass = new Map<string, any[]>();
  for (const link of teacherLinks || []) {
    const rows = teamByClass.get((link as any).class_id) || [];
    rows.push(link);
    teamByClass.set((link as any).class_id, rows);
  }

  return <>
    <PageHeader eyebrow="Class-first scheduling" title="Xếp lớp & giáo viên" description="Mã ZE / ZB / ZK… là mã lớp. Kéo học viên vào lớp trước, sau đó phân GV chính + TA và xếp lịch theo chính lớp đó." actions={<Link className="button button-secondary" href="/schedule">Mở lịch trung tâm</Link>}/>
    <Flash message={params.message} error={params.error || error?.message}/>

    <div className="planner-principle">
      <strong>Luồng chuẩn mới</strong>
      <span>HV → kéo vào lớp → lớp có roster 1–n HV → set GV chính/TA → xếp session cho LỚP → tất cả HV trong roster nhận cùng lịch lớp.</span>
    </div>

    {(()=>{const rows=(classes||[]).filter((item:any)=>{const team=teamByClass.get(item.id)||[];return !team.some((x:any)=>x.role==="Main teacher")||!scheduledClassIds.has(item.id)});return rows.length?<div className="unassigned-class-warning"><div><strong>⚠ {rows.length} lớp cần xếp</strong><span>Thiếu GV chính hoặc chưa có session sắp tới.</span></div><div className="unassigned-class-chips">{rows.slice(0,12).map((item:any)=><a href={`#class-${item.id}`} key={item.id}>{item.code}</a>)}</div></div>:null;})()}
    <div className="class-planner-layout">
      <aside><WaitingStudentPool students={waitingStudents}/></aside>
      <section className="class-planner-board">
        {(classes || []).length ? (classes || []).map((item:any)=>{
          const roster = rosterByClass.get(item.id) || [];
          const team = teamByClass.get(item.id) || [];
          const main = team.find((x:any)=>x.role === "Main teacher");
          const assistant = team.find((x:any)=>x.role === "Assistant");
          const missingTeacher=!main; const missingSchedule=!scheduledClassIds.has(item.id); return <article className={`planner-class-card ${missingTeacher||missingSchedule?"planner-class-needs-action":""}`} id={`class-${item.id}`} key={item.id}>
            <div className="planner-class-head">
              <div><div className="planner-class-code">{item.code}</div><h2>{item.name}</h2><p>{item.programs?.name || "Chưa có chương trình"} · {item.levels?.name || "Chưa có level"}</p></div>
              <Status value={item.status}/>
            </div>
            <div className="planner-class-tags"><span>{item.category}</span><span>{item.mode}</span><span>{item.campus || "Chưa có cơ sở"}</span>{missingTeacher?<span className="planner-warning-tag">⚠ Chưa có GV chính</span>:null}{missingSchedule?<span className="planner-warning-tag">⚠ Chưa có lịch</span>:null}</div>

            <ClassRosterDropzone classId={item.id} classCode={item.code} capacity={Number(item.capacity || 1)} students={roster}/>

            <form action={setClassTeachingTeam} className="planner-team-form">
              <input type="hidden" name="class_id" value={item.id}/>
              <input type="hidden" name="return_to" value="/class-planner"/>
              <SelectField label="Giáo viên chính" name="main_teacher_id" required defaultValue={main?.teachers?.id || ""} options={(teachers||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
              <SelectField label="Trợ giảng (TA)" name="assistant_teacher_id" defaultValue={assistant?.teachers?.id || ""} options={(teachers||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
              <input type="hidden" name="main_payroll_factor" value={main?.payroll_factor ?? 1}/>
              <input type="hidden" name="assistant_payroll_factor" value={assistant?.payroll_factor ?? 1}/>
              <button className="button button-primary">Lưu GV / TA</button>
            </form>

            <div className="planner-class-actions">
              <Link className="button button-secondary" href={`/classes/${item.id}`}>Mở chi tiết lớp</Link>
              <Link className="button button-primary" href={`/schedule?class=${item.id}`}>Xếp lịch GV cho lớp →</Link>
            </div>
          </article>;
        }) : <div className="empty-state"><strong>Chưa có lớp để xếp</strong><p>Tạo lớp trước, sau đó quay lại kéo học viên và phân giáo viên.</p></div>}
      </section>
    </div>
  </>;
}

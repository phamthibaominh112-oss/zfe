import Link from "next/link";
import { createLearningRecommendation, markAttendance, saveHomework, saveStudentMilestoneScore } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildLearningAnalytics, courseStage, IELTS_PATH } from "@/lib/student-learning";
import { formatDate } from "@/lib/format";

function joined(value:unknown):Record<string,any>|null{if(Array.isArray(value))return value[0]||null;return value&&typeof value==="object"?value as Record<string,any>:null;}
function pc(v:number|null){return v==null?"—":`${Math.round(v*100)}%`;}
function score(v:unknown){return v==null?"—":Number(v).toFixed(1);}

export default async function StudentLearningRecord({params,searchParams}:{params:Promise<{id:string}>,searchParams:Promise<Record<string,string|undefined>>}){
  const profile=await requireProfile();const {id}=await params;const qs=await searchParams;const supabase=await createClient();
  const {data:student}=await supabase.from("students").select("id,code,full_name,status,entry_level,target,user_id").eq("id",id).is("archived_at",null).maybeSingle();
  if(!student)return <Empty title="Không tìm thấy học viên" description=""/>;
  if(profile.role==="student"&&student.user_id!==profile.id)return <Empty title="Không có quyền" description="Bạn chỉ xem được hồ sơ của mình."/>;
  const [enrollments,sessions,attendance,homework,results,placements,recommendations,teachers]=await Promise.all([
    supabase.from("enrollments").select("id,class_id,start_date,end_date,status,target,classes(id,code,name,total_sessions,target,status)").eq("student_id",id).is("archived_at",null).order("created_at"),
    supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,topic,classes(code,name)").is("archived_at",null).order("scheduled_date"),
    supabase.from("attendance").select("id,session_id,status,late_minutes,reason,marked_at,sessions(class_id,session_no,scheduled_date,classes(code))").eq("student_id",id).order("marked_at"),
    supabase.from("homework_records").select("id,session_id,status,note,marked_at,sessions(class_id,session_no,scheduled_date,classes(code))").eq("student_id",id).order("marked_at"),
    supabase.from("assessment_results").select("id,score,band,comment,graded_at,published_at,assessments(id,class_id,name,type,max_score,assessment_date,classes(code,name))").eq("student_id",id).order("graded_at"),
    supabase.from("placement_tests").select("*,placement_speaking_bookings(speaking_score,assessor_note)").eq("student_id",id).order("created_at",{ascending:false}),
    supabase.from("student_learning_recommendations").select("*,teachers(full_name,code)").eq("student_id",id).order("created_at",{ascending:false}),
    supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name")
  ]);
  const classIds=(enrollments.data||[]).map((x:any)=>x.class_id);
  const relevantSessions=(sessions.data||[]).filter((x:any)=>classIds.includes(x.class_id));
  const analytics=buildLearningAnalytics({enrollments:enrollments.data||[],sessions:relevantSessions,attendance:attendance.data||[],homework:homework.data||[],results:results.data||[],placementTests:placements.data||[],recommendations:recommendations.data||[],studentTarget:student.target});
  const classOptions=(enrollments.data||[]).map((x:any)=>({value:x.class_id,label:`${x.classes?.code} · ${x.classes?.name}`}));
  const sessionOptions=relevantSessions.map((x:any)=>({value:x.id,label:`${x.classes?.code} · Buổi ${x.session_no} · ${formatDate(x.scheduled_date)}`}));
  const enrollmentOptions=(enrollments.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · ${x.classes?.name}`}));
  const canWrite=["admin","academic_manager","customer_service","teacher"].includes(profile.role);
  const currentClass=analytics.activeClass;
  const returnPath=`/students/${id}/learning`;

  const syllabus=classIds.length?await supabase.from("class_syllabus_items").select("*").in("class_id",classIds).order("session_no"):({data:[]} as any);
  const signed=new Map<string,string>();
  await Promise.all((syllabus.data||[]).filter((x:any)=>x.material_file_path).map(async(x:any)=>{const {data}=await supabase.storage.from("course-materials").createSignedUrl(x.material_file_path,3600);if(data?.signedUrl)signed.set(x.id,data.signedUrl);}));

  return <>
    <PageHeader eyebrow="Student Learning Record" title={`${student.code} · ${student.full_name}`} description="Một hồ sơ học tập xuyên suốt: course journey → attendance/HW → Mid/Final → skill profile → forecast → recommendation."
      actions={<Link className="button button-secondary" href={`/students/${id}`}>← Hồ sơ HV</Link>}/>
    <Flash message={qs.message} error={qs.error}/>

    <section className="learning-journey">
      {IELTS_PATH.map((stage,index)=>{const matched=(enrollments.data||[]).find((e:any)=>courseStage(e.classes?.code,e.classes?.name)?.code===stage.code);const active=matched?.status==="Active";return <div className={`learning-stage ${matched?"done":""} ${active?"active":""}`} key={stage.code}><i>{index+1}</i><span>{stage.code}</span><strong>{stage.name}</strong><small>{matched?`${matched.classes?.code} · ${matched.status}`:"Chưa học"}</small></div>})}
    </section>

    <div className="learning-kpi-grid">
      <div><span>Tiến độ lớp hiện tại</span><strong>{Math.round(analytics.progress*100)}%</strong><small>{analytics.completedSessions}/{analytics.totalSessions||"—"} buổi hoàn thành</small></div>
      <div><span>Attendance</span><strong>{pc(analytics.attendanceRate)}</strong><small>{(attendance.data||[]).length} records</small></div>
      <div><span>Homework</span><strong>{pc(analytics.homeworkRate)}</strong><small>{(homework.data||[]).length} records</small></div>
      <div><span>Midterm</span><strong>{analytics.midterm?score(analytics.midterm.band??analytics.midterm.score):"—"}</strong><small>{analytics.midterm?"Đã có điểm":"Chưa có"}</small></div>
      <div><span>Final</span><strong>{analytics.final?score(analytics.final.band??analytics.final.score):"—"}</strong><small>{analytics.final?"Đã có điểm":"Chưa có"}</small></div>
    </div>

    <div className="grid-2 section-gap">
      <Panel title="Skill Profile" description="Placement + assessment theo skill được gom thành một profile.">
        <div className="skill-profile-grid">{analytics.skills.map(x=><div className="skill-profile-card" key={x.skill}><span>{x.skill}</span><strong>{x.latest==null?"—":x.latest.toFixed(1)}</strong><small>{x.delta==null?"Chưa đủ trend":x.delta>0?`↑ +${x.delta.toFixed(1)}`:x.delta<0?`↓ ${x.delta.toFixed(1)}`:"→ ổn định"}</small></div>)}</div>
        <div className="strength-weakness-grid"><div><span>Điểm mạnh hiện tại</span><strong>{analytics.strengths.length?analytics.strengths.map(x=>`${x.skill} ${x.latest?.toFixed(1)}`).join(" · "):"Chưa đủ dữ liệu"}</strong></div><div><span>Cần ưu tiên</span><strong>{analytics.weaknesses.length?analytics.weaknesses.map(x=>`${x.skill} ${x.latest?.toFixed(1)}`).join(" · "):"Chưa đủ dữ liệu"}</strong></div></div>
      </Panel>
      <Panel title="Khả năng đạt điểm · Forecast" description="Ước tính vận hành, không phải cam kết band. Dựa trên điểm gần nhất + trend + attendance + homework + tiến độ khóa.">
        {analytics.forecast!=null?<div className="learning-forecast"><span>Estimated band trajectory</span><strong>{analytics.forecast.toFixed(1)}</strong><small>Khoảng hợp lý {analytics.forecastLow?.toFixed(1)}–{analytics.forecastHigh?.toFixed(1)} · Target HV: {student.target||currentClass?.target||"—"}</small><div className="forecast-track"><i style={{width:`${Math.min(100,analytics.forecast/9*100)}%`}}/></div></div>:<Empty title="Chưa đủ dữ liệu để forecast" description="Cần placement hoặc assessment skill/Midterm trước."/>}
      </Panel>
    </div>

    {canWrite?<Panel className="section-gap" title="Cập nhật Academic Record" description="GV · Học vụ · CSKH cùng cập nhật trên đúng hồ sơ HV; không cần quay lại form rời.">
      <div className="learning-entry-grid">
        <FormDetails title="Attendance"><form action={markAttendance}><input type="hidden" name="student_id" value={id}/><input type="hidden" name="return_path" value={returnPath}/><FormGrid><SelectField label="Session" name="session_id" required options={sessionOptions}/><SelectField label="Status" name="status" required options={["Present","Late","Excused absence","Unexcused absence","Joined partially","Make-up pending","Make-up completed"].map(v=>({value:v,label:v}))}/><Field label="Phút trễ" name="late_minutes" type="number" defaultValue={0}/><TextAreaField label="Ghi chú" name="reason"/><button className="button button-primary">Lưu attendance</button></FormGrid></form></FormDetails>
        <FormDetails title="Homework"><form action={saveHomework}><input type="hidden" name="student_id" value={id}/><input type="hidden" name="return_path" value={returnPath}/><FormGrid><SelectField label="Session" name="session_id" required options={sessionOptions}/><SelectField label="Status" name="status" required options={["Completed","Partially completed","Not completed","Submitted late","Not assigned"].map(v=>({value:v,label:v}))}/><TextAreaField label="Ghi chú" name="note"/><button className="button button-primary">Lưu HW</button></FormGrid></form></FormDetails>
        <FormDetails title="Mid / Final"><form action={saveStudentMilestoneScore}><input type="hidden" name="student_id" value={id}/><input type="hidden" name="return_path" value={returnPath}/><FormGrid><SelectField label="Lớp" name="class_id" required options={classOptions}/><SelectField label="Loại" name="type" required options={["Midterm","Final"].map(v=>({value:v,label:v}))}/><Field label="Ngày" name="assessment_date" type="date"/><Field label="Score /9" name="score" type="number" min="0" max="9" step=".1"/><Field label="Band" name="band" type="number" min="0" max="9" step=".5"/><TextAreaField label="Nhận xét" name="comment"/><label className="checkbox-row"><input type="checkbox" name="publish" defaultChecked/>Publish cho HV</label><button className="button button-primary">Lưu điểm</button></FormGrid></form></FormDetails>
        <FormDetails title="Recommendation cho GV"><form action={createLearningRecommendation}><input type="hidden" name="student_id" value={id}/><input type="hidden" name="return_path" value={returnPath}/><FormGrid><SelectField label="Enrollment" name="enrollment_id" options={enrollmentOptions}/><SelectField label="GV nhận" name="teacher_id" options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/><SelectField label="Category" name="category" defaultValue="Academic" options={["Academic","Attendance","Homework","Midterm","Final","Placement","Retention","Other"].map(v=>({value:v,label:v}))}/><SelectField label="Priority" name="priority" defaultValue="Medium" options={["Low","Medium","High"].map(v=>({value:v,label:v}))}/><Field label="Tiêu đề" name="title" required/><TextAreaField label="Recommendation" name="recommendation" required/><TextAreaField label="Evidence / vì sao" name="evidence"/><label className="checkbox-row"><input type="checkbox" name="visible_to_student"/>Cho HV xem recommendation này</label><button className="button button-primary">Gửi recommendation</button></FormGrid></form></FormDetails>
      </div>
    </Panel>:null}

    <div className="grid-2 section-gap">
      <Panel title="Lịch sử tiến bộ" description="Điểm Assessment, Midterm, Final theo thời gian.">
        {results.data?.length?<div className="learning-history">{results.data.map((r:any)=>{const a=joined(r.assessments);return <div key={r.id}><span>{formatDate(a?.assessment_date||String(r.graded_at).slice(0,10))}</span><strong>{a?.type} · {a?.name}</strong><b>{r.band||r.score||"—"}</b><small>{r.comment||""}</small></div>})}</div>:<Empty title="Chưa có assessment history" description="Điểm sẽ hình thành timeline khi được nhập."/>}
      </Panel>
      <Panel title="Recommendations" description="Academic/CSKH/GV gửi action cụ thể về teaching team hoặc HV.">
        {recommendations.data?.length?<div className="recommendation-list">{recommendations.data.map((r:any)=><div className={`recommendation-card ${String(r.priority).toLowerCase()}`} key={r.id}><div><span>{r.category} · {r.priority}</span><strong>{r.title}</strong><p>{r.recommendation}</p>{r.evidence?<small>Evidence: {r.evidence}</small>:null}</div><Status value={r.status}/></div>)}</div>:<Empty title="Chưa có recommendation" description="Khi có điểm/risk, team có thể gửi recommendation tới GV."/>}
      </Panel>
    </div>

    <Panel className="section-gap" title="Syllabus & nội dung từng buổi" description="GV và HV cùng nhìn một nguồn: học gì · mục tiêu gì · homework · slide/tài liệu.">
      {syllabus.data?.length?<div className="student-syllabus-list">{syllabus.data.map((item:any)=><article key={item.id}><b>Buổi {item.session_no}</b><div><strong>{item.title}</strong><span>{item.learning_objectives||"—"}</span>{item.content?<p>{item.content}</p>:null}{item.homework?<small>Homework: {item.homework}</small>:null}</div><div>{item.slide_url?<a className="button button-secondary button-small" href={item.slide_url} target="_blank">Slide</a>:null}{item.material_file_path?<a className="button button-secondary button-small" href={signed.get(item.id)||"#"} target="_blank">Tài liệu</a>:null}</div></article>)}</div>:<Empty title="Lớp chưa được gắn syllabus" description="Admin/Học vụ duplicate syllabus master vào lớp trước."/>}
    </Panel>
  </>;
}

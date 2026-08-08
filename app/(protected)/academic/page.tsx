import Link from "next/link";
import { completeSession, createAssignment, createAssessment, gradeAssignmentSubmission, markAttendance, reviewProgressFeedback, saveAssessmentResult, saveHomework, submitProgressFeedback } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function AcademicPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireRole(["admin","academic_manager","teacher"]);
  const params = await searchParams;
  const supabase = await createClient();
  const manager = profile.role !== "teacher";

  const [sessions, enrollments, assignments, assessments, feedback, submissions] = await Promise.all([
    supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,topic,classes(code,name),session_teachers(teachers(full_name))").gte("scheduled_date",new Date(Date.now()-14*86400000).toISOString().slice(0,10)).order("scheduled_date",{ascending:false}).limit(40),
    supabase.from("enrollments").select("id,class_id,student_id,status,students(id,code,full_name),classes(id,code,name)").eq("status","Active").is("archived_at",null).limit(200),
    supabase.from("assignments").select("id,title,due_at,max_score,published_at,classes(code,name),sessions(session_no)").is("archived_at",null).order("created_at",{ascending:false}).limit(15),
    supabase.from("assessments").select("id,name,type,assessment_date,max_score,status,class_id,classes(code,name)").is("archived_at",null).order("created_at",{ascending:false}).limit(20),
    supabase.from("progress_feedback").select("id,enrollment_id,milestone,status,risk_level,current_performance,revision_note,submitted_at,enrollments(students(code,full_name),classes(code,name))").is("archived_at",null).order("updated_at",{ascending:false}).limit(30),
    supabase.from("assignment_submissions").select("id,assignment_id,student_id,file_path,status,submitted_at,score,feedback,assignments(title,max_score,classes(code)),students(code,full_name)").order("submitted_at",{ascending:false}).limit(40)
  ]);

  const classOptions = Array.from(new Map((enrollments.data||[]).map((x:any)=>[x.class_id,{value:x.class_id,label:`${x.classes?.code} · ${x.classes?.name}`}])).values()) as Array<{value:string,label:string}>;
  const sessionOptions = (sessions.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · #${x.session_no} · ${formatDate(x.scheduled_date)} ${x.start_time?.slice(0,5)}`}));
  const enrollmentOptions = (enrollments.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · ${x.students?.code} · ${x.students?.full_name}`}));
  const studentOptions = (enrollments.data||[]).map((x:any)=>({value:x.student_id,label:`${x.students?.code} · ${x.students?.full_name}`}));
  const signedSubmissionUrls = new Map<string,string>();
  await Promise.all((submissions.data || []).map(async (row:any) => { const { data } = await supabase.storage.from("assignment-files").createSignedUrl(row.file_path, 3600); if (data?.signedUrl) signedSubmissionUrls.set(row.id, data.signedUrl); }));
  const assessmentOptions = (assessments.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · ${x.type} · ${x.name}`}));

  const actions = <div className="page-actions">
    <FormDetails title="Check attendance"><form action={markAttendance}><FormGrid>
      <SelectField label="Session" name="session_id" required options={sessionOptions}/><SelectField label="Học viên" name="student_id" required options={studentOptions}/>
      <SelectField label="Attendance" name="status" required options={["Present","Late","Excused absence","Unexcused absence","Joined partially","Make-up pending","Make-up completed"].map(v=>({value:v,label:v}))}/>
      <Field label="Số phút trễ" name="late_minutes" type="number" defaultValue={0}/><TextAreaField label="Lý do / Ghi chú" name="reason"/>
      <div className="form-actions"><button className="button button-primary">Lưu attendance</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Homework completion"><form action={saveHomework}><FormGrid>
      <SelectField label="Session" name="session_id" required options={sessionOptions}/><SelectField label="Học viên" name="student_id" required options={studentOptions}/>
      <SelectField label="Trạng thái" name="status" required options={["Completed","Partially completed","Not completed","Submitted late","Not assigned"].map(v=>({value:v,label:v}))}/><TextAreaField label="Ghi chú" name="note"/>
      <div className="form-actions"><button className="button button-primary">Lưu homework</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Tạo assignment"><form action={createAssignment}><FormGrid>
      <SelectField label="Lớp" name="class_id" required options={classOptions}/><SelectField label="Session (optional)" name="session_id" options={sessionOptions}/>
      <Field label="Tiêu đề" name="title" required/><Field label="Deadline" name="due_at" type="datetime-local"/><Field label="Điểm tối đa" name="max_score" type="number" defaultValue={100}/><TextAreaField label="Đề bài / Hướng dẫn" name="instructions" required/>
      <label className="form-group"><span>Publish ngay</span><input name="publish" type="checkbox" defaultChecked/></label><div className="form-actions"><button className="button button-primary">Tạo assignment</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Feedback milestone"><form action={submitProgressFeedback}><FormGrid>
      <SelectField label="Enrollment" name="enrollment_id" required options={enrollmentOptions}/><SelectField label="Milestone" name="milestone" required options={[30,50,70,100].map(v=>({value:String(v),label:`${v}%`}))}/>
      <SelectField label="Risk level" name="risk_level" required defaultValue="Low" options={["Low","Medium","High"].map(v=>({value:v,label:v}))}/><Field label="Attendance summary" name="attendance_summary"/><Field label="Homework summary" name="homework_summary"/>
      <TextAreaField label="Strengths" name="strengths" required/><TextAreaField label="Areas to improve" name="areas_to_improve" required/><TextAreaField label="Current performance" name="current_performance" required/><TextAreaField label="Recommendation" name="recommendation" required/>
      <div className="form-actions"><button className="button button-primary">Submit for approval</button></div>
    </FormGrid></form></FormDetails>
    <FormDetails title="Nhập điểm"><form action={saveAssessmentResult}><FormGrid>
      <SelectField label="Assessment" name="assessment_id" required options={assessmentOptions}/><SelectField label="Học viên" name="student_id" required options={studentOptions}/>
      <Field label="Score" name="score" type="number" step="0.01"/><Field label="Band" name="band"/><Field label="CEFR" name="cefr"/><TextAreaField label="Comment" name="comment"/>
      <label className="form-group"><span>Publish cho học viên</span><input name="publish" type="checkbox"/></label><div className="form-actions"><button className="button button-primary">Lưu điểm</button></div>
    </FormGrid></form></FormDetails>
    {manager ? <FormDetails title="Tạo assessment"><form action={createAssessment}><FormGrid>
      <SelectField label="Lớp" name="class_id" required options={classOptions}/><Field label="Tên assessment" name="name" required/><SelectField label="Loại" name="type" required options={["Placement","Diagnostic","Quiz","Assignment","Midterm","Final","Mock Test","Speaking","Writing","Other"].map(v=>({value:v,label:v}))}/><Field label="Ngày" name="assessment_date" type="date"/><Field label="Max score" name="max_score" type="number" defaultValue={100}/><div className="form-actions"><button className="button button-primary">Tạo assessment</button></div>
    </FormGrid></form></FormDetails> : null}
  </div>;

  return <>
    <PageHeader eyebrow="Vận hành học thuật" title="Điểm danh, bài tập & đánh giá" description={profile.role === "teacher" ? "Cập nhật điểm danh, bài tập và phản hồi cho các lớp bạn phụ trách." : "Theo dõi điểm danh, mức độ hoàn thành bài tập, điểm số và các phản hồi đang chờ duyệt."} actions={actions}/>
    <Flash message={params.message} error={params.error}/>
    <div className="grid-2">
      <Panel title="Sessions cần vận hành" description={profile.role === "teacher" ? "Giáo viên Check-in/Check-out tại mục Chấm công & KPI" : "Học vụ có thể xác nhận session khi cần xử lý ngoại lệ"}>
        {sessions.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Ngày / Giờ</th><th>Topic</th><th>Trạng thái</th><th></th></tr></thead><tbody>{sessions.data.map((item:any)=><tr key={item.id}><td><strong>{item.classes?.code} · #{item.session_no}</strong><br/><span className="muted-text">{(item.session_teachers||[]).map((x:any)=>x.teachers?.full_name).filter(Boolean).join(", ")}</span></td><td>{formatDate(item.scheduled_date)}<br/>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</td><td>{item.topic || "—"}</td><td><Status value={item.status}/></td><td>{!(["Completed","Make-up completed","Cancelled"].includes(item.status)) ? (profile.role === "teacher" ? <Link className="button button-secondary" href="/workforce">Check-in / Check-out</Link> : <form action={completeSession} className="inline-form"><input type="hidden" name="session_id" value={item.id}/><input className="input" name="topic" placeholder="Topic đã dạy"/><button className="button button-secondary">Complete</button></form>) : null}</td></tr>)}</tbody></table></div> : <Empty title="Không có session" description="Kiểm tra phân công lớp hoặc tạo session mới."/>}
      </Panel>
      <Panel title="Assignments" description="Bài tập theo lớp hoặc session">
        {assignments.data?.length ? <div className="alert-list">{assignments.data.map((item:any)=><div className="alert-item" key={item.id}><i/><div><strong>{item.classes?.code} · {item.title}</strong><span>Deadline: {formatDateTime(item.due_at)} · Max {item.max_score}</span></div><Status value={item.published_at ? "Published" : "Draft"}/></div>)}</div> : <Empty title="Chưa có assignment" description="Giáo viên có thể tạo assignment theo từng buổi."/>}
      </Panel>
    </div>

    <Panel className="section-gap" title="Assignment submissions" description="Giáo viên chỉ thấy bài nộp của học viên thuộc lớp mình được phân công">
      {submissions.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Học viên</th><th>Assignment</th><th>Nộp lúc</th><th>File</th><th>Trạng thái</th><th>Chấm bài</th></tr></thead><tbody>{submissions.data.map((row:any)=><tr key={row.id}><td><strong>{row.students?.code} · {row.students?.full_name}</strong></td><td>{row.assignments?.classes?.code} · {row.assignments?.title}<br/><span className="muted-text">Tối đa {row.assignments?.max_score}</span></td><td>{formatDateTime(row.submitted_at)}</td><td>{signedSubmissionUrls.get(row.id) ? <a className="button button-ghost" href={signedSubmissionUrls.get(row.id)} target="_blank" rel="noreferrer">Mở file</a> : "Không có quyền file"}</td><td><Status value={row.status}/></td><td><form action={gradeAssignmentSubmission} className="inline-form"><input type="hidden" name="submission_id" value={row.id}/><input className="input" type="number" name="score" step="0.01" min="0" max={row.assignments?.max_score || 100} defaultValue={row.score ?? ""} placeholder="Điểm"/><select className="select" name="status" defaultValue={row.status === "Revision required" ? "Revision required" : "Graded"}><option value="Graded">Đã chấm</option><option value="Revision required">Yêu cầu nộp lại</option></select><input className="input" name="feedback" defaultValue={row.feedback || ""} placeholder="Nhận xét"/><button className="button button-secondary">Lưu</button></form></td></tr>)}</tbody></table></div> : <Empty title="Chưa có bài nộp" description="Bài nộp của học viên sẽ xuất hiện tại đây."/>}
    </Panel>
    <div className="grid-2 section-gap">
      <Panel title="Feedback workflow" description={manager ? "Duyệt, yêu cầu sửa hoặc publish" : "Theo dõi trạng thái feedback đã submit"}>
        {feedback.data?.length ? <div className="alert-list">{feedback.data.map((item:any)=><div className="alert-item" key={item.id}><i/><div><strong>{item.enrollments?.students?.full_name} · {item.enrollments?.classes?.code} · {item.milestone}%</strong><span>{item.current_performance}</span>{manager && item.status === "Submitted" ? <form action={reviewProgressFeedback} className="inline-form section-gap"><input type="hidden" name="feedback_id" value={item.id}/><select className="select" name="decision" required><option value="publish">Approve & Publish</option><option value="revision">Request revision</option><option value="reject">Reject</option></select><input className="input" name="revision_note" placeholder="Revision note nếu có"/><button className="button button-secondary">Apply</button></form> : null}</div><Status value={item.status}/></div>)}</div> : <Empty title="Chưa có feedback" description="Feedback được tạo ở các milestone 30%, 50%, 70% và 100%."/>}
      </Panel>
      <Panel title="Assessments" description="Midterm, Final và các loại đánh giá">
        {assessments.data?.length ? <div className="alert-list">{assessments.data.map((item:any)=><div className="alert-item" key={item.id}><i/><div><strong>{item.classes?.code} · {item.name}</strong><span>{item.type} · {formatDate(item.assessment_date)} · Max {item.max_score}</span></div><Status value={item.status}/></div>)}</div> : <Empty title="Chưa có assessment" description="Học vụ hoặc giáo viên phụ trách có thể tạo assessment."/>}
      </Panel>
    </div>
  </>;
}

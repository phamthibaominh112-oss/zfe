import Link from "next/link";
import { archiveAssignment, completeSession, createAssignment, createAssessment, gradeAssignmentSubmission, batchMarkAttendance, markAllPresentForSession, markAttendance, quickMarkAttendance, reviewProgressFeedback, saveAssessmentResult, saveHomework, submitProgressFeedback, updateAssignment } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, sessionDisplayLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { canonicalProgramFromClass, mergeSyllabusItem } from "@/lib/canonical-syllabus";

export default async function AcademicPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireRole(["admin","academic_manager","customer_service","teacher"]);
  const params = await searchParams;
  const supabase = await createClient();
  const manager = profile.role !== "teacher";

  const [sessions, enrollments, assignments, assessments, feedback, submissions, attendanceRows, syllabusMasters, syllabusOverrides] = await Promise.all([
    supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,topic,classes(code,name),session_teachers(teachers(full_name))").gte("scheduled_date",new Date(Date.now()-14*86400000).toISOString().slice(0,10)).order("scheduled_date",{ascending:false}).limit(40),
    supabase.from("enrollments").select("id,class_id,student_id,status,students(id,code,full_name),classes(id,code,name)").eq("status","Active").is("archived_at",null).limit(200),
    supabase.from("assignments").select("id,class_id,session_id,created_by,title,instructions,due_at,max_score,published_at,material_path,material_name,material_mime,material_size,classes(code,name),sessions(session_no)").is("archived_at",null).order("created_at",{ascending:false}).limit(30),
    supabase.from("assessments").select("id,name,type,assessment_date,max_score,status,class_id,classes(code,name)").is("archived_at",null).order("created_at",{ascending:false}).limit(20),
    supabase.from("progress_feedback").select("id,enrollment_id,milestone,status,risk_level,current_performance,revision_note,submitted_at,enrollments(students(code,full_name),classes(code,name))").is("archived_at",null).order("updated_at",{ascending:false}).limit(30),
    supabase.from("assignment_submissions").select("id,assignment_id,student_id,file_path,status,submitted_at,score,feedback,assignments(title,max_score,classes(code)),students(code,full_name)").order("submitted_at",{ascending:false}).limit(40),
    supabase.from("attendance").select("id,session_id,student_id,status,late_minutes,reason,marked_at").gte("marked_at",new Date(Date.now()-7*86400000).toISOString()),
    supabase.from("syllabus_templates").select("id,program_code,status,syllabus_template_items(id,session_no,title,learning_objectives,content,homework,slide_url,material_file_path,material_file_name)").not("program_code","is",null).is("archived_at",null),
    supabase.from("class_syllabus_overrides").select("id,class_id,session_no,title,learning_objectives,content,homework,slide_url,material_file_path,material_file_name,override_reason").is("archived_at",null)
  ]);

  const classOptions = Array.from(new Map([
    ...(enrollments.data||[]).map((x:any)=>[String(x.class_id),{value:String(x.class_id),label:`${x.classes?.code} · ${x.classes?.name}`}]),
    ...(sessions.data||[]).filter((x:any)=>x.class_id).map((x:any)=>[String(x.class_id),{value:String(x.class_id),label:`${x.classes?.code} · ${x.classes?.name}`}])
  ]).values()) as Array<{value:string,label:string}>;
  const sessionOptions = (sessions.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · ${sessionDisplayLabel(x.status,x.session_no)} · ${formatDate(x.scheduled_date)} ${x.start_time?.slice(0,5)}`}));
  const enrollmentOptions = (enrollments.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · ${x.students?.code} · ${x.students?.full_name}`}));
  const studentOptions = (enrollments.data||[]).map((x:any)=>({value:x.student_id,label:`${x.students?.code} · ${x.students?.full_name}`}));
  const signedSubmissionUrls = new Map<string,string>();
  await Promise.all((submissions.data || []).map(async (row:any) => { const { data } = await supabase.storage.from("assignment-files").createSignedUrl(row.file_path, 3600); if (data?.signedUrl) signedSubmissionUrls.set(row.id, data.signedUrl); }));
  const signedMaterialUrls = new Map<string,string>();
  await Promise.all((assignments.data || []).filter((row:any)=>row.material_path).map(async (row:any) => {
    const { data } = await supabase.storage.from("assignment-materials").createSignedUrl(row.material_path, 3600);
    if (data?.signedUrl) signedMaterialUrls.set(row.id, data.signedUrl);
  }));
  const assessmentOptions = (assessments.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · ${x.type} · ${x.name}`}));
  const today = new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const todaySessions=(sessions.data||[]).filter((x:any)=>x.scheduled_date===today&&!String(x.status).toLowerCase().includes("cancel"));
  const rosterByClass=new Map<string,any[]>();
  for(const row of enrollments.data||[]){const list=rosterByClass.get(row.class_id)||[];list.push(row);rosterByClass.set(row.class_id,list);}
  const attendanceMap=new Map((attendanceRows.data||[]).map((x:any)=>[`${x.session_id}|${x.student_id}`,x]));
  const milestoneSessions=(sessions.data||[]).filter((x:any)=>[18,36].includes(Number(x.session_no))&&!String(x.status).toLowerCase().includes("cancel")).sort((a:any,b:any)=>String(a.scheduled_date).localeCompare(String(b.scheduled_date)));

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
      <SelectField label="Lớp (nếu không chọn Session)" name="class_id" options={classOptions}/><SelectField label="Session (optional)" name="session_id" options={sessionOptions}/>
      <div className="assignment-class-helper">Nếu chọn Session, hệ thống tự lấy đúng lớp của session đó. Chỉ chọn Lớp khi giao bài chung không gắn buổi.</div><Field label="Tiêu đề" name="title" required/><Field label="Deadline" name="due_at" type="datetime-local"/><Field label="Điểm tối đa" name="max_score" type="number" defaultValue={100}/><TextAreaField label="Đề bài / Hướng dẫn" name="instructions" required/>
      <label className="form-group assignment-upload-field"><span>File đề / tài liệu cho HV</span><input className="input" type="file" name="material_file" accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.zip"/><small>Không bắt buộc · tối đa 20MB · PDF/Word/PPT/Excel/ảnh/ZIP</small></label>
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

  const masterMap=new Map<string,any>();
  for(const master of syllabusMasters.data||[]){
    for(const item of master.syllabus_template_items||[]) masterMap.set(`${master.program_code}|${item.session_no}`,{...item,program_code:master.program_code});
  }
  const overrideMap=new Map((syllabusOverrides.data||[]).map((x:any)=>[`${x.class_id}|${x.session_no}`,x]));
  return <>
    <PageHeader eyebrow="Vận hành học thuật" title="Điểm danh, bài tập & đánh giá" description={profile.role === "teacher" ? "Cập nhật điểm danh, bài tập và phản hồi cho các lớp bạn phụ trách." : "Theo dõi điểm danh, mức độ hoàn thành bài tập, điểm số và các phản hồi đang chờ duyệt."} actions={actions}/>
    <Flash message={params.message} error={params.error}/>
  <Panel className="section-gap" title="Syllabus buổi học" description="GV/Học vụ/CSKH nhìn cùng một nội dung đã được Admin/Học vụ duplicate từ syllabus master.">
    {(syllabusMasters.data?.length||syllabusOverrides.data?.length)?<div className="academic-syllabus-strip">{(sessions.data||[]).slice(0,12).map((s:any)=>{const p=canonicalProgramFromClass(s.classes?.code,s.classes?.name); const sy=mergeSyllabusItem(p?masterMap.get(`${p}|${s.session_no}`):null,overrideMap.get(`${s.class_id}|${s.session_no}`));return <div className={`academic-syllabus-card ${sy?"ready":"missing"}`} key={s.id}><span>{s.classes?.code} · Buổi {s.session_no}</span><strong>{sy?.title||s.topic||"Chưa có syllabus"}</strong><small>{sy?.learning_objectives||sy?.content||formatDate(s.scheduled_date)}</small>{sy?.slide_url?<a href={sy.slide_url} target="_blank">Mở slide →</a>:null}</div>})}</div>:<Empty title="Chưa có syllabus class-level" description="Admin/Học vụ vào Chương trình & Syllabus để duplicate master xuống lớp."/>}
  </Panel>
    <Panel className="section-gap attendance-command-center" title="Điểm danh theo Session" description="Bấm Session → roster của lớp hiện ngay → chọn trạng thái cho nhiều học viên → Lưu một lần.">
      {todaySessions.length ? <div className="attendance-session-selector">
        {todaySessions.map((session:any)=>{
          const roster=rosterByClass.get(session.class_id)||[];
          const markedCount=roster.filter((en:any)=>attendanceMap.get(`${session.id}|${en.student_id}`)).length;
          return <details className="attendance-batch-session" key={session.id}>
            <summary>
              <div className="attendance-session-summary-main">
                <strong>{session.classes?.code} · {sessionDisplayLabel(session.status,session.session_no)}</strong>
                <span>{session.start_time?.slice(0,5)}–{session.end_time?.slice(0,5)} · {roster.length ? `${roster.length} HV` : "⚠ Chưa có roster / chưa đọc được enrollment"}</span>
              </div>
              <div className="attendance-session-summary-status">
                <b>{roster.length ? `${markedCount}/${roster.length}` : "—"}</b>
                <span>{roster.length ? "đã điểm danh" : "cần kiểm tra roster"}</span>
              </div>
            </summary>

            <form action={batchMarkAttendance} className="attendance-batch-form">
              <input type="hidden" name="session_id" value={session.id}/>
              <input type="hidden" name="class_id" value={session.class_id}/>

              <div className="attendance-batch-toolbar">
                <div>
                  <strong>Roster · {session.classes?.code}</strong>
                  <span>Default là Có mặt. Chỉ đổi những trường hợp Trễ / Vắng.</span>
                </div>
                <div className="attendance-batch-legend">
                  <span className="present">✓ Có mặt</span>
                  <span className="late">Trễ</span>
                  <span className="excused">P · Vắng phép</span>
                  <span className="absent">V · Không phép</span>
                </div>
              </div>

              {roster.length ? <div className="attendance-batch-roster">
                {roster.map((en:any)=>{
                  const st=en.students;
                  const current:any=attendanceMap.get(`${session.id}|${en.student_id}`);
                  const currentStatus=current?.status||"Present";
                  return <div className="attendance-batch-row" key={en.student_id}>
                    <div className="attendance-batch-student">
                      <strong>{st?.full_name}</strong>
                      <span>{st?.code}</span>
                    </div>

                    <div className="attendance-status-choice">
                      <label className={`attendance-choice present ${currentStatus==="Present"?"selected":""}`}>
                        <input type="radio" name={`status_${en.student_id}`} value="Present" defaultChecked={currentStatus==="Present"}/>
                        <span>✓</span><small>Có mặt</small>
                      </label>
                      <label className={`attendance-choice late ${currentStatus==="Late"?"selected":""}`}>
                        <input type="radio" name={`status_${en.student_id}`} value="Late" defaultChecked={currentStatus==="Late"}/>
                        <span>⏱</span><small>Trễ</small>
                      </label>
                      <label className={`attendance-choice excused ${currentStatus==="Excused absence"?"selected":""}`}>
                        <input type="radio" name={`status_${en.student_id}`} value="Excused absence" defaultChecked={currentStatus==="Excused absence"}/>
                        <span>P</span><small>Có phép</small>
                      </label>
                      <label className={`attendance-choice absent ${currentStatus==="Unexcused absence"?"selected":""}`}>
                        <input type="radio" name={`status_${en.student_id}`} value="Unexcused absence" defaultChecked={currentStatus==="Unexcused absence"}/>
                        <span>V</span><small>Không phép</small>
                      </label>
                    </div>

                    <div className="attendance-batch-meta">
                      <label>
                        <span>Trễ (phút)</span>
                        <input name={`late_${en.student_id}`} type="number" min="0" defaultValue={current?.late_minutes||5}/>
                      </label>
                      <label>
                        <span>Ghi chú</span>
                        <input name={`reason_${en.student_id}`} type="text" defaultValue={current?.reason||""} placeholder="Nếu cần"/>
                      </label>
                    </div>
                  </div>
                })}
              </div> : <Empty title="Lớp chưa có roster" description="Kéo học viên vào lớp trước khi điểm danh."/>}

              {roster.length ? <div className="attendance-batch-savebar">
                <span>Kiểm tra một lượt rồi lưu cho cả lớp.</span>
                <button className="button button-primary">✓ Lưu điểm danh {roster.length} HV</button>
              </div> : null}
            </form>
          </details>
        })}
      </div> : <Empty title="Hôm nay chưa có Session" description="Khi có lớp hôm nay, bấm Session để mở roster và điểm danh hàng loạt."/>}
    </Panel>

    {milestoneSessions.length?<Panel className="section-gap" title="Cảnh báo Midterm / Final" description="Buổi 18 = Midterm · Buổi 36 = Final."><div className="milestone-warning-grid">{milestoneSessions.slice(0,10).map((row:any)=>{const isMid=Number(row.session_no)===18;return <div className={`milestone-warning-card ${isMid?"mid":"final"}`} key={row.id}><span>{isMid?"MIDTERM":"FINAL"}</span><strong>{row.classes?.code} · Buổi {row.session_no}</strong><small>{formatDate(row.scheduled_date)} · {row.start_time?.slice(0,5)}</small></div>})}</div></Panel>:null}
    <div className="grid-2">
      <Panel title="Sessions cần vận hành" description={profile.role === "teacher" ? "Giáo viên Check-in/Check-out tại mục Chấm công & KPI" : "Học vụ có thể xác nhận session khi cần xử lý ngoại lệ"}>
        {sessions.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Ngày / Giờ</th><th>Topic</th><th>Trạng thái</th><th></th></tr></thead><tbody>{sessions.data.map((item:any)=><tr key={item.id}><td><strong>{item.classes?.code} · {sessionDisplayLabel(item.status,item.session_no)}</strong><br/><span className="muted-text">{(item.session_teachers||[]).map((x:any)=>x.teachers?.full_name).filter(Boolean).join(", ")}</span></td><td>{formatDate(item.scheduled_date)}<br/>{item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</td><td>{item.topic || "—"}</td><td><Status value={item.status}/></td><td>{!(["Completed","Make-up completed","Cancelled"].includes(item.status)) ? (profile.role === "teacher" ? <Link className="button button-secondary" href="/workforce">Check-in / Check-out</Link> : <form action={completeSession} className="inline-form"><input type="hidden" name="session_id" value={item.id}/><input className="input" name="topic" placeholder="Topic đã dạy"/><button className="button button-secondary">Complete</button></form>) : null}</td></tr>)}</tbody></table></div> : <Empty title="Không có session" description="Kiểm tra phân công lớp hoặc tạo session mới."/>}
      </Panel>
      <Panel title="Assignments" description="Bài tập theo lớp hoặc session">
        {assignments.data?.length ? <div className="alert-list">{assignments.data.map((item:any)=><div className="alert-item" key={item.id}><i/><div><strong>{item.classes?.code} · {item.title}</strong><span>Deadline: {formatDateTime(item.due_at)} · Max {item.max_score}</span></div><Status value={item.published_at ? "Published" : "Draft"}/></div>)}</div> : <Empty title="Chưa có assignment" description="Giáo viên có thể tạo assignment theo từng buổi."/>}
      </Panel>
    </div>

    <Panel className="section-gap" title="Assignments đã giao" description="File đề/tài liệu được lưu riêng; học viên có thể tải về từ portal.">
      {assignments.data?.length ? <div className="assignment-material-list">{assignments.data.map((row:any)=>{const canEditAssignment=manager||row.created_by===profile.id;return <div className="assignment-material-row assignment-manage-row" key={row.id}><div><strong>{row.classes?.code} · {row.title}</strong><span>{row.sessions?.session_no?`Buổi ${row.sessions.session_no} · `:""}Hạn: {row.due_at?formatDateTime(row.due_at):"Không giới hạn"}</span><small>{row.instructions}</small></div><div className="assignment-material-actions"><Status value={row.published_at?"Published":"Draft"}/>{row.material_path&&signedMaterialUrls.get(row.id)?<a className="button button-ghost button-small" href={signedMaterialUrls.get(row.id)} target="_blank" rel="noreferrer" download={row.material_name||undefined}>↓ {row.material_name||"Tải file đề"}</a>:<span className="muted-text">Không có file đính kèm</span>}{canEditAssignment?<details className="inline-details assignment-edit-details"><summary className="button button-secondary button-small">Sửa</summary><form action={updateAssignment} className="form-stack"><input type="hidden" name="assignment_id" value={row.id}/><input type="hidden" name="published_at" value={row.published_at||""}/><Field label="Tiêu đề" name="title" defaultValue={row.title} required/><Field label="Deadline" name="due_at" type="datetime-local" defaultValue={row.due_at?String(row.due_at).slice(0,16):""}/><Field label="Điểm tối đa" name="max_score" type="number" min="0.01" step="0.01" defaultValue={row.max_score} required/><TextAreaField label="Đề bài / Hướng dẫn" name="instructions" defaultValue={row.instructions} required/><label className="form-group"><span>Thay file đề (không bắt buộc)</span><input className="input" type="file" name="material_file" accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.zip"/></label><label className="form-group"><span>Publish</span><input name="publish" type="checkbox" defaultChecked={!!row.published_at}/></label><button className="button button-primary">Lưu assignment</button></form></details>:null}{canEditAssignment?<details className="inline-details assignment-delete-details"><summary className="button button-danger button-small">Xóa</summary><form action={archiveAssignment} className="form-stack"><input type="hidden" name="assignment_id" value={row.id}/><TextAreaField label="Lý do xóa / ẩn" name="reason" required/><button className="button button-danger">Xác nhận xóa khỏi portal</button></form></details>:null}</div></div>})}</div> : <Empty title="Chưa có assignment" description="Tạo assignment để giao bài cho lớp."/>}
    </Panel>

    <Panel className="section-gap" title="Assignment submissions" description="Giáo viên chỉ thấy bài nộp của học viên thuộc lớp mình được phân công">
      {submissions.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Học viên</th><th>Assignment</th><th>Nộp lúc</th><th>File</th><th>Trạng thái</th><th>Chấm bài</th></tr></thead><tbody>{submissions.data.map((row:any)=><tr key={row.id}><td><strong>{row.students?.code} · {row.students?.full_name}</strong></td><td>{row.assignments?.classes?.code} · {row.assignments?.title}<br/><span className="muted-text">Tối đa {row.assignments?.max_score}</span></td><td>{formatDateTime(row.submitted_at)}</td><td>{signedSubmissionUrls.get(row.id) ? <a className="button button-ghost" href={signedSubmissionUrls.get(row.id)} target="_blank" rel="noreferrer">Mở / tải bài HV</a> : "Không có quyền file"}</td><td><Status value={row.status}/></td><td><form action={gradeAssignmentSubmission} className="inline-form"><input type="hidden" name="submission_id" value={row.id}/><input className="input" type="number" name="score" step="0.01" min="0" max={row.assignments?.max_score || 100} defaultValue={row.score ?? ""} placeholder="Điểm"/><select className="select" name="status" defaultValue={row.status === "Revision required" ? "Revision required" : "Graded"}><option value="Graded">Đã chấm</option><option value="Revision required">Yêu cầu nộp lại</option></select><input className="input" name="feedback" defaultValue={row.feedback || ""} placeholder="Nhận xét"/><button className="button button-secondary">Lưu</button></form></td></tr>)}</tbody></table></div> : <Empty title="Chưa có bài nộp" description="Bài nộp của học viên sẽ xuất hiện tại đây."/>}
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

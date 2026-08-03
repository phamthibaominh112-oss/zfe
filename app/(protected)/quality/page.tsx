import { createObservation } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function QualityPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireRole(["admin","academic_manager","teacher"]);
  const params = await searchParams;
  const supabase = await createClient();
  const manager = profile.role !== "teacher";

  const [observations, templates, teachers, sessions, ratings] = await Promise.all([
    supabase.from("teacher_observations").select("id,type,status,total_score,strengths,areas_to_improve,required_actions,follow_up_due_at,shared_at,created_at,teachers(code,full_name),sessions(session_no,scheduled_date,classes(code,name)),observation_templates(name),observation_scores(score,note,observation_criteria(label,max_score,weight))").is("archived_at",null).order("created_at",{ascending:false}).limit(30),
    supabase.from("observation_templates").select("id,name,description,observation_criteria(id,code,label,description,max_score,weight,sort_order)").eq("is_active",true).order("name"),
    manager ? supabase.from("teachers").select("id,code,full_name").is("archived_at",null).order("full_name") : Promise.resolve({data:[] as any[]}),
    manager ? supabase.from("sessions").select("id,session_no,scheduled_date,classes(code,name)").order("scheduled_date",{ascending:false}).limit(80) : Promise.resolve({data:[] as any[]}),
    manager ? supabase.from("teacher_ratings").select("id,overall,clarity,engagement,supportiveness,pace,comment,created_at,teachers(full_name),sessions(session_no,scheduled_date,classes(code))").order("created_at",{ascending:false}).limit(30) : Promise.resolve({data:[] as any[]})
  ]);

  const defaultTemplate = templates.data?.[0];
  const actions = manager && defaultTemplate ? <FormDetails title="Tạo observation"><form action={createObservation}><FormGrid>
    <SelectField label="Giáo viên" name="teacher_id" required options={(teachers.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.full_name}`}))}/>
    <SelectField label="Session" name="session_id" options={(sessions.data||[]).map((x:any)=>({value:x.id,label:`${x.classes?.code} · #${x.session_no} · ${formatDate(x.scheduled_date)}`}))}/>
    <SelectField label="Rubric template" name="template_id" required defaultValue={defaultTemplate.id} options={(templates.data||[]).map((x:any)=>({value:x.id,label:x.name}))}/>
    <SelectField label="Observation type" name="type" required defaultValue="Scheduled" options={["Scheduled","Random","Follow-up","Probation"].map(v=>({value:v,label:v}))}/>
    <div className="form-span-2 rubric-grid">
      {(defaultTemplate.observation_criteria||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((criterion:any)=><div className="rubric-item" key={criterion.id}><div><strong>{criterion.label}</strong><span>{criterion.description}</span></div><input className="input" name={`criterion_${criterion.id}`} type="number" min="0" max={criterion.max_score} step="0.5" required defaultValue={criterion.max_score}/><input className="input" name={`note_${criterion.id}`} placeholder="Ghi chú tiêu chí"/></div>)}
    </div>
    <TextAreaField label="Strengths" name="strengths"/><TextAreaField label="Areas to improve" name="areas_to_improve"/><TextAreaField label="Required actions" name="required_actions"/>
    <Field label="Follow-up deadline" name="follow_up_due_at" type="date"/><label className="form-group"><span>Share cho giáo viên ngay</span><input name="share" type="checkbox"/></label>
    <div className="form-actions"><button className="button button-primary">Lưu observation</button></div>
  </FormGrid></form></FormDetails> : undefined;

  const avgRating = ratings.data?.length ? (ratings.data.reduce((sum:number,x:any)=>sum+Number(x.overall||0),0)/ratings.data.length).toFixed(2) : "—";
  return <>
    <PageHeader eyebrow="Kiểm soát chất lượng" title="Chất lượng giảng dạy" description={profile.role === "teacher" ? "Xem kết quả dự giờ, điểm mạnh và nội dung cần cải thiện của chính bạn." : "Theo dõi dự giờ, rubric, kế hoạch coaching và xu hướng đánh giá từ học viên."} actions={actions}/>
    <Flash message={params.message} error={params.error}/>
    {manager ? <div className="metrics-grid">
      <article className="metric-card metric-blue"><span>Observations</span><strong>{observations.data?.length || 0}</strong><small>Trong danh sách gần nhất</small></article>
      <article className="metric-card metric-yellow"><span>Student rating average</span><strong>{avgRating}</strong><small>Raw rating chỉ Academic/Admin được đọc</small></article>
      <article className="metric-card metric-green"><span>Đã chia sẻ reports</span><strong>{observations.data?.filter((x:any)=>x.shared_at).length || 0}</strong><small>Giáo viên đã có thể xem</small></article>
      <article className="metric-card metric-red"><span>Follow-up due</span><strong>{observations.data?.filter((x:any)=>x.follow_up_due_at && x.follow_up_due_at <= new Date().toISOString().slice(0,10)).length || 0}</strong><small>Coaching action đến hạn</small></article>
    </div> : null}
    <Panel title={profile.role === "teacher" ? "Đánh giá của tôi" : "Observation records"} description="Mỗi record có rubric, tổng điểm, strengths và action plan">
      {observations.data?.length ? <div className="card-grid">{observations.data.map((item:any)=><article className="class-card" key={item.id}>
        <div className="card-top"><div><h3>{item.teachers?.full_name || "My observation"}</h3><p>{item.sessions?.classes?.code || "No session"} · {item.type}</p></div><Status value={item.status}/></div>
        <div className="card-meta"><span className="chip chip-blue">Score {item.total_score ?? "—"}/100</span><span className="chip">{item.observation_templates?.name}</span>{item.follow_up_due_at ? <span className="chip chip-yellow">Follow-up {formatDate(item.follow_up_due_at)}</span> : null}</div>
        <div className="detail-list section-gap"><div className="detail-row"><span>Strengths</span><strong>{item.strengths || "—"}</strong></div><div className="detail-row"><span>Improve</span><strong>{item.areas_to_improve || "—"}</strong></div><div className="detail-row"><span>Actions</span><strong>{item.required_actions || "—"}</strong></div></div>
        <details className="section-gap"><summary className="button button-secondary">Xem rubric</summary><div className="alert-list section-gap">{(item.observation_scores||[]).map((score:any)=><div className="alert-item" key={score.observation_criteria?.label}><i/><div><strong>{score.observation_criteria?.label}</strong><span>{score.note || "Không có ghi chú"}</span></div><strong>{score.score}/{score.observation_criteria?.max_score}</strong></div>)}</div></details>
        <div className="card-footer"><span>{formatDateTime(item.created_at)}</span><span>{item.shared_at ? `Đã chia sẻ ${formatDateTime(item.shared_at)}` : "Chưa chia sẻ"}</span></div>
      </article>)}</div> : <Empty title="Chưa có observation" description={profile.role === "teacher" ? "Academic chưa share observation nào cho bạn." : "Tạo observation đầu tiên bằng rubric chuẩn."}/>} 
    </Panel>
    {manager ? <Panel className="section-gap" title="Student ratings" description="Anonymous to teachers; Academic Manager sees records for quality control">
      {ratings.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Giáo viên / Session</th><th>Overall</th><th>Clarity</th><th>Engagement</th><th>Support</th><th>Pace</th><th>Comment</th></tr></thead><tbody>{ratings.data.map((item:any)=><tr key={item.id}><td><strong>{item.teachers?.full_name}</strong><br/><span className="muted-text">{item.sessions?.classes?.code} · #{item.sessions?.session_no}</span></td><td>{item.overall}/5</td><td>{item.clarity || "—"}</td><td>{item.engagement || "—"}</td><td>{item.supportiveness || "—"}</td><td>{item.pace || "—"}</td><td>{item.comment || "—"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có rating" description="Học viên chỉ được rate session mà attendance là Present, Late hoặc Joined partially."/>}
    </Panel> : null}
  </>;
}

import { createCourseTemplate, createLevel, createProgram, updateLevel, updateProgram } from "@/app/actions";
import { Field, FormGrid, SelectField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireRole(["admin","academic_manager"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [{data:programs,error},{data:levels},{data:templates}] = await Promise.all([
    supabase.from("programs").select("id,code,name,category,is_active,created_at").order("name"),
    supabase.from("levels").select("id,program_id,code,name,sequence_no,is_active,programs(code,name)").order("sequence_no"),
    supabase.from("course_templates").select("id,program_id,level_id,name,total_hours,total_sessions,target,midterm_percent,final_percent,is_active,programs(code,name),levels(code,name)").order("name")
  ]);
  const programOptions=(programs||[]).filter((x:any)=>x.is_active).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}));
  const levelOptions=(levels||[]).filter((x:any)=>x.is_active).map((x:any)=>({value:x.id,label:`${x.programs?.code} · ${x.code} · ${x.name}`}));
  const actions=<div className="page-actions">
    <FormDetails title="Tạo program"><form action={createProgram}><FormGrid><Field label="Code" name="code" required/><Field label="Tên chương trình" name="name" required/><Field label="Category" name="category" required placeholder="IELTS / Communication / B2B"/><div className="form-actions"><button className="button button-primary">Tạo program</button></div></FormGrid></form></FormDetails>
    <FormDetails title="Tạo level"><form action={createLevel}><FormGrid><SelectField label="Program" name="program_id" required options={programOptions}/><Field label="Level code" name="code" required/><Field label="Tên level" name="name" required/><Field label="Thứ tự" name="sequence_no" type="number" defaultValue={1} required/><div className="form-actions"><button className="button button-primary">Tạo level</button></div></FormGrid></form></FormDetails>
    <FormDetails title="Tạo course template"><form action={createCourseTemplate}><FormGrid><SelectField label="Program" name="program_id" required options={programOptions}/><SelectField label="Level" name="level_id" options={levelOptions}/><Field label="Tên template" name="name" required/><Field label="Tổng giờ" name="total_hours" type="number" step="0.25" required/><Field label="Tổng session" name="total_sessions" type="number" required/><Field label="Target đầu ra" name="target"/><Field label="Midterm milestone (%)" name="midterm_percent" type="number" min="1" max="99" defaultValue={50}/><div className="form-actions"><button className="button button-primary">Tạo template</button></div></FormGrid></form></FormDetails>
  </div>;
  return <>
    <PageHeader eyebrow="Academic catalog" title="Programs, Levels & Course Templates" description="Chuẩn hoá cấu trúc Program → Level → Course Template trước khi mở lớp. Đây là nguồn kiểm soát level, duration, session count và target." actions={actions}/>
    <Flash message={params.message} error={params.error||error?.message}/>
    <div className="grid-2">
      <Panel title="Programs" description={`${programs?.length||0} chương trình`}>
        {programs?.length?<div className="table-wrap"><table><thead><tr><th>Code</th><th>Tên</th><th>Category</th><th>Status</th><th>Edit</th></tr></thead><tbody>{programs.map((row:any)=><tr key={row.id}><td><strong>{row.code}</strong></td><td>{row.name}</td><td>{row.category}</td><td><Status value={row.is_active?"Active":"Disabled"}/></td><td><details className="inline-details"><summary className="button button-secondary">Edit</summary><form action={updateProgram} className="inline-edit-form"><input type="hidden" name="program_id" value={row.id}/><Field label="Code" name="code" defaultValue={row.code} required/><Field label="Tên" name="name" defaultValue={row.name} required/><Field label="Category" name="category" defaultValue={row.category} required/><label className="checkbox-row"><input name="is_active" type="checkbox" defaultChecked={row.is_active}/><span>Active</span></label><button className="button button-primary">Lưu</button></form></details></td></tr>)}</tbody></table></div>:<Empty title="Chưa có program" description="Tạo program đầu tiên."/>}
      </Panel>
      <Panel title="Levels" description={`${levels?.length||0} level`}>
        {levels?.length?<div className="table-wrap"><table><thead><tr><th>Program</th><th>Level</th><th>Sequence</th><th>Status</th><th>Edit</th></tr></thead><tbody>{levels.map((row:any)=><tr key={row.id}><td>{row.programs?.code}</td><td><strong>{row.code} · {row.name}</strong></td><td>{row.sequence_no}</td><td><Status value={row.is_active?"Active":"Disabled"}/></td><td><details className="inline-details"><summary className="button button-secondary">Edit</summary><form action={updateLevel} className="inline-edit-form"><input type="hidden" name="level_id" value={row.id}/><Field label="Code" name="code" defaultValue={row.code} required/><Field label="Tên" name="name" defaultValue={row.name} required/><Field label="Sequence" name="sequence_no" type="number" defaultValue={row.sequence_no} required/><label className="checkbox-row"><input name="is_active" type="checkbox" defaultChecked={row.is_active}/><span>Active</span></label><button className="button button-primary">Lưu</button></form></details></td></tr>)}</tbody></table></div>:<Empty title="Chưa có level" description="Tạo level theo từng program."/>}
      </Panel>
    </div>
    <Panel className="section-gap" title="Course templates" description="Template dùng để mở lớp với duration, session count và target chuẩn">{templates?.length?<div className="card-grid">{templates.map((row:any)=><article className="class-card" key={row.id}><div className="card-top"><div><h3>{row.name}</h3><p>{row.programs?.code} · {row.levels?.code||"All levels"}</p></div><Status value={row.is_active?"Active":"Disabled"}/></div><div className="profile-grid section-gap" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}><div className="profile-item"><span>Total hours</span><strong>{row.total_hours}h</strong></div><div className="profile-item"><span>Sessions</span><strong>{row.total_sessions}</strong></div><div className="profile-item"><span>Midterm</span><strong>{row.midterm_percent}%</strong></div><div className="profile-item"><span>Final</span><strong>{row.final_percent}%</strong></div></div><div className="card-footer"><span>{row.target||"Chưa set target"}</span></div></article>)}</div>:<Empty title="Chưa có course template" description="Tạo template chuẩn trước khi mở lớp."/>}</Panel>
  </>;
}

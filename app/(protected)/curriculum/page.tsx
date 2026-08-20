import { addSyllabusTemplateItem, createSyllabusTemplate, duplicateSyllabusToClass, updateClassSyllabusItem } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CurriculumPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireRole(["admin","academic_manager"]);
  const params=await searchParams;
  const supabase=await createClient();
  const [templates,courseTemplates,classes,classItems]=await Promise.all([
    supabase.from("syllabus_templates").select("*,syllabus_template_items(*)").is("archived_at",null).order("created_at",{ascending:false}),
    supabase.from("course_templates").select("id,name,total_sessions,programs(code,name),levels(code,name)").eq("is_active",true).order("name"),
    supabase.from("classes").select("id,code,name,total_sessions,status").is("archived_at",null).order("code"),
    supabase.from("class_syllabus_items").select("*,classes(code,name)").order("class_id").order("session_no")
  ]);
  const signed=new Map<string,string>();
  const materialRows=[
    ...(templates.data||[]).filter((x:any)=>x.outline_file_path).map((x:any)=>({id:`tpl-${x.id}`,path:x.outline_file_path})),
    ...(templates.data||[]).flatMap((x:any)=>(x.syllabus_template_items||[]).filter((i:any)=>i.material_file_path).map((i:any)=>({id:`ti-${i.id}`,path:i.material_file_path}))),
    ...(classItems.data||[]).filter((x:any)=>x.material_file_path).map((x:any)=>({id:`ci-${x.id}`,path:x.material_file_path}))
  ];
  await Promise.all(materialRows.map(async row=>{const {data}=await supabase.storage.from("course-materials").createSignedUrl(row.path,3600);if(data?.signedUrl)signed.set(row.id,data.signedUrl);}));

  const templateOptions=(templates.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name} · v${x.version}`}));
  const classOptions=(classes.data||[]).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}));
  return <>
    <PageHeader eyebrow="Curriculum Control" title="Chương trình & Syllabus" description="Upload course outline → tạo syllabus master → duplicate xuống từng lớp → điều chỉnh nội dung/slide/tài liệu theo từng buổi."
      actions={<FormDetails title="+ Syllabus Master"><form action={createSyllabusTemplate} encType="multipart/form-data"><FormGrid>
        <SelectField label="Course template" name="course_template_id" options={(courseTemplates.data||[]).map((x:any)=>({value:x.id,label:`${x.programs?.code||""} · ${x.name} · ${x.total_sessions} buổi`}))}/>
        <Field label="Mã syllabus" name="code" required placeholder="IELTS-ZEF-36"/><Field label="Tên" name="name" required placeholder="IELTS Foundation"/>
        <Field label="Version" name="version" type="number" min="1" defaultValue={1}/><SelectField label="Status" name="status" defaultValue="Active" options={["Draft","Active","Archived"].map(v=>({value:v,label:v}))}/>
        <TextAreaField label="Mô tả / learning outcomes" name="description"/><label className="form-group"><span>Course outline file</span><input className="input" type="file" name="outline_file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.xls"/><small>Tối đa 30MB</small></label>
        <button className="button button-primary">Tạo syllabus</button>
      </FormGrid></form></FormDetails>}/>
    <Flash message={params.message} error={params.error}/>

    <Panel title="Duplicate syllabus xuống lớp" description="Lấy master làm chuẩn; sau khi duplicate, từng lớp có thể sửa riêng mà không làm thay đổi master.">
      <form action={duplicateSyllabusToClass} className="curriculum-duplicate-form"><SelectField label="Syllabus master" name="template_id" required options={templateOptions}/><SelectField label="Lớp đích" name="class_id" required options={classOptions}/><button className="button button-primary">Duplicate vào lớp</button></form>
    </Panel>

    <Panel className="section-gap" title="Syllabus Master Library" description="Mỗi master gồm outline tổng và nội dung từng session.">
      {templates.data?.length?<div className="curriculum-template-list">{templates.data.map((tpl:any)=><article className="curriculum-template-card" key={tpl.id}>
        <header><div><strong>{tpl.code} · {tpl.name}</strong><span>v{tpl.version} · {(tpl.syllabus_template_items||[]).length} buổi đã khai báo</span></div><Status value={tpl.status}/></header>
        <p>{tpl.description||"Chưa có mô tả."}</p>
        {tpl.outline_file_path?<a className="button button-secondary button-small" href={signed.get(`tpl-${tpl.id}`)||"#"} target="_blank">Mở Course Outline</a>:null}
        <FormDetails title="+ Thêm / sửa buổi"><form action={addSyllabusTemplateItem} encType="multipart/form-data"><input type="hidden" name="template_id" value={tpl.id}/><FormGrid>
          <Field label="Buổi số" name="session_no" type="number" min="1" required/><Field label="Tiêu đề buổi" name="title" required/>
          <Field label="Thời lượng phút" name="duration_minutes" type="number" min="15"/><Field label="Slide URL" name="slide_url" type="url" placeholder="Google Slides / Canva / Drive..."/>
          <TextAreaField label="Learning objectives" name="learning_objectives"/><TextAreaField label="Nội dung buổi học" name="content"/><TextAreaField label="Homework / Output" name="homework"/>
          <label className="form-group"><span>Tài liệu buổi</span><input className="input" type="file" name="material_file"/><small>Tối đa 30MB</small></label>
          <button className="button button-primary">Lưu buổi</button>
        </FormGrid></form></FormDetails>
        <div className="curriculum-session-list">{(tpl.syllabus_template_items||[]).sort((a:any,b:any)=>a.session_no-b.session_no).map((item:any)=><div className="curriculum-session-row" key={item.id}><b>Buổi {item.session_no}</b><div><strong>{item.title}</strong><span>{item.learning_objectives||item.content||"—"}</span></div><div className="curriculum-links">{item.slide_url?<a href={item.slide_url} target="_blank">Slide</a>:null}{item.material_file_path?<a href={signed.get(`ti-${item.id}`)||"#"} target="_blank">Tài liệu</a>:null}</div></div>)}</div>
      </article>)}</div>:<Empty title="Chưa có syllabus master" description="Tạo master đầu tiên từ course outline của trung tâm."/>}
    </Panel>

    <Panel className="section-gap" title="Syllabus đã gắn cho lớp" description="Đây là bản class-level; Admin/Học vụ sửa nội dung, slide và tài liệu riêng cho lớp.">
      {classItems.data?.length?<div className="curriculum-class-list">{Object.entries((classItems.data||[]).reduce((acc:any,row:any)=>{(acc[row.class_id] ||= []).push(row);return acc;},{})).map(([classId,rows]:any)=>{const first=rows[0];return <details className="curriculum-class-block" key={classId}><summary><strong>{first.classes?.code} · {first.classes?.name}</strong><span>{rows.length} buổi</span></summary><div className="curriculum-class-items">{rows.map((item:any)=><form action={updateClassSyllabusItem} encType="multipart/form-data" className="class-syllabus-edit" key={item.id}><input type="hidden" name="item_id" value={item.id}/><input type="hidden" name="class_id" value={item.class_id}/><input type="hidden" name="session_no" value={item.session_no}/><b>Buổi {item.session_no}</b><Field label="Title" name="title" defaultValue={item.title} required/><TextAreaField label="Objectives" name="learning_objectives" defaultValue={item.learning_objectives||""}/><TextAreaField label="Nội dung" name="content" defaultValue={item.content||""}/><TextAreaField label="Homework" name="homework" defaultValue={item.homework||""}/><Field label="Slide URL" name="slide_url" type="url" defaultValue={item.slide_url||""}/><label className="form-group"><span>Thay tài liệu</span><input className="input" type="file" name="material_file"/></label><div className="form-actions">{item.material_file_path?<a className="button button-secondary button-small" href={signed.get(`ci-${item.id}`)||"#"} target="_blank">Tài liệu hiện tại</a>:null}<button className="button button-primary button-small">Lưu buổi</button></div></form>)}</div></details>})}</div>:<Empty title="Chưa lớp nào được gắn syllabus" description="Duplicate từ master xuống lớp ở phía trên."/>}
    </Panel>
  </>;
}

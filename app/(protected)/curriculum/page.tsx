import { activateCanonicalSyllabus, addSyllabusTemplateItem, createSyllabusTemplate, removeClassSyllabusOverride, saveClassSyllabusOverride } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CANONICAL_PROGRAMS, canonicalProgramFromClass, syllabusCompleteness } from "@/lib/canonical-syllabus";

export default async function CurriculumPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireRole(["admin","academic_manager"]);
  const params=await searchParams;
  const supabase=await createClient();

  const [templates,classes,overrides]=await Promise.all([
    supabase.from("syllabus_templates").select("*,syllabus_template_items(*)").not("program_code","is",null).is("archived_at",null).order("program_code"),
    supabase.from("classes").select("id,code,name,total_sessions,status").is("archived_at",null).order("code"),
    supabase.from("class_syllabus_overrides").select("*,classes(code,name)").is("archived_at",null).order("created_at",{ascending:false})
  ]);

  const masterMap=new Map((templates.data||[]).map((x:any)=>[x.program_code,x]));
  const signed=new Map<string,string>();
  const fileRows=[
    ...(templates.data||[]).filter((x:any)=>x.outline_file_path).map((x:any)=>({id:`tpl-${x.id}`,path:x.outline_file_path})),
    ...(templates.data||[]).flatMap((x:any)=>(x.syllabus_template_items||[]).filter((i:any)=>i.material_file_path).map((i:any)=>({id:`item-${i.id}`,path:i.material_file_path}))),
    ...(overrides.data||[]).filter((x:any)=>x.material_file_path).map((x:any)=>({id:`ov-${x.id}`,path:x.material_file_path}))
  ];
  await Promise.all(fileRows.map(async row=>{const {data}=await supabase.storage.from("course-materials").createSignedUrl(row.path,3600);if(data?.signedUrl)signed.set(row.id,data.signedUrl);}));

  const classOptions=(classes.data||[]).filter((x:any)=>canonicalProgramFromClass(x.code,x.name)).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}));

  return <>
    <PageHeader eyebrow="Curriculum Control" title="Chương trình & Syllabus" description="Mỗi chương trình chỉ có 1 syllabus gốc 36 buổi. Mọi lớp ZEB/ZEF/ZEE/ZEM tự inherit từ master theo mã lớp; chỉ override khi thật sự cần."/>
    <Flash message={params.message} error={params.error}/>

    <section className="canonical-program-grid">
      {CANONICAL_PROGRAMS.map(program=>{
        const master:any=masterMap.get(program.code);
        const items=(master?.syllabus_template_items||[]).sort((a:any,b:any)=>a.session_no-b.session_no);
        const completeness=syllabusCompleteness(items);
        const linked=(classes.data||[]).filter((c:any)=>canonicalProgramFromClass(c.code,c.name)===program.code);
        return <article className={`canonical-program-card ${master?"has-master":"missing-master"}`} key={program.code}>
          <header><div><span>{program.code}</span><strong>{program.name}</strong><small>{linked.length} lớp tự động kế thừa</small></div>{master?<Status value={master.status}/>:<Status value="Chưa có master"/>}</header>
          {master?<>
            <div className="canonical-progress"><strong>{completeness.count}/36 buổi</strong><i><b style={{width:`${Math.min(100,completeness.count/36*100)}%`}}/></i><small>{completeness.complete?"Đủ 36/36":`Thiếu: ${completeness.missing.slice(0,12).join(", ")}${completeness.missing.length>12?"…":""}`}</small></div>
            {master.outline_file_path?<a className="button button-secondary button-small" href={signed.get(`tpl-${master.id}`)||"#"} target="_blank">Course Outline</a>:null}
            {master.status!=="Active"?<form action={activateCanonicalSyllabus}><input type="hidden" name="template_id" value={master.id}/><button className="button button-primary button-small" disabled={!completeness.complete}>Kích hoạt 36/36</button></form>:null}
          </>:<FormDetails title={`Tạo ${program.code} Master`}><form action={createSyllabusTemplate} encType="multipart/form-data"><input type="hidden" name="program_code" value={program.code}/><FormGrid><TextAreaField label="Mô tả / learning outcomes" name="description"/><label className="form-group"><span>Course outline gốc</span><input className="input" type="file" name="outline_file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.xls"/><small>Tối đa 30MB</small></label><button className="button button-primary">Tạo {program.code} Master</button></FormGrid></form></FormDetails>}
        </article>
      })}
    </section>

    <Panel className="section-gap" title="4 Master Syllabus" description="Không duplicate xuống lớp. Sửa master một lần → tất cả lớp thuộc chương trình đọc nội dung mới ngay.">
      {(templates.data||[]).length?<div className="canonical-master-list">{(templates.data||[]).map((tpl:any)=>{
        const items=(tpl.syllabus_template_items||[]).sort((a:any,b:any)=>a.session_no-b.session_no);
        const completeness=syllabusCompleteness(items);
        return <details className="canonical-master-block" key={tpl.id}>
          <summary><div><strong>{tpl.program_code} · {tpl.name}</strong><span>{completeness.count}/36 buổi · {tpl.status}</span></div><span>Quản lý 36 buổi</span></summary>
          <div className="canonical-master-body">
            <FormDetails title="+ Thêm / sửa một buổi"><form action={addSyllabusTemplateItem} encType="multipart/form-data"><input type="hidden" name="template_id" value={tpl.id}/><FormGrid>
              <Field label="Buổi số" name="session_no" type="number" min="1" max="36" required/>
              <Field label="Tiêu đề buổi" name="title" required/>
              <Field label="Thời lượng phút" name="duration_minutes" type="number" min="15" defaultValue={90}/>
              <Field label="Slide URL" name="slide_url" type="url" placeholder="Google Slides / Canva / Drive..."/>
              <TextAreaField label="Learning objectives" name="learning_objectives"/>
              <TextAreaField label="Nội dung buổi học" name="content"/>
              <TextAreaField label="Homework / Output" name="homework"/>
              <label className="form-group"><span>Tài liệu buổi</span><input className="input" type="file" name="material_file"/><small>Tối đa 30MB</small></label>
              <button className="button button-primary">Lưu vào Master</button>
            </FormGrid></form></FormDetails>
            <div className="canonical-session-table">{Array.from({length:36},(_,i)=>i+1).map(no=>{const item=items.find((x:any)=>x.session_no===no);return <div className={`canonical-session-row ${item?"ready":"missing"}`} key={no}><b>Buổi {no}</b><div><strong>{item?.title||"Chưa có nội dung"}</strong><span>{item?.learning_objectives||item?.content||"—"}</span></div><div>{item?.slide_url?<a href={item.slide_url} target="_blank">Slide</a>:null}{item?.material_file_path?<a href={signed.get(`item-${item.id}`)||"#"} target="_blank">Tài liệu</a>:null}</div></div>})}</div>
          </div>
        </details>
      })}</div>:<Empty title="Chưa có master nào" description="Tạo một trong 4 master ZEB/ZEF/ZEE/ZEM ở phía trên."/>}
    </Panel>

    <Panel className="section-gap" title="Lớp đang kế thừa syllabus nào?" description="Map tự động theo prefix mã lớp. Không cần thao tác duplicate.">
      <div className="class-inheritance-list">{(classes.data||[]).filter((c:any)=>canonicalProgramFromClass(c.code,c.name)).map((c:any)=>{const p=canonicalProgramFromClass(c.code,c.name)!;const master:any=masterMap.get(p);return <div key={c.id}><strong>{c.code} · {c.name}</strong><span>→ {p} Master</span><Status value={master?.status||"Chưa có master"}/></div>})}</div>
    </Panel>

    <Panel className="section-gap" title="Override riêng một buổi của lớp" description="Chỉ dùng khi lớp cần dạy khác syllabus gốc. Override Buổi 20 không tạo bản sao 36 buổi; Buổi 1–19 và 21–36 vẫn đọc Master.">
      <FormDetails title="+ Tạo / sửa override"><form action={saveClassSyllabusOverride} encType="multipart/form-data"><FormGrid>
        <SelectField label="Lớp" name="class_id" required options={classOptions}/>
        <Field label="Buổi số" name="session_no" type="number" min="1" max="36" required/>
        <Field label="Tiêu đề override" name="title"/>
        <Field label="Slide URL" name="slide_url" type="url"/>
        <TextAreaField label="Learning objectives override" name="learning_objectives"/>
        <TextAreaField label="Nội dung override" name="content"/>
        <TextAreaField label="Homework override" name="homework"/>
        <TextAreaField label="Lý do override" name="override_reason" required placeholder="Ví dụ: remedial Writing do lớp cần review..."/>
        <label className="form-group"><span>Tài liệu override</span><input className="input" type="file" name="material_file"/></label>
        <button className="button button-primary">Lưu override</button>
      </FormGrid></form></FormDetails>

      {(overrides.data||[]).length?<div className="override-list section-gap">{(overrides.data||[]).map((ov:any)=><div className="override-row" key={ov.id}><div><strong>{ov.classes?.code} · Buổi {ov.session_no}</strong><span>{ov.title||"Giữ title master"} · {ov.override_reason}</span></div><form action={removeClassSyllabusOverride}><input type="hidden" name="override_id" value={ov.id}/><button className="button button-danger button-small">Bỏ override</button></form></div>)}</div>:<Empty title="Không có override" description="Đây là trạng thái lý tưởng: tất cả lớp đọc syllabus gốc."/>}
    </Panel>

    <div className="message info section-gap"><strong>Dữ liệu class_syllabus_items cũ được giữ lại để audit.</strong> UI mới không dùng bảng đó làm nguồn syllabus chính nữa.</div>
  </>;
}

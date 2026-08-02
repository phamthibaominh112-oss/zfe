import Link from "next/link";
import { createClass, archiveClass } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { PageHeader, Panel, Status, Flash, FormDetails, Empty } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: classes, error }, { data: progressRows }, { data: programs }, { data: levels }] = await Promise.all([
    supabase.from("classes").select("id,code,name,category,mode,campus,start_date,expected_end_date,total_hours,total_sessions,target,capacity,status,programs(name),levels(name)").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("class_progress").select("class_id,completed_sessions,progress_percent"),
    supabase.from("programs").select("id,code,name").eq("is_active", true).order("name"),
    supabase.from("levels").select("id,code,name,program_id").eq("is_active", true).order("sequence_no")
  ]);
  const progressByClass = new Map<string, any>((progressRows || []).map((row: any) => [row.class_id, row]));
  const canManage = ["admin","academic_manager"].includes(profile.role);

  const actions = canManage ? <FormDetails title="Tạo lớp học"><form action={createClass}><FormGrid>
    <Field label="Mã lớp" name="code" required placeholder="ZE26001" />
    <Field label="Tên lớp" name="name" required />
    <SelectField label="Category" name="category" required options={[
      {value:"ZE",label:"ZE · Lớp nhóm"},{value:"ZK",label:"ZK · Lớp kèm"},{value:"B2B",label:"B2B · Doanh nghiệp"},{value:"Workshop",label:"Workshop"},{value:"Mock Test",label:"Mock Test"},{value:"Trial",label:"Trial"},{value:"Other",label:"Khác"}
    ]}/>
    <SelectField label="Hình thức" name="mode" required options={[{value:"Online",label:"Online"},{value:"Offline",label:"Offline"},{value:"Hybrid",label:"Hybrid"}]}/>
    <SelectField label="Program" name="program_id" options={(programs || []).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
    <SelectField label="Level" name="level_id" options={(levels || []).map((x:any)=>({value:x.id,label:`${x.code} · ${x.name}`}))}/>
    <Field label="Cơ sở" name="campus" />
    <Field label="Phòng" name="room" />
    <Field label="Ngày bắt đầu" name="start_date" type="date" />
    <Field label="Ngày kết thúc dự kiến" name="expected_end_date" type="date" />
    <Field label="Tổng giờ" name="total_hours" type="number" step="0.25" required />
    <Field label="Tổng session" name="total_sessions" type="number" required />
    <Field label="Sĩ số tối đa" name="capacity" type="number" required defaultValue={1}/>
    <SelectField label="Trạng thái" name="status" required defaultValue="Draft" options={["Draft","Waiting","Ready","Active","Paused","Completed","Closed"].map(v=>({value:v,label:v}))}/>
    <Field label="Target" name="target" />
    <TextAreaField label="Ghi chú" name="notes" />
    <div className="form-actions"><button className="button button-primary">Tạo lớp</button></div>
  </FormGrid></form></FormDetails> : undefined;

  return <>
    <PageHeader eyebrow="Class operations" title="Danh sách lớp học" description={profile.role === "student" ? "Chỉ các lớp mà bạn đang enroll mới được trả về từ database." : profile.role === "teacher" ? "Chỉ các lớp bạn được phân công mới được hiển thị." : "Quản lý category, program, level, target, duration và trạng thái vận hành của từng lớp."} actions={actions}/>
    <Flash message={params.message} error={params.error || error?.message}/>
    <Panel title="Class directory" description={`${classes?.length || 0} lớp có quyền truy cập`}>
      {classes?.length ? <div className="card-grid">{classes.map((item:any) => {
        const progress = progressByClass.get(item.id);
        return <article className="class-card" key={item.id}>
          <div className="card-top"><div><h3>{item.code}</h3><p>{item.name}</p></div><Status value={item.status}/></div>
          <div className="card-meta"><span className="chip chip-blue">{item.category}</span><span className="chip chip-yellow">{item.mode}</span><span className="chip">{item.programs?.name || "No program"}</span><span className="chip">{item.levels?.name || "No level"}</span></div>
          <div className="profile-grid section-gap" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}><div className="profile-item"><span>Progress</span><strong>{progress?.progress_percent || 0}%</strong></div><div className="profile-item"><span>Sessions</span><strong>{progress?.completed_sessions || 0}/{item.total_sessions}</strong></div><div className="profile-item"><span>Start</span><strong>{formatDate(item.start_date)}</strong></div><div className="profile-item"><span>Target</span><strong>{item.target || "—"}</strong></div></div>
          <div className="card-footer"><span>{item.campus || "No campus"} · {item.capacity} seats</span><div className="row-actions"><Link className="button button-secondary" href={`/classes/${item.id}`}>Mở lớp</Link>{profile.role === "admin" ? <form action={archiveClass}><input type="hidden" name="class_id" value={item.id}/><button className="button button-danger">Archive</button></form> : null}</div></div>
        </article>;
      })}</div> : <Empty title="Chưa có lớp" description="Academic Manager tạo lớp mới và phân công giáo viên."/>}
    </Panel>
  </>;
}

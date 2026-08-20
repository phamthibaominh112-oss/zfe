import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Status } from "@/components/ui";

function embedUrl(url:string){
  const u=new URL(url);
  if(!u.searchParams.has("embedded"))u.searchParams.set("embedded","true");
  return u.toString();
}
export default async function PlacementOnlineTest({params}:{params:Promise<{id:string}>}){
  const profile=await requireProfile();const {id}=await params;const supabase=await createClient();
  const {data:test}=await supabase.from("placement_tests").select("id,student_id,external_token,google_form_url,status,duration_minutes,scheduled_start,students(code,full_name),teachers:assigned_teacher_id(full_name)").eq("id",id).maybeSingle();
  if(!test)notFound();
  const st=Array.isArray(test.students)?test.students[0]:test.students;
  if(profile.role==="student"){
    const {data:own}=await supabase.from("students").select("id").eq("user_id",profile.id).maybeSingle();
    if(own?.id!==test.student_id)notFound();
  }
  return <>
    <PageHeader eyebrow="Placement Online" title={`${st?.code} · ${st?.full_name}`} description={`${test.duration_minutes} phút · Nhập đúng ZE Placement Code vào Google Form để kết quả tự map về CenterOS.`}/>
    <div className="placement-test-command"><div><span>ZE PLACEMENT CODE</span><strong>{test.external_token}</strong><small>Copy mã này vào câu hỏi “ZE Placement Code” trong form.</small></div><div><span>Trạng thái</span><Status value={test.status}/></div></div>
    {test.google_form_url?<iframe className="placement-google-form-frame" title="ZE Placement Google Form" src={embedUrl(test.google_form_url)} allow="clipboard-write"/>:<div className="message error">Placement này chưa được gắn Google Form URL.</div>}
  </>;
}

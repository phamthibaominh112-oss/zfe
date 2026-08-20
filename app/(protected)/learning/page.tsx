import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MyLearningPage(){
  const profile=await requireRole(["student"]);
  const supabase=await createClient();
  const {data}=await supabase.from("students").select("id").eq("user_id",profile.id).maybeSingle();
  if(!data)redirect("/dashboard?error=student_profile_not_linked");
  redirect(`/students/${data.id}/learning`);
}

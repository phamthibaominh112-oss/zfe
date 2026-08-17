import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireBusinessIntelligenceAccess(){
  const profile=await requireProfile();
  if(profile.role==="admin") return profile;
  const admin=createAdminClient();
  const {data}=await admin.from("business_intelligence_access").select("user_id").eq("user_id",profile.id).maybeSingle();
  if(!data) redirect("/dashboard");
  return profile;
}

export async function hasBusinessIntelligenceAccess(userId:string,role:string){
  if(role==="admin") return true;
  const admin=createAdminClient();
  const {data}=await admin.from("business_intelligence_access").select("user_id").eq("user_id",userId).maybeSingle();
  return !!data;
}

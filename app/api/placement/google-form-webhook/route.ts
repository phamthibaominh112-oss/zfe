import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:NextRequest){
  const configured=process.env.PLACEMENT_WEBHOOK_SECRET;
  if(!configured) return NextResponse.json({error:"PLACEMENT_WEBHOOK_SECRET is not configured"},{status:503});
  if(request.headers.get("x-ze-placement-secret")!==configured) return NextResponse.json({error:"Unauthorized"},{status:401});

  const body=await request.json().catch(()=>null);
  const token=String(body?.external_token||"").trim();
  if(!token) return NextResponse.json({error:"external_token is required"},{status:400});

  const admin=createAdminClient();
  const {data:test,error:testError}=await admin.from("placement_tests").select("id").eq("external_token",token).maybeSingle();
  if(testError||!test) return NextResponse.json({error:"Placement token not found"},{status:404});

  const payload={
    placement_test_id:test.id,external_token:token,response_id:body?.response_id||null,
    objective_score:body?.objective_score==null?null:Number(body.objective_score),
    max_score:body?.max_score==null?null:Number(body.max_score),
    answers:body?.answers||{},raw_payload:body||{},submitted_at:body?.submitted_at||new Date().toISOString(),synced_at:new Date().toISOString()
  };
  const {error:submissionError}=await admin.from("placement_form_submissions").upsert(payload,{onConflict:"response_id"});
  if(submissionError) return NextResponse.json({error:submissionError.message},{status:500});

  const patch:any={
    google_form_response_id:payload.response_id,
    objective_auto_score:payload.objective_score,
    objective_max_score:payload.max_score,
    form_completed_at:payload.submitted_at,
    auto_scored_at:new Date().toISOString(),
    status:"Completed",
    completed_at:payload.submitted_at,
    updated_at:new Date().toISOString()
  };
  if(body?.listening_score!=null)patch.listening_score=Number(body.listening_score);
  if(body?.reading_score!=null)patch.reading_score=Number(body.reading_score);
  if(body?.writing_score!=null)patch.writing_score=Number(body.writing_score);
  const {error:updateError}=await admin.from("placement_tests").update(patch).eq("id",test.id);
  if(updateError) return NextResponse.json({error:updateError.message},{status:500});
  return NextResponse.json({ok:true,placement_test_id:test.id});
}

import fs from "node:fs/promises";
import path from "node:path";
import { FinanceDashboardFrame } from "@/components/finance-dashboard-frame";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { buildFinanceDashboardData } from "@/lib/finance-dashboard-data";
import { createClient } from "@/lib/supabase/server";

function injectData(template:string,data:unknown){
  const marker="const D=";
  const start=template.indexOf(marker);
  if(start<0) throw new Error("Finance template missing const D.");
  const jsonStart=start+marker.length;
  const end=template.indexOf(";\n",jsonStart);
  if(end<0) throw new Error("Finance template data block cannot be replaced.");
  return `${template.slice(0,jsonStart)}${JSON.stringify(data)}${template.slice(end)}`;
}

export default async function FinanceIntelligencePage(){
  await requireRole(["admin"]);
  const supabase=await createClient();
  const data=await buildFinanceDashboardData(supabase);
  const template=await fs.readFile(path.join(process.cwd(),"content","finance-dashboard-v4-live-template.html"),"utf8");
  return <>
    <PageHeader eyebrow="Finance Intelligence" title="Revenue · Profit · Cashflow" description="Dashboard live map từ học viên, tuition account, enrollment, giao dịch thu tiền và chi phí trong ZE CenterOS."/>
    <div className="finance-live-note"><strong>LIVE MAPPING</strong><span>Start/End enrollment → Revenue · Payment → Cash In · Expense → Cash Out · Student → Ledger/Alerts.</span></div>
    <FinanceDashboardFrame html={injectData(template,data)}/>
  </>;
}

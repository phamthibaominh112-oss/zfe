import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { FinanceDashboardFrame } from "@/components/finance-dashboard-frame";
import { Field, SelectField } from "@/components/forms";
import { Empty, Flash, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { grantBusinessIntelligenceAccess, revokeBusinessIntelligenceAccess, updateBusinessKpiSettings } from "@/app/actions";
import { requireBusinessIntelligenceAccess } from "@/lib/business-intelligence-access";
import { buildBusinessIntelligenceData } from "@/lib/business-intelligence-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatMoney } from "@/lib/format";

function progress(value:number){return Math.max(0,Math.min(100,value*100));}
function progressTone(value:number){return value>=1?"green":value>=.75?"yellow":"red";}
function injectData(template:string,data:unknown){
  const marker="const D=",start=template.indexOf(marker);
  if(start<0) throw new Error("Finance template missing const D.");
  const jsonStart=start+marker.length,end=template.indexOf(";\n",jsonStart);
  if(end<0) throw new Error("Finance template data block cannot be replaced.");
  return `${template.slice(0,jsonStart)}${JSON.stringify(data)}${template.slice(end)}`;
}

export default async function BusinessIntelligencePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const profile=await requireBusinessIntelligenceAccess();
  const params=await searchParams;
  const tab=["overview","finance","learners","kpi","access"].includes(params.tab||"")?String(params.tab):"overview";
  const month=/^\d{4}-\d{2}$/.test(params.month||"")?String(params.month):new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);
  const admin=createAdminClient();
  const template=await fs.readFile(path.join(process.cwd(),"content","finance-dashboard-v4-live-template.html"),"utf8");
  const data=await buildBusinessIntelligenceData(admin,template,month);
  const current=data.current;
  const adminOnly=profile.role==="admin";

  let profiles:any[]=[];let grants:any[]=[];
  if(adminOnly&&tab==="access"){
    const [p,g]=await Promise.all([
      admin.from("profiles").select("id,full_name,role,is_active").eq("is_active",true).order("full_name"),
      admin.from("business_intelligence_access").select("user_id,access_level,granted_at,profiles(full_name,role)").order("granted_at")
    ]);
    profiles=p.data||[];grants=g.data||[];
  }

  const tabs=[
    ["overview","Executive"],["finance","Finance"],["learners","Learners & Retention"],["kpi","KPI & Trend"],
    ...(adminOnly?[["access","Access"]]:[])
  ];

  return <>
    <PageHeader eyebrow="Business Intelligence" title="Business Intelligence" description="Một nơi để Founder / Co-founder theo dõi revenue, profit, tăng trưởng học viên, retention, stop list và tiến độ KPI."/>
    <Flash message={params.message} error={params.error}/>
    <nav className="business-intel-tabs">{tabs.map(([key,label])=><Link key={key} className={tab===key?"bi-tab active":"bi-tab"} href={`/business-intelligence?tab=${key}&month=${month}`}>{label}</Link>)}</nav>
    <form className="month-filter bi-month-filter" method="get"><input type="hidden" name="tab" value={tab}/><label>Tháng<input type="month" name="month" defaultValue={month}/></label><button className="button button-primary">Xem tháng</button></form>

    {tab==="overview"?<>
      <div className="bi-executive-grid">
        <section className="bi-kpi-card"><span>Revenue KPI</span><strong>{formatMoney(current?.revenue||0)}</strong><small>/ {formatMoney(data.targets.revenue)}</small><div className="bi-progress"><i style={{width:`${progress(current?.revenueProgress||0)}%`}}/></div><b className={`bi-progress-label ${progressTone(current?.revenueProgress||0)}`}>{progress(current?.revenueProgress||0).toFixed(0)}%</b></section>
        <section className="bi-kpi-card"><span>HV mới KPI</span><strong>{current?.newStudents||0}</strong><small>/ {data.targets.newStudents} HV</small><div className="bi-progress"><i style={{width:`${progress(current?.studentProgress||0)}%`}}/></div><b className={`bi-progress-label ${progressTone(current?.studentProgress||0)}`}>{progress(current?.studentProgress||0).toFixed(0)}%</b></section>
        <section className="bi-kpi-card"><span>Profit KPI</span><strong>{formatMoney(current?.profit||0)}</strong><small>/ {formatMoney(data.targets.profit)}</small><div className="bi-progress"><i style={{width:`${progress(current?.profitProgress||0)}%`}}/></div><b className={`bi-progress-label ${progressTone(current?.profitProgress||0)}`}>{progress(current?.profitProgress||0).toFixed(0)}%</b></section>
        <section className="bi-kpi-card timeline"><span>Thời gian tháng đã đi</span><strong>{(data.timeProgress*100).toFixed(0)}%</strong><small>So tiến độ KPI với timeline thực tế</small></section>
      </div>
      <div className="metrics-grid compact-metrics">
        <MetricCard label="Recognized Revenue" value={formatMoney(current?.recognized||0)} tone="green"/>
        <MetricCard label="Cash In" value={formatMoney(current?.cash||0)}/>
        <MetricCard label="Expense recorded" value={formatMoney(current?.expense||0)} tone="yellow"/>
        <MetricCard label="Active HV" value={data.learners.active}/>
        <MetricCard label="Paused" value={data.learners.paused} tone="yellow"/>
        <MetricCard label="Stopped" value={data.learners.stopped} tone={data.learners.stopped?"red":"green"}/>
      </div>
      <div className="dashboard-main-grid section-gap">
        <Panel title="Business warnings" description="Cảnh báo tự động theo KPI, MoM và learner retention">
          {data.warnings.length?<div className="bi-warning-list">{data.warnings.map((w:any,i:number)=><div className={`bi-warning ${w.level.toLowerCase()}`} key={i}><strong>{w.title}</strong><span>{w.detail}</span></div>)}</div>:<Empty title="Không có cảnh báo lớn" description="Các KPI tháng đang đi tương đối đúng tiến độ."/>}
        </Panel>
        <Panel title="Learners cần chú ý" description="Risk score từ status, attendance, công nợ, renewal và lịch học tương lai" action={<Link className="text-link" href={`/business-intelligence?tab=learners&month=${month}`}>Xem toàn bộ →</Link>}>
          {data.learners.riskList.length?<div className="compact-list">{data.learners.riskList.slice(0,8).map((r:any)=><div className="compact-row" key={r.id}><div><strong>{r.code} · {r.name}</strong><span>{r.reasons.join(" · ")}</span></div><Status value={r.severity}/></div>)}</div>:<Empty title="Không có HV risk cao" description="Chưa có learner signal cần escalation."/>}
        </Panel>
      </div>
    </>:null}

    {tab==="finance"?<><div className="finance-live-note"><strong>BUSINESS INTEL · FINANCE</strong><span>Historical baseline + CenterOS live overlay. Thu phí, chi phí và payroll approved đều map về dashboard này.</span></div><FinanceDashboardFrame html={injectData(template,data.finance)}/></>:null}

    {tab==="learners"?<>
      <div className="metrics-grid compact-metrics">
        <MetricCard label="Tổng HV" value={data.learners.total}/>
        <MetricCard label="Active" value={data.learners.active} tone="green"/>
        <MetricCard label="Waiting" value={data.learners.waiting}/>
        <MetricCard label="Paused" value={data.learners.paused} tone="yellow"/>
        <MetricCard label="Stopped" value={data.learners.stopped} tone="red"/>
        <MetricCard label="HV mới tháng" value={current?.newStudents||0} note={`KPI ${data.targets.newStudents}`}/>
      </div>
      <Panel className="section-gap" title={`Stop List · ${data.learners.stopList.length}`} description="Paused/Stopped hiện tại. Status history được track tự động từ phiên bản này trở đi.">
        {data.learners.stopList.length?<div className="table-wrap"><table className="bi-table"><thead><tr><th>Học viên</th><th>Status</th><th>Ghi nhận gần nhất</th></tr></thead><tbody>{data.learners.stopList.map((r:any)=><tr key={r.id}><td><Link className="text-link" href={`/students/${r.id}`}>{r.code} · {r.name}</Link></td><td><Status value={r.status}/></td><td>{formatDate(String(r.changedAt).slice(0,10))}</td></tr>)}</tbody></table></div>:<Empty title="Stop list trống" description="Chưa có HV Paused hoặc Stopped."/>}
      </Panel>
      <Panel className="section-gap" title={`Learner Risk Watch · ${data.learners.riskList.length}`} description="High/Medium risk dựa trên nhiều signal, không chỉ một trạng thái.">
        {data.learners.riskList.length?<div className="table-wrap"><table className="bi-table risk"><thead><tr><th>HV</th><th>Risk</th><th>Attendance</th><th>Công nợ</th><th>Signals</th></tr></thead><tbody>{data.learners.riskList.map((r:any)=><tr key={r.id}><td><Link className="text-link" href={`/students/${r.id}`}>{r.code} · {r.name}</Link></td><td><Status value={r.severity}/></td><td>{r.attendanceRate==null?"—":`${(r.attendanceRate*100).toFixed(0)}%`}</td><td>{formatMoney(r.balance)}</td><td>{r.reasons.join(" · ")}</td></tr>)}</tbody></table></div>:<Empty title="Không có risk signal" description="Chưa có HV vượt ngưỡng cảnh báo."/>}
      </Panel>
    </>:null}

    {tab==="kpi"?<>
      {adminOnly?<Panel title="Monthly KPI Settings" description="Founder/Admin có thể chỉnh KPI; mặc định hiện tại là 150M · 10 HV · 70M."><form action={updateBusinessKpiSettings} className="bi-kpi-settings"><Field label="Revenue / tháng" name="monthly_revenue_target" type="number" step="1000000" defaultValue={data.targets.revenue}/><Field label="HV mới / tháng" name="monthly_new_students_target" type="number" step="1" defaultValue={data.targets.newStudents}/><Field label="Profit / tháng" name="monthly_profit_target" type="number" step="1000000" defaultValue={data.targets.profit}/><button className="button button-primary">Lưu KPI</button></form></Panel>:null}
      <Panel className="section-gap" title="Monthly KPI Performance" description="Revenue dùng Allocated Revenue; Profit = Allocated Revenue – expense recorded trong tháng.">
        <div className="table-wrap"><table className="bi-table kpi-trend"><thead><tr><th>Tháng</th><th>Revenue</th><th>HV mới</th><th>Profit</th><th>Stopped</th><th>Revenue KPI</th><th>HV KPI</th><th>Profit KPI</th></tr></thead><tbody>{data.monthly.filter((r:any)=>r.month>="2026-01"&&r.month<=month).reverse().slice(0,18).map((r:any)=><tr key={r.month}><td><strong>{r.label}</strong></td><td>{formatMoney(r.revenue)}</td><td>{r.newStudents}</td><td className={r.profit<0?"negative":""}>{formatMoney(r.profit)}</td><td>{r.stopped}</td><td>{(r.revenueProgress*100).toFixed(0)}%</td><td>{(r.studentProgress*100).toFixed(0)}%</td><td>{(r.profitProgress*100).toFixed(0)}%</td></tr>)}</tbody></table></div>
      </Panel>
    </>:null}

    {tab==="access"&&adminOnly?<>
      <Panel title="Founder / Co-founder access" description="Cấp quyền xem Business Intelligence mà không cần cấp full Admin.">
        <form action={grantBusinessIntelligenceAccess} className="bi-access-form">
          <SelectField label="Tài khoản" name="user_id" required options={profiles.filter((p:any)=>p.role!=="admin").map((p:any)=>({value:p.id,label:`${p.full_name} · ${p.role}`}))}/>
          <SelectField label="Quyền" name="access_level" defaultValue="Viewer" options={[{value:"Viewer",label:"Viewer"},{value:"Owner",label:"Owner / Co-founder"}]}/>
          <button className="button button-primary">Cấp quyền</button>
        </form>
      </Panel>
      <Panel className="section-gap" title="Đang có quyền" description="Admin luôn có quyền mặc định.">
        {grants.length?<div className="compact-list">{grants.map((g:any)=>{const p=joined(g.profiles);return <div className="compact-row" key={g.user_id}><div><strong>{p?.full_name||g.user_id}</strong><span>{p?.role} · {g.access_level}</span></div><form action={revokeBusinessIntelligenceAccess}><input type="hidden" name="user_id" value={g.user_id}/><button className="button button-danger button-small">Thu hồi</button></form></div>})}</div>:<Empty title="Chưa cấp viewer riêng" description="Chỉ Admin đang có quyền mặc định."/>}
      </Panel>
    </>:null}
  </>;
}

function joined(value:unknown):Record<string,any>|null{
  if(Array.isArray(value)) return (value[0] as Record<string,any>|undefined)||null;
  return value&&typeof value==="object"?value as Record<string,any>:null;
}

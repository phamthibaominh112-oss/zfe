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

function clamp(value:number){return Math.max(0,Math.min(100,value));}
function pct(value:number){return `${Math.round(value*100)}%`;}
function paceLabel(actual:number,expected:number,unit:string){
  const delta=actual-expected;
  if(Math.abs(delta)<0.01) return `Đúng pace`;
  return delta>=0?`Nhanh hơn pace ${unit==="đ"?formatMoney(delta):`${Math.ceil(delta)} ${unit}`}`:`Chậm hơn pace ${unit==="đ"?formatMoney(Math.abs(delta)):`${Math.ceil(Math.abs(delta))} ${unit}`}`;
}
function healthClass(actual:number,expected:number){return actual>=expected?"good":actual>=expected*.85?"watch":"risk";}
function injectData(template:string,data:unknown){
  const marker="const D=",start=template.indexOf(marker);
  if(start<0) throw new Error("Finance template missing const D.");
  const jsonStart=start+marker.length,end=template.indexOf(";\n",jsonStart);
  if(end<0) throw new Error("Finance template data block cannot be replaced.");
  return `${template.slice(0,jsonStart)}${JSON.stringify(data)}${template.slice(end)}`;
}
function joined(value:unknown):Record<string,any>|null{
  if(Array.isArray(value)) return (value[0] as Record<string,any>|undefined)||null;
  return value&&typeof value==="object"?value as Record<string,any>:null;
}

export default async function BusinessIntelligencePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const profile=await requireBusinessIntelligenceAccess();
  const params=await searchParams;
  const view=["overview","finance","learners","settings"].includes(params.view||"")?String(params.view):"overview";
  const month=/^\d{4}-\d{2}$/.test(params.month||"")?String(params.month):new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);
  const admin=createAdminClient();
  const template=await fs.readFile(path.join(process.cwd(),"content","finance-dashboard-v4-live-template.html"),"utf8");
  const data=await buildBusinessIntelligenceData(admin,template,month);
  const current=data.current;
  const x=data.executive;
  const adminOnly=profile.role==="admin";

  let profiles:any[]=[];let grants:any[]=[];
  if(adminOnly&&view==="settings"){
    const [p,g]=await Promise.all([
      admin.from("profiles").select("id,full_name,role,is_active").eq("is_active",true).order("full_name"),
      admin.from("business_intelligence_access").select("user_id,access_level,granted_at,profiles(full_name,role)").order("granted_at")
    ]);
    profiles=p.data||[];grants=g.data||[];
  }

  return <>
    <PageHeader eyebrow="Business Intelligence" title="Business Health" description="Một dòng logic: Growth → Revenue → Cost → Profit → Retention → Action."/>
    <Flash message={params.message} error={params.error}/>

    <div className="bi-control-bar">
      <nav className="bi-simple-nav">
        <Link className={view==="overview"?"active":""} href={`/business-intelligence?view=overview&month=${month}`}>Tổng quan</Link>
        <Link className={view==="finance"?"active":""} href={`/business-intelligence?view=finance&month=${month}`}>Tài chính chi tiết</Link>
        <Link className={view==="learners"?"active":""} href={`/business-intelligence?view=learners&month=${month}`}>Học viên & Retention</Link>
        {adminOnly?<Link className={view==="settings"?"active settings": "settings"} href={`/business-intelligence?view=settings&month=${month}`}>Thiết lập</Link>:null}
      </nav>
      <form className="bi-inline-month" method="get"><input type="hidden" name="view" value={view}/><input type="month" name="month" defaultValue={month}/><button className="button button-primary button-small">Xem</button></form>
    </div>

    {view==="overview"?<>
      <section className="bi-command-center">
        <div className="bi-score">
          <span>BUSINESS HEALTH SCORE</span>
          <strong>{x.businessScore}</strong>
          <small>/100</small>
          <p>{x.businessScore>=85?"Đang khỏe":x.businessScore>=70?"Ổn nhưng cần theo dõi":x.businessScore>=50?"Có gap cần xử lý":"Cần hành động ngay"}</p>
        </div>
        <div className="bi-kpi-strip">
          <div className={healthClass(current?.revenue||0,x.expectedRevenue)}><span>REVENUE</span><strong>{formatMoney(current?.revenue||0)}</strong><small>KPI {formatMoney(data.targets.revenue)} · {paceLabel(current?.revenue||0,x.expectedRevenue,"đ")}</small><i><b style={{width:`${clamp((current?.revenueProgress||0)*100)}%`}}/></i></div>
          <div className={healthClass(current?.newStudents||0,x.expectedStudents)}><span>HV MỚI</span><strong>{current?.newStudents||0} / {data.targets.newStudents}</strong><small>{paceLabel(current?.newStudents||0,x.expectedStudents,"HV")}</small><i><b style={{width:`${clamp((current?.studentProgress||0)*100)}%`}}/></i></div>
          <div className={healthClass(current?.profit||0,x.expectedProfit)}><span>PROFIT</span><strong>{formatMoney(current?.profit||0)}</strong><small>KPI {formatMoney(data.targets.profit)} · {paceLabel(current?.profit||0,x.expectedProfit,"đ")}</small><i><b style={{width:`${clamp((current?.profitProgress||0)*100)}%`}}/></i></div>
        </div>
        <div className="bi-time-pace"><span>Tháng đã đi</span><strong>{pct(data.timeProgress)}</strong><small>KPI cũng nên đạt xấp xỉ mức này</small></div>
      </section>

      <section className="bi-flow-card">
        <div className="bi-flow-step growth"><span>1 · GROWTH</span><strong>{current?.newStudents||0} HV mới</strong><small>{data.learners.active} HV active</small></div>
        <div className="bi-flow-arrow">→</div>
        <div className="bi-flow-step revenue"><span>2 · REVENUE</span><strong>{formatMoney(current?.revenue||0)}</strong><small>Recognized {formatMoney(current?.recognized||0)}</small></div>
        <div className="bi-flow-arrow">→</div>
        <div className="bi-flow-step cost"><span>3 · COST</span><strong>{formatMoney(current?.expense||0)}</strong><small>{pct(x.expenseRatio)} của revenue</small></div>
        <div className="bi-flow-arrow">→</div>
        <div className="bi-flow-step profit"><span>4 · PROFIT</span><strong>{formatMoney(current?.profit||0)}</strong><small>Margin {pct(x.profitMargin)}</small></div>
        <div className="bi-flow-arrow">→</div>
        <div className="bi-flow-step retention"><span>5 · RETENTION</span><strong>{x.highRisk} High Risk</strong><small>{data.learners.stopped} stopped · {data.learners.paused} paused</small></div>
      </section>

      <div className="bi-story-grid section-gap">
        <Panel title="Vì sao business đang ở mức này?" description="Các driver được nối trực tiếp với KPI, cash, cost và retention.">
          <div className="bi-driver-list">{x.drivers.slice(0,6).map((d:any,i:number)=><div className={`bi-driver ${d.priority.toLowerCase()}`} key={i}><div><span>{d.priority}</span><strong>{d.title}</strong><small>{d.detail}</small></div><b>{d.value}</b></div>)}</div>
        </Panel>
        <Panel title="Việc cần làm tiếp theo" description="Action queue theo mức độ ảnh hưởng, không chỉ là cảnh báo.">
          <div className="bi-action-list">{x.actions.slice(0,6).map((a:any,i:number)=><div className="bi-action" key={i}><i>{i+1}</i><div><strong>{a.action}</strong><small>{a.owner} · {a.why}</small></div></div>)}</div>
        </Panel>
      </div>

      <Panel className="section-gap" title="6 tháng gần nhất — nhìn xu hướng trong một hàng" description="Cùng một tháng: Revenue / Profit / HV mới được đặt cạnh nhau để nhìn tương quan, không tách thành nhiều chart.">
        <div className="bi-trend-matrix">
          <div className="bi-trend-head"><span>Tháng</span><span>Revenue / 150M</span><span>Profit / 70M</span><span>HV mới / 10</span><span>Stopped</span></div>
          {x.recentMonths.map((r:any)=><div className={`bi-trend-row ${r.month===month?"current":""}`} key={r.month}>
            <strong>{r.label}</strong>
            <div><i><b style={{width:`${clamp(r.revenueVsTarget*100)}%`}}/></i><span>{formatMoney(r.revenue)} · {Math.round(r.revenueVsTarget*100)}%</span></div>
            <div><i><b style={{width:`${clamp(Math.max(0,r.profitVsTarget)*100)}%`}}/></i><span>{formatMoney(r.profit)} · {Math.round(r.profitVsTarget*100)}%</span></div>
            <div><i><b style={{width:`${clamp(r.studentsVsTarget*100)}%`}}/></i><span>{r.newStudents} HV · {Math.round(r.studentsVsTarget*100)}%</span></div>
            <span className={r.stopped>0?"stop-count alert":"stop-count"}>{r.stopped}</span>
          </div>)}
        </div>
      </Panel>

      <div className="bi-health-grid section-gap">
        <section><span>Cash conversion</span><strong>{pct(x.cashConversion)}</strong><small>{formatMoney(current?.cash||0)} cash / {formatMoney(current?.recognized||0)} recognized</small></section>
        <section><span>Outstanding</span><strong>{formatMoney(x.outstanding)}</strong><small>Tiền chưa thu từ tuition accounts</small></section>
        <section><span>Active learner rate</span><strong>{pct(x.activeRate)}</strong><small>{data.learners.active}/{data.learners.total} HV</small></section>
        <section><span>Unallocated revenue</span><strong>{formatMoney(x.unallocated)}</strong><small>Dữ liệu chưa đủ để phân bổ đúng kỳ</small></section>
      </div>
    </>:null}

    {view==="finance"?<>
      <div className="bi-context-banner"><strong>FINANCE DRILL-DOWN</strong><span>Trang này là chi tiết. Màn hình Tổng quan mới là nơi Founder đọc business health và mối quan hệ giữa các chỉ số.</span></div>
      <FinanceDashboardFrame html={injectData(template,data.finance)}/>
    </>:null}

    {view==="learners"?<>
      <section className="bi-retention-summary">
        <div><span>Active</span><strong>{data.learners.active}</strong></div>
        <div><span>Waiting</span><strong>{data.learners.waiting}</strong></div>
        <div><span>Paused</span><strong>{data.learners.paused}</strong></div>
        <div><span>Stopped</span><strong>{data.learners.stopped}</strong></div>
        <div className="risk"><span>High Risk</span><strong>{x.highRisk}</strong></div>
        <div><span>Outstanding</span><strong>{formatMoney(x.outstanding)}</strong></div>
      </section>
      <div className="dashboard-main-grid section-gap">
        <Panel title={`Learner Risk Watch · ${data.learners.riskList.length}`} description="Ưu tiên theo nguy cơ rụng; click vào HV để xử lý.">
          {data.learners.riskList.length?<div className="compact-list">{data.learners.riskList.map((r:any)=><div className="compact-row" key={r.id}><div><strong><Link className="text-link" href={`/students/${r.id}`}>{r.code} · {r.name}</Link></strong><span>{r.reasons.join(" · ")}</span></div><Status value={r.severity}/></div>)}</div>:<Empty title="Không có HV risk" description="Chưa có learner signal vượt ngưỡng."/>}
        </Panel>
        <Panel title={`Stop / Pause List · ${data.learners.stopList.length}`} description="Danh sách cần retention / win-back.">
          {data.learners.stopList.length?<div className="compact-list">{data.learners.stopList.map((r:any)=><div className="compact-row" key={r.id}><div><strong><Link className="text-link" href={`/students/${r.id}`}>{r.code} · {r.name}</Link></strong><span>Cập nhật {formatDate(String(r.changedAt).slice(0,10))}</span></div><Status value={r.status}/></div>)}</div>:<Empty title="Không có HV Paused/Stopped" description="Stop list đang trống."/>}
        </Panel>
      </div>
    </>:null}

    {view==="settings"&&adminOnly?<>
      <div className="dashboard-main-grid">
        <Panel title="KPI tháng" description="Chỉ chỉnh target ở đây; không để settings chen vào Executive dashboard.">
          <form action={updateBusinessKpiSettings} className="bi-kpi-settings-simple"><Field label="Revenue / tháng" name="monthly_revenue_target" type="number" step="1000000" defaultValue={data.targets.revenue}/><Field label="HV mới / tháng" name="monthly_new_students_target" type="number" step="1" defaultValue={data.targets.newStudents}/><Field label="Profit / tháng" name="monthly_profit_target" type="number" step="1000000" defaultValue={data.targets.profit}/><button className="button button-primary">Lưu KPI</button></form>
        </Panel>
        <Panel title="Founder / Co-founder access" description="Cấp quyền xem Business Intelligence mà không cấp full Admin.">
          <form action={grantBusinessIntelligenceAccess} className="bi-access-form"><SelectField label="Tài khoản" name="user_id" required options={profiles.filter((p:any)=>p.role!=="admin").map((p:any)=>({value:p.id,label:`${p.full_name} · ${p.role}`}))}/><SelectField label="Quyền" name="access_level" defaultValue="Viewer" options={[{value:"Viewer",label:"Viewer"},{value:"Owner",label:"Owner / Co-founder"}]}/><button className="button button-primary">Cấp quyền</button></form>
          {grants.length?<div className="compact-list section-gap">{grants.map((g:any)=>{const p=joined(g.profiles);return <div className="compact-row" key={g.user_id}><div><strong>{p?.full_name||g.user_id}</strong><span>{p?.role} · {g.access_level}</span></div><form action={revokeBusinessIntelligenceAccess}><input type="hidden" name="user_id" value={g.user_id}/><button className="button button-danger button-small">Thu hồi</button></form></div>})}</div>:null}
        </Panel>
      </div>
    </>:null}
  </>;
}

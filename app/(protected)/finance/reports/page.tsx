import Link from "next/link";
import { commitMonthlyFinancialImport } from "@/app/actions";
import { Empty, Flash, MetricCard, PageHeader, Panel } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function monthKey(date: string) { return String(date || "").slice(0,7); }
function monthLabel(key: string) { const [y,m]=key.split("-"); return `T${Number(m)}/${y}`; }

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-5, 1)).toISOString().slice(0,10);
  const [{ data: payments }, { data: expenses }, { data: accounts }, { data: importedSnapshots }, { count: stagedCount }] = await Promise.all([
    supabase.from("payment_transactions").select("amount,paid_at").gte("paid_at", `${start}T00:00:00Z`).order("paid_at"),
    supabase.from("expense_transactions").select("amount,expense_date,status,finance_categories(name,group_name)").gte("expense_date", start).is("archived_at", null).neq("status", "Void").order("expense_date"),
    supabase.from("tuition_accounts").select("balance_amount,status").is("archived_at", null),
    supabase.from("monthly_financial_balance").select("id,month,revenue_amount,total_expense,operating_result,source,note").order("month", { ascending: false }).limit(24),
    supabase.from("import_monthly_financial_snapshots").select("month", { count: "exact", head: true })
  ]);
  const months: string[]=[];
  for(let i=5;i>=0;i--){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));months.push(d.toISOString().slice(0,7));}
  const rows=months.map(key=>({key,revenue:0,expense:0}));
  const map=new Map(rows.map(row=>[row.key,row]));
  for(const row of payments||[]){const item=map.get(monthKey((row as any).paid_at));if(item)item.revenue+=Number((row as any).amount||0);}
  for(const row of expenses||[]){const item=map.get(monthKey((row as any).expense_date));if(item)item.expense+=Number((row as any).amount||0);}
  const current=rows[rows.length-1];
  const outstanding=(accounts||[]).reduce((sum:number,row:any)=>sum+Number(row.balance_amount||0),0);
  const maxValue=Math.max(1,...rows.flatMap(row=>[row.revenue,row.expense]));
  const categoryMap=new Map<string,number>();
  for(const row of expenses||[]){const relation=Array.isArray((row as any).finance_categories)?(row as any).finance_categories[0]:(row as any).finance_categories;const name=relation?.name||"Chi phí khác";categoryMap.set(name,(categoryMap.get(name)||0)+Number((row as any).amount||0));}
  const categories=[...categoryMap.entries()].sort((a,b)=>b[1]-a[1]);

  return <>
    <PageHeader eyebrow="Báo cáo quản trị" title="Thu chi & hiệu quả vận hành" description="Theo dõi dòng tiền đã thu, chi phí thực tế, chênh lệch và công nợ của trung tâm." />
    <Flash message={params.message} error={params.error} />
    <nav className="finance-subnav"><Link href="/finance">Thu phí & tái phí</Link><Link href="/finance/expenses">Chi phí</Link><Link href="/payroll">Lương giáo viên</Link><Link className="finance-subnav-active" href="/finance/reports">Báo cáo thu chi</Link><Link href="/notifications">Thông báo</Link></nav>
    <div className="metrics-grid"><MetricCard label="Thu tháng này" value={formatMoney(current.revenue)} tone="green"/><MetricCard label="Chi tháng này" value={formatMoney(current.expense)} tone="red"/><MetricCard label="Chênh lệch" value={formatMoney(current.revenue-current.expense)} tone={current.revenue-current.expense>=0?"blue":"red"}/><MetricCard label="Công nợ học phí" value={formatMoney(outstanding)} tone="yellow"/></div>
    <div className="dashboard-main-grid section-gap">
      <Panel title="Dòng tiền 6 tháng" description="Thu thực nhận so với chi phí đã ghi nhận">
        <div className="cashflow-chart">{rows.map(row=><div className="cashflow-row" key={row.key}><span>{monthLabel(row.key)}</span><div className="cashflow-bars"><i className="cashflow-income" style={{width:`${Math.max(2,row.revenue/maxValue*100)}%`}}/><i className="cashflow-expense" style={{width:`${Math.max(2,row.expense/maxValue*100)}%`}}/></div><strong>{formatMoney(row.revenue-row.expense)}</strong></div>)}</div>
        <div className="chart-legend"><span><i className="legend-income"/>Thu</span><span><i className="legend-expense"/>Chi</span></div>
      </Panel>
      <Panel title="Chi phí theo hạng mục" description="Tổng cộng trong 6 tháng gần nhất">
        {categories.length?<div className="category-cost-list">{categories.map(([name,value])=><div key={name}><span>{name}</span><strong>{formatMoney(value)}</strong></div>)}</div>:<Empty title="Chưa có chi phí" description="Dữ liệu xuất hiện sau khi Admin ghi nhận khoản chi."/>}
      </Panel>
    </div>

    <Panel className="section-gap" title="Bảng cân đối theo tháng" description="Khu vực nhập dữ liệu doanh thu và chi phí tổng hợp từ hệ thống kế toán hoặc file đối soát." action={<div className="row-actions"><a className="button button-ghost button-small" href="/templates/monthly_financial_summary_template.csv" download>Tải mẫu CSV</a>{(stagedCount || 0) > 0 ? <form action={commitMonthlyFinancialImport}><button className="button button-primary button-small">Đồng bộ {stagedCount} dòng đã nhập</button></form> : null}</div>}>
      {importedSnapshots?.length ? <div className="table-wrap"><table><thead><tr><th>Tháng</th><th>Doanh thu</th><th>Tổng chi phí</th><th>Kết quả</th><th>Nguồn</th><th>Ghi chú</th></tr></thead><tbody>{importedSnapshots.map((row:any)=><tr key={row.id}><td><strong>{monthLabel(String(row.month).slice(0,7))}</strong></td><td>{formatMoney(row.revenue_amount)}</td><td>{formatMoney(row.total_expense)}</td><td><strong>{formatMoney(row.operating_result)}</strong></td><td>{row.source || "—"}</td><td>{row.note || "—"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có dữ liệu cân đối tháng" description="Khu vực này đang để trống theo yêu cầu. Cấu trúc import và hàm đồng bộ đã sẵn sàng khi bạn có dữ liệu doanh thu – chi phí thực tế." />}
    </Panel>

    <Panel className="section-gap" title="Bảng tổng hợp theo tháng" description="Dùng cho đối soát và lập kế hoạch">
      <div className="table-wrap"><table><thead><tr><th>Tháng</th><th>Thu</th><th>Chi</th><th>Chênh lệch</th><th>Tỷ lệ chi/thu</th></tr></thead><tbody>{rows.slice().reverse().map(row=><tr key={row.key}><td><strong>{monthLabel(row.key)}</strong></td><td>{formatMoney(row.revenue)}</td><td>{formatMoney(row.expense)}</td><td><strong>{formatMoney(row.revenue-row.expense)}</strong></td><td>{row.revenue?`${Math.round(row.expense/row.revenue*100)}%`:"—"}</td></tr>)}</tbody></table></div>
    </Panel>
  </>;
}

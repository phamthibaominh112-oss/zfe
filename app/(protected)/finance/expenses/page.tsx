import Link from "next/link";
import { archiveExpense, createExpense, postTeacherPayrollExpense, updateExpense } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function monthRange(value?: string) {
  const month = /^\d{4}-\d{2}$/.test(value || "") ? String(value) : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0,7);
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1);
  return { month, start, end: next.toISOString().slice(0,10) };
}

export default async function ExpensePage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const range = monthRange(params.month);
  const [{ data: categories, error }, { data: expenses }, { data: teachers }, { data: payroll }] = await Promise.all([
    supabase.from("finance_categories").select("id,code,name,group_name").eq("is_active", true).order("group_name").order("name"),
    supabase.from("expense_transactions").select("id,category_id,expense_date,amount,vendor,description,payment_method,reference,status,teacher_id,payroll_month,receipt_url,finance_categories(code,name,group_name),teachers(code,full_name)").gte("expense_date", range.start).lt("expense_date", range.end).is("archived_at", null).order("expense_date", { ascending: false }),
    supabase.from("teachers").select("id,code,full_name,hourly_rate").is("archived_at", null).order("full_name"),
    supabase.from("teacher_payroll_monthly").select("teacher_id,teacher_code,teacher_name,payroll_month,completed_hours,hourly_rate,estimated_payroll").eq("payroll_month", range.start).order("teacher_name")
  ]);
  const categoryOptions = (categories || []).map((row: any) => ({ value: row.id, label: `${row.group_name} · ${row.name}` }));
  const teacherOptions = (teachers || []).map((row: any) => ({ value: row.id, label: `${row.code} · ${row.full_name}` }));
  const byGroup = new Map<string,number>();
  for (const row of expenses || []) { const category = joined((row as any).finance_categories); const group = category?.group_name || "Other"; byGroup.set(group,(byGroup.get(group)||0)+Number((row as any).amount||0)); }
  const total = (expenses || []).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0);
  const fixed = byGroup.get("Fixed cost") || 0;
  const variable = (byGroup.get("Variable cost")||0)+(byGroup.get("Commission")||0)+(byGroup.get("Other")||0);
  const payrollTotal = (byGroup.get("Teacher payroll")||0)+(byGroup.get("Staff payroll")||0);

  return <>
    <PageHeader eyebrow="Kế toán nội bộ" title="Chi phí vận hành" description="Admin ghi nhận chi phí cố định, chi phí biến đổi, lương giáo viên và các khoản chi khác." actions={<div className="row-actions"><FormDetails title="+ Ghi nhận khoản chi"><form action={createExpense}><FormGrid><SelectField label="Nhóm chi phí" name="category_id" required options={categoryOptions}/><Field label="Ngày chi" name="expense_date" type="date" defaultValue={range.start} required/><Field label="Số tiền" name="amount" type="number" min="1" step="1000" required/><Field label="Đơn vị/người nhận" name="vendor"/><TextAreaField label="Nội dung chi" name="description" required/><SelectField label="Phương thức" name="payment_method" options={["Bank transfer","Cash","Card","Other"].map(v=>({value:v,label:v}))}/><Field label="Mã tham chiếu" name="reference"/><SelectField label="Trạng thái" name="status" defaultValue="Paid" options={["Draft","Approved","Paid"].map(v=>({value:v,label:v}))}/><SelectField label="Giáo viên liên quan (nếu có)" name="teacher_id" options={teacherOptions}/><Field label="Tháng lương (nếu có)" name="payroll_month" type="date"/><Field label="Link chứng từ" name="receipt_url"/><div className="form-actions"><button className="button button-primary">Lưu khoản chi</button></div></FormGrid></form></FormDetails></div>} />
    <Flash message={params.message} error={params.error || error?.message}/>
    <nav className="finance-subnav"><Link href="/finance">Thu phí & tái phí</Link><Link className="finance-subnav-active" href="/finance/expenses">Chi phí</Link><Link href="/finance/reports">Báo cáo thu chi</Link><Link href="/notifications">Thông báo</Link></nav>
    <form className="month-filter" method="get"><label>Tháng theo dõi<input type="month" name="month" defaultValue={range.month}/></label><button className="button button-primary">Xem tháng</button></form>
    <div className="metrics-grid"><MetricCard label="Tổng chi" value={formatMoney(total)} tone="red"/><MetricCard label="Chi phí cố định" value={formatMoney(fixed)}/><MetricCard label="Chi phí biến đổi" value={formatMoney(variable)} tone="yellow"/><MetricCard label="Lương" value={formatMoney(payrollTotal)} tone="green"/></div>

    <Panel className="section-gap" title="Ước tính lương giáo viên" description="Tính từ session Completed × payroll factor × hourly rate">
      {payroll?.length ? <div className="table-wrap"><table><thead><tr><th>Giáo viên</th><th>Giờ hoàn thành</th><th>Đơn giá</th><th>Ước tính lương</th><th>Ghi nhận</th></tr></thead><tbody>{payroll.map((row:any)=><tr key={row.teacher_id}><td><strong>{row.teacher_name}</strong><br/><span className="muted">{row.teacher_code}</span></td><td>{Number(row.completed_hours||0).toLocaleString("vi-VN")} giờ</td><td>{formatMoney(row.hourly_rate)}</td><td><strong>{formatMoney(row.estimated_payroll)}</strong></td><td><form action={postTeacherPayrollExpense}><input type="hidden" name="teacher_id" value={row.teacher_id}/><input type="hidden" name="payroll_month" value={row.payroll_month}/><button className="button button-primary button-small">Ghi nhận chi phí lương</button></form></td></tr>)}</tbody></table></div> : <Empty title="Chưa có giờ dạy hoàn thành" description="Lương ước tính xuất hiện sau khi session được đánh dấu Hoàn thành và GV có hourly rate."/>}
    </Panel>

    <Panel className="section-gap" title="Sổ chi phí" description={`${expenses?.length || 0} khoản chi trong tháng ${range.month}`}>
      {expenses?.length ? <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Nhóm</th><th>Nội dung</th><th>Người nhận</th><th>Số tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{expenses.map((row:any)=>{const category=joined(row.finance_categories);const teacher=joined(row.teachers);return <tr key={row.id}><td>{formatDate(row.expense_date)}</td><td><strong>{category?.name || "Chi phí"}</strong><br/><span className="muted">{category?.group_name}</span></td><td>{row.description}{teacher ? <><br/><span className="muted">GV: {teacher.full_name}</span></> : null}</td><td>{row.vendor || "—"}<br/><span className="muted">{row.payment_method || ""}</span></td><td><strong>{formatMoney(row.amount)}</strong></td><td><Status value={row.status}/></td><td><details className="inline-details"><summary className="button button-ghost button-small">Điều chỉnh</summary><form action={updateExpense} className="inline-edit-form"><input type="hidden" name="expense_id" value={row.id}/><SelectField label="Nhóm chi phí" name="category_id" defaultValue={row.category_id} required options={categoryOptions}/><Field label="Ngày chi" name="expense_date" type="date" defaultValue={row.expense_date} required/><Field label="Số tiền" name="amount" type="number" step="1000" defaultValue={row.amount} required/><Field label="Đơn vị/người nhận" name="vendor" defaultValue={row.vendor||""}/><TextAreaField label="Nội dung" name="description" defaultValue={row.description} required/><Field label="Phương thức" name="payment_method" defaultValue={row.payment_method||""}/><Field label="Mã tham chiếu" name="reference" defaultValue={row.reference||""}/><SelectField label="Trạng thái" name="status" defaultValue={row.status} options={["Draft","Approved","Paid","Void"].map(v=>({value:v,label:v}))}/><Field label="Link chứng từ" name="receipt_url" defaultValue={row.receipt_url||""}/><button className="button button-primary">Lưu</button></form><form action={archiveExpense} className="danger-inline-form"><input type="hidden" name="expense_id" value={row.id}/><button className="button button-danger">Huỷ khoản chi</button></form></details></td></tr>})}</tbody></table></div> : <Empty title="Chưa có khoản chi trong tháng" description="Sử dụng nút Ghi nhận khoản chi để bắt đầu theo dõi."/>}
    </Panel>
  </>;
}

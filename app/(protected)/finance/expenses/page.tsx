import Link from "next/link";
import { archiveExpense, createExpense, updateExpense, updateTeacherHourlyRate } from "@/app/actions";
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
  const month = /^\d{4}-\d{2}$/.test(value || "")
    ? String(value)
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { month, start, end: next.toISOString().slice(0, 10) };
}

const costTypeOptions = [
  { value: "Fixed cost", label: "Cố định" },
  { value: "Variable cost", label: "Biến đổi" },
  { value: "Teacher payroll", label: "Lương giảng viên" },
  { value: "Staff payroll", label: "Lương nhân sự vận hành" },
  { value: "Commission", label: "Hoa hồng" },
  { value: "Other", label: "Khác" }
];

function costTypeLabel(value?: string) {
  return costTypeOptions.find((item) => item.value === value)?.label || value || "Khác";
}

export default async function ExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const range = monthRange(params.month);

  const [
    { data: categories, error },
    { data: expenses },
    { data: teachers },
    { data: payrollStatements },
    { data: payrollLive }
  ] = await Promise.all([
    supabase.from("finance_categories")
      .select("id,code,name,group_name")
      .eq("is_active", true)
      .order("name"),
    supabase.from("expense_transactions")
      .select("id,category_id,cost_type,expense_date,amount,vendor,description,payment_method,reference,status,teacher_id,payroll_month,receipt_url,finance_categories(code,name,group_name),teachers(code,full_name)")
      .gte("expense_date", range.start)
      .lt("expense_date", range.end)
      .is("archived_at", null)
      .order("expense_date", { ascending: false }),
    supabase.from("teachers")
      .select("id,code,full_name,employment_status,teacher_compensation_settings(hourly_rate,effective_from,note)")
      .is("archived_at", null)
      .order("full_name"),
    supabase.from("teacher_payroll_statements")
      .select("id,teacher_id,completed_hours,hourly_rate_snapshot,gross_amount,teacher_status,admin_status")
      .eq("payroll_month", range.start),
    supabase.from("teacher_payroll_live_monthly")
      .select("teacher_id,completed_hours,hourly_rate,estimated_payroll")
      .eq("payroll_month", range.start)
  ]);

  const categoryOptions = (categories || []).map((row: any) => ({
    value: row.id,
    label: row.name
  }));
  const teacherOptions = (teachers || []).map((row: any) => ({
    value: row.id,
    label: `${row.code} · ${row.full_name}`
  }));
  const payrollMap = new Map((payrollStatements || []).map((row: any) => [row.teacher_id, row]));
  const liveMap = new Map((payrollLive || []).map((row: any) => [row.teacher_id, row]));

  const byType = new Map<string, number>();
  for (const row of expenses || []) {
    const key = String((row as any).cost_type || joined((row as any).finance_categories)?.group_name || "Other");
    byType.set(key, (byType.get(key) || 0) + Number((row as any).amount || 0));
  }
  const total = (expenses || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const fixed = byType.get("Fixed cost") || 0;
  const variable = (byType.get("Variable cost") || 0) + (byType.get("Commission") || 0) + (byType.get("Other") || 0);
  const payrollTotal = (byType.get("Teacher payroll") || 0) + (byType.get("Staff payroll") || 0);
  const missingRateCount = (teachers || []).filter((teacher: any) => Number(joined(teacher.teacher_compensation_settings)?.hourly_rate || 0) <= 0).length;

  return <>
    <PageHeader
      eyebrow="Kế toán nội bộ"
      title="Chi phí vận hành"
      description="Ghi nhận theo đúng cấu trúc: Nhóm chi phí, Loại chi phí, nội dung và số tiền."
      actions={<div className="row-actions">
        <FormDetails title="+ Ghi nhận khoản chi">
          <form action={createExpense}>
            <FormGrid>
              <SelectField label="Nhóm chi phí" name="category_id" required options={categoryOptions} />
              <SelectField label="Loại chi phí" name="cost_type" required defaultValue="Variable cost" options={costTypeOptions} />
              <Field label="Ngày phát sinh" name="expense_date" type="date" defaultValue={range.start} required />
              <Field label="Số tiền" name="amount" type="number" min="1" step="1000" required />
              <Field label="Nhà cung cấp / Người nhận" name="vendor" />
              <TextAreaField label="Nội dung chi phí" name="description" required />
              <SelectField label="Phương thức" name="payment_method" options={["Bank transfer", "Cash", "Card", "Other"].map((value) => ({ value, label: value }))} />
              <Field label="Mã tham chiếu" name="reference" />
              <SelectField label="Trạng thái" name="status" defaultValue="Paid" options={["Draft", "Approved", "Paid"].map((value) => ({ value, label: value }))} />
              <SelectField label="Giáo viên liên quan (nếu có)" name="teacher_id" options={teacherOptions} />
              <Field label="Tháng lương (nếu có)" name="payroll_month" type="date" />
              <Field label="Link chứng từ" name="receipt_url" />
              <div className="form-actions"><button className="button button-primary">Lưu khoản chi</button></div>
            </FormGrid>
          </form>
        </FormDetails>
      </div>}
    />
    <Flash message={params.message} error={params.error || error?.message} />
    <nav className="finance-subnav">
      <Link href="/finance">Thu phí & tái phí</Link>
      <Link className="finance-subnav-active" href="/finance/expenses">Chi phí</Link>
      <Link href="/payroll">Lương giáo viên</Link>
      <Link href="/finance/reports">Báo cáo thu chi</Link>
      <Link href="/notifications">Thông báo</Link>
    </nav>
    <form className="month-filter" method="get">
      <label>Tháng theo dõi<input type="month" name="month" defaultValue={range.month} /></label>
      <button className="button button-primary">Xem tháng</button>
    </form>

    <div className="metrics-grid">
      <MetricCard label="Tổng chi" value={formatMoney(total)} tone="red" />
      <MetricCard label="Chi phí cố định" value={formatMoney(fixed)} />
      <MetricCard label="Chi phí biến đổi" value={formatMoney(variable)} tone="yellow" />
      <MetricCard label="Lương" value={formatMoney(payrollTotal)} tone="green" />
    </div>

    <Panel
      className="section-gap"
      title="Thiết lập đơn giá giờ dạy"
      description="Admin cập nhật trực tiếp tại đây. Mức mới được dùng để tính lương và hiển thị ngay trên tài khoản giáo viên."
      action={<Link className="text-link" href={`/payroll?month=${range.month}`}>Mở quản lý lương đầy đủ →</Link>}
    >
      {missingRateCount ? <div className="message error">Có {missingRateCount} giáo viên chưa được thiết lập đơn giá. Không thể duyệt hoặc ghi nhận lương bằng 0.</div> : null}
      {teachers?.length ? <div className="rate-settings-grid">{teachers.map((teacher: any) => {
        const setting = joined(teacher.teacher_compensation_settings);
        const rate = Number(setting?.hourly_rate || 0);
        return <form action={updateTeacherHourlyRate} className={`rate-setting-card ${rate <= 0 ? "rate-missing" : ""}`} key={teacher.id}>
          <input type="hidden" name="teacher_id" value={teacher.id} />
          <input type="hidden" name="return_month" value={range.month} />
          <input type="hidden" name="return_path" value={`/finance/expenses?month=${range.month}`} />
          <div><strong>{teacher.full_name}</strong><small>{teacher.code} · {rate > 0 ? formatMoney(rate) + "/giờ" : "Chưa thiết lập đơn giá"}</small></div>
          <Field label="Đơn giá / giờ" name="hourly_rate" type="number" min="1" step="1000" defaultValue={rate || ""} required />
          <Field label="Hiệu lực từ" name="effective_from" type="date" defaultValue={setting?.effective_from || range.start} required />
          <Field label="Ghi chú" name="note" defaultValue={setting?.note || ""} />
          <button className="button button-primary rate-save-button">Lưu đơn giá</button>
        </form>;
      })}</div> : <Empty title="Chưa có giáo viên" description="Tạo hồ sơ giáo viên trước khi thiết lập đơn giá." />}
    </Panel>

    <Panel
      className="section-gap"
      title="Tình trạng lương giáo viên"
      description="Lương chỉ nhảy vào bảng chi phí sau khi giáo viên xác nhận và Admin duyệt."
      action={<Link className="text-link" href={`/payroll?month=${range.month}`}>Tổng kết & duyệt lương →</Link>}
    >
      {teachers?.length ? <div className="table-wrap"><table><thead><tr><th>Giáo viên</th><th>Giờ hoàn thành</th><th>Đơn giá</th><th>Lương dự kiến</th><th>GV xác nhận</th><th>Admin</th></tr></thead><tbody>{teachers.map((teacher: any) => {
        const statement: any = payrollMap.get(teacher.id);
        const live: any = liveMap.get(teacher.id);
        const setting = joined(teacher.teacher_compensation_settings);
        const hours = Number(statement?.completed_hours ?? live?.completed_hours ?? 0);
        const rate = Number(statement?.hourly_rate_snapshot ?? live?.hourly_rate ?? setting?.hourly_rate ?? 0);
        const gross = Number(statement?.gross_amount ?? live?.estimated_payroll ?? hours * rate);
        return <tr key={teacher.id}>
          <td><strong>{teacher.full_name}</strong><br /><span className="muted">{teacher.code}</span></td>
          <td>{hours.toLocaleString("vi-VN")} giờ</td>
          <td>{rate > 0 ? formatMoney(rate) : <span className="status status-red">Chưa set</span>}</td>
          <td><strong>{gross > 0 ? formatMoney(gross) : "—"}</strong></td>
          <td><Status value={statement?.teacher_status || "Chưa tạo"} /></td>
          <td><Status value={statement?.admin_status || "Chưa tạo"} /></td>
        </tr>;
      })}</tbody></table></div> : <Empty title="Chưa có giáo viên" description="Không có dữ liệu để tính lương." />}
    </Panel>

    <Panel className="section-gap" title="Sổ chi phí" description={`${expenses?.length || 0} khoản chi trong tháng ${range.month}`}>
      {expenses?.length ? <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Nhóm chi phí</th><th>Loại</th><th>Nội dung</th><th>Người nhận</th><th>Số tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{expenses.map((row: any) => {
        const category = joined(row.finance_categories);
        const teacher = joined(row.teachers);
        return <tr key={row.id}>
          <td>{formatDate(row.expense_date)}</td>
          <td><strong>{category?.name || "Chi phí"}</strong></td>
          <td>{costTypeLabel(row.cost_type || category?.group_name)}</td>
          <td>{row.description}{teacher ? <><br /><span className="muted">GV: {teacher.full_name}</span></> : null}</td>
          <td>{row.vendor || "—"}<br /><span className="muted">{row.payment_method || ""}</span></td>
          <td><strong>{formatMoney(row.amount)}</strong></td>
          <td><Status value={row.status} /></td>
          <td><details className="inline-details"><summary className="button button-ghost button-small">Điều chỉnh</summary>
            <form action={updateExpense} className="inline-edit-form">
              <input type="hidden" name="expense_id" value={row.id} />
              <SelectField label="Nhóm chi phí" name="category_id" defaultValue={row.category_id} required options={categoryOptions} />
              <SelectField label="Loại chi phí" name="cost_type" defaultValue={row.cost_type || category?.group_name || "Variable cost"} required options={costTypeOptions} />
              <Field label="Ngày chi" name="expense_date" type="date" defaultValue={row.expense_date} required />
              <Field label="Số tiền" name="amount" type="number" min="1" step="1000" defaultValue={row.amount} required />
              <Field label="Đơn vị/người nhận" name="vendor" defaultValue={row.vendor || ""} />
              <TextAreaField label="Nội dung" name="description" defaultValue={row.description} required />
              <Field label="Phương thức" name="payment_method" defaultValue={row.payment_method || ""} />
              <Field label="Mã tham chiếu" name="reference" defaultValue={row.reference || ""} />
              <SelectField label="Trạng thái" name="status" defaultValue={row.status} options={["Draft", "Approved", "Paid", "Void"].map((value) => ({ value, label: value }))} />
              <Field label="Link chứng từ" name="receipt_url" defaultValue={row.receipt_url || ""} />
              <button className="button button-primary">Lưu</button>
            </form>
            <form action={archiveExpense} className="danger-inline-form">
              <input type="hidden" name="expense_id" value={row.id} />
              <button className="button button-danger">Huỷ khoản chi</button>
            </form>
          </details></td>
        </tr>;
      })}</tbody></table></div> : <Empty title="Chưa có khoản chi trong tháng" description="Sử dụng nút Ghi nhận khoản chi để bắt đầu theo dõi." />}
    </Panel>
  </>;
}

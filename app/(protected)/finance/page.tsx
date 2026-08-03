import { addPayment, createRenewalFollowup, createTuitionAccount, updatePayment, updateRenewalFollowup, updateTuitionAccount } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "customer_service", "student"]);
  const params = await searchParams;
  const supabase = await createClient();
  const canManage = profile.role === "admin" || profile.role === "customer_service";

  const [{ data: accounts, error }, { data: payments }, { data: followups }, { data: students }, { data: enrollments }] = await Promise.all([
    supabase.from("tuition_accounts").select("id,student_id,enrollment_id,package_name,gross_amount,discount_amount,net_amount,paid_amount,balance_amount,purchased_hours,used_hours,renewal_due_date,status,created_at,students(id,code,full_name),enrollments(id,classes(code,name))").is("archived_at", null).order("renewal_due_date", { ascending: true }),
    supabase.from("payment_transactions").select("id,tuition_account_id,amount,paid_at,method,reference,note,tuition_accounts(package_name,students(code,full_name))").order("paid_at", { ascending: false }).limit(100),
    canManage ? supabase.from("renewal_followups").select("id,tuition_account_id,due_at,status,outcome,note,tuition_accounts(package_name,students(code,full_name))").order("due_at", { ascending: true }).limit(100) : Promise.resolve({ data: [] as any[] }),
    canManage ? supabase.from("students").select("id,code,full_name").is("archived_at", null).order("full_name") : Promise.resolve({ data: [] as any[] }),
    canManage ? supabase.from("enrollments").select("id,student_id,classes(code,name)").is("archived_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] })
  ]);

  const totalNet = (accounts || []).reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
  const totalPaid = (accounts || []).reduce((sum: number, row: any) => sum + Number(row.paid_amount || 0), 0);
  const totalBalance = (accounts || []).reduce((sum: number, row: any) => sum + Number(row.balance_amount || 0), 0);
  const today = new Date();
  const in14Days = new Date(today.getTime() + 14 * 86400000);
  const renewalSoon = (accounts || []).filter((row: any) => {
    if (!row.renewal_due_date) return false;
    const due = new Date(`${row.renewal_due_date}T00:00:00`);
    return due >= new Date(today.toDateString()) && due <= in14Days;
  }).length;

  const accountOptions = (accounts || []).map((row: any) => ({
    value: row.id,
    label: `${row.students?.code || "HV"} · ${row.students?.full_name || "Học viên"} · ${row.package_name}`
  }));
  const studentOptions = (students || []).map((row: any) => ({ value: row.id, label: `${row.code} · ${row.full_name}` }));
  const enrollmentOptions = (enrollments || []).map((row: any) => ({ value: row.id, label: `${row.classes?.code || "Lớp"} · ${row.classes?.name || ""}` }));

  const actions = canManage ? <div className="row-actions">
    <FormDetails title="Tạo tài khoản học phí">
      <form action={createTuitionAccount}><FormGrid>
        <SelectField label="Học viên" name="student_id" required options={studentOptions} />
        <SelectField label="Lớp học (không bắt buộc)" name="enrollment_id" options={enrollmentOptions} />
        <Field label="Tên gói học" name="package_name" required placeholder="IELTS Foundation 60H" />
        <Field label="Học phí gốc" name="gross_amount" type="number" min="0" step="1000" required />
        <Field label="Giảm giá" name="discount_amount" type="number" min="0" step="1000" defaultValue={0} />
        <Field label="Số giờ đã mua" name="purchased_hours" type="number" min="0" step="0.25" />
        <Field label="Ngày dự kiến tái phí" name="renewal_due_date" type="date" />
        <div className="form-actions"><button className="button button-primary">Lưu tài khoản</button></div>
      </FormGrid></form>
    </FormDetails>
    <FormDetails title="Ghi nhận thanh toán">
      <form action={addPayment}><FormGrid>
        <SelectField label="Tài khoản học phí" name="tuition_account_id" required options={accountOptions} />
        <Field label="Số tiền" name="amount" type="number" min="1" step="1000" required />
        <Field label="Thời điểm thanh toán" name="paid_at" type="datetime-local" />
        <SelectField label="Phương thức" name="method" options={[{ value: "Bank transfer", label: "Chuyển khoản" }, { value: "Cash", label: "Tiền mặt" }, { value: "Card", label: "Thẻ" }, { value: "Other", label: "Khác" }]} />
        <Field label="Mã tham chiếu" name="reference" />
        <TextAreaField label="Ghi chú" name="note" />
        <div className="form-actions"><button className="button button-primary">Ghi nhận payment</button></div>
      </FormGrid></form>
    </FormDetails>
    <FormDetails title="Tạo follow-up tái phí">
      <form action={createRenewalFollowup}><FormGrid>
        <SelectField label="Tài khoản học phí" name="tuition_account_id" required options={accountOptions} />
        <Field label="Thời hạn follow-up" name="due_at" type="datetime-local" required />
        <TextAreaField label="Nội dung follow-up" name="note" required />
        <div className="form-actions"><button className="button button-primary">Tạo task</button></div>
      </FormGrid></form>
    </FormDetails>
  </div> : undefined;

  return <>
    <PageHeader eyebrow="Học phí & chăm sóc học viên" title={profile.role === "student" ? "Học phí của tôi" : "Học phí & tái phí"} description={profile.role === "student" ? "Theo dõi gói học, số tiền đã đóng, số dư và ngày tái phí." : "Theo dõi gói học, giao dịch, công nợ, ngày tái phí và lịch chăm sóc."} actions={actions} />
    <Flash message={params.message} error={params.error || error?.message} />
    <div className="metrics-grid">
      <MetricCard label="Giá trị gói học" value={formatMoney(totalNet)} />
      <MetricCard label="Đã thu" value={formatMoney(totalPaid)} tone="green" />
      <MetricCard label="Còn phải thu" value={formatMoney(totalBalance)} tone={totalBalance > 0 ? "red" : "neutral"} />
      <MetricCard label="Tái phí trong 14 ngày" value={renewalSoon} tone="yellow" />
    </div>

    <Panel title="Tuition accounts" description={`${accounts?.length || 0} tài khoản có quyền truy cập`}>
      {accounts?.length ? <div className="table-wrap"><table><thead><tr><th>Học viên</th><th>Gói học</th><th>Giá trị</th><th>Đã đóng</th><th>Còn lại</th><th>Giờ học</th><th>Ngày tái phí</th><th>Trạng thái</th>{canManage ? <th>Chỉnh sửa</th> : null}</tr></thead><tbody>
        {accounts.map((row: any) => <tr key={row.id}><td><strong>{row.students?.full_name || "Học viên"}</strong><br/><span className="muted">{row.students?.code || "—"}</span></td><td>{row.package_name}<br/><span className="muted">{row.enrollments?.classes?.code || "Chưa gắn lớp"}</span></td><td>{formatMoney(row.net_amount)}</td><td>{formatMoney(row.paid_amount)}</td><td><strong>{formatMoney(row.balance_amount)}</strong></td><td>{Number(row.used_hours || 0).toLocaleString("vi-VN")}/{row.purchased_hours ?? "—"}</td><td>{formatDate(row.renewal_due_date)}</td><td><Status value={row.status}/></td>{canManage ? <td><details className="inline-details"><summary className="button button-ghost">Chỉnh sửa</summary><form action={updateTuitionAccount} className="inline-edit-form"><input type="hidden" name="tuition_account_id" value={row.id}/><Field label="Tên gói học" name="package_name" defaultValue={row.package_name} required/><Field label="Học phí gốc" name="gross_amount" type="number" min="0" step="1000" defaultValue={row.gross_amount} required/><Field label="Giảm giá" name="discount_amount" type="number" min="0" step="1000" defaultValue={row.discount_amount || 0}/><Field label="Số giờ đã mua" name="purchased_hours" type="number" min="0" step="0.25" defaultValue={row.purchased_hours ?? ""}/><Field label="Ngày dự kiến tái phí" name="renewal_due_date" type="date" defaultValue={row.renewal_due_date || ""}/><button className="button button-primary">Lưu tài khoản</button></form></details></td> : null}</tr>)}
      </tbody></table></div> : <Empty title="Chưa có tài khoản học phí" description={canManage ? "CSKH tạo tuition account sau khi học viên chốt và đóng tiền." : "Học phí sẽ xuất hiện sau khi CSKH tạo tài khoản cho hồ sơ của bạn."}/>} 
    </Panel>

    <div className="grid-2 section-gap">
      <Panel title="Lịch sử thanh toán" description="Transaction ledger, không ghi đè số tiền đã đóng">
        {payments?.length ? <div className="alert-list">{payments.map((row: any) => <div className="alert-item" key={row.id}><i/><div><strong>{formatMoney(row.amount)} · {row.tuition_accounts?.students?.full_name || "Học viên"}</strong><span>{new Date(row.paid_at).toLocaleString("vi-VN")} · {row.method || "Chưa ghi phương thức"} {row.reference ? `· ${row.reference}` : ""}</span>{canManage ? <details className="inline-details section-gap"><summary className="button button-ghost">Edit transaction</summary><form action={updatePayment} className="inline-edit-form"><input type="hidden" name="payment_id" value={row.id}/><Field label="Số tiền" name="amount" type="number" step="1000" defaultValue={row.amount} required/><Field label="Thời điểm" name="paid_at" type="datetime-local" defaultValue={String(row.paid_at).slice(0,16)} required/><Field label="Phương thức" name="method" defaultValue={row.method || ""}/><Field label="Reference" name="reference" defaultValue={row.reference || ""}/><TextAreaField label="Ghi chú" name="note" defaultValue={row.note || ""}/><button className="button button-primary">Lưu transaction</button></form></details> : null}</div><Status value="Paid"/></div>)}</div> : <Empty title="Chưa có giao dịch" description="Mọi lần thu tiền sẽ được lưu thành transaction riêng."/>}
      </Panel>
      {canManage ? <Panel title="Renewal follow-up" description="Chỉ Admin và CSKH được truy cập">
        {followups?.length ? <div className="alert-list">{followups.map((row: any) => <div className="alert-item" key={row.id}><i/><div><strong>{row.tuition_accounts?.students?.full_name || "Học viên"} · {row.tuition_accounts?.package_name}</strong><span>{new Date(row.due_at).toLocaleString("vi-VN")} · {row.note || "Follow-up"}</span><details className="inline-details section-gap"><summary className="button button-ghost">Update follow-up</summary><form action={updateRenewalFollowup} className="inline-edit-form"><input type="hidden" name="followup_id" value={row.id}/><Field label="Due at" name="due_at" type="datetime-local" defaultValue={String(row.due_at).slice(0,16)} required/><SelectField label="Status" name="status" defaultValue={row.status} required options={["Pending","Contacted","Call back","Renewed","Not renewing","Closed"].map(v=>({value:v,label:v}))}/><Field label="Outcome" name="outcome" defaultValue={row.outcome || ""}/><TextAreaField label="Ghi chú" name="note" defaultValue={row.note || ""}/><button className="button button-primary">Lưu follow-up</button></form></details></div><Status value={row.status}/></div>)}</div> : <Empty title="Chưa có task tái phí" description="Tạo follow-up từ nút phía trên."/>}
      </Panel> : <Panel title="Cần hỗ trợ về học phí?" description="Liên hệ CSKH của trung tâm"><div className="note-box">CSKH sẽ hỗ trợ kiểm tra giao dịch, số dư hoặc ngày tái phí khi bạn cần.</div></Panel>}
    </div>
  </>;
}

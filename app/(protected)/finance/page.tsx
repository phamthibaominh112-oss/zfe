import Link from "next/link";
import { addPayment, createRenewalFollowup, createTuitionAccount, deletePaymentAndReceipt, generateRenewalNotifications, sendFinanceNotification, updatePayment, updateReceiptDetails, updateRenewalFollowup, updateTuitionAccount } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, FormDetails, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "customer_service", "student"]);
  const params = await searchParams;
  const supabase = await createClient();
  const canManage = profile.role === "admin" || profile.role === "customer_service";
  const isAdmin = profile.role === "admin";

  const monthKey = new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);
  const monthStart = `${monthKey}-01`;
  const monthEndDate = new Date(`${monthStart}T00:00:00+07:00`); monthEndDate.setMonth(monthEndDate.getMonth()+1);
  const monthEnd = monthEndDate.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const [{ data: accounts, error }, { data: payments }, { data: receipts }, { data: followups }, { data: students }, { data: enrollments }, { data: monthPayments }] = await Promise.all([
    supabase.from("tuition_accounts").select("id,student_id,enrollment_id,package_name,gross_amount,discount_amount,net_amount,paid_amount,balance_amount,purchased_hours,used_hours,renewal_due_date,status,created_at,students(id,code,full_name),enrollments(id,classes(code,name))").is("archived_at", null).order("renewal_due_date", { ascending: true }),
    supabase.from("payment_transactions").select("id,tuition_account_id,amount,paid_at,method,reference,note,tuition_accounts(package_name,students(code,full_name))").order("paid_at", { ascending: false }).limit(150),
    supabase.from("payment_receipts").select("id,receipt_no,payment_transaction_id,status,payer_name,package_name,payment_method,reference,note").order("issued_at", { ascending: false }).limit(150),
    canManage ? supabase.from("renewal_followups").select("id,tuition_account_id,due_at,status,outcome,note,tuition_accounts(package_name,students(code,full_name))").order("due_at", { ascending: true }).limit(100) : Promise.resolve({ data: [] as any[] }),
    canManage ? supabase.from("students").select("id,code,full_name").is("archived_at", null).order("full_name") : Promise.resolve({ data: [] as any[] }),
    canManage ? supabase.from("enrollments").select("id,student_id,classes(code,name)").is("archived_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    canManage ? supabase.from("payment_transactions").select("amount").gte("paid_at",`${monthStart}T00:00:00+07:00`).lt("paid_at",`${monthEnd}T00:00:00+07:00`) : Promise.resolve({data:[] as any[]})
  ]);

  const receiptByPayment = new Map((receipts || []).map((row: any) => [row.payment_transaction_id, row]));
  const totalNet = (accounts || []).reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
  const totalPaid = (accounts || []).reduce((sum: number, row: any) => sum + Number(row.paid_amount || 0), 0);
  const totalBalance = (accounts || []).reduce((sum: number, row: any) => sum + Number(row.balance_amount || 0), 0);
  const monthRevenue = (monthPayments || []).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0);
  const todayString = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const today = new Date(`${todayString}T00:00:00+07:00`);
  const in14Days = new Date(today.getTime() + 14 * 86400000);
  const renewalSoonRows = (accounts || []).filter((row: any) => {
    if (!row.renewal_due_date) return false;
    const due = new Date(`${row.renewal_due_date}T00:00:00+07:00`);
    return due >= today && due <= in14Days;
  });
  const overdueRows = (accounts || []).filter((row: any) => row.renewal_due_date && row.renewal_due_date < todayString && row.status !== "Paid");
  const usageWarningRows = (accounts || []).filter((row: any) => Number(row.purchased_hours || 0) > 0 && Number(row.used_hours || 0) / Number(row.purchased_hours || 1) >= .8);

  const accountOptions = (accounts || []).map((row: any) => {
    const student = joined(row.students);
    return { value: row.id, label: `${student?.code || "HV"} · ${student?.full_name || "Học viên"} · ${row.package_name}` };
  });
  const studentOptions = (students || []).map((row: any) => ({ value: row.id, label: `${row.code} · ${row.full_name}` }));
  const enrollmentOptions = (enrollments || []).map((row: any) => {
    const classRow = joined(row.classes);
    return { value: row.id, label: `${classRow?.code || "Lớp"} · ${classRow?.name || ""}` };
  });

  const actions = canManage ? <div className="row-actions finance-header-actions">
    <FormDetails title="+ Tạo gói học phí">
      <form action={createTuitionAccount}><FormGrid>
        <SelectField label="Học viên" name="student_id" required options={studentOptions} />
        <SelectField label="Lớp học (không bắt buộc)" name="enrollment_id" options={enrollmentOptions} />
        <Field label="Tên gói học" name="package_name" required placeholder="IELTS Foundation 60H" />
        <Field label="Học phí gốc" name="gross_amount" type="number" min="0" step="1000" required />
        <Field label="Giảm giá" name="discount_amount" type="number" min="0" step="1000" defaultValue={0} />
        <Field label="Số giờ đã mua" name="purchased_hours" type="number" min="0" step="0.25" />
        <Field label="Ngày dự kiến tái phí" name="renewal_due_date" type="date" />
        <div className="form-actions"><button className="button button-primary">Lưu gói học phí</button></div>
      </FormGrid></form>
    </FormDetails>
    <FormDetails title="₫ Ghi nhận thu tiền">
      <form action={addPayment}><FormGrid>
        <SelectField label="Gói học phí" name="tuition_account_id" required options={accountOptions} />
        <Field label="Số tiền" name="amount" type="number" min="1000" step="1000" required />
        <Field label="Thời điểm thanh toán" name="paid_at" type="datetime-local" />
        <SelectField label="Phương thức" name="method" options={[{ value: "Bank transfer", label: "Chuyển khoản" }, { value: "Cash", label: "Tiền mặt" }, { value: "Card", label: "Thẻ" }, { value: "Other", label: "Khác" }]} />
        <Field label="Mã tham chiếu" name="reference" />
        <TextAreaField label="Ghi chú" name="note" />
        <div className="form-actions"><button className="button button-primary">Ghi nhận & tạo phiếu thu</button></div>
      </FormGrid></form>
    </FormDetails>
    <FormDetails title="↻ Tạo lịch tái phí">
      <form action={createRenewalFollowup}><FormGrid>
        <SelectField label="Gói học phí" name="tuition_account_id" required options={accountOptions} />
        <Field label="Thời hạn follow-up" name="due_at" type="datetime-local" required />
        <TextAreaField label="Nội dung follow-up" name="note" required />
        <div className="form-actions"><button className="button button-primary">Tạo việc cần làm</button></div>
      </FormGrid></form>
    </FormDetails>
  </div> : undefined;

  return <>
    <PageHeader eyebrow="Thu phí & chăm sóc" title={profile.role === "student" ? "Học phí của tôi" : "Thu phí, phiếu thu & tái phí"} description={profile.role === "student" ? "Theo dõi gói học, giao dịch, phiếu thu, số dư và ngày tái phí." : "Ghi nhận thu tiền, in phiếu thu, theo dõi công nợ và nhắc tái phí từ một màn hình."} actions={actions} />
    <Flash message={params.message} error={params.error || error?.message} />

    {canManage ? <nav className="finance-subnav" aria-label="Điều hướng tài chính">
      <Link className="finance-subnav-active" href="/finance">Thu phí & tái phí</Link>
      {isAdmin ? <Link href="/finance/expenses">Chi phí</Link> : null}
      {isAdmin ? <Link href="/finance/reports">Báo cáo thu chi</Link> : null}
      <Link href="/notifications">Thông báo</Link>
    </nav> : null}

    <div className="metrics-grid">
      <MetricCard label="Giá trị gói học" value={formatMoney(totalNet)} />
      <MetricCard label="Đã thu" value={formatMoney(totalPaid)} tone="green" />
      <MetricCard label="Còn phải thu" value={formatMoney(totalBalance)} tone={totalBalance > 0 ? "red" : "neutral"} />
      <MetricCard label="Doanh thu tháng này" value={formatMoney(monthRevenue)} tone="green" />
      <MetricCard label="Tái phí trong 14 ngày" value={renewalSoonRows.length} tone="yellow" />
    </div>

    {canManage ? <div className="dashboard-main-grid section-gap">
      <Panel title="Cảnh báo tài chính" description="Các hồ sơ cần ưu tiên xử lý">
        <div className="task-stack">
          <div className="task-card"><span className="task-number">{overdueRows.length}</span><div><strong>Đã qua ngày tái phí</strong><small>Kiểm tra và liên hệ ngay</small></div></div>
          <div className="task-card"><span className="task-number yellow">{renewalSoonRows.length}</span><div><strong>Tái phí trong 14 ngày</strong><small>Chuẩn bị nội dung chăm sóc</small></div></div>
          <div className="task-card"><span className="task-number green">{usageWarningRows.length}</span><div><strong>Đã dùng từ 80% số giờ</strong><small>Chủ động tư vấn gói tiếp theo</small></div></div>
        </div>
      </Panel>
      <Panel title="Gửi thông báo học viên" description="Thông báo xuất hiện trong tài khoản học viên">
        <form action={sendFinanceNotification} className="form-stack compact-form">
          <SelectField label="Học viên" name="student_id" required options={studentOptions}/>
          <Field label="Tiêu đề" name="title" required placeholder="Nhắc đóng học phí"/>
          <TextAreaField label="Nội dung" name="body" required placeholder="Trung tâm xin thông báo..."/>
          <SelectField label="Mức độ" name="priority" defaultValue="Normal" options={["Normal","High","Urgent"].map(value=>({value,label:value === "Normal" ? "Thông thường" : value === "High" ? "Quan trọng" : "Khẩn"}))}/>
          <input type="hidden" name="kind" value="finance_notice"/><input type="hidden" name="action_url" value="/finance"/>
          <button className="button button-primary">Gửi thông báo</button>
        </form>
        <form action={generateRenewalNotifications} className="renewal-bulk-form"><input type="hidden" name="days" value="14"/><button className="button button-yellow">Tạo thông báo tái phí cho 14 ngày tới</button></form>
      </Panel>
    </div> : null}

    <Panel className="section-gap" title="Gói học phí" description={`${accounts?.length || 0} tài khoản có quyền truy cập`}>
      {accounts?.length ? <div className="table-wrap"><table><thead><tr><th>Học viên</th><th>Gói học</th><th>Giá trị</th><th>Đã đóng</th><th>Còn lại</th><th>Tiến độ giờ</th><th>Tái phí</th><th>Trạng thái</th>{canManage ? <th>Thao tác</th> : null}</tr></thead><tbody>
        {accounts.map((row: any) => {
          const student = joined(row.students); const enrollment = joined(row.enrollments); const classRow = joined(enrollment?.classes);
          const used = Number(row.used_hours || 0); const purchased = Number(row.purchased_hours || 0); const percentage = purchased ? Math.min(100, Math.round(used / purchased * 100)) : 0;
          return <tr key={row.id}><td><strong>{student?.full_name || "Học viên"}</strong><br/><span className="muted">{student?.code || "—"}</span></td><td>{row.package_name}<br/><span className="muted">{classRow?.code || "Chưa gắn lớp"}</span></td><td>{formatMoney(row.net_amount)}</td><td>{formatMoney(row.paid_amount)}</td><td><strong>{formatMoney(row.balance_amount)}</strong></td><td><div className="mini-progress"><i style={{width:`${percentage}%`}}/><span>{used.toLocaleString("vi-VN")}/{purchased || "—"}h · {percentage}%</span></div></td><td>{formatDate(row.renewal_due_date)}</td><td><Status value={row.status}/></td>{canManage ? <td><details className="inline-details"><summary className="button button-ghost">Chỉnh sửa</summary><form action={updateTuitionAccount} className="inline-edit-form"><input type="hidden" name="tuition_account_id" value={row.id}/><Field label="Tên gói học" name="package_name" defaultValue={row.package_name} required/><Field label="Học phí gốc" name="gross_amount" type="number" min="0" step="1000" defaultValue={row.gross_amount} required/><Field label="Giảm giá" name="discount_amount" type="number" min="0" step="1000" defaultValue={row.discount_amount || 0}/><Field label="Số giờ đã mua" name="purchased_hours" type="number" min="0" step="0.25" defaultValue={row.purchased_hours ?? ""}/><Field label="Ngày dự kiến tái phí" name="renewal_due_date" type="date" defaultValue={row.renewal_due_date || ""}/><button className="button button-primary">Lưu</button></form></details></td> : null}</tr>;
        })}
      </tbody></table></div> : <Empty title="Chưa có gói học phí" description={canManage ? "Tạo gói học phí sau khi học viên chốt chương trình." : "Thông tin học phí sẽ xuất hiện sau khi CSKH cập nhật."}/>} 
    </Panel>

    <div className="grid-2 section-gap">
      <Panel title="Giao dịch & phiếu thu" description="Mỗi lần thu tiền được lưu thành một giao dịch riêng">
        {payments?.length ? <div className="alert-list">{payments.map((row: any) => {
          const account = joined(row.tuition_accounts); const student = joined(account?.students); const receipt = receiptByPayment.get(row.id) as any;
          return <div className="alert-item payment-ledger-item" key={row.id}><i/><div><strong>{formatMoney(row.amount)} · {student?.full_name || "Học viên"}</strong><span>{new Date(row.paid_at).toLocaleString("vi-VN")} · {row.method || "Chưa ghi phương thức"} {row.reference ? `· ${row.reference}` : ""}</span><div className="row-actions payment-actions">{receipt ? <Link className="button button-primary button-small" href={`/finance/receipts/${row.id}`}>In {receipt.receipt_no}</Link> : null}{canManage ? <details className="inline-details"><summary className="button button-ghost button-small">Sửa số tiền / giao dịch</summary><form action={updatePayment} className="inline-edit-form"><input type="hidden" name="payment_id" value={row.id}/><Field label="Số tiền" name="amount" type="number" min="1000" step="1000" defaultValue={row.amount} required/><Field label="Thời điểm" name="paid_at" type="datetime-local" defaultValue={String(row.paid_at).slice(0,16)} required/><Field label="Phương thức" name="method" defaultValue={row.method || ""}/><Field label="Reference" name="reference" defaultValue={row.reference || ""}/><TextAreaField label="Ghi chú" name="note" defaultValue={row.note || ""}/><button className="button button-primary">Lưu · tự cập nhật doanh thu</button></form></details> : null}{canManage&&receipt?<details className="inline-details"><summary className="button button-secondary button-small">Sửa phiếu thu</summary><form action={updateReceiptDetails} className="inline-edit-form"><input type="hidden" name="payment_id" value={row.id}/><Field label="Người nộp" name="payer_name" defaultValue={receipt.payer_name||student?.full_name||""} required/><Field label="Nội dung / gói học" name="package_name" defaultValue={receipt.package_name||account?.package_name||""} required/><Field label="Phương thức hiển thị" name="payment_method" defaultValue={receipt.payment_method||row.method||""}/><Field label="Reference" name="reference" defaultValue={receipt.reference||row.reference||""}/><TextAreaField label="Ghi chú trên phiếu" name="note" defaultValue={receipt.note||row.note||""}/><button className="button button-primary">Lưu phiếu thu</button></form></details>:null}{canManage?<details className="inline-details"><summary className="button button-danger button-small">Xóa</summary><form action={deletePaymentAndReceipt} className="form-stack payment-delete-form"><input type="hidden" name="payment_id" value={row.id}/><TextAreaField label="Lý do xóa giao dịch / phiếu thu" name="reason" required/><div className="finance-delete-warning">Xóa sẽ trừ giao dịch khỏi doanh thu và tính lại công nợ học viên.</div><button className="button button-danger">Xác nhận xóa</button></form></details>:null}</div></div><Status value="Paid"/></div>;
        })}</div> : <Empty title="Chưa có giao dịch" description="Giao dịch mới sẽ tự tạo phiếu thu có thể in."/>}
      </Panel>
      {canManage ? <Panel title="Theo dõi tái phí" description="Lịch liên hệ và kết quả chăm sóc">
        {followups?.length ? <div className="alert-list">{followups.map((row: any) => { const account = joined(row.tuition_accounts); const student = joined(account?.students); return <div className="alert-item" key={row.id}><i/><div><strong>{student?.full_name || "Học viên"} · {account?.package_name}</strong><span>{new Date(row.due_at).toLocaleString("vi-VN")} · {row.note || "Follow-up"}</span><details className="inline-details section-gap"><summary className="button button-ghost">Cập nhật kết quả</summary><form action={updateRenewalFollowup} className="inline-edit-form"><input type="hidden" name="followup_id" value={row.id}/><Field label="Thời hạn" name="due_at" type="datetime-local" defaultValue={String(row.due_at).slice(0,16)} required/><SelectField label="Trạng thái" name="status" defaultValue={row.status} required options={["Pending","Contacted","Call back","Renewed","Not renewing","Closed"].map(v=>({value:v,label:v}))}/><Field label="Kết quả" name="outcome" defaultValue={row.outcome || ""}/><TextAreaField label="Ghi chú" name="note" defaultValue={row.note || ""}/><button className="button button-primary">Lưu follow-up</button></form></details></div><Status value={row.status}/></div>;})}</div> : <Empty title="Chưa có lịch tái phí" description="Tạo follow-up từ nút phía trên."/>}
      </Panel> : <Panel title="Cần hỗ trợ về học phí?" description="Liên hệ CSKH của trung tâm"><div className="note-box">CSKH sẽ hỗ trợ kiểm tra giao dịch, số dư, phiếu thu hoặc ngày tái phí.</div></Panel>}
    </div>
  </>;
}

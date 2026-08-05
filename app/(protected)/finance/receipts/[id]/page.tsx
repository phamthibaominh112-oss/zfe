import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { moneyToVietnameseWords } from "@/lib/money-to-words";
import { createClient } from "@/lib/supabase/server";

function joined(value: unknown): Record<string,any>|null { if(Array.isArray(value))return value[0]||null; return value&&typeof value==="object"?value as Record<string,any>:null; }

export default async function ReceiptPage({ params }: { params: Promise<{id:string}> }) {
  await requireRole(["admin","customer_service","student"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: receipt } = await supabase.from("payment_receipts").select("id,receipt_no,amount,payment_method,reference,note,issued_at,issued_by,status,payer_name,package_name,students(code,full_name,phone,email)").eq("payment_transaction_id",id).maybeSingle();
  if(!receipt) notFound();
  const { data: issuer } = await supabase.from("profiles").select("full_name").eq("id", (receipt as any).issued_by).maybeSingle();
  const student=joined((receipt as any).students);
  const issuedDate=new Date((receipt as any).issued_at);
  return <div className="receipt-page">
    <div className="receipt-toolbar no-print"><Link className="button button-ghost" href="/finance">← Quay lại tài chính</Link><PrintButton/></div>
    <article className="receipt-sheet">
      <header className="receipt-header"><img src="/zest-logo.png" alt="ZEST for English"/><div><strong>ZEST FOR ENGLISH</strong><span>ZE CenterOS · Phiếu thu học phí</span></div></header>
      <div className="receipt-title"><p>PHIẾU THU</p><h1>{(receipt as any).receipt_no}</h1><span>Ngày {issuedDate.toLocaleDateString("vi-VN")} · {issuedDate.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</span></div>
      <section className="receipt-details">
        <div><span>Họ tên người nộp</span><strong>{(receipt as any).payer_name}</strong></div>
        <div><span>Mã học viên</span><strong>{student?.code||"—"}</strong></div>
        <div><span>Nội dung thu</span><strong>Học phí gói {(receipt as any).package_name}</strong></div>
        <div><span>Phương thức</span><strong>{(receipt as any).payment_method||"Chưa cập nhật"}</strong></div>
        <div><span>Mã tham chiếu</span><strong>{(receipt as any).reference||"—"}</strong></div>
        <div><span>Liên hệ</span><strong>{student?.phone||student?.email||"—"}</strong></div>
      </section>
      <section className="receipt-amount"><span>Số tiền</span><strong>{formatMoney((receipt as any).amount)}</strong><p>Bằng chữ: {moneyToVietnameseWords(Number((receipt as any).amount||0))}.</p></section>
      {(receipt as any).note?<div className="receipt-note"><span>Ghi chú</span><p>{(receipt as any).note}</p></div>:null}
      <section className="receipt-signatures"><div><strong>Người nộp tiền</strong><span>Ký và ghi rõ họ tên</span></div><div><strong>Người lập phiếu</strong><span>{issuer?.full_name||"ZE CenterOS"}</span></div></section>
      <footer className="receipt-footer"><span>Phiếu thu được tạo từ ZE CenterOS và lưu trong lịch sử giao dịch.</span><strong>{(receipt as any).status}</strong></footer>
    </article>
  </div>;
}

import Link from "next/link";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions";
import { Empty, Flash, PageHeader, Panel, Status } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id,student_id,kind,title,body,action_url,priority,status,sent_at,read_at,students(code,full_name)")
    .order("sent_at", { ascending: false })
    .limit(100);
  const unread = (notifications || []).filter((item: any) => item.status === "Unread").length;
  const isManager = profile.role === "admin" || profile.role === "customer_service";

  return <>
    <PageHeader
      eyebrow="Thông báo"
      title={isManager ? "Thông báo đã gửi" : "Thông báo của tôi"}
      description={isManager ? "Theo dõi các thông báo học phí, tái phí và chăm sóc đã gửi tới học viên." : "Cập nhật về lịch học, học phí, tái phí và các thông tin quan trọng từ trung tâm."}
      actions={!isManager && unread ? <form action={markAllNotificationsRead}><button className="button button-primary">Đánh dấu tất cả đã đọc</button></form> : undefined}
    />
    <Flash message={params.message} error={params.error || error?.message} />
    <Panel title={`${unread} thông báo chưa đọc`} description={`${notifications?.length || 0} thông báo gần nhất`}>
      {notifications?.length ? <div className="notification-list">
        {notifications.map((item: any) => <article className={`notification-card ${item.status === "Unread" ? "notification-unread" : ""}`} key={item.id}>
          <div className="notification-icon" aria-hidden="true">{item.kind === "payment_received" ? "₫" : item.kind === "renewal_due" ? "↻" : "!"}</div>
          <div className="notification-copy">
            <div className="notification-title-row"><strong>{item.title}</strong><Status value={item.status}/></div>
            {isManager && item.students ? <span className="notification-recipient">{item.students.code} · {item.students.full_name}</span> : null}
            <p>{item.body}</p>
            <small>{new Date(item.sent_at).toLocaleString("vi-VN")}</small>
            <div className="row-actions notification-actions">
              {item.action_url ? <Link className="button button-ghost" href={item.action_url}>Mở chi tiết</Link> : null}
              {!isManager && item.status === "Unread" ? <form action={markNotificationRead}><input type="hidden" name="notification_id" value={item.id}/><input type="hidden" name="return_to" value="/notifications"/><button className="button button-primary">Đã đọc</button></form> : null}
            </div>
          </div>
        </article>)}
      </div> : <Empty title="Chưa có thông báo" description="Thông báo mới từ trung tâm sẽ xuất hiện tại đây." />}
    </Panel>
  </>;
}

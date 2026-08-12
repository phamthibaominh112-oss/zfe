import Link from "next/link";
import { redirect } from "next/navigation";
import {
  adminCreateAccountabilityLog,
  adminReviewStaffDailyLog,
  adminUpdateAccountabilityLog,
  saveStaffDailyLog
} from "@/app/actions";
import { HandbookViewer } from "@/components/handbook-viewer";
import { Field, SelectField, TextAreaField } from "@/components/forms";
import { Empty, Flash, MetricCard, PageHeader, Panel, Status } from "@/components/ui";
import {
  STAFF_OPERATIONS_HANDBOOK_TITLE,
  STAFF_OPERATIONS_HANDBOOK_VERSION,
  staffOperationsHandbookHtml
} from "@/content/handbooks/staff-operations-handbook";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessStaffOps, staffOpsPerson, STAFF_OPS_PEOPLE } from "@/lib/staff-ops";
import { vietnamTodayString } from "@/lib/vietnam-date";
import { formatDate, formatDateTime } from "@/lib/format";

function localTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function roleChecklist(key?: string) {
  if (key === "thinh") return [
    "Check lịch hôm nay + 48 giờ tới.",
    "List lớp chưa confirmed/chưa có next session.",
    "Xử lý toàn bộ yêu cầu đổi/huỷ lịch.",
    "Hỏi Khang nếu cần teacher availability.",
    "Update master schedule ngay khi chốt.",
    "Gửi xác nhận lịch cho HV."
  ];
  if (key === "khang") return [
    "Review GV nghỉ/bận/issue ảnh hưởng lớp.",
    "Phản hồi request GV từ Thịnh.",
    "Review academic complaint mới.",
    "Thực hiện observation/QA theo kế hoạch.",
    "Theo dõi feedback/corrective action GV.",
    "Tiến độ test/học liệu/onboarding."
  ];
  return [
    "Clear lead/inquiry mới.",
    "Follow-up lead đến hạn.",
    "Update CRM/data quan trọng.",
    "Review placement + reminders.",
    "Route complaint đúng owner.",
    "Đối soát phí + task thi thử."
  ];
}

function managerStatusTone(status?: string) {
  return status === "Reviewed" ? "green" : status === "Needs follow-up" ? "red" : "blue";
}

export default async function StaffOperationsPage({
  searchParams
}: {
  searchParams: Promise<Record<string,string|undefined>>
}) {
  const profile = await requireProfile();
  if (!canAccessStaffOps(profile)) redirect("/dashboard?error=forbidden");

  const params = await searchParams;
  const supabase = await createClient();
  const today = vietnamTodayString();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? String(params.date) : today;
  const person = staffOpsPerson(profile.email);
  const isAdmin = profile.role === "admin";

  if (isAdmin) {
    const [{ data: logs }, { data: accountability }] = await Promise.all([
      supabase.from("staff_daily_logs")
        .select("*")
        .order("work_date",{ascending:false})
        .order("updated_at",{ascending:false})
        .limit(60),
      supabase.from("staff_accountability_logs")
        .select("*")
        .order("incident_date",{ascending:false})
        .order("created_at",{ascending:false})
        .limit(50)
    ]);

    const todayLogs = (logs || []).filter((x:any)=>x.work_date===today);
    const submittedEmails = new Set(todayLogs.filter((x:any)=>x.status==="Submitted").map((x:any)=>String(x.staff_email).toLowerCase()));
    const missing = STAFF_OPS_PEOPLE.filter((x)=>!submittedEmails.has(x.email));
    const drafts = (logs||[]).filter((x:any)=>x.status==="Draft").length;
    const followups = (logs||[]).filter((x:any)=>x.manager_status==="Needs follow-up").length;
    const openAccountability = (accountability||[]).filter((x:any)=>x.status!=="Closed").length;

    return <>
      <PageHeader
        eyebrow="Staff Operations Control"
        title="Manager Review · Khang · Thịnh · Mai"
        description="Admin xem toàn bộ Daily Work Log, trạng thái nộp, case cần follow-up và Accountability Log của back-office."
        actions={<Link className="button button-secondary" href="#handbook">Mở Handbook ↓</Link>}
      />
      <Flash message={params.message} error={params.error}/>

      <div className="staff-ops-access-banner admin">
        <strong>Quyền truy cập giới hạn</strong>
        <span>Nhân sự được dùng module: Khang Academic · Thịnh Academic · Mai/Student Care. Admin xem toàn bộ để quản lý và kiểm soát.</span>
      </div>

      <div className="metrics-grid">
        <MetricCard label="Daily Log hôm nay" value={`${submittedEmails.size}/3`} note={missing.length ? `Chưa nộp: ${missing.map(x=>x.name).join(", ")}` : "Đủ 3/3"} tone={missing.length ? "yellow" : "green"}/>
        <MetricCard label="Đang lưu nháp" value={drafts} note="Trong lịch sử gần nhất" />
        <MetricCard label="Cần follow-up" value={followups} note="Manager Review" tone={followups ? "red" : "green"}/>
        <MetricCard label="Accountability mở" value={openAccountability} note="Open / Monitoring" tone={openAccountability ? "yellow" : "green"}/>
      </div>

      <Panel className="section-gap" title="Daily Work Logs" description="Admin thấy đầy đủ log đã lưu/nộp. Review trực tiếp trên từng log.">
        {(logs||[]).length ? <div className="staff-log-manager-list">{(logs||[]).map((row:any)=><article className="staff-log-manager-card" key={row.id}>
          <div className="staff-log-manager-head">
            <div><strong>{row.staff_name} · {formatDate(row.work_date)}</strong><span>{row.staff_email}</span></div>
            <div className="staff-log-statuses"><Status value={row.status}/><span className={`staff-manager-pill ${managerStatusTone(row.manager_status)}`}>{row.manager_status}</span></div>
          </div>
          <div className="staff-log-clock"><span>Check-in <b>{row.check_in_actual || "—"}</b></span><span>Check-out <b>{row.check_out_actual || "—"}</b></span><span>Nộp <b>{formatDateTime(row.submitted_at)}</b></span></div>
          <div className="staff-log-outcomes">
            <div><small>Outcome 1</small><p>{row.outcome_1 || "—"}</p></div>
            <div><small>Outcome 2</small><p>{row.outcome_2 || "—"}</p></div>
            <div><small>Outcome 3</small><p>{row.outcome_3 || "—"}</p></div>
          </div>
          <div className="staff-log-detail-grid">
            <div><small>Đã hoàn thành</small><p>{row.completed_today || "—"}</p></div>
            <div><small>Việc mở / rủi ro / handover</small><p>{row.open_risks_handover || "—"}</p></div>
            <div><small>Delay / SLA breach</small><p>{row.delay_sla_breach || "Không ghi nhận"}</p></div>
            <div><small>3 ưu tiên ngày mai</small><p>{row.tomorrow_priorities || "—"}</p></div>
          </div>
          <form action={adminReviewStaffDailyLog} className="staff-manager-review-form">
            <input type="hidden" name="log_id" value={row.id}/>
            <SelectField label="Manager status" name="manager_status" defaultValue={row.manager_status} options={[
              {value:"Pending",label:"Pending"},
              {value:"Reviewed",label:"Reviewed"},
              {value:"Needs follow-up",label:"Needs follow-up"}
            ]}/>
            <TextAreaField label="Manager note" name="manager_note" defaultValue={row.manager_note||""} placeholder="Feedback, owner, deadline, điểm cần follow-up..."/>
            <button className="button button-primary">Lưu Manager Review</button>
          </form>
        </article>)}</div> : <Empty title="Chưa có Daily Work Log" description="Khang, Thịnh và Mai chưa lưu log vào database."/>}
      </Panel>

      <Panel className="section-gap" title="Accountability Log" description="Theo handbook: Manager chỉ log khi lỗi có ảnh hưởng thực tế hoặc lặp lại.">
        <form action={adminCreateAccountabilityLog} className="staff-accountability-form">
          <Field label="Ngày" name="incident_date" type="date" required defaultValue={today}/>
          <SelectField label="Nhân sự" name="staff_email" required options={STAFF_OPS_PEOPLE.map((x)=>({value:x.email,label:`${x.name} · ${x.title}`}))}/>
          <SelectField label="Level" name="severity" required options={[
            {value:"Level 1",label:"Level 1 · Nhắc nhở"},
            {value:"Level 2",label:"Level 2 · Performance issue"},
            {value:"Level 3",label:"Level 3 · Serious"}
          ]}/>
          <Field label="Deadline corrective action" name="deadline" type="date"/>
          <TextAreaField label="Lỗi / sự cố" name="incident" required placeholder="Mô tả factual, tránh đánh giá cảm tính."/>
          <TextAreaField label="Ảnh hưởng" name="impact" placeholder="Ảnh hưởng HV/lớp/data/SLA..."/>
          <TextAreaField label="Corrective action" name="corrective_action" placeholder="Ai làm gì, khi nào hoàn thành?"/>
          <TextAreaField label="Manager note" name="manager_note"/>
          <button className="button button-primary">Ghi Accountability Log</button>
        </form>

        {(accountability||[]).length ? <div className="accountability-db-list">{(accountability||[]).map((row:any)=><article className={`accountability-db-card ${String(row.severity).toLowerCase().replaceAll(" ","-")}`} key={row.id}>
          <div className="accountability-db-head"><div><strong>{row.staff_name} · {row.severity}</strong><span>{formatDate(row.incident_date)} · {row.staff_email}</span></div><Status value={row.status}/></div>
          <p><b>Sự cố:</b> {row.incident}</p>
          <p><b>Ảnh hưởng:</b> {row.impact || "—"}</p>
          <form action={adminUpdateAccountabilityLog} className="staff-accountability-update">
            <input type="hidden" name="accountability_id" value={row.id}/>
            <SelectField label="Status" name="status" defaultValue={row.status} options={[
              {value:"Open",label:"Open"},
              {value:"Monitoring",label:"Monitoring"},
              {value:"Closed",label:"Closed"}
            ]}/>
            <Field label="Deadline" name="deadline" type="date" defaultValue={row.deadline||""}/>
            <TextAreaField label="Corrective action" name="corrective_action" defaultValue={row.corrective_action||""}/>
            <TextAreaField label="Manager note" name="manager_note" defaultValue={row.manager_note||""}/>
            <button className="button button-secondary">Cập nhật</button>
          </form>
        </article>)}</div> : <Empty title="Chưa có Accountability Log" description="Chưa có issue nào được Manager ghi nhận."/>}
      </Panel>

      <div id="handbook"/>
      <Panel className="section-gap staff-handbook-panel" title={`${STAFF_OPERATIONS_HANDBOOK_TITLE} v${STAFF_OPERATIONS_HANDBOOK_VERSION}`} description="Bản handbook nội bộ được lưu cùng ZE CenterOS.">
        <div id="handbook"/>
        <HandbookViewer
          html={staffOperationsHandbookHtml}
          title="Zest for English · Staff Operations Handbook"
          subtitle="Clear roles · Clear ownership · Daily Work Log · Accountability · Manager Review"
          frameTitle="Zest for English Staff Operations Handbook"
        />
      </Panel>
    </>;
  }

  if (!person) redirect("/dashboard?error=forbidden");

  const [{ data: existingLog }, { data: workSchedules }, { data: recentLogs }] = await Promise.all([
    supabase.from("staff_daily_logs").select("*").eq("user_id",profile.id).eq("work_date",selectedDate).maybeSingle(),
    supabase.from("staff_work_schedules")
      .select("id,work_date,start_time,end_time,staff_work_logs(check_in_at,check_out_at,status)")
      .eq("user_id",profile.id).eq("work_date",selectedDate).order("start_time"),
    supabase.from("staff_daily_logs").select("id,work_date,status,submitted_at,manager_status,manager_note,updated_at").eq("user_id",profile.id).order("work_date",{ascending:false}).limit(10)
  ]);

  const workLogs=(workSchedules||[]).flatMap((s:any)=>s.staff_work_logs||[]);
  const checkins=workLogs.map((x:any)=>x.check_in_at).filter(Boolean).sort();
  const checkouts=workLogs.map((x:any)=>x.check_out_at).filter(Boolean).sort();
  const actualIn=checkins.length?localTime(checkins[0]):"";
  const actualOut=checkouts.length?localTime(checkouts[checkouts.length-1]):"";
  const checklist=roleChecklist(person.roleKey);

  return <>
    <PageHeader
      eyebrow="Staff Operations"
      title={`${person.name} · ${person.title}`}
      description="Handbook + Daily Work Log chính thức. Log được lưu vào ZE CenterOS database và Admin có thể review."
      actions={<Link className="button button-secondary" href="#handbook">Mở Handbook ↓</Link>}
    />
    <Flash message={params.message} error={params.error}/>

    <div className="staff-ops-access-banner">
      <strong>Private Back-office Workspace</strong>
      <span>Chỉ Khang · Thịnh · Mai và Admin được truy cập. Giáo viên không thấy module này.</span>
    </div>

    <Panel className="section-gap" title="Checklist đúng vai trò hôm nay" description="Nhìn đúng vùng trách nhiệm của mình trước khi bắt đầu ca.">
      <div className="staff-role-checklist">{checklist.map((item,i)=><div key={item}><span>{String(i+1).padStart(2,"0")}</span><p>{item}</p></div>)}</div>
    </Panel>

    <Panel className="section-gap staff-daily-log-panel" title="Daily Work Log" description="Một log/người/ngày. Có thể lưu nháp trong ca và Nộp cuối ca khi đã đóng vòng công việc.">
      <form className="staff-date-filter" method="get">
        <label>Ngày làm việc<input type="date" name="date" defaultValue={selectedDate}/></label>
        <button className="button button-secondary">Mở ngày</button>
      </form>

      <div className="staff-clock-summary">
        <div><span>Check-in thực tế</span><strong>{actualIn || "Chưa check-in"}</strong></div>
        <div><span>Check-out thực tế</span><strong>{actualOut || "Chưa check-out"}</strong></div>
        <div><span>Trạng thái log</span><Status value={existingLog?.status || "Draft"}/></div>
        <div><span>Manager review</span><strong>{existingLog?.manager_status || "Pending"}</strong></div>
      </div>

      {existingLog?.manager_note ? <div className="staff-manager-feedback"><strong>Manager feedback</strong><p>{existingLog.manager_note}</p></div> : null}

      <form action={saveStaffDailyLog} className="staff-daily-log-form">
        <input type="hidden" name="work_date" value={selectedDate}/>
        <input type="hidden" name="check_in_actual" value={actualIn}/>
        <input type="hidden" name="check_out_actual" value={actualOut}/>
        <div className="staff-outcome-grid">
          <TextAreaField label="Outcome 1 hôm nay" name="outcome_1" required defaultValue={existingLog?.outcome_1||""} placeholder="Kết quả phải đạt, không chỉ ghi tên task."/>
          <TextAreaField label="Outcome 2 hôm nay" name="outcome_2" required defaultValue={existingLog?.outcome_2||""}/>
          <TextAreaField label="Outcome 3 hôm nay" name="outcome_3" required defaultValue={existingLog?.outcome_3||""}/>
        </div>
        <div className="staff-log-two-col">
          <TextAreaField label="Đã hoàn thành hôm nay" name="completed_today" required defaultValue={existingLog?.completed_today||""} placeholder="Việc + kết quả + evidence/link nếu có."/>
          <TextAreaField label="Việc còn mở / rủi ro / handover" name="open_risks_handover" defaultValue={existingLog?.open_risks_handover||""} placeholder="Case | Status | Next action | Owner | Deadline"/>
          <TextAreaField label="Delay / SLA breach (nếu có)" name="delay_sla_breach" defaultValue={existingLog?.delay_sla_breach||""} placeholder="Vì sao trễ? Ảnh hưởng? Cách khắc phục?"/>
          <TextAreaField label="3 ưu tiên cho ngày mai" name="tomorrow_priorities" required defaultValue={existingLog?.tomorrow_priorities||""}/>
        </div>
        <div className="staff-log-actions">
          <button className="button button-secondary" name="submit_mode" value="draft">Lưu nháp</button>
          <button className="button button-primary" name="submit_mode" value="submit">Nộp Daily Log cuối ca</button>
        </div>
      </form>
    </Panel>

    <Panel className="section-gap" title="Lịch sử log của tôi" description="Xem trạng thái nộp và Manager Review gần nhất.">
      {(recentLogs||[]).length?<div className="staff-log-history">{(recentLogs||[]).map((row:any)=><Link href={`/staff-ops?date=${row.work_date}`} key={row.id}><div><strong>{formatDate(row.work_date)}</strong><span>Cập nhật {formatDateTime(row.updated_at)}</span></div><div><Status value={row.status}/><span className={`staff-manager-pill ${managerStatusTone(row.manager_status)}`}>{row.manager_status}</span></div></Link>)}</div>:<Empty title="Chưa có lịch sử" description="Daily Work Log đầu tiên sẽ xuất hiện tại đây sau khi lưu."/>}
    </Panel>

    <div id="handbook"/>
    <Panel className="section-gap staff-handbook-panel" title={`${STAFF_OPERATIONS_HANDBOOK_TITLE} v${STAFF_OPERATIONS_HANDBOOK_VERSION}`} description="Bản handbook nội bộ được embed trực tiếp trong ZE CenterOS, không cần mở file ngoài.">
      <HandbookViewer
        html={staffOperationsHandbookHtml}
        title="Zest for English · Staff Operations Handbook"
        subtitle={`${person.name} · ${person.title} · Daily Work Log · Accountability`}
        frameTitle="Zest for English Staff Operations Handbook"
      />
    </Panel>
  </>;
}

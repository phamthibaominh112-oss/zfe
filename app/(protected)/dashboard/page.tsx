import { rateTeacher, submitAssignment } from "@/app/actions";
import Link from "next/link";
import { PageHeader, MetricCard, Panel, Status, Flash, Empty } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import { dateOnlyString, vietnamTodayDate, vietnamTodayString } from "@/lib/vietnam-date";

function weekRange() {
  const now = vietnamTodayDate();
  const day = now.getUTCDay() || 7;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [dateOnlyString(start), dateOnlyString(end)];
}

function joinedClass(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;
  const [weekStart, weekEnd] = weekRange();

  if (profile.role === "admin" || profile.role === "academic_manager") {
    const [students, classes, sessions, pendingFeedback, observations] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("status", "Active").is("archived_at", null),
      supabase.from("sessions").select("id,class_id,scheduled_date,start_time,status,classes(code,name)").gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd).order("scheduled_date").limit(12),
      supabase.from("progress_feedback").select("id,enrollment_id,milestone,status", { count: "exact" }).eq("status", "Submitted").limit(8),
      supabase.from("teacher_observations").select("id,total_score,status,teachers(full_name),created_at").order("created_at", { ascending: false }).limit(6)
    ]);
    return <>
      <PageHeader eyebrow="Academic control center" title={`Chào ${profile.full_name}`} description="Tổng quan vận hành theo dữ liệu thật. Các số liệu dưới đây được lọc bởi Supabase RLS theo role hiện tại." actions={<Link className="button button-primary" href="/schedule">Mở lịch tuần</Link>} />
      <Flash message={params.message} error={params.error} />
      <div className="metrics-grid">
        <MetricCard label="Học viên hiện có" value={students.count || 0} note="Không gồm hồ sơ đã archive" />
        <MetricCard label="Lớp active" value={classes.count || 0} note="ZE, ZK, B2B và các category khác" tone="green" />
        <MetricCard label="Session tuần này" value={sessions.data?.length || 0} note={`${formatDate(weekStart)} – ${formatDate(weekEnd)}`} tone="yellow" />
        <MetricCard label="Feedback chờ duyệt" value={pendingFeedback.count || 0} note="30% · 50% · 70% · 100%" tone={(pendingFeedback.count || 0) > 0 ? "red" : "neutral"} />
      </div>
      <div className="grid-2">
        <Panel title="Lịch vận hành tuần" description="Các session sắp diễn ra trong tuần hiện tại">
          {sessions.data?.length ? <div className="alert-list">{sessions.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>{item.classes?.code} · {item.classes?.name}</strong><span>{formatDate(item.scheduled_date)} · {item.start_time?.slice(0,5)}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Chưa có session" description="Tạo session tại Lịch & Matching." />}
        </Panel>
        <Panel title="Teacher quality gần đây" description="Observation chỉ hiển thị cho Academic và Admin">
          {observations.data?.length ? <div className="alert-list">{observations.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>{item.teachers?.full_name || "Giáo viên"}</strong><span>Điểm: {item.total_score ?? "Chưa chấm"}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Chưa có observation" description="Tạo observation tại Teacher Quality." />}
        </Panel>
      </div>
    </>;
  }

  if (profile.role === "teacher") {
    const { data: teacher } = await supabase.from("teachers").select("id,full_name").eq("user_id", profile.id).single();
    const { data: assignments } = teacher ? await supabase.from("class_teachers").select("class_id,classes(id,code,name,status)").eq("teacher_id", teacher.id) : { data: [] as any[] };
    const classIds = (assignments || []).map((x: any) => x.class_id);
    const [sessions, hours, feedback, observations] = await Promise.all([
      classIds.length ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,classes(code,name)").in("class_id", classIds).gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd).order("scheduled_date") : Promise.resolve({ data: [] as any[] }),
      teacher ? supabase.from("teacher_monthly_hours").select("completed_hours").eq("teacher_id", teacher.id).eq("month", new Date().toISOString().slice(0,7) + "-01").maybeSingle() : Promise.resolve({ data: null as any }),
      supabase.from("progress_feedback").select("id,status,milestone,enrollments(students(full_name),classes(code))").eq("submitted_by", profile.id).order("updated_at", { ascending: false }).limit(8),
      teacher ? supabase.from("teacher_observations").select("id,total_score,status,strengths,areas_to_improve,shared_at").eq("teacher_id", teacher.id).order("created_at", { ascending: false }).limit(4) : Promise.resolve({ data: [] as any[] })
    ]);
    return <>
      <PageHeader eyebrow="Teacher workspace" title={`Lịch dạy của ${profile.full_name}`} description="Bạn chỉ thấy lớp, session, học viên và đánh giá có liên quan trực tiếp đến tài khoản giáo viên của mình." actions={<Link className="button button-primary" href="/schedule">Đăng ký lịch rảnh</Link>} />
      <Flash message={params.message} error={params.error} />
      <div className="metrics-grid">
        <MetricCard label="Lớp đang phụ trách" value={classIds.length} />
        <MetricCard label="Buổi trong tuần" value={sessions.data?.length || 0} tone="yellow" />
        <MetricCard label="Giờ đã hoàn thành tháng" value={`${Number(hours.data?.completed_hours || 0).toLocaleString("vi-VN")}h`} tone="green" />
        <MetricCard label="Feedback đang xử lý" value={feedback.data?.filter((x: any) => x.status !== "Published").length || 0} tone="red" />
      </div>
      <div className="grid-2">
        <Panel title="Weekly teaching plan" description={`${formatDate(weekStart)} – ${formatDate(weekEnd)}`}>
          {sessions.data?.length ? <div className="alert-list">{sessions.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>{item.classes?.code} · Session {item.session_no}</strong><span>{formatDate(item.scheduled_date)} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Tuần này chưa có lịch" description="Liên hệ học vụ nếu lịch chưa được phân công." />}
        </Panel>
        <Panel title="Đánh giá định kỳ của tôi" description="Chỉ observation đã được Academic share mới xuất hiện">
          {observations.data?.length ? <div className="alert-list">{observations.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>Observation · {item.total_score ?? "Chưa có điểm"}</strong><span>{item.strengths || "Chưa có nhận xét"}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Chưa có đánh giá được chia sẻ" description="Dữ liệu observation của giáo viên khác không thể truy cập." />}
        </Panel>
      </div>
    </>;
  }

  if (profile.role === "customer_service") {
    const today = new Date().toISOString().slice(0,10);
    const next14 = new Date(Date.now() + 14*86400000).toISOString().slice(0,10);
    const [students, accounts, renewals, followups] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("tuition_accounts").select("id,balance_amount,renewal_due_date,status,students(full_name,code)").order("renewal_due_date").limit(12),
      supabase.from("tuition_accounts").select("id", { count: "exact", head: true }).gte("renewal_due_date", today).lte("renewal_due_date", next14),
      supabase.from("renewal_followups").select("id,due_at,status,note,tuition_accounts(students(full_name,code))").eq("status", "Pending").order("due_at").limit(8)
    ]);
    const outstanding = (accounts.data || []).reduce((sum: number, x: any) => sum + Number(x.balance_amount || 0), 0);
    return <>
      <PageHeader eyebrow="Customer success & finance" title="CSKH Operations" description="Chỉ gồm hồ sơ, học phí, giao dịch và tái phí. Role CSKH không được truy cập điểm thi, feedback học thuật hoặc observation giáo viên." actions={<Link className="button button-primary" href="/finance">Mở Renewal Pipeline</Link>} />
      <Flash message={params.message} error={params.error} />
      <div className="metrics-grid">
        <MetricCard label="Hồ sơ học viên" value={students.count || 0} />
        <MetricCard label="Tái phí trong 14 ngày" value={renewals.count || 0} tone="yellow" />
        <MetricCard label="Công nợ trong danh sách" value={formatMoney(outstanding)} tone="red" />
        <MetricCard label="Follow-up pending" value={followups.data?.length || 0} tone="green" />
      </div>
      <Panel title="Follow-up cần xử lý" description="Danh sách được phân theo thời hạn">
        {followups.data?.length ? <div className="alert-list">{followups.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>{item.tuition_accounts?.students?.full_name || "Học viên"}</strong><span>{item.note || "Renewal follow-up"} · {new Date(item.due_at).toLocaleString("vi-VN")}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Không có follow-up pending" description="Tạo task mới trong Học phí & CSKH." />}
      </Panel>
    </>;
  }

  const { data: student } = await supabase.from("students").select("id,full_name,code,target,entry_level").eq("user_id", profile.id).single();
  if (!student) return <><PageHeader eyebrow="Student portal" title="Hồ sơ chưa được liên kết" description="Admin cần liên kết user account với student profile trước khi sử dụng." /><div className="message error">Không tìm thấy student profile cho tài khoản này.</div></>;

  const today = vietnamTodayString();
  const { data: enrollments } = await supabase.from("enrollments").select("id,class_id,status,start_date,end_date,classes(id,code,name,total_sessions,target,status,start_date,expected_end_date)").eq("student_id", student.id).is("archived_at", null);
  const classIds = (enrollments || []).map((x: any) => x.class_id);
  const activeEnrollments = (enrollments || []).filter((item: any) => {
    const classRow = joinedClass(item.classes);
    return item.status === "Active" || ["Active", "Ready", "Paused"].includes(String(classRow?.status || ""));
  });
  const completedEnrollments = (enrollments || []).filter((item: any) => {
    const classRow = joinedClass(item.classes);
    return item.status === "Completed" || ["Completed", "Closed"].includes(String(classRow?.status || ""));
  });

  const [upcomingSessions, recentSessions, tuition, feedback, assignments, recentAttendance, myRatings] = await Promise.all([
    classIds.length ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,classes(code,name)").in("class_id", classIds).gte("scheduled_date", today).is("archived_at", null).order("scheduled_date").order("start_time").limit(8) : Promise.resolve({ data: [] as any[] }),
    classIds.length ? supabase.from("sessions").select("id,class_id,session_no,scheduled_date,start_time,end_time,status,classes(code,name)").in("class_id", classIds).lt("scheduled_date", today).is("archived_at", null).order("scheduled_date", { ascending: false }).order("start_time", { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
    supabase.from("tuition_accounts").select("id,package_name,balance_amount,renewal_due_date,status").eq("student_id", student.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("progress_feedback").select("id,milestone,strengths,areas_to_improve,current_performance,recommendation,status,published_at,enrollments!inner(student_id,classes(code,name))").eq("enrollments.student_id", student.id).eq("status", "Published").order("published_at", { ascending: false }).limit(4),
    classIds.length ? supabase.from("assignments").select("id,title,due_at,max_score,class_id,classes(code),assignment_submissions(id,status,score,student_id)").in("class_id", classIds).not("published_at", "is", null).order("due_at").limit(8) : Promise.resolve({ data: [] as any[] }),
    supabase.from("attendance").select("session_id,status,sessions(id,session_no,scheduled_date,class_id,classes(code,name),session_teachers(teachers(id,full_name)))").eq("student_id", student.id).in("status", ["Present","Late","Joined partially"]).order("marked_at", { ascending: false }).limit(12),
    supabase.from("teacher_ratings").select("id,session_id,teacher_id,overall").eq("student_id", student.id)
  ]);

  return <>
    <PageHeader eyebrow="Student portal" title={`Xin chào ${student.full_name}`} description="Bạn chỉ có thể xem hồ sơ, lớp học, kết quả, feedback và học phí thuộc chính mình." />
    <Flash message={params.message} error={params.error} />
    <div className="metrics-grid">
      <MetricCard label="Lớp đang học" value={activeEnrollments.length} note={`${completedEnrollments.length} lớp đã hoàn thành`} />
      <MetricCard label="Buổi sắp tới" value={upcomingSessions.data?.length || 0} tone="yellow" />
      <MetricCard label="Feedback đã publish" value={feedback.data?.length || 0} tone="green" />
      <MetricCard label="Học phí còn lại" value={formatMoney((tuition.data || []).reduce((s: number,x: any)=>s+Number(x.balance_amount||0),0))} tone="red" />
    </div>
    <div className="grid-2">
      <Panel title="Lịch học sắp tới" description="Theo session">
        {upcomingSessions.data?.length ? <div className="alert-list">{upcomingSessions.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>{joinedClass(item.classes)?.code} · Session {item.session_no}</strong><span>{formatDate(item.scheduled_date)} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Chưa có lịch sắp tới" description={completedEnrollments.length ? "Các lớp hiện có đã kết thúc. Lịch mới sẽ xuất hiện khi bạn được enroll vào lớp active." : "Lịch mới sẽ xuất hiện sau khi học vụ tạo session."} />}
      </Panel>
      <Panel title="Bài tập cần xử lý" description="Upload file trực tiếp theo assignment">
        {assignments.data?.length ? <div className="alert-list">{assignments.data.map((item: any) => { const own = (item.assignment_submissions || []).find((x: any)=>x.student_id===student.id); return <div className="alert-item" key={item.id}><i /><div><strong>{joinedClass(item.classes)?.code} · {item.title}</strong><span>Hạn: {item.due_at ? new Date(item.due_at).toLocaleString("vi-VN") : "Không giới hạn"}</span>{(!own || own.status === "Revision required") ? <form action={submitAssignment} className="inline-form section-gap"><input type="hidden" name="assignment_id" value={item.id}/><input className="input" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx" required/><button className="button button-secondary">Nộp bài</button></form> : own.score != null ? <span>Điểm: {own.score}/{item.max_score}</span> : null}</div><Status value={own?.status || "Not submitted"} /></div>; })}</div> : <Empty title="Chưa có assignment" description="Workbook cũ không có dữ liệu bài tập; bài mới do giáo viên publish sẽ hiển thị tại đây." />}
      </Panel>
    </div>
    <Panel className="section-gap" title="Lịch sử buổi học gần đây" description="Hiển thị cả buổi completed, cancelled và rescheduled">
      {recentSessions.data?.length ? <div className="alert-list">{recentSessions.data.map((item: any) => <div className="alert-item" key={item.id}><i /><div><strong>{joinedClass(item.classes)?.code} · Session {item.session_no}</strong><span>{formatDate(item.scheduled_date)} · {item.start_time?.slice(0,5)}–{item.end_time?.slice(0,5)}</span></div><Status value={item.status} /></div>)}</div> : <Empty title="Chưa có lịch sử session" description="Khi lớp phát sinh session, lịch sử sẽ xuất hiện ở đây." />}
    </Panel>
    <Panel className="section-gap" title="Đánh giá giáo viên sau buổi học" description="Chỉ buổi có attendance Present, Late hoặc Joined partially mới được rate">
      {recentAttendance.data?.length ? <div className="alert-list">{recentAttendance.data.map((record:any) => { const session = record.sessions; const teachers = session?.session_teachers || []; return teachers.map((link:any) => { const teacher = link.teachers; if (!teacher) return null; const existing = (myRatings.data || []).find((rating:any) => rating.session_id === record.session_id && rating.teacher_id === teacher.id); return <div className="alert-item" key={`${record.session_id}-${teacher.id}`}><i/><div><strong>{session?.classes?.code} · #{session?.session_no} · {teacher.full_name}</strong><span>{formatDate(session?.scheduled_date)} · Attendance {record.status}</span>{!existing ? <form action={rateTeacher} className="inline-form section-gap"><input type="hidden" name="session_id" value={record.session_id}/><input type="hidden" name="teacher_id" value={teacher.id}/>{["overall","clarity","engagement","supportiveness","pace"].map((name)=><label className="form-group" key={name}><span>{name}</span><select className="select" name={name} defaultValue="5" required>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}<input className="input" name="comment" placeholder="Nhận xét (không bắt buộc)"/><button className="button button-secondary">Gửi rating</button></form> : <span>Đã đánh giá: {existing.overall}/5</span>}</div><Status value={existing ? "Submitted" : "Pending"}/></div>; }); })}</div> : <Empty title="Chưa có buổi đủ điều kiện đánh giá" description="Workbook lịch cũ không chứa attendance; rating sẽ mở sau khi giáo viên điểm danh trong hệ thống."/>}
    </Panel>
  </>;
}

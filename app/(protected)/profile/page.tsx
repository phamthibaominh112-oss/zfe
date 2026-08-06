import { updateOwnProfile } from "@/app/actions";
import { Field, FormGrid } from "@/components/forms";
import { Flash, PageHeader, Panel, Status } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: teacher } = profile.role === "teacher" ? await supabase.from("teachers").select("id,code,full_name,email,phone,employment_status,specialization,teacher_compensation_settings(hourly_rate,effective_from)").eq("user_id", profile.id).maybeSingle() : { data: null };
  const { data: student } = profile.role === "student" ? await supabase.from("students").select("id,code,full_name,email,phone,status,entry_level,target").eq("user_id", profile.id).maybeSingle() : { data: null };

  return <>
    <PageHeader eyebrow="Tài khoản" title="Hồ sơ tài khoản" description="Cập nhật tên hiển thị và xem thông tin hồ sơ được liên kết với tài khoản."/>
    <Flash message={params.message} error={params.error}/>
    <div className="grid-2">
      <Panel title="Thông tin đăng nhập" description="Thông tin tài khoản đang sử dụng">
        <div className="profile-grid">
          <div className="profile-item"><span>Họ tên</span><strong>{profile.full_name}</strong></div>
          <div className="profile-item"><span>Role</span><strong>{ROLE_LABELS[profile.role]}</strong></div>
          <div className="profile-item"><span>Trạng thái</span><Status value={profile.is_active ? "Active" : "Disabled"}/></div>
          <div className="profile-item"><span>Phạm vi</span><strong>{ROLE_DESCRIPTIONS[profile.role]}</strong></div>
        </div>
      </Panel>
      <Panel title="Cập nhật tên hiển thị" description="RPC bảo mật không cho phép người dùng sửa role">
        <form action={updateOwnProfile}><FormGrid><Field label="Tên hiển thị" name="full_name" defaultValue={profile.full_name} required/><div className="form-actions"><button className="button button-primary">Lưu thay đổi</button></div></FormGrid></form>
      </Panel>
    </div>
    {teacher ? <Panel title="Hồ sơ giáo viên" description="Thông tin nghề nghiệp và đơn giá hiện hành của tài khoản này" className="section-gap"><div className="profile-grid"><div className="profile-item"><span>Mã GV</span><strong>{teacher.code}</strong></div><div className="profile-item"><span>Loại hợp đồng</span><strong>{teacher.employment_status || "—"}</strong></div><div className="profile-item"><span>Đơn giá giờ dạy</span><strong>{Number((Array.isArray(teacher.teacher_compensation_settings) ? teacher.teacher_compensation_settings[0]?.hourly_rate : teacher.teacher_compensation_settings?.hourly_rate) || 0).toLocaleString("vi-VN")} đ</strong></div><div className="profile-item"><span>Chuyên môn</span><strong>{(teacher.specialization || []).join(", ") || "—"}</strong></div></div></Panel> : null}
    {student ? <Panel title="Hồ sơ học viên" description="Thông tin học tập gắn với tài khoản này" className="section-gap"><div className="profile-grid"><div className="profile-item"><span>Mã học viên</span><strong>{student.code}</strong></div><div className="profile-item"><span>Trạng thái</span><Status value={student.status}/></div><div className="profile-item"><span>Trình độ đầu vào</span><strong>{student.entry_level || "—"}</strong></div><div className="profile-item"><span>Mục tiêu</span><strong>{student.target || "—"}</strong></div></div></Panel> : null}
  </>;
}

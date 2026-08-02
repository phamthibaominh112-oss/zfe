import { adminCreateUser, adminUpdateUser } from "@/app/actions";
import { Field, FormGrid, SelectField } from "@/components/forms";
import { Empty, Flash, FormDetails, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS, ROLES, type AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: auditLogs }, { data: unlinkedStudents }, { data: unlinkedTeachers }, authResult] = await Promise.all([
    supabase.from("profiles").select("id,full_name,role,is_active,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("id,actor_id,action,table_name,record_id,created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("students").select("id,code,full_name,email").is("user_id", null).is("archived_at", null).order("full_name"),
    admin.from("teachers").select("id,code,full_name,email").is("user_id", null).is("archived_at", null).order("full_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);
  const authById = new Map<string, any>((authResult.data?.users || []).map((user: any) => [user.id, user]));
  const roleOptions = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

  const actions = <FormDetails title="Tạo tài khoản thật">
    <form action={adminCreateUser}><FormGrid>
      <Field label="Họ tên" name="full_name" required />
      <Field label="Email đăng nhập" name="email" type="email" required />
      <Field label="Mật khẩu tạm" name="password" type="password" min="8" required />
      <SelectField label="Role" name="role" required options={roleOptions} />
      <SelectField label="Liên kết student profile có sẵn" name="link_student_id" options={(unlinkedStudents || []).map((row:any)=>({value:row.id,label:`${row.code} · ${row.full_name}`}))} />
      <SelectField label="Liên kết teacher profile có sẵn" name="link_teacher_id" options={(unlinkedTeachers || []).map((row:any)=>({value:row.id,label:`${row.code} · ${row.full_name}`}))} />
      <div className="note-box form-span-2">Chỉ chọn profile liên kết phù hợp với role. Để trống nếu muốn hệ thống tạo profile mới.</div>
      <div className="form-actions"><button className="button button-primary">Tạo user</button></div>
    </FormGrid></form>
  </FormDetails>;

  return <>
    <PageHeader eyebrow="Administration" title="Users & Roles" description="Không có role switcher giả lập. Mỗi người dùng đăng nhập bằng Supabase Auth và chỉ nhận dữ liệu được RLS cho phép. Chỉ Admin có trang này." actions={actions}/>
    <Flash message={params.message} error={params.error || error?.message || authResult.error?.message}/>
    <Panel title="User directory" description={`${profiles?.length || 0} tài khoản trong hệ thống`}>
      {profiles?.length ? <div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Email</th><th>Role hiện tại</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Cập nhật quyền</th></tr></thead><tbody>
        {profiles.map((row: any) => {
          const authUser = authById.get(row.id);
          return <tr key={row.id}>
            <td><strong>{row.full_name}</strong><br/><span className="muted">{row.id.slice(0, 8)}…</span></td>
            <td>{authUser?.email || "—"}</td>
            <td><span className="chip chip-blue">{ROLE_LABELS[row.role as AppRole]}</span></td>
            <td><Status value={row.is_active ? "Active" : "Disabled"}/></td>
            <td>{authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleString("vi-VN") : "Chưa đăng nhập"}</td>
            <td><details className="inline-details"><summary className="button button-secondary">Edit</summary><form action={adminUpdateUser} className="inline-edit-form">
              <input type="hidden" name="user_id" value={row.id}/>
              <Field label="Họ tên" name="full_name" defaultValue={row.full_name} required/>
              <SelectField label="Role" name="role" defaultValue={row.role} required options={roleOptions}/>
              <label className="checkbox-row"><input type="checkbox" name="is_active" defaultChecked={row.is_active}/><span>Cho phép đăng nhập</span></label>
              <button className="button button-primary">Lưu quyền</button>
            </form></details></td>
          </tr>;
        })}
      </tbody></table></div> : <Empty title="Chưa có profile" description="Tạo user đầu tiên bằng bootstrap SQL, sau đó quản lý tài khoản tại đây."/>}
    </Panel>
    <Panel title="Audit log gần nhất" description="INSERT / UPDATE / DELETE trên các bảng trọng yếu" className="section-gap">
      {auditLogs?.length ? <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Action</th><th>Table</th><th>Record</th><th>Actor</th></tr></thead><tbody>{auditLogs.map((row:any)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString("vi-VN")}</td><td><Status value={row.action}/></td><td>{row.table_name}</td><td>{row.record_id || "—"}</td><td>{row.actor_id?.slice(0,8) || "system"}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có audit event" description="Log sẽ xuất hiện sau khi có thay đổi dữ liệu."/>}
    </Panel>
    <div className="note-box section-gap"><strong>Security rule:</strong> thay đổi role được thực hiện bằng server action sử dụng service-role key trên server. Key này không bao giờ được đưa vào biến môi trường có tiền tố <code>NEXT_PUBLIC_</code>. Role thường không thể tự nâng quyền hoặc sửa role của chính mình.</div>
  </>;
}

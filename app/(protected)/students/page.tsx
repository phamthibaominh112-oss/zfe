import Link from "next/link";
import { createStudent, archiveStudent } from "@/app/actions";
import { Field, FormGrid, SelectField, TextAreaField } from "@/components/forms";
import { PageHeader, Panel, Status, Flash, FormDetails, Empty } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const profile = await requireRole(["admin","academic_manager","teacher","customer_service"]);
  const params = await searchParams;
  const supabase = await createClient();
  const studentsQuery = profile.role === "teacher"
    ? supabase.from("students").select("id,code,full_name,status,entry_level,target,created_at")
    : supabase.from("students").select("id,code,full_name,status,entry_level,target,phone,email,source,created_at");
  const { data: students, error } = await studentsQuery.is("archived_at", null).order("created_at", { ascending: false });
  const canCreate = ["admin","academic_manager","customer_service"].includes(profile.role);

  const actions = canCreate ? <FormDetails title="Tạo hồ sơ học viên"><form action={createStudent}><FormGrid>
    <Field label="Mã học viên (optional)" name="code" placeholder="Tự sinh nếu để trống" />
    <Field label="Họ và tên" name="full_name" required />
    <Field label="Ngày sinh" name="date_of_birth" type="date" />
    <Field label="Số điện thoại" name="phone" />
    <Field label="Email" name="email" type="email" />
    <Field label="Nguồn lead" name="source" />
    <Field label="Người liên hệ / Phụ huynh" name="guardian_name" />
    <Field label="SĐT người liên hệ" name="guardian_phone" />
    <Field label="Level đầu vào" name="entry_level" />
    <Field label="Target" name="target" />
    <SelectField label="Trạng thái" name="status" required defaultValue="Waiting for class" options={[
      {value:"Waiting for class",label:"Chờ xếp lớp"},{value:"Active",label:"Đang học"},{value:"Paused",label:"Tạm dừng"},{value:"Completed",label:"Hoàn thành"},{value:"Stopped",label:"Ngưng học"}
    ]} />
    <TextAreaField label="Ghi chú" name="notes" />
    <div className="form-actions"><button className="button button-primary">Lưu hồ sơ</button></div>
  </FormGrid></form></FormDetails> : undefined;

  return <>
    <PageHeader eyebrow="Student master database" title="Hồ sơ học viên" description={profile.role === "teacher" ? "Giáo viên chỉ thấy học viên thuộc lớp mình được phân công; thông tin học phí và renewal không được truy vấn." : "Một học viên có một master profile và có thể có nhiều enrollment, payment, assessment và feedback."} actions={actions} />
    <Flash message={params.message} error={params.error || error?.message} />
    <Panel title="Student directory" description={`${students?.length || 0} hồ sơ có quyền truy cập`}>
      {students?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã</th><th>Học viên</th><th>Level / Target</th>{profile.role !== "teacher" ? <><th>Liên hệ</th><th>Nguồn</th></> : null}<th>Trạng thái</th><th></th></tr></thead><tbody>
        {students.map((student: any) => <tr key={student.id}>
          <td><strong>{student.code}</strong></td>
          <td className="table-title"><strong>{student.full_name}</strong><span>Tạo {new Date(student.created_at).toLocaleDateString("vi-VN")}</span></td>
          <td><strong>{student.entry_level || "—"}</strong><br/><span className="muted-text">{student.target || "Chưa set target"}</span></td>
          {profile.role !== "teacher" ? <><td>{student.phone || "—"}<br/><span className="muted-text">{student.email || ""}</span></td><td>{student.source || "—"}</td></> : null}
          <td><Status value={student.status} /></td>
          <td><div className="row-actions"><Link className="button button-secondary" href={`/students/${student.id}`}>Mở profile</Link>{profile.role === "admin" ? <form action={archiveStudent}><input type="hidden" name="student_id" value={student.id}/><button className="button button-danger" type="submit">Archive</button></form> : null}</div></td>
        </tr>)}
      </tbody></table></div> : <Empty title="Chưa có học viên" description="Tạo hồ sơ đầu tiên hoặc kiểm tra RLS của tài khoản hiện tại." />}
    </Panel>
  </>;
}

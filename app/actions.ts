"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireRole } from "@/lib/auth";
import { text, toNumber } from "@/lib/format";
import type { AppRole } from "@/lib/roles";

function go(path: string, message?: string, error?: string): never {
  const params = new URLSearchParams();
  if (message) params.set("message", message);
  if (error) params.set("error", error);
  redirect(`${path}${params.size ? `?${params.toString()}` : ""}`);
}

function failMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function scheduleReturnPath(formData: FormData) {
  const params = new URLSearchParams();
  const week = text(formData.get("return_week"));
  const teacher = text(formData.get("return_teacher"));
  const classId = text(formData.get("return_class"));
  if (week) params.set("week", week);
  if (teacher) params.set("teacher", teacher);
  if (classId) params.set("class", classId);
  return `/schedule${params.size ? `?${params.toString()}` : ""}`;
}

export async function createStudent(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "customer_service"]);
  const supabase = await createClient();
  const code = text(formData.get("code"));
  const payload: Record<string, unknown> = {
    full_name: text(formData.get("full_name")),
    date_of_birth: text(formData.get("date_of_birth")) || null,
    phone: text(formData.get("phone")) || null,
    email: text(formData.get("email")) || null,
    guardian_name: text(formData.get("guardian_name")) || null,
    guardian_phone: text(formData.get("guardian_phone")) || null,
    source: text(formData.get("source")) || null,
    status: text(formData.get("status")) || "Waiting for class",
    entry_level: text(formData.get("entry_level")) || null,
    target: text(formData.get("target")) || null,
    notes: text(formData.get("notes")) || null,
    created_by: profile.id
  };
  if (code) payload.code = code;
  try {
    const { error } = await supabase.from("students").insert(payload);
    assertNoError(error);
  } catch (error) {
    go("/students", undefined, failMessage(error));
  }
  revalidatePath("/students");
  go("/students", "Đã tạo hồ sơ học viên.");
}


export async function updateStudent(formData: FormData) {
  await requireRole(["admin", "academic_manager", "customer_service"]);
  const supabase = await createClient();
  const studentId = text(formData.get("student_id"));
  const { error } = await supabase.from("students").update({
    full_name: text(formData.get("full_name")),
    date_of_birth: text(formData.get("date_of_birth")) || null,
    phone: text(formData.get("phone")) || null,
    email: text(formData.get("email")) || null,
    guardian_name: text(formData.get("guardian_name")) || null,
    guardian_phone: text(formData.get("guardian_phone")) || null,
    source: text(formData.get("source")) || null,
    status: text(formData.get("status")),
    entry_level: text(formData.get("entry_level")) || null,
    target: text(formData.get("target")) || null,
    notes: text(formData.get("notes")) || null
  }).eq("id", studentId);
  if (error) go(`/students/${studentId}`, undefined, error.message);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  go(`/students/${studentId}`, "Đã cập nhật hồ sơ học viên.");
}

export async function updateEnrollmentTimeline(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const enrollmentId = text(formData.get("enrollment_id"));
  const studentId = text(formData.get("student_id"));
  const startDate = text(formData.get("start_date"));
  const endDate = text(formData.get("end_date"));
  if (!enrollmentId || !studentId) go("/students", undefined, "Không xác định được enrollment.");
  if (!startDate) go(`/students/${studentId}`, undefined, "Start date là bắt buộc.");
  if (endDate && endDate < startDate) go(`/students/${studentId}`, undefined, "End date không thể trước Start date.");
  const { error } = await supabase.from("enrollments").update({
    start_date:startDate,end_date:endDate||null,updated_at:new Date().toISOString()
  }).eq("id",enrollmentId);
  if (error) go(`/students/${studentId}`,undefined,error.message);
  revalidatePath(`/students/${studentId}`); revalidatePath("/students"); revalidatePath("/dashboard"); revalidatePath("/finance");
  go(`/students/${studentId}`,"Đã cập nhật Start date / End date.");
}

export async function createStudentAvailability(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "customer_service"]);
  const supabase = await createClient();
  const studentId = text(formData.get("student_id"));
  const { error } = await supabase.from("student_availability").insert({
    student_id: studentId,
    weekday: toNumber(formData.get("weekday")),
    start_time: text(formData.get("start_time")),
    end_time: text(formData.get("end_time")),
    effective_from: text(formData.get("effective_from")) || new Date().toISOString().slice(0, 10),
    effective_to: text(formData.get("effective_to")) || null,
    is_recurring: formData.get("is_recurring") === "on",
    note: text(formData.get("note")) || null,
    created_by: profile.id
  });
  if (error) go(`/students/${studentId}`, undefined, error.message);
  revalidatePath(`/students/${studentId}`);
  go(`/students/${studentId}`, "Đã lưu lịch rảnh của học viên.");
}

export async function createClass(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("classes").insert({
    code: text(formData.get("code")),
    name: text(formData.get("name")),
    category: text(formData.get("category")),
    program_id: text(formData.get("program_id")) || null,
    level_id: text(formData.get("level_id")) || null,
    mode: text(formData.get("mode")),
    campus: text(formData.get("campus")) || null,
    room: text(formData.get("room")) || null,
    start_date: text(formData.get("start_date")) || null,
    expected_end_date: text(formData.get("expected_end_date")) || null,
    total_hours: toNumber(formData.get("total_hours")),
    total_sessions: toNumber(formData.get("total_sessions")),
    target: text(formData.get("target")) || null,
    capacity: toNumber(formData.get("capacity"), 1),
    status: text(formData.get("status")) || "Draft",
    notes: text(formData.get("notes")) || null,
    created_by: profile.id
  });
  if (error) go("/classes", undefined, error.message);
  revalidatePath("/classes");
  go("/classes", "Đã tạo lớp học.");
}


export async function updateClass(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const { error } = await supabase.from("classes").update({
    name: text(formData.get("name")),
    category: text(formData.get("category")),
    program_id: text(formData.get("program_id")) || null,
    level_id: text(formData.get("level_id")) || null,
    mode: text(formData.get("mode")),
    campus: text(formData.get("campus")) || null,
    room: text(formData.get("room")) || null,
    start_date: text(formData.get("start_date")) || null,
    expected_end_date: text(formData.get("expected_end_date")) || null,
    total_hours: toNumber(formData.get("total_hours")),
    total_sessions: toNumber(formData.get("total_sessions")),
    target: text(formData.get("target")) || null,
    capacity: toNumber(formData.get("capacity"), 1),
    status: text(formData.get("status")),
    notes: text(formData.get("notes")) || null
  }).eq("id", classId);
  if (error) go(`/classes/${classId}`, undefined, error.message);
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  go(`/classes/${classId}`, "Đã cập nhật lớp học.");
}

export async function setClassTeachingTeam(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const returnTo = text(formData.get("return_to")) || `/classes/${classId}`;
  const mainTeacherId = text(formData.get("main_teacher_id"));
  const assistantTeacherId = text(formData.get("assistant_teacher_id"));

  if (!mainTeacherId) go(returnTo, undefined, "Vui lòng chọn Giáo viên chính.");
  if (assistantTeacherId && assistantTeacherId === mainTeacherId) {
    go(returnTo, undefined, "GV chính và Co-teacher/TA phải là hai người khác nhau.");
  }

  const { error: removeError } = await supabase
    .from("class_teachers")
    .delete()
    .eq("class_id", classId)
    .in("role", ["Main teacher", "Assistant"]);
  if (removeError) go(returnTo, undefined, removeError.message);

  const rows: Array<Record<string, unknown>> = [{
    class_id: classId,
    teacher_id: mainTeacherId,
    role: "Main teacher",
    payroll_factor: toNumber(formData.get("main_payroll_factor"), 1)
  }];

  if (assistantTeacherId) rows.push({
    class_id: classId,
    teacher_id: assistantTeacherId,
    role: "Assistant",
    payroll_factor: toNumber(formData.get("assistant_payroll_factor"), 1)
  });

  const { error: insertError } = await supabase.from("class_teachers").insert(rows);
  if (insertError) go(returnTo, undefined, insertError.message);

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  go(returnTo, assistantTeacherId
    ? "Đã cập nhật Giáo viên chính và Trợ giảng của lớp."
    : "Đã cập nhật Giáo viên chính. Lớp hiện chưa có Trợ giảng.");
}

// Backward-compatible action for any older form still using assignTeacher.
export async function assignTeacher(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const role = text(formData.get("role")) || "Main teacher";
  const teacherId = text(formData.get("teacher_id"));
  if (!teacherId) go(`/classes/${classId}`, undefined, "Vui lòng chọn giáo viên.");

  if (role === "Main teacher" || role === "Assistant") {
    const { error: removeError } = await supabase
      .from("class_teachers")
      .delete()
      .eq("class_id", classId)
      .eq("role", role);
    if (removeError) go(`/classes/${classId}`, undefined, removeError.message);
  }

  const { error } = await supabase.from("class_teachers").insert({
    class_id: classId,
    teacher_id: teacherId,
    role,
    payroll_factor: toNumber(formData.get("payroll_factor"), 1)
  });
  if (error) go(`/classes/${classId}`, undefined, error.message);
  revalidatePath(`/classes/${classId}`);
  go(`/classes/${classId}`, "Đã phân công giáo viên.");
}

export async function enrollStudent(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const { error } = await supabase.from("enrollments").insert({
    class_id: classId,
    student_id: text(formData.get("student_id")),
    start_date: text(formData.get("start_date")) || new Date().toISOString().slice(0, 10),
    end_date: text(formData.get("end_date")) || null,
    status: "Active",
    target: text(formData.get("target")) || null,
    enrolled_by: profile.id
  });
  if (error) go(`/classes/${classId}`, undefined, error.message);
  revalidatePath(`/classes/${classId}`);
  go(`/classes/${classId}`, "Đã xếp học viên vào lớp.");
}

export async function moveStudentEnrollment(studentId: string, targetClassId: string | null, sourceClassId: string | null) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();

  if (!studentId) return { ok: false, error: "Không tìm thấy học viên." };
  if (targetClassId && sourceClassId === targetClassId) return { ok: true };

  try {
    if (targetClassId) {
      const [{ data: targetClass, error: classError }, { count, error: countError }] = await Promise.all([
        supabase.from("classes").select("id,code,capacity,status").eq("id", targetClassId).is("archived_at", null).single(),
        supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("class_id", targetClassId).eq("status", "Active").is("archived_at", null).neq("student_id", studentId)
      ]);
      if (classError || !targetClass) return { ok: false, error: classError?.message || "Không tìm thấy lớp đích." };
      if (countError) return { ok: false, error: countError.message };
      if (Number(count || 0) >= Number(targetClass.capacity || 1)) return { ok: false, error: `${targetClass.code} đã đủ sĩ số.` };

      const { data: existing, error: existingError } = await supabase
        .from("enrollments")
        .select("id,archived_at,status")
        .eq("student_id", studentId)
        .eq("class_id", targetClassId)
        .maybeSingle();
      if (existingError) return { ok: false, error: existingError.message };

      if (existing) {
        const { error } = await supabase.from("enrollments").update({
          archived_at: null,
          archived_by: null,
          status: "Active",
          end_date: null,
          start_date: new Date().toISOString().slice(0, 10),
          enrolled_by: profile.id
        }).eq("id", existing.id);
        if (error) return { ok: false, error: error.message };
      } else {
        const { error } = await supabase.from("enrollments").insert({
          student_id: studentId,
          class_id: targetClassId,
          start_date: new Date().toISOString().slice(0, 10),
          status: "Active",
          enrolled_by: profile.id
        });
        if (error) return { ok: false, error: error.message };
      }
    }

    if (sourceClassId && sourceClassId !== targetClassId) {
      const { error } = await supabase.from("enrollments").update({
        status: "Transferred",
        end_date: new Date().toISOString().slice(0, 10),
        archived_at: new Date().toISOString(),
        archived_by: profile.id
      }).eq("student_id", studentId).eq("class_id", sourceClassId).is("archived_at", null);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/class-planner");
    revalidatePath("/classes");
    revalidatePath("/schedule");
    revalidatePath("/students");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failMessage(error) };
  }
}

export async function createTeacherAvailability(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  let teacherId = text(formData.get("teacher_id"));
  if (profile.role === "teacher") {
    const { data } = await supabase.from("teachers").select("id").eq("user_id", profile.id).single();
    teacherId = data?.id || "";
  }
  if (!teacherId) go("/schedule", undefined, "Không tìm thấy teacher profile.");
  const { error } = await supabase.from("teacher_availability").insert({
    teacher_id: teacherId,
    weekday: toNumber(formData.get("weekday")),
    start_time: text(formData.get("start_time")),
    end_time: text(formData.get("end_time")),
    mode: text(formData.get("mode")) || null,
    campus: text(formData.get("campus")) || null,
    effective_from: text(formData.get("effective_from")) || new Date().toISOString().slice(0, 10),
    effective_to: text(formData.get("effective_to")) || null,
    is_recurring: formData.get("is_recurring") === "on",
    note: text(formData.get("note")) || null,
    created_by: profile.id
  });
  const returnPath = scheduleReturnPath(formData);
  if (error) go(returnPath, undefined, error.message);
  revalidatePath("/schedule");
  go(returnPath, "Đã lưu lịch rảnh giáo viên.");
}

export async function updateTeacherAvailability(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const availabilityId = text(formData.get("availability_id"));
  if (!availabilityId) go("/schedule", undefined, "Không tìm thấy lịch rảnh cần điều chỉnh.");
  const { error } = await supabase.from("teacher_availability").update({
    teacher_id: text(formData.get("teacher_id")),
    weekday: toNumber(formData.get("weekday")),
    start_time: text(formData.get("start_time")),
    end_time: text(formData.get("end_time")),
    mode: text(formData.get("mode")) || null,
    campus: text(formData.get("campus")) || null,
    effective_from: text(formData.get("effective_from")),
    effective_to: text(formData.get("effective_to")) || null,
    is_recurring: formData.get("is_recurring") === "on",
    note: text(formData.get("note")) || null
  }).eq("id", availabilityId);
  const returnPath = scheduleReturnPath(formData);
  if (error) go(returnPath, undefined, error.message);
  revalidatePath("/schedule");
  go(returnPath, "Đã điều chỉnh lịch rảnh giáo viên.");
}

export async function deleteTeacherAvailability(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const availabilityId = text(formData.get("availability_id"));
  const returnPath = scheduleReturnPath(formData);
  if (formData.get("confirm") !== "on") go(returnPath, undefined, "Vui lòng xác nhận trước khi xóa lịch rảnh.");
  const { error } = await supabase.from("teacher_availability").delete().eq("id", availabilityId);
  if (error) go(returnPath, undefined, error.message);
  revalidatePath("/schedule");
  go(returnPath, "Đã xóa lịch rảnh giáo viên.");
}

export async function updateSessionTeachingTeam(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const sessionId = text(formData.get("session_id"));
  const teacherId = text(formData.get("teacher_id"));
  const assistantTeacherId = text(formData.get("assistant_teacher_id"));

  if (!sessionId) go("/schedule", undefined, "Không xác định được buổi học.");
  if (!teacherId) go("/schedule", undefined, "Vui lòng chọn Giáo viên chính.");
  if (assistantTeacherId && assistantTeacherId === teacherId) {
    go("/schedule", undefined, "GV chính và Co-teacher/TA phải là hai người khác nhau.");
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id,class_id,session_no")
    .eq("id", sessionId)
    .is("archived_at", null)
    .single();
  if (sessionError || !session) {
    go("/schedule", undefined, sessionError?.message || "Không tìm thấy buổi học.");
  }

  // IMPORTANT: this action never inserts/duplicates a session.
  // It only replaces the teaching-team rows attached to the existing session.
  const { error: deleteError } = await supabase
    .from("session_teachers")
    .delete()
    .eq("session_id", sessionId)
    .in("role", ["Main teacher", "Assistant"]);
  if (deleteError) go("/schedule", undefined, deleteError.message);

  const rows: Array<Record<string, unknown>> = [{
    session_id: sessionId,
    teacher_id: teacherId,
    role: "Main teacher",
    payroll_factor: 1
  }];
  if (assistantTeacherId) rows.push({
    session_id: sessionId,
    teacher_id: assistantTeacherId,
    role: "Assistant",
    payroll_factor: 1
  });

  const { error: insertError } = await supabase.from("session_teachers").insert(rows);
  if (insertError) go("/schedule", undefined, insertError.message);

  revalidatePath("/schedule");
  revalidatePath(`/classes/${session.class_id}`);
  revalidatePath("/dashboard");
  go("/schedule", assistantTeacherId
    ? `Đã phân công GV chính + TA cho Buổi ${session.session_no}.`
    : `Đã cập nhật GV chính cho Buổi ${session.session_no}.`);
}

export async function updateSessionSchedule(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const sessionId = text(formData.get("session_id"));
  const { data: oldSession, error: readError } = await supabase
    .from("sessions")
    .select("id,class_id,session_no,scheduled_date,start_time,end_time")
    .eq("id", sessionId)
    .is("archived_at", null)
    .single();
  if (readError || !oldSession) go("/schedule", undefined, readError?.message || "Không tìm thấy buổi học cần điều chỉnh.");

  const newDate = text(formData.get("scheduled_date"));
  const newStart = text(formData.get("start_time"));
  const newEnd = text(formData.get("end_time"));
  const reason = text(formData.get("reason"));
  if (!reason) go("/schedule", undefined, "Vui lòng nhập lý do điều chỉnh lịch.");

  const { error: updateError } = await supabase.from("sessions").update({
    session_no: toNumber(formData.get("session_no")),
    scheduled_date: newDate,
    start_time: newStart,
    end_time: newEnd,
    duration_hours: toNumber(formData.get("duration_hours")),
    mode: text(formData.get("mode")),
    campus: text(formData.get("campus")) || null,
    room: text(formData.get("room")) || null,
    meeting_url: text(formData.get("meeting_url")) || null,
    status: text(formData.get("status")) || "Scheduled",
    topic: text(formData.get("topic")) || null
  }).eq("id", sessionId);
  if (updateError) go("/schedule", undefined, updateError.message);

  const { error: changeError } = await supabase.from("session_changes").insert({
    session_id: sessionId,
    old_date: oldSession.scheduled_date,
    new_date: newDate,
    old_start_time: oldSession.start_time,
    new_start_time: newStart,
    old_end_time: oldSession.end_time,
    new_end_time: newEnd,
    reason,
    changed_by: profile.id
  });
  if (changeError) go("/schedule", undefined, changeError.message);

  const teacherId = text(formData.get("teacher_id"));
  const assistantTeacherId = text(formData.get("assistant_teacher_id"));
  if (assistantTeacherId && teacherId && assistantTeacherId === teacherId) {
    go("/schedule", undefined, "GV chính và Co-teacher/TA phải là hai người khác nhau.");
  }

  const { error: removeTeacherError } = await supabase
    .from("session_teachers")
    .delete()
    .eq("session_id", sessionId)
    .in("role", ["Main teacher", "Assistant"]);
  if (removeTeacherError) go("/schedule", undefined, removeTeacherError.message);

  const staffingRows: Array<Record<string, unknown>> = [];
  if (teacherId) staffingRows.push({
    session_id: sessionId,
    teacher_id: teacherId,
    role: "Main teacher",
    payroll_factor: 1
  });
  if (assistantTeacherId) staffingRows.push({
    session_id: sessionId,
    teacher_id: assistantTeacherId,
    role: "Assistant",
    payroll_factor: 1
  });
  if (staffingRows.length) {
    const { error: addTeacherError } = await supabase.from("session_teachers").insert(staffingRows);
    if (addTeacherError) go("/schedule", undefined, addTeacherError.message);
  }

  revalidatePath("/schedule");
  revalidatePath(`/classes/${oldSession.class_id}`);
  revalidatePath("/dashboard");
  go("/schedule", "Đã điều chỉnh lịch dạy và lưu lịch sử thay đổi.");
}

export async function archiveSessionSchedule(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const sessionId = text(formData.get("session_id"));
  const reason = text(formData.get("reason"));
  if (formData.get("confirm") !== "on") go("/schedule", undefined, "Vui lòng xác nhận trước khi xóa lịch.");
  if (!reason) go("/schedule", undefined, "Vui lòng nhập lý do xóa lịch.");

  const { data: oldSession, error: readError } = await supabase
    .from("sessions")
    .select("id,class_id,scheduled_date,start_time,end_time")
    .eq("id", sessionId)
    .is("archived_at", null)
    .single();
  if (readError || !oldSession) go("/schedule", undefined, readError?.message || "Không tìm thấy buổi học cần xóa.");

  const { error: updateError } = await supabase.from("sessions").update({
    status: "Cancelled",
    archived_at: new Date().toISOString(),
    archived_by: profile.id
  }).eq("id", sessionId);
  if (updateError) go("/schedule", undefined, updateError.message);

  const { error: changeError } = await supabase.from("session_changes").insert({
    session_id: sessionId,
    old_date: oldSession.scheduled_date,
    new_date: oldSession.scheduled_date,
    old_start_time: oldSession.start_time,
    new_start_time: oldSession.start_time,
    old_end_time: oldSession.end_time,
    new_end_time: oldSession.end_time,
    reason: `Xóa khỏi lịch: ${reason}`,
    changed_by: profile.id
  });
  if (changeError) go("/schedule", undefined, changeError.message);

  revalidatePath("/schedule");
  revalidatePath(`/classes/${oldSession.class_id}`);
  revalidatePath("/dashboard");
  go("/schedule", "Đã xóa buổi học khỏi lịch. Dữ liệu vẫn được lưu trong lịch sử.");
}

export async function duplicatePreviousWeekSchedule(formData: FormData) {
  const profile=await requireRole(["admin","academic_manager"]);
  const supabase=await createClient();
  const targetStart=text(formData.get("target_week_start"));
  const returnWeek=text(formData.get("return_week"))||"0";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(targetStart)) go("/schedule",undefined,"Tuần đích không hợp lệ.");
  const targetStartDate=new Date(`${targetStart}T00:00:00Z`);
  const sourceStartDate=new Date(targetStartDate); sourceStartDate.setUTCDate(sourceStartDate.getUTCDate()-7);
  const sourceEndDate=new Date(sourceStartDate); sourceEndDate.setUTCDate(sourceEndDate.getUTCDate()+6);
  const targetEndDate=new Date(targetStartDate); targetEndDate.setUTCDate(targetEndDate.getUTCDate()+6);
  const sourceStart=sourceStartDate.toISOString().slice(0,10), sourceEnd=sourceEndDate.toISOString().slice(0,10), targetEnd=targetEndDate.toISOString().slice(0,10);

  const { data: sourceRows,error:sourceError }=await supabase.from("sessions")
    .select("id,class_id,session_no,scheduled_date,start_time,end_time,duration_hours,mode,campus,room,meeting_url,topic,status,session_teachers(teacher_id,role,payroll_factor)")
    .gte("scheduled_date",sourceStart).lte("scheduled_date",sourceEnd).neq("status","Cancelled").is("archived_at",null).order("scheduled_date").order("start_time");
  if(sourceError) go(`/schedule?week=${returnWeek}`,undefined,sourceError.message);
  if(!sourceRows?.length) go(`/schedule?week=${returnWeek}`,undefined,"Tuần trước không có session để duplicate.");

  const classIds: string[] = Array.from(
    new Set<string>((sourceRows as any[]).map((x:any)=>String(x.class_id)))
  );
  const [{data:priorRows},{data:targetRows}]=await Promise.all([
    supabase.from("sessions").select("class_id,session_no").in("class_id",classIds).lt("scheduled_date",targetStart).neq("status","Cancelled").is("archived_at",null),
    supabase.from("sessions").select("class_id,scheduled_date,start_time").in("class_id",classIds).gte("scheduled_date",targetStart).lte("scheduled_date",targetEnd).neq("status","Cancelled").is("archived_at",null)
  ]);
  const nextNo = new Map<string, number>();
  for (const classId of classIds) {
    const maxNo=Math.max(0,...(priorRows||[]).filter((x:any)=>x.class_id===classId).map((x:any)=>Number(x.session_no||0)));
    nextNo.set(classId,maxNo+1);
  }
  const existing=new Set((targetRows||[]).map((x:any)=>`${x.class_id}|${x.scheduled_date}|${String(x.start_time).slice(0,5)}`));
  let created=0, skipped=0;
  for(const src of sourceRows as any[]){
    const d=new Date(`${src.scheduled_date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+7);
    const scheduledDate=d.toISOString().slice(0,10);
    const key=`${src.class_id}|${scheduledDate}|${String(src.start_time).slice(0,5)}`;
    if(existing.has(key)){skipped++;continue;}
    const sessionNo=nextNo.get(src.class_id)||1; nextNo.set(src.class_id,sessionNo+1);
    const {data:newSession,error:createError}=await supabase.from("sessions").insert({
      class_id:src.class_id,session_no:sessionNo,scheduled_date:scheduledDate,start_time:src.start_time,end_time:src.end_time,
      duration_hours:src.duration_hours,mode:src.mode,campus:src.campus,room:src.room,meeting_url:src.meeting_url,topic:src.topic,status:"Scheduled",created_by:profile.id
    }).select("id").single();
    if(createError||!newSession) go(`/schedule?week=${returnWeek}`,undefined,createError?.message||"Không duplicate được session.");
    const staff=(src.session_teachers||[]).map((l:any)=>({session_id:newSession.id,teacher_id:l.teacher_id,role:l.role,payroll_factor:l.payroll_factor??1}));
    if(staff.length){const {error:staffError}=await supabase.from("session_teachers").insert(staff); if(staffError) go(`/schedule?week=${returnWeek}`,undefined,staffError.message);}
    existing.add(key); created++;
  }
  revalidatePath("/schedule"); revalidatePath("/dashboard");
  go(`/schedule?week=${returnWeek}`,`Đã duplicate ${created} session từ tuần trước${skipped?` · bỏ qua ${skipped} session đã tồn tại`:""}. Số buổi tự tăng tiếp nối.`);
}

export async function createSession(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const sessionNo = toNumber(formData.get("session_no"));
  if (!sessionNo || sessionNo < 1) go("/schedule", undefined, "Số buổi phải từ 1 trở lên.");

  const { data: existingSession } = await supabase
    .from("sessions")
    .select("id,session_no,status")
    .eq("class_id", classId)
    .eq("session_no", sessionNo)
    .neq("status", "Cancelled")
    .is("archived_at", null)
    .maybeSingle();

  if (existingSession) {
    go(
      "/schedule",
      undefined,
      `Buổi ${sessionNo} đã tồn tại trong lớp này. Nếu bạn đang thêm Co-teacher/TA, KHÔNG tạo buổi mới. Hãy mở "Quản lý GV + Co-teacher/TA" ngay trên card của Buổi ${sessionNo}.`
    );
  }

  const { data: session, error } = await supabase.from("sessions").insert({
    class_id: classId,
    session_no: sessionNo,
    scheduled_date: text(formData.get("scheduled_date")),
    start_time: text(formData.get("start_time")),
    end_time: text(formData.get("end_time")),
    duration_hours: toNumber(formData.get("duration_hours")),
    mode: text(formData.get("mode")),
    campus: text(formData.get("campus")) || null,
    room: text(formData.get("room")) || null,
    meeting_url: text(formData.get("meeting_url")) || null,
    status: "Scheduled",
    topic: text(formData.get("topic")) || null,
    created_by: profile.id
  }).select("id").single();
  if (error || !session) go("/schedule", undefined, error?.message || "Không tạo được session.");

  let teacherId = text(formData.get("teacher_id"));
  let assistantTeacherId = text(formData.get("assistant_teacher_id"));

  if (!teacherId || !assistantTeacherId) {
    const { data: classStaff } = await supabase
      .from("class_teachers")
      .select("teacher_id,role,payroll_factor")
      .eq("class_id", classId)
      .in("role", ["Main teacher", "Assistant"]);
    if (!teacherId) teacherId = classStaff?.find((x:any)=>x.role === "Main teacher")?.teacher_id || "";
    if (!assistantTeacherId) assistantTeacherId = classStaff?.find((x:any)=>x.role === "Assistant")?.teacher_id || "";
  }

  if (assistantTeacherId && teacherId && assistantTeacherId === teacherId) {
    await supabase.from("sessions").delete().eq("id", session.id);
    go("/schedule", undefined, "GV chính và Co-teacher/TA phải là hai người khác nhau.");
  }

  const staffingRows: Array<Record<string, unknown>> = [];
  if (teacherId) staffingRows.push({ session_id: session.id, teacher_id: teacherId, role: "Main teacher", payroll_factor: 1 });
  if (assistantTeacherId) staffingRows.push({ session_id: session.id, teacher_id: assistantTeacherId, role: "Assistant", payroll_factor: 1 });

  if (staffingRows.length) {
    const { error: teacherError } = await supabase.from("session_teachers").insert(staffingRows);
    if (teacherError) go("/schedule", undefined, teacherError.message);
  }

  revalidatePath("/schedule");
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/dashboard");
  go("/schedule", assistantTeacherId ? "Đã tạo buổi học với GV chính và Trợ giảng." : "Đã tạo buổi học.");
}

export async function completeSession(formData: FormData) {
  await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const sessionId = text(formData.get("session_id"));
  const { error } = await supabase.rpc("complete_teaching_session", { p_session_id: sessionId, p_topic: text(formData.get("topic")) || null });
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  revalidatePath("/dashboard");
  go("/academic", "Session đã được xác nhận hoàn thành.");
}

export async function quickMarkAttendance(formData: FormData) {
  const profile = await requireRole(["admin","academic_manager","teacher"]);
  const supabase = await createClient();
  const sessionId=text(formData.get("session_id"));
  const studentId=text(formData.get("student_id"));
  const status=text(formData.get("status"));
  const lateMinutes=status==="Late"?Math.max(0,toNumber(formData.get("late_minutes"),5)):0;
  const { error }=await supabase.from("attendance").upsert({
    session_id:sessionId,student_id:studentId,status,late_minutes:lateMinutes,
    reason:text(formData.get("reason"))||null,marked_by:profile.id,marked_at:new Date().toISOString()
  },{onConflict:"session_id,student_id"});
  if(error) go("/academic",undefined,error.message);
  revalidatePath("/academic"); revalidatePath(`/students/${studentId}`);
  go("/academic",`Đã điểm danh: ${status}.`);
}

export async function markAllPresentForSession(formData: FormData) {
  const profile=await requireRole(["admin","academic_manager","teacher"]);
  const supabase=await createClient();
  const sessionId=text(formData.get("session_id"));
  const classId=text(formData.get("class_id"));
  const { data: roster,error:rosterError }=await supabase.from("enrollments").select("student_id").eq("class_id",classId).eq("status","Active").is("archived_at",null);
  if(rosterError) go("/academic",undefined,rosterError.message);
  if(!roster?.length) go("/academic",undefined,"Lớp chưa có học viên active.");
  const rows=roster.map((r:any)=>({session_id:sessionId,student_id:r.student_id,status:"Present",late_minutes:0,marked_by:profile.id,marked_at:new Date().toISOString()}));
  const { error }=await supabase.from("attendance").upsert(rows,{onConflict:"session_id,student_id"});
  if(error) go("/academic",undefined,error.message);
  revalidatePath("/academic");
  go("/academic",`Đã đánh dấu có mặt cho ${rows.length} học viên.`);
}

export async function markAttendance(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const { error } = await supabase.from("attendance").upsert({
    session_id: text(formData.get("session_id")),
    student_id: text(formData.get("student_id")),
    status: text(formData.get("status")),
    late_minutes: toNumber(formData.get("late_minutes")),
    reason: text(formData.get("reason")) || null,
    marked_by: profile.id,
    marked_at: new Date().toISOString()
  }, { onConflict: "session_id,student_id" });
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  go("/academic", "Đã cập nhật attendance.");
}

export async function saveHomework(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const { error } = await supabase.from("homework_records").upsert({
    session_id: text(formData.get("session_id")),
    student_id: text(formData.get("student_id")),
    status: text(formData.get("status")),
    note: text(formData.get("note")) || null,
    marked_by: profile.id,
    marked_at: new Date().toISOString()
  }, { onConflict: "session_id,student_id" });
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  go("/academic", "Đã cập nhật homework completion.");
}

export async function createAssignment(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const material = formData.get("material_file");

  if (material instanceof File && material.size > 20 * 1024 * 1024) {
    go("/academic", undefined, "File giao BTVN tối đa 20MB.");
  }

  const { data: assignment, error } = await supabase.from("assignments").insert({
    class_id: classId,
    session_id: text(formData.get("session_id")) || null,
    title: text(formData.get("title")),
    instructions: text(formData.get("instructions")),
    due_at: text(formData.get("due_at")) || null,
    max_score: toNumber(formData.get("max_score"), 100),
    created_by: profile.id,
    published_at: formData.get("publish") === "on" ? new Date().toISOString() : null
  }).select("id").single();

  if (error || !assignment) go("/academic", undefined, error?.message || "Không tạo được assignment.");

  if (material instanceof File && material.size > 0) {
    const safeName = material.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${assignment.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("assignment-materials")
      .upload(path, material, { upsert: false, contentType: material.type || undefined });

    if (uploadError) {
      await supabase.from("assignments").delete().eq("id", assignment.id);
      go("/academic", undefined, `Không upload được file giao BTVN: ${uploadError.message}`);
    }

    const { error: updateError } = await supabase.from("assignments").update({
      material_path: path,
      material_name: material.name,
      material_mime: material.type || null,
      material_size: material.size,
      updated_at: new Date().toISOString()
    }).eq("id", assignment.id);

    if (updateError) go("/academic", undefined, updateError.message);
  }

  revalidatePath("/academic");
  revalidatePath("/dashboard");
  go("/academic", material instanceof File && material.size > 0
    ? "Đã tạo assignment và upload file cho học viên."
    : "Đã tạo assignment.");
}

export async function submitAssignment(formData: FormData) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const assignmentId = text(formData.get("assignment_id"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) go("/dashboard", undefined, "Vui lòng chọn file bài làm.");
  if (file.size > 20 * 1024 * 1024) go("/dashboard", undefined, "File bài làm tối đa 20MB.");
  const { data: student } = await supabase.from("students").select("id").eq("user_id", profile.id).single();
  if (!student) go("/dashboard", undefined, "Không tìm thấy student profile.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${student.id}/${assignmentId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("assignment-files").upload(path, file, { upsert: false });
  if (uploadError) go("/dashboard", undefined, uploadError.message);
  const { data: existing } = await supabase.from("assignment_submissions").select("id,status").eq("assignment_id", assignmentId).eq("student_id", student.id).maybeSingle();
  if (existing) {
    if (existing.status !== "Revision required") go("/dashboard", undefined, "Assignment này đã được nộp và chưa được mở resubmission.");
    const { error } = await supabase.rpc("resubmit_assignment", { p_assignment_id: assignmentId, p_file_path: path });
    if (error) go("/dashboard", undefined, error.message);
  } else {
    const { error } = await supabase.from("assignment_submissions").insert({ assignment_id: assignmentId, student_id: student.id, file_path: path, status: "Submitted" });
    if (error) go("/dashboard", undefined, error.message);
  }
  revalidatePath("/dashboard");
  go("/dashboard", "Đã nộp bài.");
}

export async function createAssessment(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").insert({
    class_id: text(formData.get("class_id")),
    name: text(formData.get("name")),
    type: text(formData.get("type")),
    assessment_date: text(formData.get("assessment_date")) || null,
    max_score: toNumber(formData.get("max_score"), 100),
    status: "Draft",
    created_by: profile.id
  });
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  go("/academic", "Đã tạo assessment.");
}

export async function saveAssessmentResult(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const publish = formData.get("publish") === "on";
  const { error } = await supabase.from("assessment_results").upsert({
    assessment_id: text(formData.get("assessment_id")),
    student_id: text(formData.get("student_id")),
    score: text(formData.get("score")) ? toNumber(formData.get("score")) : null,
    band: text(formData.get("band")) || null,
    cefr: text(formData.get("cefr")) || null,
    comment: text(formData.get("comment")) || null,
    graded_by: profile.id,
    graded_at: new Date().toISOString(),
    published_at: publish ? new Date().toISOString() : null
  }, { onConflict: "assessment_id,student_id" });
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  go("/academic", "Đã lưu điểm assessment.");
}

export async function submitProgressFeedback(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const { error } = await supabase.from("progress_feedback").upsert({
    enrollment_id: text(formData.get("enrollment_id")),
    milestone: toNumber(formData.get("milestone")),
    strengths: text(formData.get("strengths")),
    areas_to_improve: text(formData.get("areas_to_improve")),
    attendance_summary: text(formData.get("attendance_summary")) || null,
    homework_summary: text(formData.get("homework_summary")) || null,
    current_performance: text(formData.get("current_performance")),
    recommendation: text(formData.get("recommendation")),
    risk_level: text(formData.get("risk_level")) || "Low",
    status: "Submitted",
    submitted_by: profile.id,
    submitted_at: new Date().toISOString(),
    revision_note: null
  }, { onConflict: "enrollment_id,milestone" });
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  go("/academic", "Feedback đã gửi quản lý học vụ duyệt.");
}

export async function reviewProgressFeedback(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const id = text(formData.get("feedback_id"));
  const decision = text(formData.get("decision"));
  const now = new Date().toISOString();
  const payload = decision === "publish"
    ? { status: "Published", approved_by: profile.id, approved_at: now, published_at: now, revision_note: null }
    : decision === "revision"
      ? { status: "Revision requested", revision_note: text(formData.get("revision_note")), approved_by: null, approved_at: null, published_at: null }
      : { status: "Rejected", revision_note: text(formData.get("revision_note")), approved_by: profile.id, approved_at: now, published_at: null };
  const { error } = await supabase.from("progress_feedback").update(payload).eq("id", id);
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  go("/academic", decision === "publish" ? "Feedback đã được duyệt và publish cho học viên." : "Đã cập nhật quyết định duyệt.");
}

export async function createObservation(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const templateId = text(formData.get("template_id"));
  const share = formData.get("share") === "on";
  const { data: criteria, error: criteriaError } = await supabase.from("observation_criteria").select("id,max_score,weight").eq("template_id", templateId).order("sort_order");
  if (criteriaError) go("/quality", undefined, criteriaError.message);
  let weightedScore = 0;
  let totalWeight = 0;
  const scoreRows = (criteria || []).map((criterion: any) => {
    const score = toNumber(formData.get(`criterion_${criterion.id}`));
    weightedScore += (score / Number(criterion.max_score || 5)) * Number(criterion.weight || 1);
    totalWeight += Number(criterion.weight || 1);
    return { criterion_id: criterion.id, score, note: text(formData.get(`note_${criterion.id}`)) || null };
  });
  const totalScore = totalWeight ? Math.round((weightedScore / totalWeight) * 1000) / 10 : null;
  const { data: observation, error } = await supabase.from("teacher_observations").insert({
    teacher_id: text(formData.get("teacher_id")),
    session_id: text(formData.get("session_id")) || null,
    observer_id: profile.id,
    template_id: templateId,
    type: text(formData.get("type")) || "Scheduled",
    status: share ? "Shared" : "Draft",
    total_score: totalScore,
    strengths: text(formData.get("strengths")) || null,
    areas_to_improve: text(formData.get("areas_to_improve")) || null,
    required_actions: text(formData.get("required_actions")) || null,
    follow_up_due_at: text(formData.get("follow_up_due_at")) || null,
    shared_at: share ? new Date().toISOString() : null
  }).select("id").single();
  if (error || !observation) go("/quality", undefined, error?.message || "Không tạo được observation.");
  if (scoreRows.length) {
    const { error: scoreError } = await supabase.from("observation_scores").insert(scoreRows.map((row: { criterion_id: string; score: number; note: string | null }) => ({ ...row, observation_id: observation.id })));
    if (scoreError) go("/quality", undefined, scoreError.message);
  }
  revalidatePath("/quality");
  go("/quality", "Đã lưu observation và rubric scores.");
}

export async function createTuitionAccount(formData: FormData) {
  const profile = await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const gross = toNumber(formData.get("gross_amount"));
  const discount = toNumber(formData.get("discount_amount"));
  const net = Math.max(gross - discount, 0);
  const { error } = await supabase.from("tuition_accounts").insert({
    student_id: text(formData.get("student_id")),
    enrollment_id: text(formData.get("enrollment_id")) || null,
    package_name: text(formData.get("package_name")),
    gross_amount: gross,
    discount_amount: discount,
    net_amount: net,
    paid_amount: 0,
    balance_amount: net,
    purchased_hours: text(formData.get("purchased_hours")) ? toNumber(formData.get("purchased_hours")) : null,
    renewal_due_date: text(formData.get("renewal_due_date")) || null,
    status: "Open",
    created_by: profile.id
  });
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/finance");
  go("/finance", "Đã tạo tài khoản học phí.");
}

export async function addPayment(formData: FormData) {
  const profile = await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.from("payment_transactions").insert({
    tuition_account_id: text(formData.get("tuition_account_id")),
    amount: toNumber(formData.get("amount")),
    paid_at: text(formData.get("paid_at")) || new Date().toISOString(),
    method: text(formData.get("method")) || null,
    reference: text(formData.get("reference")) || null,
    note: text(formData.get("note")) || null,
    created_by: profile.id
  });
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/finance");
  go("/finance", "Đã ghi nhận thanh toán.");
}

export async function createRenewalFollowup(formData: FormData) {
  const profile = await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.from("renewal_followups").insert({
    tuition_account_id: text(formData.get("tuition_account_id")),
    assigned_to: profile.id,
    due_at: text(formData.get("due_at")),
    status: "Pending",
    note: text(formData.get("note")) || null,
    created_by: profile.id
  });
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/finance");
  go("/finance", "Đã tạo lịch follow-up tái phí.");
}

export async function rateTeacher(formData: FormData) {
  await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("id").eq("user_id", (await requireProfile()).id).single();
  if (!student) go("/dashboard", undefined, "Không tìm thấy student profile.");
  const { error } = await supabase.from("teacher_ratings").upsert({
    session_id: text(formData.get("session_id")),
    student_id: student.id,
    teacher_id: text(formData.get("teacher_id")),
    overall: toNumber(formData.get("overall")),
    clarity: toNumber(formData.get("clarity")),
    engagement: toNumber(formData.get("engagement")),
    supportiveness: toNumber(formData.get("supportiveness")),
    pace: toNumber(formData.get("pace")),
    comment: text(formData.get("comment")) || null
  }, { onConflict: "session_id,student_id,teacher_id" });
  if (error) go("/dashboard", undefined, error.message);
  revalidatePath("/dashboard");
  go("/dashboard", "Cảm ơn bạn đã đánh giá buổi học.");
}


export async function updatePlacementTestBooking(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const placementTestId = text(formData.get("placement_test_id"));
  const duration = toNumber(formData.get("duration_minutes"));
  if (![90,180].includes(duration)) go("/placement", undefined, "Placement chỉ dùng block 90 hoặc 180 phút.");
  const raw = text(formData.get("scheduled_start"));
  const when = new Date(raw.includes("T") ? `${raw}:00+07:00` : raw);
  if (!Number.isFinite(when.getTime())) go("/placement", undefined, "Thời gian Placement không hợp lệ.");
  const { error } = await supabase.from("placement_tests").update({
    duration_minutes: duration,
    familiarity: duration === 90 ? "New to IELTS" : "Familiar / Full test",
    scheduled_start: when.toISOString(),
    note: text(formData.get("note")) || null,
    status: "Scheduled",
    updated_at: new Date().toISOString()
  }).eq("id", placementTestId);
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement"); revalidatePath("/schedule"); revalidatePath("/dashboard");
  go("/placement", "Đã cập nhật lịch Placement.");
}

export async function cancelPlacementTestBooking(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const placementTestId = text(formData.get("placement_test_id"));
  const reason = text(formData.get("reason"));
  if (!reason) go("/placement", undefined, "Vui lòng ghi lý do hủy.");
  const { error } = await supabase.from("placement_tests").update({
    status: "Cancelled", note: reason, updated_at: new Date().toISOString()
  }).eq("id", placementTestId);
  if (error) go("/placement", undefined, error.message);
  const { error: speakingError } = await supabase.from("placement_speaking_bookings").update({
    status: "Cancelled", updated_at: new Date().toISOString()
  }).eq("placement_test_id", placementTestId);
  if (speakingError) go("/placement", undefined, speakingError.message);
  revalidatePath("/placement"); revalidatePath("/schedule"); revalidatePath("/dashboard");
  go("/placement", "Đã hủy Placement và Speaking liên quan.");
}

export async function updatePlacementSpeakingBooking(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const bookingId = text(formData.get("booking_id"));
  const teacherId = text(formData.get("teacher_id"));
  const raw = text(formData.get("scheduled_start"));
  const when = new Date(raw.includes("T") ? `${raw}:00+07:00` : raw);
  if (!Number.isFinite(when.getTime())) go("/placement", undefined, "Thời gian Speaking không hợp lệ.");
  const { data: teacher } = await supabase.from("teachers").select("id,email,is_placement_assessor").eq("id",teacherId).maybeSingle();
  const founder = ["giaovien@gmail.com","baominh@gmail.com"].includes(String(teacher?.email || "").toLowerCase());
  if (!teacher || (!teacher.is_placement_assessor && !founder)) go("/placement", undefined, "GV này chưa được phép nhận Placement Speaking.");
  const { error } = await supabase.from("placement_speaking_bookings").update({
    teacher_id: teacherId, scheduled_start: when.toISOString(), status: "Booked", updated_at: new Date().toISOString()
  }).eq("id", bookingId);
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement"); revalidatePath("/schedule"); revalidatePath("/dashboard");
  go("/placement", "Đã đổi lịch / GV Speaking.");
}

export async function cancelPlacementSpeakingBooking(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const bookingId = text(formData.get("booking_id"));
  const reason = text(formData.get("reason"));
  if (!reason) go("/placement", undefined, "Vui lòng ghi lý do hủy Speaking.");
  const { error } = await supabase.from("placement_speaking_bookings").update({
    status: "Cancelled", assessor_note: reason, updated_at: new Date().toISOString()
  }).eq("id", bookingId);
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement"); revalidatePath("/schedule"); revalidatePath("/dashboard");
  go("/placement", "Đã hủy Speaking booking.");
}

export async function createPlacementTest(formData: FormData) {
  const profile = await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const duration = toNumber(formData.get("duration_minutes"));
  if (![90,180].includes(duration)) go("/placement", undefined, "Placement chỉ dùng block 90 hoặc 180 phút.");
  const scheduledRaw = text(formData.get("scheduled_start"));
  const scheduledDate = new Date(`${scheduledRaw}:00+07:00`);
  if (!Number.isFinite(scheduledDate.getTime())) go("/placement", undefined, "Thời gian Placement không hợp lệ.");
  const { error } = await supabase.from("placement_tests").insert({
    student_id: text(formData.get("student_id")),
    familiarity: duration === 90 ? "New to IELTS" : "Familiar / Full test",
    duration_minutes: duration,
    scheduled_start: scheduledDate.toISOString(),
    note: text(formData.get("note")) || null,
    status: "Scheduled",
    created_by: profile.id
  });
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement");
  go("/placement", `Đã book Placement ${duration} phút.`);
}

export async function bookPlacementSpeaking(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const raw = text(formData.get("scheduled_start"));
  const when = new Date(raw.includes("T") ? `${raw}:00+07:00` : raw);
  if (!Number.isFinite(when.getTime())) go("/placement", undefined, "Thời gian Speaking không hợp lệ.");
  // v1.4.2: booking Speaking dưới 12 giờ vẫn được phép.
  // 12 giờ chỉ còn là khuyến nghị vận hành, không phải hard constraint.
  const teacherId = text(formData.get("teacher_id"));
  const { data: teacher } = await supabase.from("teachers").select("id,email,is_placement_assessor").eq("id",teacherId).maybeSingle();
  const founder = ["giaovien@gmail.com","baominh@gmail.com"].includes(String(teacher?.email || "").toLowerCase());
  if (!teacher || (!teacher.is_placement_assessor && !founder)) go("/placement", undefined, "GV này chưa được phép nhận Placement Speaking.");
  const { error } = await supabase.from("placement_speaking_bookings").upsert({
    placement_test_id: text(formData.get("placement_test_id")),
    teacher_id: teacherId,
    scheduled_start: when.toISOString(),
    duration_minutes: 15,
    status: "Booked"
  }, { onConflict: "placement_test_id" });
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement");
  go("/placement", "Đã book Speaking 15 phút cho GV assessor.");
}

export async function updatePlacementRawScores(formData: FormData) {
  await requireRole(["admin","academic_manager","customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.from("placement_tests").update({
    listening_score: text(formData.get("listening_score")) ? toNumber(formData.get("listening_score")) : null,
    reading_score: text(formData.get("reading_score")) ? toNumber(formData.get("reading_score")) : null,
    writing_score: text(formData.get("writing_score")) ? toNumber(formData.get("writing_score")) : null,
    objective_note: text(formData.get("objective_note")) || null,
    completed_at: text(formData.get("completed_at")) || new Date().toISOString(),
    status: "Completed"
  }).eq("id", text(formData.get("placement_test_id")));
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement");
  go("/placement", "Đã lưu điểm Placement. Chờ Speaking/Academic validation.");
}

export async function submitPlacementSpeakingScore(formData: FormData) {
  const profile = await requireRole(["teacher","admin","academic_manager"]);
  const supabase = await createClient();
  const bookingId = text(formData.get("booking_id"));
  if (profile.role === "teacher") {
    const { data: teacher } = await supabase.from("teachers").select("id").eq("user_id",profile.id).maybeSingle();
    const { data: booking } = await supabase.from("placement_speaking_bookings").select("teacher_id").eq("id",bookingId).maybeSingle();
    if (!teacher || booking?.teacher_id !== teacher.id) go("/placement", undefined, "Bạn không được phân công Speaking booking này.");
  }
  const { error } = await supabase.from("placement_speaking_bookings").update({
    speaking_score: toNumber(formData.get("speaking_score")),
    assessor_note: text(formData.get("assessor_note")) || null,
    status: "Completed",
    completed_at: new Date().toISOString()
  }).eq("id",bookingId);
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement");
  go("/placement", "Đã lưu điểm Speaking.");
}

export async function validatePlacementResult(formData: FormData) {
  const profile = await requireRole(["admin","academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("placement_tests").update({
    entry_level: text(formData.get("entry_level")),
    overall_score: text(formData.get("overall_score")) ? toNumber(formData.get("overall_score")) : null,
    academic_note: text(formData.get("academic_note")) || null,
    recommendation: text(formData.get("recommendation")) || null,
    validated_by: profile.id,
    validated_at: new Date().toISOString(),
    status: "Validated"
  }).eq("id", text(formData.get("placement_test_id")));
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement");
  go("/placement", "Academic đã validate kết quả Placement.");
}

export async function markPlacementFollowup(formData: FormData) {
  const profile = await requireRole(["admin","customer_service"]);
  const supabase = await createClient();
  const { data: row } = await supabase.from("placement_tests").select("validated_at").eq("id", text(formData.get("placement_test_id"))).maybeSingle();
  if (!row?.validated_at) go("/placement", undefined, "Academic chưa validate kết quả.");
  const { error } = await supabase.from("placement_tests").update({
    result_released_at: new Date().toISOString(),
    followup_at: new Date().toISOString(),
    followup_note: text(formData.get("followup_note")) || null,
    followup_by: profile.id,
    status: "Released"
  }).eq("id", text(formData.get("placement_test_id")));
  if (error) go("/placement", undefined, error.message);
  revalidatePath("/placement");
  go("/placement", "Đã ghi nhận trả điểm và tư vấn follow-up.");
}

export async function adminCreateUser(formData: FormData) {
  await requireRole(["admin"]);
  const email = text(formData.get("email")).toLowerCase();
  const password = text(formData.get("password"));
  const fullName = text(formData.get("full_name"));
  const role = text(formData.get("role")) as AppRole;
  if (password.length < 8) go("/admin/users", undefined, "Mật khẩu tạm phải có ít nhất 8 ký tự.");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) go("/admin/users", undefined, error?.message || "Không tạo được user.");
  const userId = data.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, full_name: fullName, role, is_active: true });
  if (profileError) go("/admin/users", undefined, profileError.message);
  if (role === "teacher") {
    const existingTeacherId = text(formData.get("link_teacher_id"));
    const result = existingTeacherId
      ? await admin.from("teachers").update({ user_id: userId, full_name: fullName, email }).eq("id", existingTeacherId)
      : await admin.from("teachers").insert({ user_id: userId, full_name: fullName, email });
    if (result.error) go("/admin/users", undefined, result.error.message);
  }
  if (role === "student") {
    const existingStudentId = text(formData.get("link_student_id"));
    const result = existingStudentId
      ? await admin.from("students").update({ user_id: userId, full_name: fullName, email }).eq("id", existingStudentId)
      : await admin.from("students").insert({ user_id: userId, full_name: fullName, email, created_by: (await requireProfile()).id });
    if (result.error) go("/admin/users", undefined, result.error.message);
  }
  revalidatePath("/admin/users");
  go("/admin/users", "Đã tạo tài khoản và gán role.");
}

export async function updateOwnProfile(formData: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_profile", { p_full_name: text(formData.get("full_name")) });
  if (error) go("/profile", undefined, error.message);
  revalidatePath("/profile");
  go("/profile", "Đã cập nhật tên hiển thị.");
}

export async function archiveStudent(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("students").update({ archived_at: new Date().toISOString(), archived_by: profile.id, status: "Archived" }).eq("id", text(formData.get("student_id")));
  if (error) go("/students", undefined, error.message);
  revalidatePath("/students");
  go("/students", "Đã archive hồ sơ học viên.");
}

export async function archiveClass(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("classes").update({ archived_at: new Date().toISOString(), archived_by: profile.id, status: "Closed" }).eq("id", text(formData.get("class_id")));
  if (error) go("/classes", undefined, error.message);
  revalidatePath("/classes");
  go("/classes", "Đã archive lớp học.");
}

export async function adminUpdateUser(formData: FormData) {
  await requireRole(["admin"]);
  const userId = text(formData.get("user_id"));
  const role = text(formData.get("role")) as AppRole;
  const isActive = formData.get("is_active") === "on";
  const fullName = text(formData.get("full_name"));
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role, is_active: isActive, full_name: fullName }).eq("id", userId);
  if (error) go("/admin/users", undefined, error.message);
  const { data: existingTeacher } = await admin.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  const { data: existingStudent } = await admin.from("students").select("id").eq("user_id", userId).maybeSingle();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email || null;
  if (role === "teacher" && !existingTeacher) {
    const { error: teacherError } = await admin.from("teachers").insert({ user_id: userId, full_name: fullName, email });
    if (teacherError) go("/admin/users", undefined, teacherError.message);
  }
  if (role === "student" && !existingStudent) {
    const { error: studentError } = await admin.from("students").insert({ user_id: userId, full_name: fullName, email, created_by: (await requireProfile()).id });
    if (studentError) go("/admin/users", undefined, studentError.message);
  }
  revalidatePath("/admin/users");
  go("/admin/users", "Đã cập nhật role và trạng thái tài khoản.");
}

export async function adminSendPasswordReset(formData: FormData) {
  await requireRole(["admin"]);
  const email = text(formData.get("email"));
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) go("/admin/users", undefined, error.message);
  // The generated link is intentionally not displayed in the UI. Configure Supabase SMTP
  // and use the normal forgot-password flow for delivery in production.
  if (!data.properties?.action_link) go("/admin/users", undefined, "Không tạo được recovery link.");
  go("/admin/users", "Recovery link đã được tạo. Hãy cấu hình SMTP và dùng màn hình Forgot Password để gửi email tự động.");
}

export async function rescheduleSession(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const classId = text(formData.get("class_id"));
  const { error } = await supabase.rpc("reschedule_session", {
    p_session_id: text(formData.get("session_id")),
    p_new_date: text(formData.get("new_date")),
    p_new_start: text(formData.get("new_start")),
    p_new_end: text(formData.get("new_end")),
    p_reason: text(formData.get("reason"))
  });
  if (error) go(`/classes/${classId}`, undefined, error.message);
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/schedule");
  go(`/classes/${classId}`, "Đã đổi lịch và lưu session change history.");
}

export async function gradeAssignmentSubmission(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "teacher"]);
  const supabase = await createClient();
  const submissionId = text(formData.get("submission_id"));
  const status = text(formData.get("status")) || "Graded";
  const { error } = await supabase.from("assignment_submissions").update({
    score: text(formData.get("score")) ? toNumber(formData.get("score")) : null,
    feedback: text(formData.get("feedback")) || null,
    status,
    graded_by: profile.id,
    graded_at: new Date().toISOString()
  }).eq("id", submissionId);
  if (error) go("/academic", undefined, error.message);
  revalidatePath("/academic");
  revalidatePath("/dashboard");
  go("/academic", status === "Revision required" ? "Đã yêu cầu học viên chỉnh sửa bài." : "Đã chấm và lưu kết quả assignment.");
}

export async function createProgram(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("programs").insert({
    code: text(formData.get("code")).toUpperCase(),
    name: text(formData.get("name")),
    category: text(formData.get("category")),
    is_active: true
  });
  if (error) go("/catalog", undefined, error.message);
  revalidatePath("/catalog");
  go("/catalog", "Đã tạo chương trình.");
}

export async function updateProgram(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("programs").update({
    code: text(formData.get("code")).toUpperCase(),
    name: text(formData.get("name")),
    category: text(formData.get("category")),
    is_active: formData.get("is_active") === "on"
  }).eq("id", text(formData.get("program_id")));
  if (error) go("/catalog", undefined, error.message);
  revalidatePath("/catalog");
  go("/catalog", "Đã cập nhật chương trình.");
}

export async function createLevel(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("levels").insert({
    program_id: text(formData.get("program_id")),
    code: text(formData.get("code")).toUpperCase(),
    name: text(formData.get("name")),
    sequence_no: toNumber(formData.get("sequence_no"), 1),
    is_active: true
  });
  if (error) go("/catalog", undefined, error.message);
  revalidatePath("/catalog");
  go("/catalog", "Đã tạo level.");
}

export async function updateLevel(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("levels").update({
    code: text(formData.get("code")).toUpperCase(),
    name: text(formData.get("name")),
    sequence_no: toNumber(formData.get("sequence_no"), 1),
    is_active: formData.get("is_active") === "on"
  }).eq("id", text(formData.get("level_id")));
  if (error) go("/catalog", undefined, error.message);
  revalidatePath("/catalog");
  go("/catalog", "Đã cập nhật level.");
}

export async function createCourseTemplate(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("course_templates").insert({
    program_id: text(formData.get("program_id")),
    level_id: text(formData.get("level_id")) || null,
    name: text(formData.get("name")),
    total_hours: toNumber(formData.get("total_hours")),
    total_sessions: toNumber(formData.get("total_sessions")),
    target: text(formData.get("target")) || null,
    midterm_percent: toNumber(formData.get("midterm_percent"), 50),
    final_percent: 100,
    is_active: true
  });
  if (error) go("/catalog", undefined, error.message);
  revalidatePath("/catalog");
  go("/catalog", "Đã tạo course template.");
}

export async function updateTuitionAccount(formData: FormData) {
  await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const accountId = text(formData.get("tuition_account_id"));
  const gross = toNumber(formData.get("gross_amount"));
  const discount = toNumber(formData.get("discount_amount"));
  const net = Math.max(gross - discount, 0);
  const { data: current, error: fetchError } = await supabase.from("tuition_accounts").select("paid_amount").eq("id", accountId).single();
  if (fetchError) go("/finance", undefined, fetchError.message);
  const paid = Number(current?.paid_amount || 0);
  const status = paid >= net ? "Paid" : paid > 0 ? "Partially paid" : "Open";
  const { error } = await supabase.from("tuition_accounts").update({
    package_name: text(formData.get("package_name")),
    gross_amount: gross,
    discount_amount: discount,
    net_amount: net,
    balance_amount: Math.max(net - paid, 0),
    purchased_hours: text(formData.get("purchased_hours")) ? toNumber(formData.get("purchased_hours")) : null,
    renewal_due_date: text(formData.get("renewal_due_date")) || null,
    status
  }).eq("id", accountId);
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/finance");
  go("/finance", "Đã cập nhật tài khoản học phí.");
}

export async function updatePayment(formData: FormData) {
  await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.from("payment_transactions").update({
    amount: toNumber(formData.get("amount")),
    paid_at: text(formData.get("paid_at")),
    method: text(formData.get("method")) || null,
    reference: text(formData.get("reference")) || null,
    note: text(formData.get("note")) || null
  }).eq("id", text(formData.get("payment_id")));
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/finance");
  go("/finance", "Đã điều chỉnh payment transaction và tái tính công nợ.");
}

export async function updateRenewalFollowup(formData: FormData) {
  await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.from("renewal_followups").update({
    due_at: text(formData.get("due_at")),
    status: text(formData.get("status")),
    outcome: text(formData.get("outcome")) || null,
    note: text(formData.get("note")) || null
  }).eq("id", text(formData.get("followup_id")));
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/finance");
  go("/finance", "Đã cập nhật follow-up tái phí.");
}

// v1.2.0 — Finance, expense accounting, receipts and notifications
export async function createExpense(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const amount = toNumber(formData.get("amount"));
  if (amount <= 0) go("/finance/expenses", undefined, "Số tiền chi phải lớn hơn 0.");
  const { error } = await supabase.from("expense_transactions").insert({
    category_id: text(formData.get("category_id")),
    cost_type: text(formData.get("cost_type")) || "Variable cost",
    expense_date: text(formData.get("expense_date")) || new Date().toISOString().slice(0, 10),
    amount,
    vendor: text(formData.get("vendor")) || null,
    description: text(formData.get("description")),
    payment_method: text(formData.get("payment_method")) || null,
    reference: text(formData.get("reference")) || null,
    status: text(formData.get("status")) || "Paid",
    teacher_id: text(formData.get("teacher_id")) || null,
    payroll_month: text(formData.get("payroll_month")) || null,
    receipt_url: text(formData.get("receipt_url")) || null,
    created_by: profile.id,
    approved_by: profile.id,
    approved_at: new Date().toISOString()
  });
  if (error) go("/finance/expenses", undefined, error.message);
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  revalidatePath("/dashboard");
  go("/finance/expenses", "Đã ghi nhận chi phí.");
}

export async function updateExpense(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const amount = toNumber(formData.get("amount"));
  if (amount <= 0) go("/finance/expenses", undefined, "Số tiền chi phải lớn hơn 0.");
  const { error } = await supabase.from("expense_transactions").update({
    category_id: text(formData.get("category_id")),
    cost_type: text(formData.get("cost_type")) || "Variable cost",
    expense_date: text(formData.get("expense_date")),
    amount,
    vendor: text(formData.get("vendor")) || null,
    description: text(formData.get("description")),
    payment_method: text(formData.get("payment_method")) || null,
    reference: text(formData.get("reference")) || null,
    status: text(formData.get("status")) || "Paid",
    receipt_url: text(formData.get("receipt_url")) || null,
    approved_by: profile.id,
    approved_at: new Date().toISOString()
  }).eq("id", text(formData.get("expense_id")));
  if (error) go("/finance/expenses", undefined, error.message);
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  go("/finance/expenses", "Đã cập nhật chi phí.");
}

export async function archiveExpense(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("expense_transactions").update({
    archived_at: new Date().toISOString(),
    archived_by: profile.id,
    status: "Void"
  }).eq("id", text(formData.get("expense_id")));
  if (error) go("/finance/expenses", undefined, error.message);
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  go("/finance/expenses", "Đã huỷ và lưu trữ khoản chi. Dữ liệu vẫn được giữ trong audit log.");
}

export async function postTeacherPayrollExpense(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const teacherId = text(formData.get("teacher_id"));
  const payrollMonth = text(formData.get("payroll_month"));
  const [{ data: payroll, error: payrollError }, { data: category, error: categoryError }] = await Promise.all([
    supabase.from("teacher_payroll_monthly").select("teacher_id,teacher_code,teacher_name,payroll_month,completed_hours,hourly_rate,estimated_payroll").eq("teacher_id", teacherId).eq("payroll_month", payrollMonth).maybeSingle(),
    supabase.from("finance_categories").select("id").eq("code", "PAYROLL_TEACHER").single()
  ]);
  if (payrollError || categoryError || !payroll || !category) {
    go("/finance/expenses", undefined, payrollError?.message || categoryError?.message || "Không tìm thấy dữ liệu lương giáo viên.");
  }
  if (Number(payroll.completed_hours || 0) <= 0) {
    go("/finance/expenses", undefined, "Không thể ghi nhận lương vì giáo viên chưa có giờ hoàn thành trong tháng.");
  }
  if (Number(payroll.hourly_rate || 0) <= 0) {
    go("/finance/expenses", undefined, "Chưa thiết lập đơn giá giờ dạy cho giáo viên. Vui lòng cập nhật đơn giá trước.");
  }
  if (Number(payroll.estimated_payroll || 0) <= 0) {
    go("/finance/expenses", undefined, "Mức lương phải lớn hơn 0 trước khi ghi vào chi phí.");
  }
  const sourceKey = `teacher-payroll:${teacherId}:${payrollMonth}`;
  const { error } = await supabase.from("expense_transactions").upsert({
    category_id: category.id,
    cost_type: "Teacher payroll",
    expense_date: `${payrollMonth.slice(0, 7)}-01`,
    amount: Number(payroll.estimated_payroll || 0),
    vendor: payroll.teacher_name,
    description: `Lương GV ${payroll.teacher_name} · ${Number(payroll.completed_hours || 0).toLocaleString("vi-VN")} giờ × ${Number(payroll.hourly_rate || 0).toLocaleString("vi-VN")} đ`,
    payment_method: "Payroll",
    status: "Approved",
    teacher_id: teacherId,
    payroll_month: payrollMonth,
    source_key: sourceKey,
    created_by: profile.id,
    approved_by: profile.id,
    approved_at: new Date().toISOString(),
    archived_at: null,
    archived_by: null
  }, { onConflict: "source_key" });
  if (error) go("/finance/expenses", undefined, error.message);
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  go("/finance/expenses", "Đã ghi nhận chi phí lương giáo viên. Chạy lại sẽ cập nhật thay vì tạo trùng.");
}

export async function sendFinanceNotification(formData: FormData) {
  await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_student_finance_notification", {
    p_student_id: text(formData.get("student_id")),
    p_kind: text(formData.get("kind")) || "finance_notice",
    p_title: text(formData.get("title")),
    p_body: text(formData.get("body")),
    p_action_url: text(formData.get("action_url")) || "/finance",
    p_priority: text(formData.get("priority")) || "Normal",
    p_dedupe_key: text(formData.get("dedupe_key")) || null
  });
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  go("/finance", "Đã gửi thông báo vào tài khoản học viên.");
}

export async function generateRenewalNotifications(formData: FormData) {
  await requireRole(["admin", "customer_service"]);
  const supabase = await createClient();
  const days = toNumber(formData.get("days"), 14);
  const { data, error } = await supabase.rpc("generate_renewal_notifications", { p_days: days });
  if (error) go("/finance", undefined, error.message);
  revalidatePath("/notifications");
  go("/finance", `Đã tạo/cập nhật ${Number(data || 0)} thông báo tái phí.`);
}

export async function markNotificationRead(formData: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: text(formData.get("notification_id")) });
  if (error) go("/notifications", undefined, error.message);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  const returnTo = text(formData.get("return_to"));
  go(returnTo.startsWith("/") ? returnTo : "/notifications", "Đã đánh dấu thông báo là đã đọc.");
}

export async function markAllNotificationsRead(_formData: FormData) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) go("/notifications", undefined, error.message);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  go("/notifications", "Đã đánh dấu tất cả thông báo là đã đọc.");
}

// v1.2.1 — Monthly teacher payroll review and approval
export async function updateTeacherHourlyRate(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const teacherId = text(formData.get("teacher_id"));
  const month = text(formData.get("return_month"));
  const target = text(formData.get("return_path")) || (month ? `/payroll?month=${month}` : "/payroll");
  const hourlyRate = toNumber(formData.get("hourly_rate"));
  const taHourlyRate = toNumber(formData.get("ta_hourly_rate"));
  if (hourlyRate < 50000 || hourlyRate > 1500000) go(target, undefined, "Đơn giá giờ dạy phải từ 50.000đ đến 1.500.000đ mỗi giờ.");
  if (taHourlyRate < 0 || taHourlyRate > 1500000) go(target, undefined, "Đơn giá TA phải từ 0đ đến 1.500.000đ mỗi giờ.");
  const { error } = await supabase.rpc("update_teacher_compensation_rate", {
    p_teacher_id: teacherId,
    p_hourly_rate: hourlyRate,
    p_ta_hourly_rate: taHourlyRate,
    p_effective_from: text(formData.get("effective_from")) || new Date().toISOString().slice(0, 10),
    p_note: text(formData.get("note")) || null
  });
  if (error) go(target, undefined, error.message);
  revalidatePath("/dashboard");
  revalidatePath("/payroll");
  revalidatePath("/finance/expenses");
  go(target, "Đã cập nhật đơn giá giờ dạy. Giáo viên sẽ thấy mức mới trên tài khoản của mình.");
}

export async function generateTeacherPayrollMonth(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const month = text(formData.get("payroll_month"));
  const monthDate = month.length === 7 ? `${month}-01` : month;
  const { data, error } = await supabase.rpc("generate_teacher_payroll_statements", {
    p_month: monthDate,
    p_force: true
  });
  if (error) go(`/payroll?month=${month.slice(0, 7)}`, undefined, error.message);
  revalidatePath("/dashboard");
  revalidatePath("/payroll");
  go(`/payroll?month=${month.slice(0, 7)}`, `Đã tổng kết hoặc cập nhật ${Number(data || 0)} bảng lương.`);
}

export async function teacherReviewPayroll(formData: FormData) {
  await requireRole(["teacher"]);
  const supabase = await createClient();
  const statementId = text(formData.get("statement_id"));
  const decision = text(formData.get("decision"));
  const month = text(formData.get("return_month"));
  const target = text(formData.get("return_path")) || (month ? `/payroll?month=${month}` : "/payroll");
  const { error } = await supabase.rpc("teacher_review_payroll", {
    p_statement_id: statementId,
    p_decision: decision,
    p_note: text(formData.get("note")) || null
  });
  if (error) go(target, undefined, error.message);
  revalidatePath("/dashboard");
  revalidatePath("/payroll");
  go(target, decision === "Approved" ? "Bạn đã xác nhận số giờ và mức lương tháng." : "Đã gửi báo cáo sai lệch cho Admin.");
}

export async function adminApproveTeacherPayroll(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const statementId = text(formData.get("statement_id"));
  const month = text(formData.get("return_month"));
  const { error } = await supabase.rpc("admin_approve_teacher_payroll", {
    p_statement_id: statementId,
    p_admin_note: text(formData.get("admin_note")) || null,
    p_mark_paid: text(formData.get("mark_paid")) === "true"
  });
  const target = month ? `/payroll?month=${month}` : "/payroll";
  if (error) go(target, undefined, error.message);
  revalidatePath("/dashboard");
  revalidatePath("/payroll");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  go(target, "Đã duyệt bảng lương và tự động ghi nhận vào chi phí tháng.");
}

export async function adminMarkTeacherPayrollPaid(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const statementId = text(formData.get("statement_id"));
  const month = text(formData.get("return_month"));
  const { error } = await supabase.rpc("admin_mark_teacher_payroll_paid", {
    p_statement_id: statementId
  });
  const target = month ? `/payroll?month=${month}` : "/payroll";
  if (error) go(target, undefined, error.message);
  revalidatePath("/dashboard");
  revalidatePath("/payroll");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  go(target, "Đã đánh dấu bảng lương là đã thanh toán.");
}

export async function commitMonthlyFinancialImport() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("commit_monthly_financial_import");
  if (error) go("/finance/reports", undefined, error.message);
  revalidatePath("/dashboard");
  revalidatePath("/finance/reports");
  go("/finance/reports", `Đã đồng bộ ${Number(data || 0)} tháng dữ liệu vào bảng cân đối.`);
}

// v1.3.0 — Workforce scheduling, clock-in/out, staff payroll and teacher KPI
export async function teacherSessionCheckIn(formData: FormData) {
  await requireRole(["teacher"]);
  const supabase = await createClient();
  const sessionId = text(formData.get("session_id"));
  const returnPath = text(formData.get("return_path")) || "/workforce";
  const { error } = await supabase.rpc("teacher_check_in_session", { p_session_id: sessionId });
  if (error) go(returnPath, undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/dashboard");
  revalidatePath("/academic");
  go(returnPath, "Đã check-in buổi dạy.");
}

export async function teacherSessionCheckOut(formData: FormData) {
  await requireRole(["teacher"]);
  const supabase = await createClient();
  const sessionId = text(formData.get("session_id"));
  const returnPath = text(formData.get("return_path")) || "/workforce";
  const { error } = await supabase.rpc("teacher_check_out_session", {
    p_session_id: sessionId,
    p_topic: text(formData.get("topic")) || null
  });
  if (error) go(returnPath, undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/dashboard");
  revalidatePath("/academic");
  revalidatePath("/payroll");
  go(returnPath, "Đã check-out và hoàn tất buổi dạy. Buổi học đủ điều kiện tính lương nếu đúng quy định chấm công.");
}

export async function createStaffWorkSchedule(formData: FormData) {
  const profile = await requireRole(["admin", "academic_manager", "customer_service"]);
  const supabase = await createClient();
  const userId = profile.role === "admin" ? text(formData.get("user_id")) : profile.id;
  if (!userId) go("/workforce", undefined, "Vui lòng chọn nhân sự.");
  const { data: staffProfile, error: staffError } = await supabase.from("profiles").select("id,role").eq("id", userId).maybeSingle();
  if (staffError || !staffProfile || !["academic_manager", "customer_service"].includes(String(staffProfile.role))) {
    go("/workforce", undefined, staffError?.message || "Chỉ Academic và CSKH mới đăng ký lịch làm tại đây.");
  }
  const { error } = await supabase.from("staff_work_schedules").insert({
    user_id: userId,
    role: staffProfile.role,
    work_date: text(formData.get("work_date")),
    start_time: text(formData.get("start_time")),
    end_time: text(formData.get("end_time")),
    work_mode: text(formData.get("work_mode")) || "Office",
    location: text(formData.get("location")) || null,
    note: text(formData.get("note")) || null,
    status: profile.role === "admin" ? "Approved" : "Planned",
    created_by: profile.id,
    approved_by: profile.role === "admin" ? profile.id : null,
    approved_at: profile.role === "admin" ? new Date().toISOString() : null
  });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/dashboard");
  go("/workforce", "Đã đăng ký lịch làm.");
}

export async function adminOverrideTeacherCheckin(formData: FormData) {
  const profile=await requireRole(["admin"]);
  const admin=createAdminClient();
  const sessionId=text(formData.get("session_id")), teacherId=text(formData.get("teacher_id"));
  const checkInAt=text(formData.get("check_in_at")), checkOutAt=text(formData.get("check_out_at")), reason=text(formData.get("reason"));
  if(!sessionId||!teacherId||!checkInAt||!reason) go("/workforce",undefined,"Thiếu thông tin override GV.");
  if(checkOutAt&&new Date(checkOutAt).getTime()<new Date(checkInAt).getTime()) go("/workforce",undefined,"Check-out không thể trước Check-in.");
  const {data:session,error:sessionError}=await admin.from("sessions").select("scheduled_date,start_time").eq("id",sessionId).single();
  if(sessionError||!session) go("/workforce",undefined,sessionError?.message||"Không tìm thấy session.");
  const scheduledStart=new Date(`${session.scheduled_date}T${String(session.start_time).slice(0,8)}+07:00`);
  const lateMinutes=Math.max(0,Math.round((new Date(checkInAt).getTime()-scheduledStart.getTime())/60000));
  const {error}=await admin.from("teacher_session_checkins").upsert({
    session_id:sessionId,teacher_id:teacherId,check_in_at:new Date(checkInAt).toISOString(),
    check_out_at:checkOutAt?new Date(checkOutAt).toISOString():null,late_minutes:lateMinutes,early_checkout_minutes:0,
    status:"Adjusted",adjustment_note:reason,adjusted_by:profile.id,updated_at:new Date().toISOString()
  },{onConflict:"session_id,teacher_id"});
  if(error) go("/workforce",undefined,error.message);
  revalidatePath("/workforce"); revalidatePath("/dashboard"); revalidatePath("/payroll");
  go("/workforce","Admin đã override Check-in/Check-out của giáo viên.");
}

export async function adminOverrideStaffCheckin(formData: FormData) {
  const profile=await requireRole(["admin"]);
  const admin=createAdminClient();
  const scheduleId=text(formData.get("schedule_id")), checkInAt=text(formData.get("check_in_at")), checkOutAt=text(formData.get("check_out_at")), reason=text(formData.get("reason"));
  if(!scheduleId||!checkInAt||!reason) go("/workforce",undefined,"Thiếu thông tin override nhân sự.");
  if(checkOutAt&&new Date(checkOutAt).getTime()<new Date(checkInAt).getTime()) go("/workforce",undefined,"Check-out không thể trước Check-in.");
  const {data:schedule,error:scheduleError}=await admin.from("staff_work_schedules").select("id,user_id,work_date,start_time").eq("id",scheduleId).single();
  if(scheduleError||!schedule) go("/workforce",undefined,scheduleError?.message||"Không tìm thấy ca làm.");
  const scheduledStart=new Date(`${schedule.work_date}T${String(schedule.start_time).slice(0,8)}+07:00`);
  const lateMinutes=Math.max(0,Math.round((new Date(checkInAt).getTime()-scheduledStart.getTime())/60000));
  const {error}=await admin.from("staff_work_logs").upsert({
    schedule_id:scheduleId,user_id:schedule.user_id,check_in_at:new Date(checkInAt).toISOString(),
    check_out_at:checkOutAt?new Date(checkOutAt).toISOString():null,late_minutes:lateMinutes,status:"Adjusted",
    adjustment_note:reason,adjusted_by:profile.id,updated_at:new Date().toISOString()
  },{onConflict:"schedule_id"});
  if(error) go("/workforce",undefined,error.message);
  revalidatePath("/workforce"); revalidatePath("/dashboard");
  go("/workforce","Admin đã override Check-in/Check-out của nhân sự.");
}

export async function staffWorkCheckIn(formData: FormData) {
  await requireRole(["academic_manager", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_check_in", { p_schedule_id: text(formData.get("schedule_id")) });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/dashboard");
  go("/workforce", "Đã check-in ca làm.");
}

export async function staffWorkCheckOut(formData: FormData) {
  await requireRole(["academic_manager", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_check_out", { p_schedule_id: text(formData.get("schedule_id")) });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/dashboard");
  go("/workforce", "Đã check-out ca làm. Giờ công đã được cập nhật.");
}

export async function updateStaffHourlyRate(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const hourlyRate = toNumber(formData.get("hourly_rate"));
  if (hourlyRate < 20000 || hourlyRate > 1500000) go("/workforce", undefined, "Đơn giá nhân sự phải từ 20.000 đến 1.500.000đ/giờ.");
  const { error } = await supabase.rpc("update_staff_compensation_rate", {
    p_user_id: text(formData.get("user_id")),
    p_hourly_rate: hourlyRate,
    p_effective_from: text(formData.get("effective_from")) || new Date().toISOString().slice(0, 10),
    p_note: text(formData.get("note")) || null
  });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/finance/expenses");
  go("/workforce", "Đã cập nhật đơn giá nhân sự.");
}

export async function generateStaffPayrollMonth(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const month = text(formData.get("payroll_month"));
  const monthDate = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month;
  const { data, error } = await supabase.rpc("generate_staff_payroll_statements", { p_month: monthDate, p_force: true });
  if (error) go(`/workforce?month=${month.slice(0, 7)}`, undefined, error.message);
  revalidatePath("/workforce");
  go(`/workforce?month=${month.slice(0, 7)}`, `Đã tổng kết hoặc cập nhật ${Number(data || 0)} bảng lương nhân sự.`);
}

export async function staffReviewPayroll(formData: FormData) {
  await requireRole(["academic_manager", "customer_service"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_review_payroll", {
    p_statement_id: text(formData.get("statement_id")),
    p_decision: text(formData.get("decision")),
    p_note: text(formData.get("note")) || null
  });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  go("/workforce", text(formData.get("decision")) === "Approved" ? "Đã xác nhận bảng công và mức lương." : "Đã gửi yêu cầu kiểm tra bảng công.");
}

export async function adminApproveStaffPayroll(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_staff_payroll", {
    p_statement_id: text(formData.get("statement_id")),
    p_admin_note: text(formData.get("note")) || null,
    p_mark_paid: false
  });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/finance/expenses");
  go("/workforce", "Đã duyệt lương nhân sự và ghi vào bảng chi phí.");
}

export async function adminMarkStaffPayrollPaid(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_mark_staff_payroll_paid", { p_statement_id: text(formData.get("statement_id")) });
  if (error) go("/workforce", undefined, error.message);
  revalidatePath("/workforce");
  revalidatePath("/finance/expenses");
  go("/workforce", "Đã đánh dấu lương nhân sự là đã thanh toán.");
}

export async function generateTeacherKpiMonth(formData: FormData) {
  await requireRole(["admin", "academic_manager"]);
  const supabase = await createClient();
  const month = text(formData.get("kpi_month"));
  const monthDate = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month;
  const { data, error } = await supabase.rpc("generate_teacher_kpi_snapshots", { p_month: monthDate, p_force: true });
  if (error) go(`/workforce/kpi?month=${month.slice(0, 7)}`, undefined, error.message);
  revalidatePath("/workforce/kpi");
  go(`/workforce/kpi?month=${month.slice(0, 7)}`, `Đã cập nhật KPI cho ${Number(data || 0)} giáo viên.`);
}

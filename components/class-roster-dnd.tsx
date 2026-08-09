"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveStudentEnrollment } from "@/app/actions";

export type PlannerStudent = {
  id: string;
  code: string;
  full_name: string;
  status?: string | null;
};

function dragPayload(student: PlannerStudent, sourceClassId?: string | null) {
  return JSON.stringify({ studentId: student.id, sourceClassId: sourceClassId || null });
}

export function WaitingStudentPool({ students }: { students: PlannerStudent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/ze-student");
    if (!raw) return;
    const data = JSON.parse(raw) as { studentId: string; sourceClassId?: string | null };
    if (!data.sourceClassId) return;
    startTransition(async () => {
      const result = await moveStudentEnrollment(data.studentId, null, data.sourceClassId || null);
      setMessage(result.ok ? "Đã đưa học viên về danh sách chờ xếp lớp." : result.error || "Không thể cập nhật lớp.");
      if (result.ok) router.refresh();
    });
  }

  return <div className={`planner-pool ${pending ? "planner-pending" : ""}`} onDragOver={(e)=>e.preventDefault()} onDrop={handleDrop}>
    <div className="planner-pool-head"><div><strong>Học viên chờ xếp lớp</strong><span>Kéo học viên vào một lớp phù hợp</span></div><b>{students.length}</b></div>
    {message ? <div className="planner-inline-message">{message}</div> : null}
    <div className="planner-student-list">
      {students.length ? students.map((student)=><div
        draggable
        className="planner-student-card"
        key={student.id}
        onDragStart={(event)=>{
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/ze-student", dragPayload(student));
        }}
      >
        <span className="planner-drag-handle">⋮⋮</span>
        <div><strong>{student.full_name}</strong><small>{student.code} · {student.status || "Waiting for class"}</small></div>
      </div>) : <div className="planner-empty-mini">Không còn học viên chưa xếp lớp.</div>}
    </div>
    <small className="planner-drop-hint">Có thể kéo HV từ một lớp về đây để gỡ khỏi lớp.</small>
  </div>;
}

export function ClassRosterDropzone({ classId, classCode, capacity, students }: { classId: string; classCode: string; capacity: number; students: PlannerStudent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const raw = event.dataTransfer.getData("application/ze-student");
    if (!raw) return;
    const data = JSON.parse(raw) as { studentId: string; sourceClassId?: string | null };
    if (data.sourceClassId === classId) return;
    startTransition(async () => {
      const result = await moveStudentEnrollment(data.studentId, classId, data.sourceClassId || null);
      setMessage(result.ok ? `Đã xếp học viên vào ${classCode}.` : result.error || "Không thể cập nhật lớp.");
      if (result.ok) router.refresh();
    });
  }

  return <div
    className={`planner-roster-drop ${dragOver ? "planner-roster-over" : ""} ${pending ? "planner-pending" : ""}`}
    onDragOver={(event)=>{event.preventDefault(); setDragOver(true);}}
    onDragLeave={()=>setDragOver(false)}
    onDrop={handleDrop}
  >
    <div className="planner-roster-title"><span>Học viên trong lớp</span><b>{students.length}/{capacity}</b></div>
    {message ? <div className="planner-inline-message">{message}</div> : null}
    <div className="planner-roster-list">
      {students.map((student)=><div
        draggable
        className="planner-roster-student"
        key={student.id}
        onDragStart={(event)=>{
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/ze-student", dragPayload(student, classId));
        }}
      ><span>⋮⋮</span><div><strong>{student.full_name}</strong><small>{student.code}</small></div></div>)}
      {students.length < capacity ? <div className="planner-drop-placeholder">Kéo học viên vào đây</div> : <div className="planner-full">Lớp đã đủ sĩ số</div>}
    </div>
  </div>;
}

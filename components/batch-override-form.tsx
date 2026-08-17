"use client";

import { useState } from "react";
import { adminBatchOverrideTeacherCheckins, requestTeacherBatchCheckinOverride } from "@/app/actions";

type TeacherRow={session_id:string;scheduled_date:string;start_time:string;end_time:string;class_code:string;session_no:number;check_in_at?:string|null;check_out_at?:string|null;hasPending?:boolean};
type AdminRow={value:string;label:string;sub:string};

export function TeacherBatchOverrideForm({rows,month}:{rows:TeacherRow[];month:string}){
  const items=rows.filter(r=>!r.hasPending&&(!r.check_in_at||!r.check_out_at));
  const [selected,setSelected]=useState<string[]>([]);
  if(!items.length) return null;
  const all=selected.length===items.length;
  const toggle=(id:string)=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  return <form action={requestTeacherBatchCheckinOverride} className="batch-override-box">
    <input type="hidden" name="month" value={month}/>
    <div className="batch-override-head"><div><strong>Batch request override</strong><span>Chọn nhiều buổi quên chấm công. Giờ lịch sẽ là giờ đề xuất.</span></div><label className="checkbox-row"><input type="checkbox" checked={all} onChange={()=>setSelected(all?[]:items.map(x=>x.session_id))}/>Chọn tất cả</label></div>
    <div className="batch-override-rows">{items.map(row=><label className="batch-override-row" key={row.session_id}><input type="checkbox" name="session_id" value={row.session_id} checked={selected.includes(row.session_id)} onChange={()=>toggle(row.session_id)}/><span><strong>{row.scheduled_date} · {row.class_code} · Buổi {row.session_no}</strong><small>{row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)} · IN {row.check_in_at?"✓":"thiếu"} · OUT {row.check_out_at?"✓":"thiếu"}</small></span></label>)}</div>
    <label className="form-group"><span>Lý do chung</span><textarea className="textarea" name="reason" required/></label>
    <button className="button button-primary" disabled={!selected.length}>Gửi {selected.length} buổi cho Admin</button>
  </form>;
}

export function AdminBatchOverrideForm({rows,month}:{rows:AdminRow[];month:string}){
  const [selected,setSelected]=useState<string[]>([]);
  if(!rows.length) return null;
  const all=selected.length===rows.length;
  const toggle=(id:string)=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  return <form action={adminBatchOverrideTeacherCheckins} className="batch-override-box admin-batch-override">
    <input type="hidden" name="month" value={month}/>
    <div className="batch-override-head"><div><strong>Admin batch override</strong><span>Dùng giờ lịch làm IN/OUT cho các ca đã chọn.</span></div><label className="checkbox-row"><input type="checkbox" checked={all} onChange={()=>setSelected(all?[]:rows.map(x=>x.value))}/>Chọn tất cả</label></div>
    <div className="batch-override-rows">{rows.map(row=><label className="batch-override-row" key={row.value}><input type="checkbox" name="session_teacher" value={row.value} checked={selected.includes(row.value)} onChange={()=>toggle(row.value)}/><span><strong>{row.label}</strong><small>{row.sub}</small></span></label>)}</div>
    <label className="form-group"><span>Lý do chung</span><textarea className="textarea" name="reason" required/></label>
    <button className="button button-primary" disabled={!selected.length}>Override {selected.length} ca</button>
  </form>;
}

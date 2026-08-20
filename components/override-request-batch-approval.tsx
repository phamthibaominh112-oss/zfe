"use client";
import {useState} from "react";
import {adminApproveTeacherOverrideRequestsBatch} from "@/app/actions";

type Row={id:string;label:string;sub:string};
export function OverrideRequestBatchApproval({rows}:{rows:Row[]}){
  const [selected,setSelected]=useState<string[]>([]);
  if(!rows.length)return null;
  const all=selected.length===rows.length;
  const toggle=(id:string)=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  return <form action={adminApproveTeacherOverrideRequestsBatch} className="batch-override-box batch-approval-box">
    <div className="batch-override-head"><div><strong>Duyệt nhiều yêu cầu override</strong><span>Chọn một số hoặc Select all; Admin note dùng chung.</span></div><label className="checkbox-row"><input type="checkbox" checked={all} onChange={()=>setSelected(all?[]:rows.map(x=>x.id))}/>Select all ({rows.length})</label></div>
    <div className="batch-override-rows">{rows.map(row=><label className="batch-override-row" key={row.id}><input type="checkbox" name="request_id" value={row.id} checked={selected.includes(row.id)} onChange={()=>toggle(row.id)}/><span><strong>{row.label}</strong><small>{row.sub}</small></span></label>)}</div>
    <label className="form-group"><span>Admin note chung (optional)</span><textarea className="textarea" name="admin_note"/></label>
    <button className="button button-primary" disabled={!selected.length}>✓ Approve {selected.length} yêu cầu</button>
  </form>;
}

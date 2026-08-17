"use client";

import { useMemo, useState } from "react";
import { saveTeacherWeeklyAvailability } from "@/app/actions";

const DAYS=["Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy","Chủ nhật"];
type Slot={weekday:number;start_time:string;end_time:string};

export function TeacherAvailabilityWeekForm({weekStart,weekEnd,weekOffset,existing=[]}:{weekStart:string;weekEnd:string;weekOffset:number;existing?:Slot[]}){
  const defaults=useMemo(()=>{const m=new Map<number,Slot>();for(const slot of existing){if(!m.has(slot.weekday))m.set(slot.weekday,slot);}return m;},[existing]);
  const [selected,setSelected]=useState<Record<number,boolean>>(()=>Object.fromEntries(DAYS.map((_,i)=>[i+1,defaults.has(i+1)])));
  const count=Object.values(selected).filter(Boolean).length;
  return <form action={saveTeacherWeeklyAvailability} className="weekly-availability-form">
    <input type="hidden" name="week_start" value={weekStart}/><input type="hidden" name="week_offset" value={weekOffset}/>
    <div className="weekly-availability-head"><div><strong>{weekStart} → {weekEnd}</strong><span>{count} ngày đang chọn · lưu một lần</span></div><button type="button" className="button button-ghost button-small" onClick={()=>setSelected(Object.fromEntries(DAYS.map((_,i)=>[i+1,true])))}>Chọn cả tuần</button></div>
    <div className="weekly-availability-grid">{DAYS.map((label,index)=>{const day=index+1,slot=defaults.get(day),on=!!selected[day];return <section className={`weekly-availability-day ${on?"selected":""}`} key={day}>
      <label className="weekly-day-toggle"><input type="checkbox" name={`selected_${day}`} checked={on} onChange={e=>setSelected(prev=>({...prev,[day]:e.target.checked}))}/><span>{label}</span></label>
      <div className="weekly-time-row"><label><span>Từ</span><input className="input" name={`start_${day}`} type="time" defaultValue={slot?.start_time?.slice(0,5)||"09:00"} disabled={!on}/></label><label><span>Đến</span><input className="input" name={`end_${day}`} type="time" defaultValue={slot?.end_time?.slice(0,5)||"17:00"} disabled={!on}/></label></div>
      <small>{slot?`Đang có ${slot.start_time?.slice(0,5)}–${slot.end_time?.slice(0,5)}`:"Chưa đăng ký"}</small>
    </section>})}</div>
    <div className="weekly-availability-common"><label><span>Hình thức</span><select className="select input" name="mode" defaultValue=""><option value="">Linh hoạt</option><option>Online</option><option>Offline</option><option>Hybrid</option></select></label><label><span>Cơ sở</span><input className="input" name="campus"/></label><label className="weekly-note"><span>Ghi chú chung</span><input className="input" name="note" placeholder="Ví dụ: ưu tiên tối, linh động ±30p"/></label></div>
    <div className="weekly-availability-save"><span>Chỉ ghi đè availability của đúng tuần này.</span><button className="button button-primary">Lưu lịch rảnh cả tuần</button></div>
  </form>;
}

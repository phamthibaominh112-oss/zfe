export const STUDENT_CARE_EFFECTIVE_DATE="2026-09-01";
export type CareCycle={cycle_type:"First week"|"Monthly";cycle_no:number;due_date:string;key:string};
function addDays(value:string,days:number){const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function careCyclesForEnrollment(startDate:string,endDate?:string|null,horizon?:string){
  const out:CareCycle[]=[]; const end=horizon||addDays(new Date().toISOString().slice(0,10),45);
  if(startDate>=STUDENT_CARE_EFFECTIVE_DATE){const due=addDays(startDate,7);if(due<=end&&(!endDate||due<=endDate))out.push({cycle_type:"First week",cycle_no:0,due_date:due,key:`First week|0`});}
  const anchor=startDate>STUDENT_CARE_EFFECTIVE_DATE?startDate:STUDENT_CARE_EFFECTIVE_DATE;
  for(let n=1;n<=36;n++){const due=addDays(anchor,n*30);if(due>end)break;if(!endDate||due<=endDate)out.push({cycle_type:"Monthly",cycle_no:n,due_date:due,key:`Monthly|${n}`});}
  return out;
}
export function careUrgency(due:string,today:string){if(due<today)return "Overdue";if(due===today)return "Due today";return "Upcoming";}

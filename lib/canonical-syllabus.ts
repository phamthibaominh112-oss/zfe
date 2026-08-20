export const CANONICAL_PROGRAMS=[
  {code:"ZEB",name:"IELTS Beginner"},
  {code:"ZEF",name:"IELTS Foundation"},
  {code:"ZEE",name:"IELTS Entry"},
  {code:"ZEM",name:"IELTS Master"}
] as const;

export type CanonicalProgramCode=(typeof CANONICAL_PROGRAMS)[number]["code"];

export function canonicalProgramFromClass(code:unknown,name?:unknown):CanonicalProgramCode|null{
  const raw=String(code||"").trim().toUpperCase();
  for(const p of CANONICAL_PROGRAMS){
    if(raw.startsWith(p.code)) return p.code;
  }
  const nm=String(name||"").toLowerCase();
  if(nm.includes("beginner")) return "ZEB";
  if(nm.includes("foundation")) return "ZEF";
  if(nm.includes("entry")) return "ZEE";
  if(nm.includes("master")) return "ZEM";
  return null;
}

export function mergeSyllabusItem(master:any,override:any){
  if(!master&&!override) return null;
  return {
    ...(master||{}),
    ...(override||{}),
    id:override?.id||master?.id,
    source:override?"Override":"Master",
    program_code:master?.program_code||null,
    session_no:override?.session_no||master?.session_no
  };
}

export function syllabusCompleteness(items:any[]){
  const numbers=new Set((items||[]).map(x=>Number(x.session_no)).filter(n=>n>=1&&n<=36));
  const missing=Array.from({length:36},(_,i)=>i+1).filter(n=>!numbers.has(n));
  return {count:numbers.size,missing,complete:numbers.size===36&&missing.length===0};
}

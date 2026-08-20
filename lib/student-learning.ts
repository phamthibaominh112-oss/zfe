export type SkillName="Listening"|"Reading"|"Writing"|"Speaking";

function joined(value:unknown):Record<string,any>|null{
  if(Array.isArray(value)) return (value[0] as Record<string,any>|undefined)||null;
  return value&&typeof value==="object"?value as Record<string,any>:null;
}
function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:0;}
function clamp(v:number,min=0,max=9){return Math.max(min,Math.min(max,v));}

export const IELTS_PATH=[
  {prefix:"ZEB",code:"ZEB",name:"IELTS Beginner",target:"Foundation readiness"},
  {prefix:"ZEF",code:"ZEF",name:"IELTS Foundation",target:"Build core IELTS skills"},
  {prefix:"ZEE",code:"ZEE",name:"IELTS Entry",target:"Entry band development"},
  {prefix:"ZEM",code:"ZEM",name:"IELTS Master",target:"Higher-band mastery"}
];

export function courseStage(code:string|undefined|null,name:string|undefined|null){
  const raw=String(code||"").toUpperCase();
  const byCode=IELTS_PATH.find(x=>raw.startsWith(x.prefix));
  if(byCode)return byCode;
  const nm=String(name||"").toLowerCase();
  return IELTS_PATH.find(x=>nm.includes(x.name.toLowerCase()))||null;
}

export function buildLearningAnalytics(input:{
  enrollments:any[];sessions:any[];attendance:any[];homework:any[];results:any[];
  placementTests:any[];recommendations:any[];studentTarget?:string|null;
}){
  const {enrollments,sessions,attendance,homework,results,placementTests,recommendations}=input;
  const activeEnrollment=enrollments.find((x:any)=>x.status==="Active")||enrollments[0];
  const activeClass=joined(activeEnrollment?.classes);
  const classSessions=sessions.filter((x:any)=>x.class_id===activeEnrollment?.class_id);
  const completedSessions=classSessions.filter((x:any)=>["Completed","Make-up completed"].includes(String(x.status))).length;
  const totalSessions=n(activeClass?.total_sessions)||classSessions.length||0;
  const progress=totalSessions?completedSessions/totalSessions:0;

  const presentStatuses=new Set(["Present","Late","Joined partially","Make-up completed"]);
  const attendanceRate=attendance.length?attendance.filter((x:any)=>presentStatuses.has(String(x.status))).length/attendance.length:null;
  const hwGood=new Set(["Completed","Partially completed"]);
  const homeworkRate=homework.length?homework.filter((x:any)=>hwGood.has(String(x.status))).length/homework.length:null;

  const latestPlacement=placementTests.find((x:any)=>x.status!=="Cancelled")||placementTests[0];
  const speaking=joined(latestPlacement?.placement_speaking_bookings);
  const skillSeries:Record<SkillName,{value:number,date:string,source:string}[]>={
    Listening:[],Reading:[],Writing:[],Speaking:[]
  };
  if(latestPlacement){
    const date=String(latestPlacement.completed_at||latestPlacement.scheduled_start||"").slice(0,10);
    for(const [skill,key] of [["Listening","listening_score"],["Reading","reading_score"],["Writing","writing_score"]] as const){
      if(latestPlacement[key]!=null) skillSeries[skill].push({value:n(latestPlacement[key]),date,source:"Placement"});
    }
    if(speaking?.speaking_score!=null)skillSeries.Speaking.push({value:n(speaking.speaking_score),date,source:"Placement"});
  }

  for(const row of [...results].reverse()){
    const assessment=joined(row.assessments);
    const type=String(assessment?.type||"");
    const bandValue=row.band!=null?Number(row.band):NaN;
    const score=n(row.score),max=n(assessment?.max_score);
    const normalized=Number.isFinite(bandValue)?bandValue:(max>0?score/max*9:score);
    const date=String(assessment?.assessment_date||row.graded_at||"").slice(0,10);
    const skill=(["Listening","Reading","Writing","Speaking"] as SkillName[]).find(s=>type.toLowerCase().includes(s.toLowerCase()));
    if(skill&&normalized>0)skillSeries[skill].push({value:clamp(normalized),date,source:type});
  }

  const skills=(Object.keys(skillSeries) as SkillName[]).map(skill=>{
    const points=skillSeries[skill];
    const latest=points[points.length-1]?.value??null;
    const previous=points.length>1?points[points.length-2].value:null;
    const delta=latest!=null&&previous!=null?latest-previous:null;
    return {skill,latest,previous,delta,points};
  });
  const available=skills.filter(x=>x.latest!=null);
  const strengths=[...available].sort((a,b)=>n(b.latest)-n(a.latest)).slice(0,2);
  const weaknesses=[...available].sort((a,b)=>n(a.latest)-n(b.latest)).slice(0,2);

  const overallPoints=results.filter((r:any)=>["Midterm","Final","Mock Test"].includes(String(joined(r.assessments)?.type)))
    .map((r:any)=>{
      const a=joined(r.assessments),band=Number(r.band);
      const v=Number.isFinite(band)?band:(n(a?.max_score)>0?n(r.score)/n(a?.max_score)*9:n(r.score));
      return {value:clamp(v),date:String(a?.assessment_date||r.graded_at||"").slice(0,10),type:a?.type};
    }).filter((x:any)=>x.value>0);
  if(latestPlacement?.overall_score!=null)overallPoints.unshift({value:n(latestPlacement.overall_score),date:String(latestPlacement.completed_at||latestPlacement.scheduled_start||"").slice(0,10),type:"Placement"});

  const latestOverall=overallPoints[overallPoints.length-1]?.value
    ?? (available.length?available.reduce((s,x)=>s+n(x.latest),0)/available.length:null);
  const prevOverall=overallPoints.length>1?overallPoints[overallPoints.length-2]?.value:null;
  const trend=latestOverall!=null&&prevOverall!=null?latestOverall-prevOverall:0;

  // Conservative operational forecast, intentionally labelled as an estimate.
  const behaviorAdj=((attendanceRate??0.8)-0.8)*0.8+((homeworkRate??0.8)-0.8)*0.6;
  const progressAdj=(progress-.5)*0.35;
  const forecast=latestOverall==null?null:clamp(latestOverall+trend*.45+behaviorAdj+progressAdj);
  const low=forecast==null?null:clamp(forecast-.35);
  const high=forecast==null?null:clamp(forecast+.35);

  const midterm=results.find((r:any)=>String(joined(r.assessments)?.type)==="Midterm");
  const final=results.find((r:any)=>String(joined(r.assessments)?.type)==="Final");

  return {
    activeEnrollment,activeClass,completedSessions,totalSessions,progress,attendanceRate,homeworkRate,
    skills,strengths,weaknesses,latestOverall,trend,forecast,forecastLow:low,forecastHigh:high,
    midterm,final,recommendations:recommendations||[]
  };
}

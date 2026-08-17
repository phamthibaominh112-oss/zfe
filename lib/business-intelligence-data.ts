import { buildFinanceDashboardData, extractBaselineFinanceData } from "@/lib/finance-dashboard-data";

function joined(value:unknown):Record<string,any>|null{
  if(Array.isArray(value)) return (value[0] as Record<string,any>|undefined)||null;
  return value&&typeof value==="object"?value as Record<string,any>:null;
}
function n(v:unknown){return Number(v||0);}
function pct(actual:number,target:number){return target>0?actual/target:0;}
function normalize(value:unknown){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/đ/g,"d").replace(/[^a-z0-9]+/g," ").trim();}
function baselineStudentKey(party:unknown){
  const text=String(party||"");
  const match=text.match(/^([A-Za-z0-9_-]+)\s*[-·]\s*(.+)$/);
  return match?`code:${match[1]}`:`name:${normalize(text)}`;
}
function monthRange(month:string){
  const start=`${month}-01`;
  const d=new Date(`${start}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);
  return {start,end:d.toISOString().slice(0,10)};
}
function monthLabel(month:string){const [y,m]=month.split("-");return `Tháng ${Number(m)}/${y}`;}

export async function buildBusinessIntelligenceData(admin:any,template:string,selectedMonth:string){
  const baseline=extractBaselineFinanceData(template);
  const finance=await buildFinanceDashboardData(admin,baseline);
  const {start,end}=monthRange(selectedMonth);
  const nowMonth=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);

  const [
    {data:kpiSettings},
    {data:students},
    {data:enrollments},
    {data:attendance},
    {data:tuition},
    {data:statusHistory},
    {data:futureSessions}
  ]=await Promise.all([
    admin.from("business_kpi_settings").select("*").eq("id",1).maybeSingle(),
    admin.from("students").select("id,code,full_name,status,created_at,updated_at").is("archived_at",null),
    admin.from("enrollments").select("id,student_id,class_id,start_date,end_date,status,students(code,full_name,status),classes(code,name,status)").is("archived_at",null),
    admin.from("attendance").select("student_id,status,marked_at,sessions(scheduled_date)").gte("marked_at",new Date(Date.now()-90*86400000).toISOString()),
    admin.from("tuition_accounts").select("student_id,balance_amount,renewal_due_date,status,students(code,full_name,status)").is("archived_at",null),
    admin.from("student_status_history").select("student_id,old_status,new_status,changed_at,students(code,full_name)").order("changed_at",{ascending:false}),
    admin.from("sessions").select("class_id,scheduled_date,status").gte("scheduled_date",new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})).lte("scheduled_date",new Date(Date.now()+14*86400000).toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})).neq("status","Cancelled").is("archived_at",null)
  ]);

  const targets={
    revenue:n(kpiSettings?.monthly_revenue_target||150000000),
    newStudents:Number(kpiSettings?.monthly_new_students_target||10),
    profit:n(kpiSettings?.monthly_profit_target||70000000)
  };

  const baselineFirstMonth=new Map<string,string>();
  for(const row of baseline.ledger||[]){
    if(row.direction!=="IN") continue;
    const key=baselineStudentKey(row.party);
    const month=String(row.date||"").slice(0,7);
    if(!month) continue;
    const prev=baselineFirstMonth.get(key);
    if(!prev||month<prev) baselineFirstMonth.set(key,month);
  }

  const liveFirstMonth=new Map<string,string>();
  for(const row of enrollments||[]){
    const st=joined(row.students);
    const key=st?.code?`code:${st.code}`:`name:${normalize(st?.full_name)}`;
    const month=String(row.start_date||"").slice(0,7);
    if(!month) continue;
    const prev=liveFirstMonth.get(key);
    if(!prev||month<prev) liveFirstMonth.set(key,month);
  }

  const expenseByMonth=new Map<string,number>();
  for(const row of finance.ledger||[]){
    if(row.direction!=="OUT") continue;
    const month=String(row.date||"").slice(0,7);
    expenseByMonth.set(month,(expenseByMonth.get(month)||0)+n(row.amount));
  }

  const stoppedByMonth=new Map<string,Set<string>>();
  for(const row of statusHistory||[]){
    if(row.new_status!=="Stopped") continue;
    const month=String(row.changed_at||"").slice(0,7);
    if(!stoppedByMonth.has(month)) stoppedByMonth.set(month,new Set());
    stoppedByMonth.get(month)!.add(row.student_id);
  }

  const monthly=(finance.monthly||[]).map((row:any)=>{
    const month=row.month;
    const baselineNew=[...baselineFirstMonth.values()].filter(x=>x===month).length;
    const liveNew=[...liveFirstMonth.entries()].filter(([key,m])=>m===month&&!baselineFirstMonth.has(key)).length;
    const newStudents=baselineNew+liveNew;
    const expense=expenseByMonth.get(month)||0;
    const profit=n(row.allocated)-expense;
    const stopped=stoppedByMonth.get(month)?.size||0;
    return {
      month,label:monthLabel(month),
      revenue:n(row.allocated),recognized:n(row.recognized),cash:n(row.cash),
      expense,profit,newStudents,stopped,
      revenueProgress:pct(n(row.allocated),targets.revenue),
      studentProgress:pct(newStudents,targets.newStudents),
      profitProgress:pct(profit,targets.profit)
    };
  });

  const current=monthly.find((x:any)=>x.month===selectedMonth)||monthly[monthly.length-1];
  const daysInMonth=new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7)),0).getDate();
  const todayDay=selectedMonth===nowMonth?Number(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(-2)):daysInMonth;
  const timeProgress=Math.min(1,todayDay/daysInMonth);

  const attendanceMap=new Map<string,{total:number,attended:number,last:string|null}>();
  for(const row of attendance||[]){
    const sid=String(row.student_id);
    const stat=attendanceMap.get(sid)||{total:0,attended:0,last:null};
    stat.total++;
    if(["Present","Late","Joined partially"].includes(String(row.status))) stat.attended++;
    const session=joined(row.sessions);
    const date=String(session?.scheduled_date||String(row.marked_at).slice(0,10));
    if(!stat.last||date>stat.last) stat.last=date;
    attendanceMap.set(sid,stat);
  }
  const tuitionMap=new Map<string,{balance:number,renewal:string|null}>();
  for(const row of tuition||[]){
    const sid=String(row.student_id);
    const prev=tuitionMap.get(sid)||{balance:0,renewal:null};
    prev.balance+=n(row.balance_amount);
    const due=row.renewal_due_date?String(row.renewal_due_date):null;
    if(due&&(!prev.renewal||due<prev.renewal)) prev.renewal=due;
    tuitionMap.set(sid,prev);
  }
  const classIdsWithFuture=new Set((futureSessions||[]).map((x:any)=>x.class_id));
  const studentFutureMap=new Map<string,boolean>();
  for(const e of enrollments||[]){
    if(classIdsWithFuture.has(e.class_id)&&["Active","Ready"].includes(String(e.status))) studentFutureMap.set(String(e.student_id),true);
  }

  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const in14=new Date();in14.setDate(in14.getDate()+14);
  const in14s=in14.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const riskList=(students||[]).map((student:any)=>{
    const att=attendanceMap.get(String(student.id))||{total:0,attended:0,last:null};
    const financeRow=tuitionMap.get(String(student.id))||{balance:0,renewal:null};
    const attendanceRate=att.total?att.attended/att.total:null;
    const reasons:string[]=[];
    let score=0;
    if(student.status==="Stopped"){score+=100;reasons.push("Đã ngưng học");}
    if(student.status==="Paused"){score+=55;reasons.push("Đang tạm dừng");}
    if(attendanceRate!=null&&attendanceRate<0.6){score+=45;reasons.push(`Attendance ${(attendanceRate*100).toFixed(0)}%`);}
    else if(attendanceRate!=null&&attendanceRate<0.75){score+=25;reasons.push(`Attendance ${(attendanceRate*100).toFixed(0)}%`);}
    if(financeRow.balance>0){score+=financeRow.balance>=5000000?25:12;reasons.push(`Công nợ ${financeRow.balance.toLocaleString("vi-VN")}đ`);}
    if(financeRow.renewal&&financeRow.renewal>=today&&financeRow.renewal<=in14s){score+=15;reasons.push("Tái phí ≤14 ngày");}
    if(student.status==="Active"&&!studentFutureMap.get(String(student.id))){score+=20;reasons.push("Chưa có session 14 ngày tới");}
    return {id:student.id,code:student.code,name:student.full_name,status:student.status,attendanceRate,balance:financeRow.balance,renewal:financeRow.renewal,score,reasons,severity:score>=60?"High":score>=30?"Medium":"Low"};
  }).filter((x:any)=>x.score>=20).sort((a:any,b:any)=>b.score-a.score);

  const stopList=(students||[]).filter((s:any)=>["Stopped","Paused"].includes(String(s.status))).map((s:any)=>{
    const latest=(statusHistory||[]).find((h:any)=>h.student_id===s.id&&["Stopped","Paused"].includes(String(h.new_status)));
    return {id:s.id,code:s.code,name:s.full_name,status:s.status,changedAt:latest?.changed_at||s.updated_at};
  }).sort((a:any,b:any)=>String(b.changedAt).localeCompare(String(a.changedAt)));

  const warnings:any[]=[];
  const expected=timeProgress;
  if(current){
    if(current.revenueProgress+0.1<expected) warnings.push({level:"High",title:"Revenue đang chậm tiến độ",detail:`Đạt ${(current.revenueProgress*100).toFixed(0)}% KPI trong khi tháng đã đi ${(expected*100).toFixed(0)}%.`});
    if(current.studentProgress+0.1<expected) warnings.push({level:"Medium",title:"HV mới đang thấp điểm",detail:`${current.newStudents}/${targets.newStudents} HV mới.`});
    if(current.profitProgress+0.1<expected) warnings.push({level:"High",title:"Profit đang dưới tiến độ",detail:`Đạt ${(current.profitProgress*100).toFixed(0)}% KPI profit.`});
    const prev=monthly[monthly.findIndex((x:any)=>x.month===selectedMonth)-1];
    if(prev&&prev.revenue>0&&current.revenue<prev.revenue*0.8) warnings.push({level:"Medium",title:"Revenue giảm >20% MoM",detail:`${current.label} thấp hơn tháng trước ${((1-current.revenue/prev.revenue)*100).toFixed(0)}%.`});
    if(current.stopped>=2) warnings.push({level:"High",title:"Stop list tăng",detail:`${current.stopped} học viên ghi nhận Stopped trong tháng.`});
  }

  const learnerSummary={
    total:(students||[]).length,
    active:(students||[]).filter((s:any)=>s.status==="Active").length,
    paused:(students||[]).filter((s:any)=>s.status==="Paused").length,
    stopped:(students||[]).filter((s:any)=>s.status==="Stopped").length,
    waiting:(students||[]).filter((s:any)=>s.status==="Waiting for class").length,
    stopList,riskList
  };

  const outstanding=(tuition||[]).reduce((sum:number,row:any)=>sum+n(row.balance_amount),0);
  const highRisk=riskList.filter((x:any)=>x.severity==="High").length;
  const mediumRisk=riskList.filter((x:any)=>x.severity==="Medium").length;
  const expectedRevenue=targets.revenue*timeProgress;
  const expectedStudents=targets.newStudents*timeProgress;
  const expectedProfit=targets.profit*timeProgress;
  const revenueGap=Math.max(0,targets.revenue-n(current?.revenue));
  const studentGap=Math.max(0,targets.newStudents-n(current?.newStudents));
  const profitGap=Math.max(0,targets.profit-n(current?.profit));
  const paceRevenueGap=n(current?.revenue)-expectedRevenue;
  const paceStudentGap=n(current?.newStudents)-expectedStudents;
  const paceProfitGap=n(current?.profit)-expectedProfit;
  const expenseRatio=n(current?.revenue)>0?n(current?.expense)/n(current?.revenue):0;
  const profitMargin=n(current?.revenue)>0?n(current?.profit)/n(current?.revenue):0;
  const cashConversion=n(current?.recognized)>0?n(current?.cash)/n(current?.recognized):0;
  const activeRate=learnerSummary.total>0?learnerSummary.active/learnerSummary.total:0;
  const unallocated=n(finance?.kpi?.unallocated);

  const drivers:any[]=[];
  if(studentGap>0) drivers.push({kind:"growth",priority:paceStudentGap<0?"High":"Medium",title:"Thiếu đầu vào HV mới",value:`Còn ${Math.ceil(studentGap)} HV để đạt KPI`,detail:`Tiến độ hiện tại ${n(current?.newStudents)}/${targets.newStudents}. Đây là nguồn tăng trưởng đầu kỳ quan trọng nhất.`});
  if(outstanding>0) drivers.push({kind:"cash",priority:outstanding>=10000000?"High":"Medium",title:"Công nợ đang khóa cash",value:`${outstanding.toLocaleString("vi-VN")}đ`,detail:"Doanh thu và cash không giống nhau; khoản này ảnh hưởng khả năng chuyển doanh thu thành tiền thực thu."});
  if(highRisk>0) drivers.push({kind:"retention",priority:"High",title:"HV có nguy cơ rụng",value:`${highRisk} High Risk`,detail:`Thêm ${mediumRisk} Medium Risk. Retention xấu sẽ làm giảm future revenue và tái phí.`});
  if(unallocated>0) drivers.push({kind:"data",priority:"Medium",title:"Revenue chưa phân bổ được",value:`${unallocated.toLocaleString("vi-VN")}đ`,detail:"Thiếu Start/End date hoặc dữ liệu enrollment làm Business Intel chưa phân bổ được doanh thu đúng kỳ."});
  if(expenseRatio>.65) drivers.push({kind:"cost",priority:"High",title:"Cost đang ăn mạnh vào revenue",value:`${(expenseRatio*100).toFixed(0)}% revenue`,detail:`Profit margin hiện ${(profitMargin*100).toFixed(0)}%. Cần kiểm tra payroll và variable cost.`});
  else if(expenseRatio>.5) drivers.push({kind:"cost",priority:"Medium",title:"Cost ratio cần theo dõi",value:`${(expenseRatio*100).toFixed(0)}% revenue`,detail:`Profit margin hiện ${(profitMargin*100).toFixed(0)}%.`});
  if(!drivers.length) drivers.push({kind:"healthy",priority:"Low",title:"Không có driver xấu nổi bật",value:"Business đang tương đối cân bằng",detail:"Tiếp tục theo dõi KPI và learner signals theo tuần."});

  const actions:any[]=[];
  if(paceStudentGap<0) actions.push({owner:"Growth / CSKH",action:`Bù ít nhất ${Math.max(1,Math.ceil(expectedStudents-n(current?.newStudents)))} HV mới để về đúng pace tháng`,why:"KPI HV mới đang chạy chậm hơn timeline."});
  if(outstanding>0) actions.push({owner:"CSKH",action:"Ưu tiên follow-up các khoản công nợ và renewal gần hạn",why:`Outstanding hiện ${outstanding.toLocaleString("vi-VN")}đ.`});
  if(highRisk>0) actions.push({owner:"Academic + CSKH",action:`Can thiệp ${highRisk} HV High Risk trước`,why:"Attendance/status/schedule/tuition đang tạo tín hiệu rụng."});
  if(unallocated>0) actions.push({owner:"Admin / CSKH",action:"Bổ sung Start date / End date cho enrollment thiếu dữ liệu",why:"Để revenue allocation và forecast không bị sai."});
  if(paceProfitGap<0) actions.push({owner:"Founder / Admin",action:"Review cost + revenue gap trước cuối tháng",why:`Profit đang thấp hơn pace ${Math.abs(paceProfitGap).toLocaleString("vi-VN")}đ.`});
  if(!actions.length) actions.push({owner:"Founder",action:"Giữ cadence hiện tại và review lại vào tuần sau",why:"Chưa có gap lớn so với pace tháng."});

  const recentMonths=monthly.filter((r:any)=>r.month<=selectedMonth).slice(-6).map((r:any)=>({
    ...r,
    revenueVsTarget:targets.revenue>0?r.revenue/targets.revenue:0,
    profitVsTarget:targets.profit>0?r.profit/targets.profit:0,
    studentsVsTarget:targets.newStudents>0?r.newStudents/targets.newStudents:0
  }));

  const businessScore=Math.max(0,Math.min(100,Math.round(
    Math.min(1,n(current?.revenueProgress))*35+
    Math.min(1,n(current?.studentProgress))*20+
    Math.min(1,n(current?.profitProgress))*30+
    Math.min(1,activeRate)*15
  )));

  return {
    finance,targets,current,monthly,timeProgress,
    learners:learnerSummary,
    warnings,
    executive:{
      businessScore,
      expectedRevenue,expectedStudents,expectedProfit,
      revenueGap,studentGap,profitGap,
      paceRevenueGap,paceStudentGap,paceProfitGap,
      expenseRatio,profitMargin,cashConversion,activeRate,
      outstanding,highRisk,mediumRisk,unallocated,
      drivers:drivers.sort((a:any,b:any)=>({High:3,Medium:2,Low:1}[b.priority as "High"|"Medium"|"Low"]||0)-({High:3,Medium:2,Low:1}[a.priority as "High"|"Medium"|"Low"]||0)),
      actions,
      recentMonths
    }
  };
}

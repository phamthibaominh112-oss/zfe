function joined(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}
function monthStart(month:string){return new Date(`${month}-01T00:00:00Z`);}
function nextMonthStart(month:string){const d=monthStart(month);d.setUTCMonth(d.getUTCMonth()+1);return d;}
function daysInclusive(start:Date,end:Date){return Math.max(0,Math.floor((end.getTime()-start.getTime())/86400000)+1);}
function overlapDays(aStart:Date,aEnd:Date,bStart:Date,bEnd:Date){const s=aStart>bStart?aStart:bStart;const e=aEnd<bEnd?aEnd:bEnd;return s<=e?daysInclusive(s,e):0;}
function monthLabel(month:string){return new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:"UTC"}).format(monthStart(month));}
function monthsBetween(start:string,end:string){const rows:string[]=[];const c=monthStart(start),last=monthStart(end);while(c<=last){rows.push(`${c.getUTCFullYear()}-${String(c.getUTCMonth()+1).padStart(2,"0")}`);c.setUTCMonth(c.getUTCMonth()+1);}return rows;}
function n(v:unknown){return Number(v||0);}

export async function buildFinanceDashboardData(supabase:any){
  const todayString=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const today=new Date(`${todayString}T00:00:00Z`);
  const currentMonth=todayString.slice(0,7);

  const [{data:accounts,error:accountError},{data:payments,error:paymentError},{data:expenses,error:expenseError}] = await Promise.all([
    supabase.from("tuition_accounts")
      .select("id,student_id,enrollment_id,package_name,net_amount,paid_amount,balance_amount,renewal_due_date,status,created_at,students(code,full_name,status),enrollments(start_date,end_date,status,classes(code,name))")
      .is("archived_at",null),
    supabase.from("payment_transactions")
      .select("id,tuition_account_id,amount,paid_at,method,reference,note,tuition_accounts(package_name,students(code,full_name))")
      .order("paid_at"),
    supabase.from("expense_transactions")
      .select("id,expense_date,amount,vendor,description,payment_method,reference,status,payroll_month,finance_categories(code,name,group_name)")
      .is("archived_at",null).neq("status","Void").order("expense_date")
  ]);
  if(accountError) throw accountError;
  if(paymentError) throw paymentError;
  if(expenseError) throw expenseError;

  const allMonths=monthsBetween("2025-01","2027-12");
  const monthlyMap=new Map(allMonths.map(month=>[month,{
    month,label:monthLabel(month),cash:0,allocated:0,recognized:0,remaining:0,gap:0,
    cumCash:0,cumRecognized:0,deferred:0,earnedNotCollected:0,mom:null as number|null,
    period:"Past",alert:""
  }]));

  let unallocated=0;
  const alerts:any[]=[];
  for(const account of accounts||[]){
    const enrollment=joined(account.enrollments);
    const student=joined(account.students);
    const amount=n(account.net_amount);
    const startRaw=enrollment?.start_date;
    const endRaw=enrollment?.end_date;
    if(!startRaw||!endRaw||endRaw<startRaw){
      unallocated+=amount;
      alerts.push({
        id:student?.code||String(account.id).slice(0,8),
        student:student?.full_name||"Học viên",
        severity:amount>=10000000?"CRITICAL":"HIGH",
        alert:"Unallocated tuition value",
        exposure:amount,
        source:"Tuition account",
        note:`${account.package_name} chưa có đủ Start date / End date để phân bổ revenue.`,
        action:"Cập nhật ngày bắt đầu/kết thúc enrollment."
      });
      continue;
    }
    const serviceStart=new Date(`${startRaw}T00:00:00Z`);
    const serviceEnd=new Date(`${endRaw}T00:00:00Z`);
    const totalDays=daysInclusive(serviceStart,serviceEnd);
    if(!totalDays) continue;

    for(const month of allMonths){
      const row:any=monthlyMap.get(month);
      const ms=monthStart(month);
      const me=new Date(nextMonthStart(month).getTime()-86400000);
      const monthDays=overlapDays(serviceStart,serviceEnd,ms,me);
      if(!monthDays) continue;
      row.allocated+=amount*monthDays/totalDays;
      if(month<currentMonth) row.recognized+=amount*monthDays/totalDays;
      else if(month===currentMonth){
        const earnedEnd=today<me?today:me;
        const earnedDays=overlapDays(serviceStart,serviceEnd,ms,earnedEnd);
        row.recognized+=amount*earnedDays/totalDays;
      }
    }
  }

  for(const payment of payments||[]){
    const row:any=monthlyMap.get(String(payment.paid_at).slice(0,7));
    if(row) row.cash+=n(payment.amount);
  }

  let cumCash=0,cumRecognized=0,priorAllocated:number|null=null;
  for(const month of allMonths){
    const row:any=monthlyMap.get(month);
    row.remaining=Math.max(0,row.allocated-row.recognized);
    row.gap=row.cash-row.recognized;
    cumCash+=row.cash;cumRecognized+=row.recognized;
    row.cumCash=cumCash;row.cumRecognized=cumRecognized;
    row.deferred=Math.max(0,cumCash-cumRecognized);
    row.earnedNotCollected=Math.max(0,cumRecognized-cumCash);
    row.mom=priorAllocated&&priorAllocated!==0?(row.allocated-priorAllocated)/Math.abs(priorAllocated):null;
    if(row.allocated) priorAllocated=row.allocated;
    row.period=month<currentMonth?"Past":month===currentMonth?"Current":"Future";
    if(month===currentMonth) row.alert="CURRENT MONTH";
    else if(row.mom!=null&&row.mom<-0.4&&row.allocated>0) row.alert="WATCH: >40% MoM allocated revenue drop";
  }

  const monthly=allMonths.map(month=>monthlyMap.get(month));
  const current:any=monthlyMap.get(currentMonth);
  const futureAllocated=monthly.filter((row:any)=>row.month>currentMonth).reduce((sum:number,row:any)=>sum+n(row.allocated),0);

  const ledger:any[]=[];
  for(const payment of payments||[]){
    const account=joined(payment.tuition_accounts);
    const student=joined(account?.students);
    ledger.push({
      date:String(payment.paid_at).slice(0,10),month:String(payment.paid_at).slice(0,7),direction:"IN",
      ref:payment.reference||String(payment.id).slice(0,8).toUpperCase(),
      party:`${student?.code||"HV"}-${student?.full_name||"Học viên"}`,
      category:"Tuition / Contract Collection",detail:`${account?.package_name||"Học phí"} · ${payment.method||"Thu phí"}`,
      amount:n(payment.amount),method:payment.method||"",note:payment.note||"",status:"Received"
    });
  }
  for(const expense of expenses||[]){
    const cat=joined(expense.finance_categories);
    ledger.push({
      date:String(expense.expense_date),month:String(expense.expense_date).slice(0,7),direction:"OUT",
      ref:expense.reference||String(expense.id).slice(0,8).toUpperCase(),party:expense.vendor||"ZFE",
      category:cat?.name||cat?.group_name||"Expense",detail:expense.description||"",amount:n(expense.amount),
      method:expense.payment_method||"",note:"",status:expense.status||"Paid"
    });
  }
  ledger.sort((a,b)=>`${b.date}-${b.ref}`.localeCompare(`${a.date}-${a.ref}`));

  const in14=new Date(today);in14.setUTCDate(in14.getUTCDate()+14);
  for(const account of accounts||[]){
    const student=joined(account.students);
    const balance=n(account.balance_amount);
    if(balance>0) alerts.push({
      id:student?.code||String(account.id).slice(0,8),student:student?.full_name||"Học viên",
      severity:balance>=5000000?"HIGH":"MEDIUM",alert:"Outstanding tuition",exposure:balance,source:"Tuition account",
      note:`${account.package_name} còn công nợ ${balance.toLocaleString("vi-VN")}đ.`,action:"CSKH follow-up thu phí."
    });
    if(account.renewal_due_date){
      const due=new Date(`${account.renewal_due_date}T00:00:00Z`);
      if(due>=today&&due<=in14) alerts.push({
        id:student?.code||String(account.id).slice(0,8),student:student?.full_name||"Học viên",
        severity:"MEDIUM",alert:"Renewal due ≤14 days",exposure:0,source:"Renewal",
        note:`Hạn tái phí ${account.renewal_due_date} · ${account.package_name}.`,action:"CSKH follow-up tái phí."
      });
    }
  }

  const health:any={OK:0,MEDIUM:0,HIGH:0,CRITICAL:0};
  for(const alert of alerts) health[alert.severity]=(health[alert.severity]||0)+1;
  health.OK=Math.max(0,(accounts||[]).length-new Set(alerts.map((x:any)=>x.id)).size);

  const july=(expenses||[]).filter((row:any)=>String(row.expense_date).slice(0,7)==="2026-07");
  const fixedByCategory:Record<string,number>={};
  let julyActualTotal=0,fixedBaseline=0,teacherJuly=0;
  for(const row of july){
    const cat=joined(row.finance_categories);const amount=n(row.amount);julyActualTotal+=amount;
    if(cat?.group_name==="Fixed cost"){fixedBaseline+=amount;fixedByCategory[cat?.name||"Fixed cost"]=(fixedByCategory[cat?.name||"Fixed cost"]||0)+amount;}
    if(cat?.group_name==="Teacher payroll") teacherJuly+=amount;
  }

  return {
    asOf:new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date()),
    monthly,ledger,alerts,health,
    kpi:{
      allocatedCurrent:n(current?.allocated),recognizedCurrent:n(current?.recognized),deferred:n(current?.deferred),
      cashCurrent:n(current?.cash),futureAllocated,unallocated,cumCash:n(current?.cumCash),cumRecognized:n(current?.cumRecognized)
    },
    expense:{
      julyActualTotal,julyPaidTotal:julyActualTotal,fixedBaseline,
      variableJuly:Math.max(0,julyActualTotal-fixedBaseline),teacherJuly,fixedByCategory
    },
    profit:{splitStart:"2026-08",founderPct:.8,cofounderPct:.2}
  };
}

type AnyRow = Record<string, any>;

function joined(value: unknown): AnyRow | null {
  if (Array.isArray(value)) return (value[0] as AnyRow | undefined) || null;
  return value && typeof value === "object" ? value as AnyRow : null;
}
function n(value: unknown) { return Number(value || 0); }
function monthStart(month:string){return new Date(`${month}-01T00:00:00Z`);}
function nextMonthStart(month:string){const d=monthStart(month);d.setUTCMonth(d.getUTCMonth()+1);return d;}
function daysInclusive(start:Date,end:Date){return Math.max(0,Math.floor((end.getTime()-start.getTime())/86400000)+1);}
function overlapDays(aStart:Date,aEnd:Date,bStart:Date,bEnd:Date){const s=aStart>bStart?aStart:bStart;const e=aEnd<bEnd?aEnd:bEnd;return s<=e?daysInclusive(s,e):0;}
function monthLabel(month:string){return new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:"UTC"}).format(monthStart(month));}

function normalizeText(value: unknown){
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g," ").trim();
}
function studentKey(code: unknown, name: unknown){
  const c=String(code||"").trim();
  if(c) return `code:${c}`;
  return `name:${normalizeText(name)}`;
}
function ledgerStudentKey(row:any){
  const party=String(row?.party||"");
  const match=party.match(/^([A-Za-z0-9_-]+)\s*[-·]\s*(.+)$/);
  return match ? studentKey(match[1],match[2]) : `party:${normalizeText(party)}`;
}
function paymentStudentKey(payment:any){
  const account=joined(payment.tuition_accounts);
  const student=joined(account?.students);
  return studentKey(student?.code,student?.full_name);
}
function paymentDedupKey(row:any){
  return `${row.date}|${row.direction}|${ledgerStudentKey(row)}`;
}
function livePaymentDedupKey(payment:any){
  return `${String(payment.paid_at).slice(0,10)}|IN|${paymentStudentKey(payment)}`;
}

function cloneBaseline(input:any){
  return JSON.parse(JSON.stringify(input || {}));
}

export function extractBaselineFinanceData(template:string){
  const marker="const D=";
  const start=template.indexOf(marker);
  if(start<0) throw new Error("Finance template missing baseline const D.");
  const jsonStart=start+marker.length;
  const end=template.indexOf(";\n",jsonStart);
  if(end<0) throw new Error("Cannot locate baseline finance JSON.");
  return JSON.parse(template.slice(jsonStart,end));
}

export async function buildFinanceDashboardData(supabase:any, baselineInput:any){
  const baseline=cloneBaseline(baselineInput);
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

  const monthly=(baseline.monthly||[]).map((row:any)=>({...row}));
  const monthMap=new Map(monthly.map((row:any)=>[row.month,row]));
  const baselineLedger=(baseline.ledger||[]).map((row:any)=>({...row}));
  const baselineAlerts=(baseline.alerts||[]).map((row:any)=>({...row}));

  // ------------------------------------------------------------------
  // CUTOVER / OVERLAY RULE
  // Historical Excel/HTML remains the opening book.
  // A live CenterOS student supersedes the same student's baseline cash
  // transaction on the same date. Completely new CenterOS records append.
  // ------------------------------------------------------------------
  const livePaymentKeys=new Set((payments||[]).map(livePaymentDedupKey));
  const mergedLedger=baselineLedger.filter((row:any)=>{
    if(row.direction!=="IN") return true;
    return !livePaymentKeys.has(paymentDedupKey(row));
  });

  for(const payment of payments||[]){
    const account=joined(payment.tuition_accounts);
    const student=joined(account?.students);
    mergedLedger.push({
      date:String(payment.paid_at).slice(0,10),
      month:String(payment.paid_at).slice(0,7),
      direction:"IN",
      ref:payment.reference||`OS-${String(payment.id).slice(0,8).toUpperCase()}`,
      party:`${student?.code||"HV"}-${student?.full_name||"Học viên"}`,
      category:"Tuition / Contract Collection",
      detail:`${account?.package_name||"Học phí"} · ${payment.method||"Thu phí"} · CenterOS`,
      amount:n(payment.amount),
      method:payment.method||"",
      note:payment.note||"",
      status:"Received"
    });
  }

  // Expense transactions in CenterOS are live. Replace baseline OUT rows
  // with the same date/ref when a live copy exists; otherwise append.
  const liveExpenseKeys=new Set((expenses||[]).map((x:any)=>`${x.expense_date}|${normalizeText(x.reference||x.description||x.vendor)}`));
  const withoutLiveExpenseDuplicates=mergedLedger.filter((row:any)=>{
    if(row.direction!=="OUT") return true;
    return !liveExpenseKeys.has(`${row.date}|${normalizeText(row.ref||row.detail||row.party)}`);
  });
  for(const expense of expenses||[]){
    const cat=joined(expense.finance_categories);
    withoutLiveExpenseDuplicates.push({
      date:String(expense.expense_date),
      month:String(expense.expense_date).slice(0,7),
      direction:"OUT",
      ref:expense.reference||`EXP-${String(expense.id).slice(0,8).toUpperCase()}`,
      party:expense.vendor||"ZFE",
      category:cat?.name||cat?.group_name||"Expense",
      detail:expense.description||"",
      amount:n(expense.amount),
      method:expense.payment_method||"",
      note:"",
      status:expense.status||"Paid"
    });
  }
  withoutLiveExpenseDuplicates.sort((a:any,b:any)=>`${b.date}-${b.ref}`.localeCompare(`${a.date}-${a.ref}`));

  // Rebuild Cash In from the merged ledger so edited CenterOS receipts
  // supersede the static Excel/HTML amount instead of double-counting.
  for(const row of monthly) row.cash=0;
  for(const row of withoutLiveExpenseDuplicates){
    if(row.direction!=="IN") continue;
    const month=String(row.date).slice(0,7);
    const target=monthMap.get(month);
    if(target) target.cash+=n(row.amount);
  }

  // ------------------------------------------------------------------
  // Revenue delta from CenterOS
  // Only add tuition accounts for students NOT represented in historical
  // baseline cash ledger. Existing historical learners stay on baseline
  // allocation to avoid double-counting the workbook.
  // ------------------------------------------------------------------
  const baselineStudentKeys=new Set(
    baselineLedger.filter((row:any)=>row.direction==="IN").map(ledgerStudentKey)
  );
  let liveUnallocated=0;
  const liveAlerts:any[]=[];

  for(const account of accounts||[]){
    const student=joined(account.students);
    const enrollment=joined(account.enrollments);
    const skey=studentKey(student?.code,student?.full_name);

    // Existing historical learner: CenterOS updates cash/status/alerts,
    // but its contract is already inside baseline Allocated Revenue.
    if(baselineStudentKeys.has(skey)) continue;

    const startRaw=enrollment?.start_date;
    const endRaw=enrollment?.end_date;
    const amount=n(account.net_amount);
    if(!amount) continue;

    if(!startRaw||!endRaw||endRaw<startRaw){
      liveUnallocated+=amount;
      liveAlerts.push({
        id:student?.code||String(account.id).slice(0,8),
        student:student?.full_name||"Học viên",
        severity:amount>=10000000?"CRITICAL":"HIGH",
        alert:"Unallocated tuition value · CenterOS",
        exposure:amount,source:"CenterOS",
        note:`${account.package_name} chưa đủ Start date / End date.`,
        action:"Cập nhật enrollment để phân bổ revenue."
      });
      continue;
    }

    const serviceStart=new Date(`${startRaw}T00:00:00Z`);
    const serviceEnd=new Date(`${endRaw}T00:00:00Z`);
    const totalDays=daysInclusive(serviceStart,serviceEnd);
    if(!totalDays) continue;

    for(const row of monthly){
      const ms=monthStart(row.month);
      const me=new Date(nextMonthStart(row.month).getTime()-86400000);
      const serviceDays=overlapDays(serviceStart,serviceEnd,ms,me);
      if(!serviceDays) continue;
      const addAllocated=amount*serviceDays/totalDays;
      row.allocated=n(row.allocated)+addAllocated;

      if(row.month<currentMonth){
        row.recognized=n(row.recognized)+addAllocated;
      }else if(row.month===currentMonth){
        const earnedEnd=today<me?today:me;
        const earnedDays=overlapDays(serviceStart,serviceEnd,ms,earnedEnd);
        row.recognized=n(row.recognized)+amount*earnedDays/totalDays;
      }
    }
  }

  // Live tuition alerts still map to learner records, including existing
  // historical learners.
  const in14=new Date(today);in14.setUTCDate(in14.getUTCDate()+14);
  for(const account of accounts||[]){
    const student=joined(account.students);
    const balance=n(account.balance_amount);
    if(balance>0) liveAlerts.push({
      id:student?.code||String(account.id).slice(0,8),
      student:student?.full_name||"Học viên",
      severity:balance>=5000000?"HIGH":"MEDIUM",
      alert:"Outstanding tuition · CenterOS",
      exposure:balance,source:"CenterOS",
      note:`${account.package_name} còn công nợ ${balance.toLocaleString("vi-VN")}đ.`,
      action:"CSKH follow-up thu phí."
    });
    if(account.renewal_due_date){
      const due=new Date(`${account.renewal_due_date}T00:00:00Z`);
      if(due>=today&&due<=in14) liveAlerts.push({
        id:student?.code||String(account.id).slice(0,8),
        student:student?.full_name||"Học viên",
        severity:"MEDIUM",alert:"Renewal due ≤14 days · CenterOS",
        exposure:0,source:"CenterOS",
        note:`Hạn tái phí ${account.renewal_due_date} · ${account.package_name}.`,
        action:"CSKH follow-up tái phí."
      });
    }
  }

  // Recalculate dependent monthly metrics after cash/live delta merge.
  let cumCash=0,cumRecognized=0,priorAllocated:number|null=null;
  for(const row of monthly){
    row.remaining=Math.max(0,n(row.allocated)-n(row.recognized));
    row.gap=n(row.cash)-n(row.recognized);
    cumCash+=n(row.cash);cumRecognized+=n(row.recognized);
    row.cumCash=cumCash;row.cumRecognized=cumRecognized;
    row.deferred=Math.max(0,cumCash-cumRecognized);
    row.earnedNotCollected=Math.max(0,cumRecognized-cumCash);
    row.mom=priorAllocated&&priorAllocated!==0?(n(row.allocated)-priorAllocated)/Math.abs(priorAllocated):null;
    if(n(row.allocated)) priorAllocated=n(row.allocated);
    row.period=row.month<currentMonth?"Past":row.month===currentMonth?"Current":"Future";
    row.alert=row.month===currentMonth?"CURRENT MONTH":
      row.mom!=null&&row.mom<-0.4&&n(row.allocated)>0?"WATCH: >40% MoM allocated revenue drop":"";
  }

  const current=monthMap.get(currentMonth) || monthly.find((x:any)=>x.period==="Current") || monthly[monthly.length-1];
  const futureAllocated=monthly.filter((row:any)=>row.month>currentMonth).reduce((sum:number,row:any)=>sum+n(row.allocated),0);

  // Deduplicate alerts by student + alert type, favor CenterOS/live copy.
  const alertMap=new Map<string,any>();
  for(const alert of baselineAlerts){
    alertMap.set(`${normalizeText(alert.id||alert.student)}|${normalizeText(alert.alert)}`,alert);
  }
  for(const alert of liveAlerts){
    const family=normalizeText(String(alert.alert).replace(" centeros",""));
    alertMap.set(`${normalizeText(alert.id||alert.student)}|${family}`,alert);
  }
  const alerts=[...alertMap.values()];

  const health:any={OK:0,MEDIUM:0,HIGH:0,CRITICAL:0};
  for(const alert of alerts) health[alert.severity]=(health[alert.severity]||0)+1;
  const baselineHealthTotal=Object.values(baseline.health||{}).reduce((s:any,v:any)=>s+n(v),0);
  const knownStudentCount=Math.max(baselineHealthTotal,(accounts||[]).length);
  health.OK=Math.max(0,knownStudentCount-new Set(alerts.map((x:any)=>normalizeText(x.id||x.student))).size);

  // Expense baseline remains from historical HTML. CenterOS July actuals
  // replace it only when the OS has actual July expense rows.
  const julyExpenses=(expenses||[]).filter((row:any)=>String(row.expense_date).slice(0,7)==="2026-07");
  let expense={...(baseline.expense||{})};
  if(julyExpenses.length){
    const fixedByCategory:Record<string,number>={};
    let julyActualTotal=0,fixedBaseline=0,teacherJuly=0;
    for(const row of julyExpenses){
      const cat=joined(row.finance_categories),amount=n(row.amount);
      julyActualTotal+=amount;
      if(cat?.group_name==="Fixed cost"){fixedBaseline+=amount;fixedByCategory[cat?.name||"Fixed cost"]=(fixedByCategory[cat?.name||"Fixed cost"]||0)+amount;}
      if(cat?.group_name==="Teacher payroll") teacherJuly+=amount;
    }
    expense={
      julyActualTotal,julyPaidTotal:julyActualTotal,fixedBaseline,
      variableJuly:Math.max(0,julyActualTotal-fixedBaseline),teacherJuly,fixedByCategory
    };
  }

  return {
    ...baseline,
    asOf:new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date()),
    monthly,
    ledger:withoutLiveExpenseDuplicates,
    alerts,
    health,
    expense,
    kpi:{
      allocatedCurrent:n(current?.allocated),
      recognizedCurrent:n(current?.recognized),
      deferred:n(current?.deferred),
      cashCurrent:n(current?.cash),
      futureAllocated,
      unallocated:n(baseline?.kpi?.unallocated)+liveUnallocated,
      cumCash:n(current?.cumCash),
      cumRecognized:n(current?.cumRecognized)
    },
    dataMode:{
      baseline:"ZE historical workbook / Finance Dashboard v4",
      live:"ZE CenterOS",
      rule:"Historical baseline + CenterOS live overlay; live duplicate records supersede baseline."
    }
  };
}

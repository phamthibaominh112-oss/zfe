import ExcelJS from "exceljs";

export type ImportType="students"|"payments"|"expenses"|"scores"|"curriculum";
export type ImportRow={rowNo:number;payload:Record<string,any>;errors:string[]};

export const IMPORT_META:Record<ImportType,{label:string;sheet:string;roles:string[];description:string}>={
  students:{label:"Danh sách học viên",sheet:"Students",roles:["admin","academic_manager","customer_service"],description:"Tạo/cập nhật hồ sơ HV và optional enrollment vào lớp."},
  payments:{label:"Money list / phiếu thu",sheet:"Payments",roles:["admin","customer_service"],description:"Tạo/cập nhật tài khoản học phí và ghi giao dịch thu tiền."},
  expenses:{label:"Chi phí",sheet:"Expenses",roles:["admin"],description:"Import expense transactions; dữ liệu đi thẳng vào Business Intelligence."},
  scores:{label:"Điểm thi",sheet:"Scores",roles:["admin","academic_manager","customer_service"],description:"Tạo assessment nếu cần và upsert điểm theo HV + lớp."},
  curriculum:{label:"Chương trình 36 buổi",sheet:"Curriculum_36",roles:["admin","academic_manager"],description:"Import ONE canonical master per ZEB/ZEF/ZEE/ZEM; mỗi master bắt buộc đủ Buổi 1→36."}
};

function plainCell(value:any):any{
  if(value==null)return null;
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==="object"){
    if("result" in value)return plainCell(value.result);
    if("text" in value)return String(value.text);
    if("richText" in value)return value.richText.map((x:any)=>x.text).join("");
    if("hyperlink" in value)return String(value.text||value.hyperlink||"");
  }
  return typeof value==="string"?value.trim():value;
}
function headerKey(value:any){return String(plainCell(value)||"").trim().toLowerCase().replace(/\s+/g,"_");}
export function textValue(v:any){return String(v??"").trim();}
export function numberValue(v:any){const n=Number(String(v??"").replace(/[,\s₫đ]/g,""));return Number.isFinite(n)?n:NaN;}
export function dateValue(v:any){
  if(!v)return "";
  if(v instanceof Date)return v.toISOString().slice(0,10);
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return s;
}
export function dateTimeValue(v:any){
  if(!v)return "";
  if(v instanceof Date)return v.toISOString();
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}T/.test(s))return s;
  if(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(s))return s.replace(" ","T");
  return s;
}

export async function readImportFile(file:File,type:ImportType):Promise<{sheetName:string;rows:Record<string,any>[]}> {
  if(file.size>12*1024*1024)throw new Error("File import tối đa 12MB.");
  const name=file.name.toLowerCase();
  if(!name.endsWith(".xlsx")&&!name.endsWith(".xlsm"))throw new Error("Import Center hiện nhận file Excel .xlsx/.xlsm. Hãy dùng template của CenterOS.");
  const wb=new ExcelJS.Workbook();
  const bytes=new Uint8Array(await file.arrayBuffer());
  await wb.xlsx.load(bytes as any);
  const expected=IMPORT_META[type].sheet;
  const ws=wb.getWorksheet(expected)||wb.worksheets[0];
  if(!ws)throw new Error("Workbook không có worksheet.");
  const headerRow=ws.getRow(1);
  const headers:string[]=[];
  headerRow.eachCell({includeEmpty:true},(cell,col)=>{headers[col]=headerKey(cell.value);});
  const rows:Record<string,any>[]=[];
  ws.eachRow((row,rowNo)=>{
    if(rowNo===1)return;
    const payload:Record<string,any>={};let has=false;
    headers.forEach((h,col)=>{if(!h)return;const val=plainCell(row.getCell(col).value);payload[h]=val;if(val!==null&&val!=="")has=true;});
    if(!has)return;

    // Curriculum workbooks often contain one program-summary / metadata row
    // immediately before Session 1. It may repeat program/level/syllabus fields
    // but has no real lesson number/title. Treat that row as metadata instead
    // of counting it as a 37th syllabus session. Genuine lesson rows with a
    // valid session_no are still validated normally below.
    if(type==="curriculum"){
      const rawNo=numberValue(payload.session_no);
      const validNo=Number.isInteger(rawNo)&&rawNo>=1&&rawNo<=36;
      const hasTitle=Boolean(textValue(payload.title));
      const looksLikeProgramMeta=!validNo&&!hasTitle&&Boolean(textValue(payload.program_code)||textValue(payload.syllabus_code)||textValue(payload.program_name));
      if(looksLikeProgramMeta)return;
    }

    rows.push({...payload,__row_no:rowNo});
  });
  if(!rows.length)throw new Error(`Sheet ${ws.name} không có dữ liệu.`);
  if(rows.length>3000)throw new Error("Mỗi import tối đa 3.000 dòng để bảo đảm kiểm soát lỗi.");
  return {sheetName:ws.name,rows};
}

export function validateImportRows(type:ImportType,rows:Record<string,any>[],refs:{students:any[];classes:any[];categories:any[]}):ImportRow[]{
  const studentCodes=new Set(refs.students.map(x=>String(x.code||"").toUpperCase()));
  const studentEmails=new Set(refs.students.map(x=>String(x.email||"").toLowerCase()).filter(Boolean));
  const classCodes=new Set(refs.classes.map(x=>String(x.code||"").toUpperCase()));
  const categoryCodes=new Set(refs.categories.map(x=>String(x.code||"").toUpperCase()));
  const allowedAssessment=new Set(["Placement","Diagnostic","Quiz","Assignment","Midterm","Final","Mock Test","Speaking","Writing","Other"]);
  const allowedPrograms=new Set(["ZEB","ZEF","ZEE","ZEM"]);
  const result:ImportRow[]=rows.map((payload:any)=>{
    const e:string[]=[];const rowNo=Number(payload.__row_no||0);
    if(type==="students"){
      if(!textValue(payload.full_name))e.push("Thiếu full_name");
      if(!textValue(payload.student_code)&&!textValue(payload.email))e.push("Cần student_code hoặc email để match");
      if(payload.class_code&& !classCodes.has(textValue(payload.class_code).toUpperCase()))e.push(`Không tìm thấy class_code ${payload.class_code}`);
      if(payload.start_date&&!/^\d{4}-\d{2}-\d{2}$/.test(dateValue(payload.start_date)))e.push("start_date không hợp lệ");
    }else if(type==="payments"){
      const c=textValue(payload.student_code).toUpperCase(),em=textValue(payload.student_email).toLowerCase();
      if(!c&&!em)e.push("Thiếu student_code/student_email");
      if(c&&!studentCodes.has(c)&&(!em||!studentEmails.has(em)))e.push("Không match được học viên hiện có");
      if(!textValue(payload.package_name))e.push("Thiếu package_name");
      if(!(numberValue(payload.gross_amount)>0))e.push("gross_amount phải > 0");
      if(!(numberValue(payload.amount_paid)>0))e.push("amount_paid phải > 0");
      if(payload.class_code&&!classCodes.has(textValue(payload.class_code).toUpperCase()))e.push(`Không tìm thấy class_code ${payload.class_code}`);
    }else if(type==="expenses"){
      const cat=textValue(payload.category_code).toUpperCase();
      if(!cat)e.push("Thiếu category_code");else if(!categoryCodes.has(cat))e.push(`Category ${cat} chưa tồn tại trong Finance Categories`);
      if(!(numberValue(payload.amount)>0))e.push("amount phải > 0");
      if(!textValue(payload.description))e.push("Thiếu description");
      if(!dateValue(payload.expense_date))e.push("Thiếu expense_date");
    }else if(type==="scores"){
      const c=textValue(payload.student_code).toUpperCase(),em=textValue(payload.student_email).toLowerCase();
      if(!c&&!em)e.push("Thiếu student_code/student_email");
      if(c&&!studentCodes.has(c)&&(!em||!studentEmails.has(em)))e.push("Không match được học viên");
      const classCode=textValue(payload.class_code).toUpperCase();if(!classCode||!classCodes.has(classCode))e.push("class_code không tồn tại");
      if(!allowedAssessment.has(textValue(payload.assessment_type)||"Other"))e.push("assessment_type không hợp lệ");
      const score=payload.score==null||payload.score===""?null:numberValue(payload.score);if(score!=null&&!Number.isFinite(score))e.push("score không phải số");
      const band=payload.band==null||payload.band===""?null:numberValue(payload.band);if(band!=null&&(!Number.isFinite(band)||band<0||band>9))e.push("band phải 0–9");
    }else if(type==="curriculum"){
      const p=textValue(payload.program_code).toUpperCase();if(!allowedPrograms.has(p))e.push("program_code chỉ nhận ZEB/ZEF/ZEE/ZEM");
      const no=numberValue(payload.session_no);if(!Number.isInteger(no)||no<1||no>36)e.push("session_no phải là số nguyên 1–36");
      if(!textValue(payload.title))e.push("Thiếu title");
    }
    return {rowNo,payload,errors:e};
  });
  if(type==="curriculum"){
    const groups=new Map<string,ImportRow[]>();
    for(const row of result){
      const p=textValue(row.payload.program_code).toUpperCase();
      if(!groups.has(p))groups.set(p,[]);
      groups.get(p)!.push(row);
    }
    for(const [program,group] of groups){
      if(!allowedPrograms.has(program))continue;

      const validSessionRows=group.filter(x=>{
        const no=numberValue(x.payload.session_no);
        return Number.isInteger(no)&&no>=1&&no<=36;
      });
      const nums=validSessionRows.map(x=>numberValue(x.payload.session_no));
      const unique=new Set(nums);
      const missing=Array.from({length:36},(_,i)=>i+1).filter(n=>!unique.has(n));
      const duplicateNos=[...new Set(nums.filter((n,i)=>nums.indexOf(n)!==i))];

      // Do not spam the same completeness error onto all 36 correct rows.
      // Mark only duplicate rows directly; for missing sessions attach one
      // concise master-level error to the first valid row so Commit remains
      // blocked while the preview stays readable.
      if(duplicateNos.length){
        for(const row of validSessionRows){
          const no=numberValue(row.payload.session_no);
          if(duplicateNos.includes(no))row.errors.push(`${program} trùng Buổi ${no}`);
        }
      }
      if(missing.length){
        const target=validSessionRows[0]||group[0];
        if(target)target.errors.push(`${program} thiếu Buổi ${missing.join(", ")} — syllabus master phải đủ 1→36`);
      }
    }
  }
  return result;
}

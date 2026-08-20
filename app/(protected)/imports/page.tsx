import Link from "next/link";
import { cancelBulkImportJob, commitBulkImport, uploadBulkImport } from "@/app/actions";
import { Empty, Flash, PageHeader, Panel, Status } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { IMPORT_META, type ImportType } from "@/lib/bulk-import";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

function compactPayload(payload:any){
  return Object.entries(payload||{}).filter(([k,v])=>k!=="__row_no"&&v!==null&&v!=="").slice(0,7).map(([k,v])=>`${k}: ${String(v)}`).join(" · ");
}
export default async function ImportsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const profile=await requireRole(["admin","academic_manager","customer_service"]);const params=await searchParams;const admin=createAdminClient();
  const allowed=(Object.entries(IMPORT_META) as [ImportType,(typeof IMPORT_META)[ImportType]][]).filter(([,m])=>m.roles.includes(profile.role));
  const jobId=params.job;
  const [{data:jobs},jobResult]=await Promise.all([
    admin.from("bulk_import_jobs").select("id,import_type,file_name,sheet_name,status,total_rows,valid_rows,error_rows,imported_rows,skipped_rows,created_at,created_by").order("created_at",{ascending:false}).limit(15),
    jobId?admin.from("bulk_import_jobs").select("*").eq("id",jobId).maybeSingle():Promise.resolve({data:null,error:null} as any)
  ]);
  const job:any=jobResult.data;
  const rowsResult=job?await admin.from("bulk_import_rows").select("id,row_no,payload,validation_errors,status,result_note").eq("job_id",job.id).order("row_no").limit(500):{data:[]};
  const rows:any[]=rowsResult.data||[];
  const canCommit=job&&job.status!=="Completed"&&job.status!=="Cancelled"&&Number(job.error_rows||0)===0&&(profile.role==="admin"||job.created_by===profile.id);
  return <>
    <PageHeader eyebrow="Data Operations" title="Import Center" description="Upload Excel → Preview → Validate → Commit. Không ghi dữ liệu vào hệ thống cho tới khi toàn bộ dòng hợp lệ." actions={<a className="button button-yellow" href="/templates/ZE_CenterOS_Bulk_Import_Templates_v2.1.0.xlsx" download>↓ Tải Excel Template</a>}/>
    <Flash message={params.message} error={params.error}/>

    <section className="import-type-grid">{allowed.map(([type,meta])=><form action={uploadBulkImport} encType="multipart/form-data" className="import-type-card" key={type}><input type="hidden" name="import_type" value={type}/><div><span>{meta.sheet}</span><strong>{meta.label}</strong><p>{meta.description}</p></div><label className="import-file-picker"><input type="file" name="file" accept=".xlsx,.xlsm" required/><span>Chọn Excel</span></label><button className="button button-primary">Preview & Validate</button></form>)}</section>

    {job?<Panel className="section-gap import-preview-panel" title={`Preview · ${IMPORT_META[job.import_type as ImportType]?.label||job.import_type}`} description={`${job.file_name} · Sheet ${job.sheet_name||"—"} · Upload ${formatDateTime(job.created_at)}`} action={<Link className="button button-secondary button-small" href="/imports">Đóng preview</Link>}>
      <div className="import-job-summary"><div><span>Tổng dòng</span><strong>{job.total_rows}</strong></div><div className="ok"><span>Valid</span><strong>{job.valid_rows}</strong></div><div className={job.error_rows?"bad":"ok"}><span>Lỗi</span><strong>{job.error_rows}</strong></div><div><span>Imported</span><strong>{job.imported_rows}</strong></div><div><span>Skipped</span><strong>{job.skipped_rows}</strong></div><div><span>Status</span><Status value={job.status}/></div></div>
      {Number(job.error_rows)>0?<div className="message error"><strong>Chưa thể Commit.</strong> Sửa các dòng lỗi trong Excel rồi upload lại. CenterOS cố ý chặn import một phần để tránh database bị nửa đúng nửa sai.</div>:null}
      <div className="import-preview-table"><div className="import-preview-head"><span>Dòng</span><span>Dữ liệu</span><span>Validation</span><span>Status</span></div>{rows.map(row=><div className={`import-preview-row ${row.validation_errors?.length?"has-error":""}`} key={row.id}><b>{row.row_no}</b><p>{compactPayload(row.payload)}</p><div>{row.validation_errors?.length?row.validation_errors.map((e:string,i:number)=><span className="import-error-chip" key={i}>{e}</span>):<span className="import-ok-chip">✓ Hợp lệ</span>}{row.result_note?<small>{row.result_note}</small>:null}</div><Status value={row.status}/></div>)}</div>
      <div className="import-commit-bar"><div><strong>{canCommit?"Sẵn sàng Commit":"Import đang được kiểm soát"}</strong><span>{canCommit?`${job.valid_rows} dòng sẽ được ghi vào hệ thống.`:job.status==="Completed"?"Job đã hoàn tất và được giữ làm audit log.":"Sửa lỗi trước khi Commit."}</span></div>{canCommit?<form action={commitBulkImport}><input type="hidden" name="job_id" value={job.id}/><button className="button button-primary">Commit {job.valid_rows} dòng</button></form>:null}{job.status!=="Completed"&&job.status!=="Cancelled"?<form action={cancelBulkImportJob}><input type="hidden" name="job_id" value={job.id}/><button className="button button-danger">Hủy job</button></form>:null}</div>
    </Panel>:null}

    <Panel className="section-gap" title="Import history" description="Admin thấy tất cả job; Academic/CSKH thấy job do mình upload.">
      {jobs?.length?<div className="import-history-list">{jobs.filter((j:any)=>profile.role==="admin"||j.created_by===profile.id).map((j:any)=><Link className="import-history-row" href={`/imports?job=${j.id}`} key={j.id}><div><strong>{IMPORT_META[j.import_type as ImportType]?.label||j.import_type}</strong><span>{j.file_name} · {formatDateTime(j.created_at)}</span></div><div><b>{j.valid_rows}/{j.total_rows}</b><small>valid</small></div><Status value={j.status}/></Link>)}</div>:<Empty title="Chưa có import job" description="Upload file Excel đầu tiên ở phía trên."/>}
    </Panel>

    <Panel className="section-gap" title="Quy tắc Import Center" description="Các rule để tránh map nhầm dữ liệu.">
      <div className="import-rule-grid"><div><strong>HV</strong><span>Match bằng student_code trước, email sau. Không fuzzy-match bằng tên.</span></div><div><strong>Money</strong><span>Reference trùng sẽ Skip. Phiếu thu được trigger tự sinh như nhập tay.</span></div><div><strong>Chi phí</strong><span>Category code phải tồn tại; expense sẽ nhảy vào Business Intelligence.</span></div><div><strong>Điểm</strong><span>Match HV + class_code; assessment chưa có sẽ được tạo.</span></div><div><strong>Syllabus</strong><span>Mỗi ZEB/ZEF/ZEE/ZEM phải đúng 36 dòng, session_no 1→36. Import vào ONE Master, không tạo theo lớp.</span></div></div>
    </Panel>
  </>;
}

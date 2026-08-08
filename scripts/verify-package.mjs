import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "app/(auth)/login/page.tsx",
  "app/(protected)/dashboard/page.tsx",
  "app/(protected)/finance/page.tsx",
  "app/(protected)/admin/users/page.tsx",
  "supabase/migrations/001_schema.sql",
  "supabase/migrations/002_rls.sql",
  "supabase/migrations/003_storage_and_seed.sql",
  "supabase/migrations/004_schedule_management.sql",
  "supabase/migrations/005_finance_accounting_notifications.sql",
  "supabase/migrations/006_monthly_payroll_and_financial_tracking.sql",
  "supabase/migrations/007_expense_categories_and_payroll_guard.sql",
  "supabase/migrations/008_teacher_hourly_rate_range.sql",
  "supabase/migrations/009_workforce_checkin_compliance.sql",
  "app/(protected)/payroll/page.tsx",
  "app/(protected)/workforce/page.tsx",
  "app/(protected)/workforce/kpi/page.tsx",
  "app/(protected)/sop/page.tsx",
  "components/handbook-viewer.tsx",
  "content/handbooks/master-training-handbook.ts"
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
const pkg = JSON.parse(read("package.json"));
if (pkg.dependencies.next !== "16.2.12") failures.push("Next.js must remain pinned to patched 16.2.12");
if (!String(pkg.engines?.node || "").includes("22")) failures.push("Node.js 22 is required by current Supabase JS");
const envTemplate = [".env.example", "env.example"].find((file) => fs.existsSync(path.join(root, file)));
if (envTemplate) {
  const env = read(envTemplate);
  if (env.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY")) failures.push("Service role key must never be public");
} else {
  console.warn("ZE CenterOS verification: env template not found; skipping documentation-only env template check.");
}
const roles = read("lib/roles.ts");
if (/finance[^\n]+academic_manager|finance[^\n]+teacher/.test(roles)) failures.push("Finance route leaked to academic/teacher role");
const roleBlock = (name) => roles.match(new RegExp(`const ${name}: NavItem\\[] = \\[([\\s\\S]*?)\\];`))?.[1] || "";
for (const name of ["ADMIN_NAV", "ACADEMIC_NAV", "CUSTOMER_SERVICE_NAV"]) if (!roleBlock(name).includes('href: "/sop"')) failures.push(`SOP navigation missing for ${name}`);
for (const name of ["TEACHER_NAV", "STUDENT_NAV"]) if (roleBlock(name).includes('href: "/sop"')) failures.push(`SOP navigation leaked to ${name}`);
const sopPage = read("app/(protected)/sop/page.tsx");
if (!sopPage.includes('requireRole(["admin", "academic_manager", "customer_service"])')) failures.push("SOP route role guard missing");
const handbookViewer = read("components/handbook-viewer.tsx");
if (/srcDoc\s*=/.test(handbookViewer)) failures.push("SOP handbook must not use server-rendered iframe srcDoc");
if (!handbookViewer.includes("doc.write(html)")) failures.push("SOP handbook client-side document writer missing");
if (!handbookViewer.includes("data-ze-centeros-embed")) failures.push("SOP embedded handbook layout override missing");
const rls = read("supabase/migrations/002_rls.sql");
for (const marker of [
  "tuition_select",
  "public.is_customer_service() or student_id = public.current_student_id()",
  "observations_select",
  "feedback_select",
  "ratings_select",
  "audit_select",
  "students_delete",
  "classes_delete",
  "public.current_role() = 'student'",
  "public.current_role() = 'teacher'"
]) if (!rls.includes(marker)) failures.push(`Missing RLS marker: ${marker}`);

const scheduleMigration = read("supabase/migrations/004_schedule_management.sql");
for (const marker of ["teacher_availability_delete", "session_teachers_delete", "public.is_academic_manager()"])
  if (!scheduleMigration.includes(marker)) failures.push(`Missing schedule management marker: ${marker}`);

const financeMigration = read("supabase/migrations/005_finance_accounting_notifications.sql");
for (const marker of ["expense_transactions", "payment_receipts", "notifications", "generate_renewal_notifications", "teacher_payroll_monthly"])
  if (!financeMigration.includes(marker)) failures.push(`Missing finance/accounting marker: ${marker}`);


const payrollMigration = read("supabase/migrations/006_monthly_payroll_and_financial_tracking.sql");
for (const marker of ["teacher_compensation_settings", "teacher_payroll_statements", "teacher_review_payroll", "admin_approve_teacher_payroll", "monthly_financial_snapshots", "run_month_end_payroll_job"])
  if (!payrollMigration.includes(marker)) failures.push(`Missing payroll marker: ${marker}`);

const expenseCategoryMigration = read("supabase/migrations/007_expense_categories_and_payroll_guard.sql");
for (const marker of ["cost_type", "Lương giảng viên", "Nền tảng / Phần mềm", "Vui lòng nhập đơn giá giờ dạy lớn hơn 0"])
  if (!expenseCategoryMigration.includes(marker)) failures.push(`Missing expense category/payroll guard marker: ${marker}`);


const workforceMigration = read("supabase/migrations/009_workforce_checkin_compliance.sql");
for (const marker of [
  "teacher_session_checkins",
  "staff_work_schedules",
  "staff_work_logs",
  "teacher_kpi_live_monthly",
  "teacher_check_in_session",
  "teacher_check_out_session",
  "staff_check_in",
  "staff_check_out",
  "staff_payroll_statements",
  "admin_approve_staff_payroll"
]) if (!workforceMigration.includes(marker)) failures.push(`Missing workforce/compliance marker: ${marker}`);

for (const file of ["app/(protected)/students/page.tsx", "app/(protected)/students/[id]/page.tsx"]) {
  if (/\.select\(select\)/.test(read(file))) failures.push(`Dynamic Supabase select remains in ${file}`);
}
for (const file of ["lib/supabase/server.ts", "lib/supabase/client.ts", "lib/supabase/admin.ts"]) {
  if (!/as any/.test(read(file))) failures.push(`Supabase parser boundary fix missing in ${file}`);
}

const runtimeProxy = read("lib/supabase/proxy.ts");
if (!runtimeProxy.includes("isPlatformConfigured")) failures.push("Missing runtime environment guard in Supabase proxy");
if (!fs.existsSync(path.join(root, "app/setup/page.tsx"))) failures.push("Missing production setup page");

const appShell = read("components/app-shell.tsx");
if (/setRole|localStorage|data-role-switch/i.test(appShell)) failures.push("Demo role switching detected");
if (failures.length) {
  console.error("ZE CenterOS package verification failed:");
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log("ZE CenterOS package verification passed.");
console.log("- Production authentication only");
console.log("- RBAC navigation checked");
console.log("- Supabase RLS markers checked");
console.log("- Finance route isolated from teacher/academic roles");
console.log("- SOP library restricted to Admin/Academic/CSKH");

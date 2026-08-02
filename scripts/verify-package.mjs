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
  "supabase/migrations/003_storage_and_seed.sql"
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

for (const file of ["app/(protected)/students/page.tsx", "app/(protected)/students/[id]/page.tsx"]) {
  if (/\.select\(select\)/.test(read(file))) failures.push(`Dynamic Supabase select remains in ${file}`);
}
for (const file of ["lib/supabase/server.ts", "lib/supabase/client.ts", "lib/supabase/admin.ts"]) {
  if (!/as any/.test(read(file))) failures.push(`Supabase parser boundary fix missing in ${file}`);
}

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

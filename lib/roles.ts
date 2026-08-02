export const ROLES = [
  "admin",
  "academic_manager",
  "teacher",
  "customer_service",
  "student"
] as const;

export type AppRole = (typeof ROLES)[number];

export type Profile = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  academic_manager: "Quản lý học vụ",
  teacher: "Giáo viên",
  customer_service: "CSKH",
  student: "Học viên"
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Toàn quyền hệ thống",
  academic_manager: "Lớp học, lịch, học thuật và chất lượng",
  teacher: "Lịch dạy, attendance, bài tập và feedback",
  customer_service: "Hồ sơ học viên, học phí và tái phí",
  student: "Lộ trình, lịch học, bài tập và kết quả"
};

export type NavItem = {
  href: string;
  label: string;
  short: string;
  roles: AppRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "DB", roles: [...ROLES] },
  { href: "/catalog", label: "Programs & Levels", short: "PL", roles: ["admin", "academic_manager"] },
  { href: "/students", label: "Học viên", short: "HV", roles: ["admin", "academic_manager", "teacher", "customer_service"] },
  { href: "/classes", label: "Lớp học", short: "LH", roles: [...ROLES] },
  { href: "/schedule", label: "Lịch & Matching", short: "LM", roles: ["admin", "academic_manager", "teacher", "student"] },
  { href: "/academic", label: "Academic Ops", short: "AO", roles: ["admin", "academic_manager", "teacher"] },
  { href: "/quality", label: "Teacher Quality", short: "TQ", roles: ["admin", "academic_manager", "teacher"] },
  { href: "/finance", label: "Học phí & CSKH", short: "TC", roles: ["admin", "customer_service", "student"] },
  { href: "/admin/users", label: "Administration", short: "AD", roles: ["admin"] }
];

export function roleCanAccess(role: AppRole, allowed: readonly AppRole[]) {
  return allowed.includes(role);
}

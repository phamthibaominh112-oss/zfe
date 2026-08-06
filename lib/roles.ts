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
  admin: "Quản lý toàn bộ trung tâm",
  academic_manager: "Điều phối lớp học và chất lượng",
  teacher: "Giảng dạy và theo dõi học viên",
  customer_service: "Hồ sơ, học phí và tái phí",
  student: "Lịch học và tiến độ cá nhân"
};

export type NavItem = {
  href: string;
  label: string;
  short: string;
};

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", short: "⌂" },
  { href: "/schedule", label: "Lịch trung tâm", short: "◷" },
  { href: "/classes", label: "Lớp học", short: "▦" },
  { href: "/students", label: "Học viên", short: "HV" },
  { href: "/academic", label: "Học thuật", short: "✓" },
  { href: "/quality", label: "Chất lượng GV", short: "★" },
  { href: "/finance", label: "Thu phí & tài chính", short: "₫" },
  { href: "/finance/expenses", label: "Chi phí & báo cáo", short: "TC" },
  { href: "/payroll", label: "Lương giáo viên", short: "LG" },
  { href: "/catalog", label: "Chương trình", short: "PL" },
  { href: "/admin/users", label: "Người dùng & quyền", short: "⚙" }
];

const ACADEMIC_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", short: "⌂" },
  { href: "/schedule", label: "Lịch trung tâm", short: "◷" },
  { href: "/classes", label: "Lớp học", short: "▦" },
  { href: "/students", label: "Học viên", short: "HV" },
  { href: "/academic", label: "Điểm danh & học tập", short: "✓" },
  { href: "/quality", label: "Chất lượng GV", short: "★" },
  { href: "/catalog", label: "Chương trình", short: "PL" }
];

const TEACHER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Hôm nay", short: "⌂" },
  { href: "/schedule", label: "Lịch dạy", short: "◷" },
  { href: "/classes", label: "Lớp của tôi", short: "▦" },
  { href: "/students", label: "Học viên của tôi", short: "HV" },
  { href: "/academic", label: "Điểm danh & bài tập", short: "✓" },
  { href: "/quality", label: "Đánh giá của tôi", short: "★" },
  { href: "/payroll", label: "Lương tháng", short: "₫" }
];

const CUSTOMER_SERVICE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan CSKH", short: "⌂" },
  { href: "/students", label: "Hồ sơ học viên", short: "HV" },
  { href: "/finance", label: "Thu phí & tái phí", short: "₫" },
  { href: "/classes", label: "Tình trạng lớp", short: "▦" }
];

const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Trang chủ", short: "⌂" },
  { href: "/schedule", label: "Lịch học", short: "◷" },
  { href: "/classes", label: "Lộ trình & lớp", short: "▦" },
  { href: "/finance", label: "Học phí", short: "₫" }
];

export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  admin: ADMIN_NAV,
  academic_manager: ACADEMIC_NAV,
  teacher: TEACHER_NAV,
  customer_service: CUSTOMER_SERVICE_NAV,
  student: STUDENT_NAV
};

export function roleCanAccess(role: AppRole, allowed: readonly AppRole[]) {
  return allowed.includes(role);
}

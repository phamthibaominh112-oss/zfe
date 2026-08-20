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
  email: string | null;
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
  group?: string;
};

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", short: "⌂", group: "Vận hành" },
  { href: "/class-planner", label: "Xếp lớp & GV", short: "XL", group: "Vận hành" },
  { href: "/schedule", label: "Lịch trung tâm", short: "◷", group: "Vận hành" },
  { href: "/workforce", label: "Chấm công & nhân sự", short: "CC", group: "Vận hành" },

  { href: "/classes", label: "Lớp học", short: "▦", group: "Học viên & Học thuật" },
  { href: "/students", label: "Học viên", short: "HV", group: "Học viên & Học thuật" },
  { href: "/placement", label: "Placement Test", short: "PT", group: "Học viên & Học thuật" },
  { href: "/academic", label: "Học thuật", short: "✓", group: "Học viên & Học thuật" },
  { href: "/quality", label: "Chất lượng GV", short: "★", group: "Học viên & Học thuật" },
  { href: "/curriculum", label: "Chương trình & Syllabus", short: "SY", group: "Học viên & Học thuật" },

  { href: "/finance", label: "Thu phí & tái phí", short: "₫", group: "Business & Tài chính" },
  { href: "/finance/expenses", label: "Chi phí & báo cáo", short: "TC", group: "Business & Tài chính" },
  { href: "/payroll", label: "Lương giáo viên", short: "LG", group: "Business & Tài chính" },

  { href: "/sop", label: "SOP & Training", short: "SOP", group: "Hệ thống" },
  { href: "/admin/users", label: "Người dùng & quyền", short: "⚙", group: "Hệ thống" }
];

const ACADEMIC_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", short: "⌂" },
  { href: "/class-planner", label: "Xếp lớp & GV", short: "XL" },
  { href: "/schedule", label: "Lịch trung tâm", short: "◷" },
  { href: "/workforce", label: "Lịch làm & chấm công", short: "CC" },
  { href: "/classes", label: "Lớp học", short: "▦" },
  { href: "/students", label: "Học viên", short: "HV" },
  { href: "/placement", label: "Placement Test", short: "PT" },
  { href: "/academic", label: "Điểm danh & học tập", short: "✓" },
  { href: "/quality", label: "Chất lượng GV", short: "★" },
  { href: "/curriculum", label: "Chương trình & Syllabus", short: "SY" },
  { href: "/sop", label: "SOP & Training", short: "SOP" }
];

const TEACHER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Hôm nay", short: "⌂" },
  { href: "/schedule", label: "Lịch dạy", short: "◷" },
  { href: "/workforce", label: "Check-in & KPI", short: "KPI" },
  { href: "/placement", label: "Placement Test", short: "PT" },
  { href: "/classes", label: "Lớp của tôi", short: "▦" },
  { href: "/students", label: "Học viên của tôi", short: "HV" },
  { href: "/academic", label: "Điểm danh & bài tập", short: "✓" },
  { href: "/quality", label: "Đánh giá của tôi", short: "★" },
  { href: "/payroll", label: "Lương tháng", short: "₫" }
];

const CUSTOMER_SERVICE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan CSKH", short: "⌂" },
  { href: "/workforce", label: "Lịch làm & chấm công", short: "CC" },
  { href: "/students", label: "Hồ sơ học viên", short: "HV" },
  { href: "/placement", label: "Placement Test", short: "PT" },
  { href: "/academic", label: "Academic Record", short: "AR" },
  { href: "/finance", label: "Thu phí & tái phí", short: "₫" },
  { href: "/classes", label: "Tình trạng lớp", short: "▦" },
  { href: "/sop", label: "SOP & Training", short: "SOP" }
];

const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Trang chủ", short: "⌂" },
  { href: "/schedule", label: "Lịch học", short: "◷" },
  { href: "/learning", label: "Học tập & tiến bộ", short: "LP" },
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

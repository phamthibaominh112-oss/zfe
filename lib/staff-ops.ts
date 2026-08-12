import type { Profile } from "@/lib/roles";

export const STAFF_OPS_PEOPLE = [
  { email: "khangaca@gmail.com", name: "Khang", title: "Academic & Teacher Quality", roleKey: "khang" },
  { email: "thinhaca@gmail.com", name: "Thịnh", title: "Scheduling & Student Operations", roleKey: "thinh" },
  { email: "studentcare@gmail.com", name: "Mai", title: "Customer Success & Admissions Operations", roleKey: "mai" }
] as const;

export const STAFF_OPS_EMAILS = STAFF_OPS_PEOPLE.map((x) => x.email);

export function staffOpsPerson(email?: string | null) {
  const key = String(email || "").trim().toLowerCase();
  return STAFF_OPS_PEOPLE.find((x) => x.email === key) || null;
}

export function canAccessStaffOps(profile: Pick<Profile, "role" | "email">) {
  return profile.role === "admin" || !!staffOpsPerson(profile.email);
}

export function isStaffOpsWorker(profile: Pick<Profile, "role" | "email">) {
  return profile.role !== "admin" && !!staffOpsPerson(profile.email);
}

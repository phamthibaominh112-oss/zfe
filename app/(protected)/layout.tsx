import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("status", "Unread");
  return <AppShell profile={profile} unreadNotifications={count || 0}>{children}</AppShell>;
}

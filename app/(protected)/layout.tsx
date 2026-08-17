import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasBusinessIntelligenceAccess } from "@/lib/business-intelligence-access";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ count }, businessIntelligenceAccess] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("status", "Unread"),
    hasBusinessIntelligenceAccess(profile.id,profile.role)
  ]);
  return <AppShell profile={profile} unreadNotifications={count || 0} businessIntelligenceAccess={businessIntelligenceAccess}>{children}</AppShell>;
}

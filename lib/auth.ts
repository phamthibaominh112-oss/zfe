import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/roles";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userId)
    .single();

  if (error || !data || !data.is_active) return null;
  return data as Profile;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?error=account_not_ready");
  return profile;
}

export async function requireRole(allowed: readonly AppRole[]) {
  const profile = await requireProfile();
  if (!allowed.includes(profile.role)) redirect("/dashboard?error=forbidden");
  return profile;
}

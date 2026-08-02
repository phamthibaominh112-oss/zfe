import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";

/** Server-only service-role client. Never expose this client or key to the browser. */
export function createAdminClient(): any {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false }
  }) as any;
}

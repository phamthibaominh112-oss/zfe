"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

/** See server.ts: RLS provides runtime security; generated DB types can be added later. */
export function createClient(): any {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey()) as any;
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

/**
 * The project does not ship generated Supabase Database types yet.
 * Explicitly returning an untyped client prevents PostgREST's compile-time
 * select parser from turning valid runtime queries into ParserError values.
 * Runtime authorization remains enforced by PostgreSQL RLS.
 */
export async function createClient(): Promise<any> {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Cookie refresh is handled by proxy.ts when called from a Server Component.
        }
      }
    }
  }) as any;
}

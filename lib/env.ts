export type SupabaseEnvironmentStatus = {
  url: boolean;
  publishableKey: boolean;
  serviceRoleKey: boolean;
  appUrl: boolean;
};

export function getSupabaseEnvironmentStatus(): SupabaseEnvironmentStatus {
  return {
    url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL)
  };
}

/** Public Supabase configuration needed to create browser/server session clients. */
export function isSupabasePublicConfigured() {
  const status = getSupabaseEnvironmentStatus();
  return status.url && status.publishableKey;
}

/** Minimum production configuration required before the application is opened. */
export function isPlatformConfigured() {
  const status = getSupabaseEnvironmentStatus();
  return status.url && status.publishableKey && status.serviceRoleKey;
}

export function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return value;
}

export function getSupabasePublishableKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return value;
}

export function getSupabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return value;
}

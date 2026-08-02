import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl, isPlatformConfigured } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth/", "/setup"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path));
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // A newly deployed project may not have Supabase variables yet. Do not throw a
  // runtime 500. Route the operator to a setup screen that explains what is missing.
  if (!isPlatformConfigured()) {
    if (pathname === "/setup") return NextResponse.next({ request });

    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Once configured, /setup is no longer the application entry point.
  if (pathname === "/setup") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data } = await supabase.auth.getClaims();
  const isPublic = isPublicPath(pathname);

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (data?.claims && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

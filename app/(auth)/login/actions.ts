"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/dashboard");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`
  });
  if (error) redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  redirect("/forgot-password?message=reset_sent");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");
  if (password.length < 8) redirect("/reset-password?error=Mật khẩu phải có ít nhất 8 ký tự.");
  if (password !== confirmPassword) redirect("/reset-password?error=Mật khẩu xác nhận không khớp.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=password_updated");
}

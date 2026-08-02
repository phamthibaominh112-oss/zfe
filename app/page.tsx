import { redirect } from "next/navigation";
import { isPlatformConfigured } from "@/lib/env";

export default function Home() {
  redirect(isPlatformConfigured() ? "/dashboard" : "/setup");
}

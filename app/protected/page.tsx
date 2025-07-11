import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/auth/login");
  }

  // Redirect to appropriate dashboard based on user role
  const userRole = data.user.user_metadata?.role || 'student';
  redirect(`/dashboard/${userRole}`);
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get user's active role assignments to determine primary role
  const { data: roleAssignments } = await supabase
    .from("user_role_assignments")
    .select("role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .or("expires_at.is.null")
    .order("assigned_at", { ascending: false });

  // Determine primary role based on role hierarchy
  let primaryRole = "student"; // default
  
  if (roleAssignments && roleAssignments.length > 0) {
    // Role hierarchy: system_admin > institution_admin > department_admin > teacher > student
    const roleHierarchy = {
      system_admin: 5,
      institution_admin: 4,
      department_admin: 3,
      teacher: 2,
      student: 1
    };

    const highestRole = roleAssignments.reduce((highest, current) => {
      const currentWeight = roleHierarchy[current.role as keyof typeof roleHierarchy] || 0;
      const highestWeight = roleHierarchy[highest.role as keyof typeof roleHierarchy] || 0;
      return currentWeight > highestWeight ? current : highest;
    });

    primaryRole = highestRole.role;
  } else {
    // Fallback to legacy role system if no role assignments found
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    primaryRole = profile?.role || user.user_metadata?.role || "student";
  }

  // Redirect based on primary role
  switch (primaryRole) {
    case "system_admin":
      redirect("/dashboard/admin");
      break;
    case "institution_admin":
      redirect("/dashboard/institution");
      break;
    case "department_admin":
      redirect("/dashboard/department_admin");
      break;
    case "teacher":
      redirect("/dashboard/teacher");
      break;
    case "student":
    default:
      redirect("/dashboard/student");
      break;
  }
}

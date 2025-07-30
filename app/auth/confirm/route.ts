import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // Get user data and check onboarding status
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Import OnboardingGuard dynamically to avoid circular dependencies
        const { OnboardingGuard } = await import('@/lib/utils/onboarding-guard');
        const onboardingStatus = await OnboardingGuard.checkOnboardingStatus(user);
        
        // If user needs onboarding, redirect to onboarding flow
        if (onboardingStatus.needsOnboarding) {
          redirect(onboardingStatus.redirectPath || '/onboarding');
        } else {
          // User has completed onboarding, redirect to intended destination or dashboard
          const userRole = user.user_metadata?.role || 'student';
          if (next !== "/" && next.includes('/dashboard/')) {
            redirect(next);
          } else {
            redirect(OnboardingGuard.getDashboardPath(userRole));
          }
        }
      } else {
        redirect('/auth/error?error=User not found after verification');
      }
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`);
}

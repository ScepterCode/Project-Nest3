import { LoginForm } from '@/components/login-form';
import Logo from '@/components/Header/Logo';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const notice =
    reason === 'idle'
      ? 'You were signed out after 30 minutes of inactivity.'
      : reason === 'confirmed'
        ? 'Your email is confirmed. Sign in to continue.'
        : undefined;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <LoginForm notice={notice} />
      </div>
    </div>
  );
}

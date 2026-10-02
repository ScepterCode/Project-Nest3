import { LoginForm } from '@/components/login-form';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const notice =
    reason === 'idle'
      ? 'You were signed out after 30 minutes of inactivity.'
      : undefined;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm notice={notice} />
      </div>
    </div>
  );
}

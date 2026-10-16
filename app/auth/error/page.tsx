import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ResendConfirmation } from '@/components/auth/resend-confirmation';
import { emailLinkError } from '@/lib/auth/email-links';

// Only fixed messages are shown: the `error` value picks one, so a crafted
// link can't put its own text on this page.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const info = emailLinkError(error);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{info.title}</CardTitle>
            <CardDescription>{info.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            {info.offerResend && <ResendConfirmation />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

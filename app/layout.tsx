import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { SessionProvider } from '@/components/session-provider';
import { AuthProvider } from '@/contexts/auth-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: 'ProjectNest',
    template: '%s | ProjectNest',
  },
  description:
    'Classes, assignments, grading and peer review for schools and their students.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ErrorBoundary>
          <SessionProvider>
            <AuthProvider>
              <ThemeProvider
                attribute="class"
                // Most pages are styled for light mode only; following the OS
                // theme rendered dark components on hard-coded white pages.
                defaultTheme="light"
                enableSystem={false}
                disableTransitionOnChange
              >
                {children}
                <Toaster />
              </ThemeProvider>
            </AuthProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

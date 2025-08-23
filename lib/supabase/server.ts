import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  // This function is creating a supabase client on the server side. This is important for handling server requests. Now whenever a user works on the browser. session info is being stored in cookies/local storage. createBrowserClient is being provided by supabase for this operation
  return createServerClient(
    // For the server, supabase provides this createServerClient, which on requests from the user, reads and updates session info securely from cookie making server side rendering easy and also detect the user. when using createserverClient from supabase SSR, you must pass 3 things, supabase URL, supabase anon key and A cookies object for session handling
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
          // This is saying give all the cookies the browser sent to this request
        },
        setAll(cookiesToSet) {
          // Here supabase sets or updates session when something
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) =>
                cookieStore.set(name, value, options)
              // name of the cookie,the value the cookie stores and options is a config object with settings like path, httpOnly,secure and maxage
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            // cookies helps supabase to store and read user's sessions
          }
        },
      },
    }
  );
}

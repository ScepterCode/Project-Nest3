import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Provide a safe fallback cookie store for build-time / non-request contexts.
function noopCookieStore() {
  return {
    getAll() {
      return [] as Array<{ name: string; value: string; options?: any }>;
    },
    set(name: string, value: string, options?: any) {
      // noop
    },
  };
}

export async function createClient() {
  let cookieStore = noopCookieStore();

  try {
    // cookies() throws when invoked outside a request scope (static build).
    // Wrap in try/catch so building and type-checking won't fail.
    // When running in a request, cookies() will return a real store.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    cookieStore = await cookies();
  } catch {
    // keep noop store
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // If cookieStore is noop this is a no-op.
              (cookieStore as any).set(name, value, options),
            );
          } catch {
            // setAll may fail during static rendering — ignore safely.
          }
        },
      },
    },
  );
}

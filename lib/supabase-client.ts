import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

export function createClient() {
  // Type assertion is safe after the above check
  return createSupabaseClient(supabaseUrl as string, supabaseAnonKey as string);
}

// If you see import errors for this file, restart your editor and dev server to refresh path aliases.

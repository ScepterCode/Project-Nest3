import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export default async function ProtectedPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect('/auth/login');
  }

  // /dashboard routes by the role stored in the database. user_metadata is
  // editable by the user, so it must not decide where they land.
  redirect('/dashboard');
}

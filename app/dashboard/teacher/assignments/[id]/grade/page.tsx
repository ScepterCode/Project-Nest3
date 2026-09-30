import { redirect } from 'next/navigation';

// Grading lives at /grade-submissions; keep this URL working for old links.
export default async function GradeRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/teacher/assignments/${id}/grade-submissions`);
}

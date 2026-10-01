import type { SupabaseClient } from '@supabase/supabase-js';

export const SUBMISSIONS_BUCKET = 'submissions';

// Signed links are short-lived; a fresh one is created on every click.
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Normalizes what's stored in submissions.file_url to a storage object path
 * ("<student_id>/<assignment_id>/<file>").
 *
 * New uploads store the path. Older rows store a full
 * ".../storage/v1/object/public/submissions/<path>" URL, which never worked
 * because the bucket is private; the path is recovered from it.
 */
export function submissionFilePath(fileUrl: string): string {
  const marker = `/${SUBMISSIONS_BUCKET}/`;
  if (/^https?:\/\//i.test(fileUrl)) {
    const { pathname } = new URL(fileUrl);
    const i = pathname.indexOf(marker);
    return decodeURIComponent(
      i >= 0 ? pathname.slice(i + marker.length) : pathname
    );
  }
  return fileUrl;
}

/** Display name without the "<timestamp>-" prefix added at upload time. */
export function submissionFileName(fileUrl: string): string {
  const name = submissionFilePath(fileUrl).split('/').pop() || 'file';
  return name.replace(/^\d{10,}-/, '');
}

/**
 * Short-lived signed URL for a submission file. Storage policies decide who
 * may open it: the student who uploaded it and the class teacher.
 */
export async function getSubmissionFileUrl(
  supabase: SupabaseClient,
  fileUrl: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .createSignedUrl(submissionFilePath(fileUrl), SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not open this file');
  }
  return data.signedUrl;
}

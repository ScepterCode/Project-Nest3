import { Upload } from 'tus-js-client';
import { createClient } from '@/lib/supabase/client';

/**
 * Uploads large files in 6 MB chunks with Supabase's resumable (TUS)
 * endpoint, so a dropped connection or a reload doesn't start over: each
 * chunk is retried with back-off, and a later attempt at the same file
 * picks up where the last one stopped. Small files use a normal upload.
 */
export const RESUMABLE_FROM_BYTES = 6 * 1024 * 1024;
const CHUNK_BYTES = 6 * 1024 * 1024; // Supabase requires exactly 6 MB chunks

export interface UploadOptions {
  bucket: string;
  path: string;
  file: File;
  contentType: string;
  onProgress?: (fraction: number) => void;
}

/** Storage answers 409 when the path is taken: with a stable path per file,
 * that means this exact file is already uploaded. */
function alreadyThere(error: unknown) {
  const e = error as {
    statusCode?: string | number;
    status?: number;
    message?: string;
    originalResponse?: { getStatus(): number };
  };
  return (
    String(e?.statusCode) === '409' ||
    e?.status === 409 ||
    e?.originalResponse?.getStatus?.() === 409 ||
    /already exists/i.test(e?.message ?? '')
  );
}

export async function uploadFile({
  bucket,
  path,
  file,
  contentType,
  onProgress,
}: UploadOptions) {
  const supabase = createClient();

  if (file.size < RESUMABLE_FROM_BYTES) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: false });
    if (error && !alreadyThere(error)) throw error;
    onProgress?.(1);
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again before uploading');

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000, 30000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_BYTES,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: '3600',
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: error => (alreadyThere(error) ? resolve() : reject(error)),
    });

    // Resume an earlier attempt at this same file and destination.
    upload
      .findPreviousUploads()
      .then(previous => {
        const match = previous.find(p => p.metadata?.objectName === path);
        if (match) upload.resumeFromPreviousUpload(match);
        upload.start();
      })
      .catch(() => upload.start());
  });
}

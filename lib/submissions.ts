// What students can upload as assignment work. Must match the "submissions"
// bucket (supabase/migrations/20261013120000_uploads_enrollment_signup.sql).

/** The free plan's per-file maximum, also set on the bucket. */
export const MAX_SUBMISSION_BYTES = 50 * 1024 * 1024;

/** Types the bucket accepts, as the browser reports them. */
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'audio/mpeg',
  'audio/wav',
  'application/zip',
  'application/x-zip-compressed',
]);

/**
 * Animation and art project files. Browsers report them inconsistently (often
 * as nothing at all), so they're stored as application/octet-stream, which is
 * always downloaded rather than opened in the browser.
 */
const PROJECT_EXTENSIONS = [
  'blend',
  'fla',
  'aep',
  'prproj',
  'psd',
  'kra',
  'ora',
  'clip',
  'tvpp',
  'ma',
  'mb',
  'c4d',
  'fbx',
  'obj',
  'max',
  'toon',
  'xstage',
  'sai',
  'procreate',
];

/** For the file picker's `accept`. */
export const SUBMISSION_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.odt',
  '.odp',
  '.rtf',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mp3',
  '.wav',
  '.zip',
  ...PROJECT_EXTENSIONS.map(ext => `.${ext}`),
].join(',');

function extension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * The content type to upload a file with, or an error message if it can't be
 * uploaded.
 */
export function submissionFileType(file: {
  name: string;
  size: number;
  type: string;
}): { contentType: string } | { problem: string } {
  if (file.size > MAX_SUBMISSION_BYTES) {
    return {
      problem:
        'Files can be up to 50 MB. For longer videos, upload to YouTube, Vimeo or Google Drive and hand in the link instead.',
    };
  }
  if (PROJECT_EXTENSIONS.includes(extension(file.name))) {
    return { contentType: 'application/octet-stream' };
  }
  if (ALLOWED_TYPES.has(file.type)) {
    return { contentType: file.type };
  }
  return {
    problem:
      'That file type isn’t supported. Use a video (MP4, MOV, WebM), GIF, image, PDF, document, ZIP or your animation project file.',
  };
}

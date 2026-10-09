// Class materials: files and links a teacher shares with their class.
// Storage rules live in supabase/migrations/20261009120000_class_materials.sql;
// the limits here must match the "class-materials" bucket.

export const MATERIALS_BUCKET = 'class-materials';

/** The free plan's per-file maximum, also set on the bucket. */
export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;

/** File types the bucket accepts (no HTML, SVG or scripts). */
export const ALLOWED_MATERIAL_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'Word',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'PowerPoint',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.oasis.opendocument.text': 'Document',
  'application/vnd.oasis.opendocument.presentation': 'Presentation',
  'application/vnd.oasis.opendocument.spreadsheet': 'Spreadsheet',
  'application/rtf': 'Document',
  'application/zip': 'ZIP',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'image/png': 'Image',
  'image/jpeg': 'Image',
  'image/gif': 'Image',
  'image/webp': 'Image',
  'audio/mpeg': 'Audio',
  'audio/mp4': 'Audio',
  'audio/wav': 'Audio',
};

/** For the file picker's `accept`. */
export const MATERIAL_ACCEPT = Object.keys(ALLOWED_MATERIAL_TYPES).join(',');

export interface ClassMaterial {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  kind: 'file' | 'link';
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

/** Why a file can't be uploaded, or null if it can. */
export function fileProblem(file: { size: number; type: string }) {
  if (file.size > MAX_MATERIAL_BYTES) {
    return `Files can be up to ${formatBytes(MAX_MATERIAL_BYTES)}. For videos, share a link instead.`;
  }
  if (!ALLOWED_MATERIAL_TYPES[file.type]) {
    return 'That file type isn’t supported. Use a PDF, Office document, image, audio, text or ZIP file.';
  }
  return null;
}

/** A storage-safe version of a file name (keeps the extension). */
export function safeFileName(name: string) {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '');
  const trimmed = cleaned.slice(-100);
  return trimmed || 'file';
}

/** "<class_id>/<random>/<file name>": the bucket's rules require the class folder. */
export function materialPath(
  classId: string,
  fileName: string,
  random: string
) {
  return `${classId}/${random}/${safeFileName(fileName)}`;
}

/** The link as an absolute http(s) URL, or null if it isn't one. */
export function normalizeLink(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text)
    ? text
    : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'loom.com',
  'dailymotion.com',
  'ted.com',
  'wistia.com',
];

/** True for links to video sites. */
export function isVideoLink(link: string | null) {
  if (!link) return false;
  try {
    const host = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
    return VIDEO_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number | null) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

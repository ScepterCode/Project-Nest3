// Checks that a video/file link handed in or shared can actually be opened
// by others. Only these services are checked, through fixed URLs, so the
// server never fetches an arbitrary address a user typed (no SSRF).

export type LinkService = 'youtube' | 'vimeo' | 'google_drive';

export interface LinkCheckResult {
  /** 'ok', 'private' (exists but others can't open it), 'missing', or 'unknown'. */
  status: 'ok' | 'private' | 'missing' | 'unknown';
  service: LinkService | null;
  message: string | null;
}

export function linkService(link: string): LinkService | null {
  let host: string;
  try {
    host = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
  if (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com')
  )
    return 'youtube';
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';
  if (host === 'drive.google.com' || host === 'docs.google.com')
    return 'google_drive';
  return null;
}

/** The fixed address the server fetches for a link, or null to skip. */
export function checkUrl(link: string): string | null {
  const service = linkService(link);
  const encoded = encodeURIComponent(link);
  switch (service) {
    case 'youtube':
      return `https://www.youtube.com/oembed?format=json&url=${encoded}`;
    case 'vimeo':
      return `https://vimeo.com/api/oembed.json?url=${encoded}`;
    case 'google_drive': {
      const url = new URL(link);
      // Re-built on Google's own host so nothing else can be fetched.
      return `https://${url.hostname}${url.pathname}${url.search}`;
    }
    default:
      return null;
  }
}

const MESSAGES: Record<LinkService, { private: string; missing: string }> = {
  youtube: {
    private:
      'This YouTube video is private, so your teacher can’t watch it. Set it to “Unlisted” (or Public) in YouTube Studio.',
    missing: 'This YouTube video can’t be found. Check the link.',
  },
  vimeo: {
    private:
      'This Vimeo video is private. Change its privacy so “Anyone with the link” can view it.',
    missing: 'This Vimeo video can’t be found. Check the link.',
  },
  google_drive: {
    private:
      'This Google Drive file isn’t shared. In Drive, choose Share → General access → “Anyone with the link”.',
    missing: 'This Google Drive file can’t be found. Check the link.',
  },
};

/** Turns the service's reply into a result. */
export function interpret(
  service: LinkService,
  response: { status: number; finalUrl: string }
): LinkCheckResult {
  const { status, finalUrl } = response;
  if (service === 'google_drive') {
    if (
      /accounts\.google\.com/.test(finalUrl) ||
      status === 401 ||
      status === 403
    ) {
      return { status: 'private', service, message: MESSAGES[service].private };
    }
    if (status === 404)
      return { status: 'missing', service, message: MESSAGES[service].missing };
    return status < 400
      ? { status: 'ok', service, message: null }
      : { status: 'unknown', service, message: null };
  }
  if (status === 401 || status === 403) {
    return { status: 'private', service, message: MESSAGES[service].private };
  }
  if (status === 404 || status === 400) {
    return { status: 'missing', service, message: MESSAGES[service].missing };
  }
  return status < 400
    ? { status: 'ok', service, message: null }
    : { status: 'unknown', service, message: null };
}

/** Client helper: asks the server to check a link. Never throws. */
export async function checkLink(link: string): Promise<LinkCheckResult> {
  if (!linkService(link))
    return { status: 'unknown', service: null, message: null };
  try {
    const response = await fetch(
      `/api/links/check?url=${encodeURIComponent(link)}`
    );
    if (!response.ok)
      return { status: 'unknown', service: linkService(link), message: null };
    return (await response.json()) as LinkCheckResult;
  } catch {
    return { status: 'unknown', service: linkService(link), message: null };
  }
}

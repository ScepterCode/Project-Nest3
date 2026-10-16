import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkUrl, interpret, linkService } from '@/lib/link-check';
import { normalizeLink } from '@/lib/materials';

/**
 * Is this YouTube / Vimeo / Google Drive link viewable by others? Signed-in
 * users only; only those services are contacted, through fixed URLs.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const link = normalizeLink(request.nextUrl.searchParams.get('url') ?? '');
  const service = link ? linkService(link) : null;
  const target = link ? checkUrl(link) : null;
  if (!link || !service || !target) {
    return NextResponse.json({
      status: 'unknown',
      service: null,
      message: null,
    });
  }

  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'ProjectNest link check' },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    // Don't download a whole Drive file: only the status and final URL matter.
    response.body?.cancel().catch(() => {});
    return NextResponse.json(
      interpret(service, { status: response.status, finalUrl: response.url })
    );
  } catch {
    return NextResponse.json({ status: 'unknown', service, message: null });
  }
}

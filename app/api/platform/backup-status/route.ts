import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/platform/server';

// The daily database backup runs as a GitHub Actions workflow
// (.github/workflows/db-backup.yml). The repository is public, so its run
// history can be read without a token.
const REPOSITORY = process.env.GITHUB_REPOSITORY ?? 'ScepterCode/Project-Nest3';

export async function GET() {
  const supabase = await createClient();
  const auth = await requirePlatformAdmin(supabase);
  if (!auth.ok) return auth.response;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/actions/workflows/db-backup.yml/runs?per_page=5`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        // GitHub allows 60 unauthenticated requests an hour; cache briefly.
        next: { revalidate: 300 },
      }
    );
    if (response.status === 404) {
      return NextResponse.json({ configured: false, runs: [] });
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub returned ${response.status}` },
        { status: 502 }
      );
    }
    const data = (await response.json()) as {
      workflow_runs?: {
        status: string;
        conclusion: string | null;
        created_at: string;
        html_url: string;
      }[];
    };
    return NextResponse.json({
      configured: true,
      runs: (data.workflow_runs ?? []).map(run => ({
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        url: run.html_url,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach GitHub' },
      { status: 502 }
    );
  }
}

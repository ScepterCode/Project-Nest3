'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatBytes } from '@/lib/materials';
import { platformRpc, sinceText } from '@/lib/platform/client';

// Supabase free plan limits.
const DATABASE_LIMIT = 500 * 1024 * 1024;
const STORAGE_LIMIT = 1024 * 1024 * 1024;

interface Health {
  database_bytes: number;
  storage_bytes: number;
  files: number;
  buckets: { bucket: string; bytes: number; files: number }[];
  top_classes: {
    class_id: string;
    class: string;
    school: string | null;
    bytes: number;
    files: number;
  }[];
}

interface BackupStatus {
  configured?: boolean;
  runs?: {
    status: string;
    conclusion: string | null;
    createdAt: string;
    url: string;
  }[];
  error?: string;
}

const BUCKET_LABELS: Record<string, string> = {
  submissions: 'Student work',
  'class-materials': 'Class materials',
};

function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percent = Math.min(100, (used / limit) * 100);
  const colour =
    percent >= 90
      ? 'bg-red-500'
      : percent >= 70
        ? 'bg-amber-500'
        : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {formatBytes(used)} of {formatBytes(limit)} ({percent.toFixed(0)}%)
        </span>
      </div>
      <div className="h-3 rounded bg-gray-100">
        <div
          className={`h-3 rounded ${colour}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function PlatformHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);

  useEffect(() => {
    platformRpc<Health>('platform_health')
      .then(h =>
        setHealth({
          ...h,
          database_bytes: Number(h.database_bytes),
          storage_bytes: Number(h.storage_bytes),
        })
      )
      .catch(e => setError(e.message));
    fetch('/api/platform/backup-status')
      .then(r => r.json())
      .then(setBackup)
      .catch(() => setBackup({ error: 'Could not check backups' }));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!health) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const lastRun = backup?.runs?.[0];
  const lastGood = backup?.runs?.find(r => r.conclusion === 'success');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Free plan usage</CardTitle>
          <CardDescription>
            When either bar nears full, move to Supabase&apos;s paid plan or ask
            for long videos as links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Meter
            label="Database"
            used={health.database_bytes}
            limit={DATABASE_LIMIT}
          />
          <Meter
            label={`File storage (${health.files} files)`}
            used={health.storage_bytes}
            limit={STORAGE_LIMIT}
          />
          {health.buckets.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {health.buckets
                .map(
                  b =>
                    `${BUCKET_LABELS[b.bucket] ?? b.bucket}: ${formatBytes(Number(b.bytes))}`
                )
                .join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Classes using the most storage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health.top_classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No files uploaded yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Class</th>
                  <th className="py-2 font-normal">School</th>
                  <th className="py-2 font-normal">Files</th>
                  <th className="py-2 font-normal">Size</th>
                </tr>
              </thead>
              <tbody>
                {health.top_classes.map(c => (
                  <tr key={c.class_id} className="border-t">
                    <td className="py-2">{c.class}</td>
                    <td className="py-2">{c.school ?? '—'}</td>
                    <td className="py-2">{c.files}</td>
                    <td className="py-2">{formatBytes(Number(c.bytes))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily backups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!backup ? (
            <p className="text-muted-foreground">Checking…</p>
          ) : backup.error ? (
            <p className="text-amber-700">{backup.error}</p>
          ) : !lastRun ? (
            <p className="text-amber-700">
              No backup has run yet. Add the two backup settings on GitHub and
              run the &ldquo;Database backup&rdquo; workflow once (see
              docs/backups.md).
            </p>
          ) : (
            <>
              <p>
                Last run {sinceText(lastRun.createdAt)}:{' '}
                <span
                  className={
                    lastRun.conclusion === 'success'
                      ? 'text-green-700'
                      : 'text-red-600'
                  }
                >
                  {lastRun.status !== 'completed'
                    ? 'still running'
                    : lastRun.conclusion === 'success'
                      ? 'succeeded'
                      : `failed (${lastRun.conclusion})`}
                </span>{' '}
                ·{' '}
                <a
                  href={lastRun.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  details
                </a>
              </p>
              {lastRun.conclusion !== 'success' && (
                <p className="text-muted-foreground">
                  Last successful backup:{' '}
                  {lastGood ? sinceText(lastGood.createdAt) : 'none yet'}.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

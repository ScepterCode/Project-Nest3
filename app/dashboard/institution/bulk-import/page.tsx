'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE_CSV,
  ImportRow,
  ImportRowError,
  parseImportFile,
} from '@/lib/bulk/csv';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';

interface ImportHistoryItem {
  id: string;
  file_name: string;
  total_records: number;
  successful_records: number;
  failed_records: number;
  status: string;
  created_at: string;
}

interface ImportOutcome {
  created: { line: number; email: string }[];
  skipped: ImportRowError[];
  failed: ImportRowError[];
}

const PREVIEW_ROWS = 10;

export default function BulkImportPage() {
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileErrors, setFileErrors] = useState<ImportRowError[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const response = await fetch('/api/bulk-import');
    if (response.ok) {
      const data = await response.json();
      setHistory(data.imports || []);
    } else {
      const data = await response.json().catch(() => ({}));
      setRequestError(data.error || null);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const reset = () => {
    setFileName('');
    setFileSize(0);
    setRows([]);
    setFileErrors([]);
    setFatal(null);
    setProcessed(0);
    setOutcome(null);
    setRequestError(null);
  };

  const handleFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setFatal('Please upload a .csv file (in Excel: File → Save As → CSV).');
      return;
    }
    const parsed = parseImportFile(await file.text());
    setFileName(file.name);
    setFileSize(file.size);
    setRows(parsed.rows);
    setFileErrors(parsed.errors);
    setFatal(parsed.fatal ?? null);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([IMPORT_TEMPLATE_CSV], { type: 'text/csv' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    setImporting(true);
    setRequestError(null);
    const result: ImportOutcome = { created: [], skipped: [], failed: [] };
    let importId: string | undefined;

    try {
      for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
        const response = await fetch('/api/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            importId,
            fileName,
            fileSize,
            totalRows: rows.length,
            rows: batch,
            final: i + IMPORT_BATCH_SIZE >= rows.length,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data.error || `Import failed (HTTP ${response.status})`
          );
        }
        importId = data.importId;
        result.created.push(...data.created);
        result.skipped.push(...data.skipped);
        result.failed.push(...data.failed);
        setProcessed(Math.min(i + IMPORT_BATCH_SIZE, rows.length));
        setOutcome({ ...result });
      }
    } catch (error) {
      setRequestError(
        `${error instanceof Error ? error.message : 'Import failed'}. ` +
          `${result.created.length} account(s) were created before it stopped.`
      );
    } finally {
      setImporting(false);
      loadHistory();
    }
  };

  const problems = outcome
    ? [...outcome.failed, ...outcome.skipped].sort((a, b) => a.line - b.line)
    : [];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Import Users</h1>
        <p className="text-muted-foreground">
          Create student and teacher accounts for your institution from a CSV
          file.
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Accounts are created without a password and no email is sent. Tell
          your users to open the sign-in page and choose{' '}
          <strong>Forgot password</strong> to set one. Emails that already have
          an account are skipped and left unchanged.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>1. Choose a file</CardTitle>
          <CardDescription>
            Columns: <code>email</code>, <code>first_name</code>,{' '}
            <code>last_name</code>, and optionally <code>role</code> (
            <code>student</code> or <code>teacher</code>; defaults to student).
            Up to {IMPORT_MAX_ROWS.toLocaleString()} rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            <Upload className="h-4 w-4" />
            {fileName || 'Select CSV file'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={importing}
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </label>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download template
          </Button>
        </CardContent>
      </Card>

      {fatal && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{fatal}</AlertDescription>
        </Alert>
      )}

      {fileName && !fatal && (
        <Card>
          <CardHeader>
            <CardTitle>2. Check and import</CardTitle>
            <CardDescription>
              {rows.length} valid row{rows.length === 1 ? '' : 's'}
              {fileErrors.length > 0 &&
                `, ${fileErrors.length} with problems (they won't be imported)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-4">Line</th>
                      <th className="py-1 pr-4">Email</th>
                      <th className="py-1 pr-4">Name</th>
                      <th className="py-1">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, PREVIEW_ROWS).map(row => (
                      <tr key={row.line} className="border-t">
                        <td className="py-1 pr-4">{row.line}</td>
                        <td className="py-1 pr-4">{row.email}</td>
                        <td className="py-1 pr-4">
                          {row.first_name} {row.last_name}
                        </td>
                        <td className="py-1">{row.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > PREVIEW_ROWS && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    …and {rows.length - PREVIEW_ROWS} more
                  </p>
                )}
              </div>
            )}

            {fileErrors.length > 0 && (
              <ProblemList
                title="Rows that won't be imported"
                problems={fileErrors}
              />
            )}

            {importing || outcome ? (
              <div className="space-y-2">
                <Progress
                  value={rows.length ? (processed / rows.length) * 100 : 0}
                />
                <p className="text-sm text-muted-foreground">
                  {processed} of {rows.length} processed
                </p>
              </div>
            ) : (
              <Button onClick={runImport} disabled={rows.length === 0}>
                Import {rows.length} user{rows.length === 1 ? '' : 's'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {requestError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      )}

      {outcome && !importing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import finished
            </CardTitle>
            <CardDescription>
              {outcome.created.length} created · {outcome.skipped.length}{' '}
              already had an account · {outcome.failed.length} failed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {problems.length > 0 && (
              <ProblemList title="Not imported" problems={problems} />
            )}
            <Button variant="outline" onClick={reset}>
              Import another file
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {history.map(item => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="font-medium">{item.file_name}</span>
                  <span className="text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()} ·{' '}
                    {item.successful_records} created · {item.failed_records}{' '}
                    not imported
                  </span>
                  <Badge
                    variant={
                      item.status === 'completed' ? 'default' : 'secondary'
                    }
                  >
                    {item.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProblemList({
  title,
  problems,
}: {
  title: string;
  problems: ImportRowError[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
        {problems.map(p => (
          <li key={`${p.line}-${p.email}`} className="text-red-700">
            Line {p.line}
            {p.email && ` (${p.email})`}: {p.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

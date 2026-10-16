'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { platformRpc } from '@/lib/platform/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';

interface Template {
  id: string;
  name: string;
  description: string | null;
  published: boolean;
  criteria: number;
  max_points: number;
  assignments: number;
  schools: number;
  created_at: string;
}

export default function PlatformRubricsPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    platformRpc<Template[]>('platform_rubric_templates')
      .then(rows =>
        setTemplates(
          (rows ?? []).map(r => ({
            ...r,
            criteria: Number(r.criteria),
            max_points: Number(r.max_points),
            assignments: Number(r.assignments),
            schools: Number(r.schools),
          }))
        )
      )
      .catch(e => toast.error(errorMessage(e, 'Could not load templates')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setPublished = async (template: Template, published: boolean) => {
    const ok = await confirmAction(
      published
        ? {
            title: `Publish "${template.name}"?`,
            description:
              'Every tutor at every school will see it in their rubric list.',
            confirmLabel: 'Publish',
          }
        : {
            title: `Withdraw "${template.name}"?`,
            description:
              'Tutors can no longer pick it. Assignments that already use it keep their copy, so past grading is unchanged.',
            confirmLabel: 'Withdraw',
            destructive: true,
          }
    );
    if (!ok) return;
    setBusy(template.id);
    try {
      await platformRpc('platform_set_programme_template', {
        p_rubric: template.id,
        p_published: published,
      });
      toast.success(published ? 'Published' : 'Withdrawn');
      load();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the template'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Programme rubric templates
            </CardTitle>
            <CardDescription>
              Shared marking guides for the whole programme, such as foundation
              checkpoints. Tutors attach them to their assignments; each
              assignment keeps its own copy, so editing or withdrawing a
              template never changes past grading.
            </CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/platform/rubrics/new">
              <Plus className="mr-2 h-4 w-4" />
              New template
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!templates ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet. Create one for each foundation assessment
              checkpoint.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Template</th>
                  <th className="py-2 font-normal">Criteria</th>
                  <th className="py-2 font-normal">Max points</th>
                  <th className="py-2 font-normal">Used in</th>
                  <th className="py-2 font-normal">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-t align-top">
                    <td className="py-2">
                      <p className="font-medium">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="py-2">{t.criteria}</td>
                    <td className="py-2">{t.max_points}</td>
                    <td className="py-2">
                      {t.assignments} assignment{t.assignments === 1 ? '' : 's'}{' '}
                      · {t.schools} school
                      {t.schools === 1 ? '' : 's'}
                    </td>
                    <td className="py-2">
                      <Badge variant={t.published ? 'default' : 'outline'}>
                        {t.published ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={t.published ? 'text-red-600' : ''}
                        onClick={() => setPublished(t, !t.published)}
                        disabled={busy === t.id}
                      >
                        {t.published ? 'Withdraw' : 'Publish'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

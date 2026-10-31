'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, FileCheck } from 'lucide-react';
import { RubricCreatorModal } from './rubric-creator-modal';

import { createClient } from '@/lib/supabase/client';
import { errorMessage, toast } from '@/lib/toast';
interface Rubric {
  id: string;
  name: string;
  description: string;
  criteria_count: number;
  max_points: number;
  status: string;
}

interface RubricSelectorModalProps {
  assignmentId: string;
  onRubricSelected: (rubric: any) => void;
  trigger?: React.ReactNode;
}

export function RubricSelectorModal({
  assignmentId,
  onRubricSelected,
  trigger,
}: RubricSelectorModalProps) {
  const [open, setOpen] = useState(false);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [templates, setTemplates] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchRubrics();
    }
  }, [open]);

  const fetchRubrics = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/rubrics');
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Failed to load marking guides');
      setRubrics(result.rubrics || []);
      setTemplates(result.templates || []);
    } catch (error) {
      console.error('Error fetching marking guides:', error);
      toast.error(`Couldn't load your marking guides: ${errorMessage(error)}`);
      setRubrics([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const attachRubric = async (rubric: Rubric) => {
    setAttaching(rubric.id);
    try {
      // The assignment stores a snapshot of the rubric, so grading stays
      // stable if the rubric is edited later.
      const { data, error } = await createClient()
        .from('rubrics')
        .select(
          'id, name, description, rubric_criteria(id, name, description, weight, order_index, rubric_levels(id, name, description, points, order_index))'
        )
        .eq('id', rubric.id)
        .single();
      if (error || !data)
        throw new Error(error?.message || 'Marking guide not found');

      const byOrder = (
        a: { order_index: number | null },
        b: { order_index: number | null }
      ) => (a.order_index ?? 0) - (b.order_index ?? 0);
      const fullRubric = {
        id: data.id,
        name: data.name,
        description: data.description,
        criteria: [...(data.rubric_criteria ?? [])]
          .sort(byOrder)
          .map(criterion => ({
            id: criterion.id,
            name: criterion.name,
            description: criterion.description,
            weight: criterion.weight,
            levels: [...(criterion.rubric_levels ?? [])]
              .sort(byOrder)
              .map(level => ({
                id: level.id,
                name: level.name,
                description: level.description,
                points: level.points,
              })),
          })),
      };

      // Attach to assignment
      const response = await fetch(`/api/assignments/${assignmentId}/rubric`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rubric: fullRubric }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to attach marking guide');
      }

      onRubricSelected(fullRubric);
      setOpen(false);
      toast.success('Marking guide attached to assignment successfully!');
    } catch (error) {
      console.error('Error attaching marking guide:', error);
      toast.error(`Couldn't attach the marking guide: ${errorMessage(error)}`);
    } finally {
      setAttaching(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Marking Guide
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Marking Guide to Assignment</DialogTitle>
          <DialogDescription>
            Choose an existing marking guide or create a new one
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Programme templates: shared marking guides for every school */}
          {!loading && templates.length > 0 && (
            <div className="border-b pb-4">
              <h3 className="font-medium">Programme templates</h3>
              <p className="mb-2 text-sm text-gray-500">
                Shared marking guides, so every school assesses the same way.
              </p>
              <div className="space-y-2">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3"
                  >
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-xs text-gray-600">
                        {template.criteria_count} criteria •{' '}
                        {template.max_points} max points
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => attachRubric(template)}
                      disabled={attaching === template.id}
                    >
                      {attaching === template.id ? 'Attaching...' : 'Use'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create New Rubric */}
          <div className="border-b pb-4">
            <h3 className="font-medium mb-2">Create New Marking Guide</h3>
            <RubricCreatorModal
              assignmentId={assignmentId}
              onRubricCreated={rubric => {
                onRubricSelected(rubric);
                setOpen(false);
              }}
              trigger={
                <Button variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Marking Guide
                </Button>
              }
            />
          </div>

          {/* Existing Rubrics */}
          <div>
            <h3 className="font-medium mb-2">Use Existing Marking Guide</h3>

            {loading ? (
              <div className="text-center py-4">Loading marking guides...</div>
            ) : rubrics.length === 0 ? (
              <div className="text-center py-8">
                <FileCheck className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500">No marking guides available</p>
                <p className="text-sm text-gray-400">
                  Create your first marking guide above
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {rubrics.map(rubric => (
                  <Card
                    key={rubric.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">
                            {rubric.name}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {rubric.criteria_count} criteria •{' '}
                            {rubric.max_points} max points
                          </CardDescription>
                        </div>
                        <Badge variant="outline">{rubric.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {rubric.description && (
                        <p className="text-sm text-gray-600 mb-3">
                          {rubric.description}
                        </p>
                      )}
                      <Button
                        onClick={() => attachRubric(rubric)}
                        disabled={attaching === rubric.id}
                        size="sm"
                        className="w-full"
                      >
                        {attaching === rubric.id
                          ? 'Attaching...'
                          : 'Use This Marking Guide'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

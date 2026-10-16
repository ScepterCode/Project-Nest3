'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  TutorMetrics,
  TutorMetricsTable,
  toTutorMetrics,
} from '@/components/delivery/tutor-metrics-table';

/** School admin's view of their tutors' delivery (school_tutor_metrics). */
export function SchoolTutorsCard() {
  const [tutors, setTutors] = useState<TutorMetrics[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc('school_tutor_metrics')
      .then(({ data, error: rpcError }) => {
        if (rpcError) setError(rpcError.message);
        else
          setTutors(
            ((data as Record<string, unknown>[]) ?? []).map(toTutorMetrics)
          );
      });
  }, []);

  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Tutors</h2>
        <p className="text-sm text-gray-600">
          Sessions and attendance tutors have logged, how quickly work is
          marked, and deadlines students missed.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !tutors ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <TutorMetricsTable tutors={tutors} />
      )}
    </div>
  );
}

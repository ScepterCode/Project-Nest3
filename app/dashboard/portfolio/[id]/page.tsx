'use client';

import { use } from 'react';
import { LearnerPortfolio } from '@/components/portfolio/learner-portfolio';

/** A learner's portfolio (the database decides who may see it). */
export default function LearnerPortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <LearnerPortfolio studentId={id} />;
}

'use client';

import { useAuth } from '@/contexts/auth-context';
import { LearnerPortfolio } from '@/components/portfolio/learner-portfolio';

/** The signed-in learner's own portfolio. */
export default function MyPortfolioPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <LearnerPortfolio studentId={user.id} />;
}

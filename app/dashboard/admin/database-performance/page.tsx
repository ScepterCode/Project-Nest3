import { Metadata } from 'next';
import DatabasePerformanceDashboard from '@/components/database/performance-dashboard';

export const metadata: Metadata = {
  title: 'Database Performance | Admin Dashboard',
  description: 'Monitor database performance metrics and system health',
};

export default function DatabasePerformancePage() {
  return (
    <div className="container mx-auto py-6">
      <DatabasePerformanceDashboard />
    </div>
  );
}
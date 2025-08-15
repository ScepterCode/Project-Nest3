import { Metadata } from 'next';
import { BulkRoleAssignmentInterface } from '@/components/bulk-role-assignment/bulk-role-assignment-interface';

export const metadata: Metadata = {
  title: 'Bulk Role Assignment',
  description: 'Assign roles to multiple users simultaneously',
};

export default function BulkRoleAssignmentPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Role Assignment</h1>
        <p className="text-gray-600 mt-2">
          Efficiently assign roles to multiple users with validation and conflict resolution
        </p>
      </div>
      
      <BulkRoleAssignmentInterface />
    </div>
  );
}
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface SowDocument {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  version: number;
  createdAt: string;
  project?: { name: string; number: string } | null;
  contractor?: { name: string } | null;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function SowList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sow-documents', page, search],
    queryFn: () =>
      api<{ data: SowDocument[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/budgeting/sow?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Statements of Work"
        subtitle="Manage SOW documents for contractors and staff"
        action={
          <Link to="/budgeting/sow/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            New SOW
          </Link>
        }
      />

      <div className="mb-4">
        <input type="text" placeholder="Search SOW documents..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contractor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((sow) => (
              <tr key={sow.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-gray-500">{sow.number}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{sow.project?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{sow.contractor?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">R {Number(sow.totalAmount).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">v{sow.version}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[sow.status] || ''}`}>
                    {sow.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(sow.createdAt).toLocaleDateString('en-ZA')}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <ActionMenu items={[
                    { label: 'View', onClick: () => navigate(`/budgeting/sow/${sow.id}`) },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No SOW documents yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

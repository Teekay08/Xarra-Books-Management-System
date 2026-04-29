import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { ActionMenu } from '../../components/ActionMenu';

interface ReturnAuth {
  id: string;
  number: string;
  returnDate: string;
  reason: string;
  status: string;
  partner: { name: string };
  lines: { id: string; quantity: number; title: { title: string } }[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  AUTHORIZED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-700',
  RECEIVED: 'bg-yellow-100 text-yellow-700',
  INSPECTED: 'bg-purple-100 text-purple-700',
  VERIFIED: 'bg-teal-100 text-teal-700',
  PROCESSED: 'bg-green-100 text-green-700',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  AUTHORIZED: 'Authorized',
  IN_TRANSIT: 'In Transit',
  RECEIVED: 'Received',
  INSPECTED: 'Inspected',
  VERIFIED: 'Verified',
  PROCESSED: 'Processed',
};

export function ReturnsList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['returns', page, search],
    queryFn: () =>
      api<{ data: ReturnAuth[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/returns?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Returns"
        action={
          <Link to="/returns/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Create Return
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <input type="text" placeholder="Search by RA number..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => setExportModalOpen(true) },
        ]} />
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {data?.data?.map((ra) => (
              <tr key={ra.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/returns/${ra.id}`)}>
                <td className="px-4 py-3 text-sm font-medium text-green-700">{ra.number}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{ra.partner.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{ra.reason}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">
                  {ra.lines.reduce((sum, l) => sum + l.quantity, 0)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[ra.status] ?? ''}`}>
                    {statusLabels[ra.status] ?? ra.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(ra.returnDate).toLocaleDateString('en-ZA')}</td>
                <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    { label: 'View Details', onClick: () => navigate(`/returns/${ra.id}`) },
                    { label: 'Edit', onClick: () => navigate(`/returns/${ra.id}/edit`), hidden: ra.status !== 'DRAFT' },
                    { label: 'Delete', onClick: () => { if (confirm('Delete this return?')) navigate(`/returns/${ra.id}`); }, variant: 'danger', hidden: ra.status !== 'DRAFT' },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No returns found.</td></tr>
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
      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/returns', from, to), 'returns-export.csv')}
        title="Export Returns"
      />
    </div>
  );
}

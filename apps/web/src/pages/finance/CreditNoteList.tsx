import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';

interface CreditNote {
  id: string;
  number: string;
  total: string;
  reason: string;
  status: string;
  voidedAt: string | null;
  createdAt: string;
  partner: { name: string };
  invoice: { number: string };
  lines?: any[];
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-700',
  SENT: 'bg-blue-100 text-blue-700',
  VOIDED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  SENT: 'Sent',
  VOIDED: 'Voided',
};

export function CreditNoteList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-notes', page, search],
    queryFn: () =>
      api<{ data: { items: CreditNote[]; total: number; page: number; limit: number } }>(
        `/finance/credit-notes?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Credit Notes"
        action={
          <Link
            to="/credit-notes/new"
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            New Credit Note
          </Link>
        }
      />

      <div className="mb-4 flex gap-3 items-center">
        <input
          type="text" placeholder="Search by credit note number..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => setExportModalOpen(true) },
        ]} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.items?.map((cn) => {
              const status = cn.voidedAt ? 'VOIDED' : (cn.status || 'DRAFT');
              return (
                <tr key={cn.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/credit-notes/${cn.id}`)}>
                  <td className="px-4 py-3 text-sm font-medium text-amber-700">{cn.number}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{cn.invoice?.number}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{cn.partner?.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{cn.reason}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">R {Number(cn.total).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(cn.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu items={[
                      { label: 'View Details', onClick: () => navigate(`/credit-notes/${cn.id}`) },
                      { label: 'Download PDF', onClick: () => window.open(`/api/v1/finance/credit-notes/${cn.id}/pdf`, '_blank') },
                    ]} />
                  </td>
                </tr>
              );
            })}
            {!isLoading && data?.data?.items?.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No credit notes found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.data && Math.ceil(data.data.total / data.data.limit) > 1 && (
        <Pagination page={page} totalPages={Math.ceil(data.data.total / data.data.limit)} total={data.data.total} onPageChange={setPage} />
      )}
      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/credit-notes', from, to), 'credit-notes.csv')}
        title="Export Credit Notes"
      />
    </div>
  );
}

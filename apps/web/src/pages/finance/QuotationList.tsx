import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';
import { STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface Quotation {
  id: string;
  number: string;
  total: string;
  status: string;
  quotationDate: string;
  validUntil: string | null;
  partner: { name: string };
}

export function QuotationList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', page, search],
    queryFn: () =>
      api<{ data: Quotation[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/finance/quotations?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Quotations"
        action={
          <Link to="/quotations/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Create Quotation
          </Link>
        }
      />

      <div className="mb-4 flex gap-3 items-center">
        <input type="text" placeholder="Search by quotation number..."
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
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {data?.data?.map((q) => (
              <tr key={q.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/quotations/${q.id}`)}>
                <td className="px-4 py-3 text-sm font-medium text-green-700">{q.number}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{q.partner.name}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">R {Number(q.total).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[q.status] ?? ''}`}>
                    {q.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(q.quotationDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    { label: 'View Details', onClick: () => navigate(`/quotations/${q.id}`) },
                    { label: 'Edit', onClick: () => navigate(`/quotations/${q.id}/edit`), hidden: q.status !== 'DRAFT' },
                    { label: 'Convert to Invoice', onClick: () => navigate(`/quotations/${q.id}`), hidden: q.status !== 'ACCEPTED' },
                    { label: 'Print', onClick: () => window.open(`/api/v1/finance/quotations/${q.id}/pdf`, '_blank') },
                    { label: 'Delete', onClick: () => { if (confirm('Delete this quotation?')) navigate(`/quotations/${q.id}`); }, variant: 'danger', hidden: q.status !== 'DRAFT' },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No quotations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPageChange={setPage} />
      )}
      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/quotations', from, to), 'quotations.csv')}
        title="Export Quotations"
      />
    </div>
  );
}

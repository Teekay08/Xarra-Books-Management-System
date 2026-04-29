import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { CONSIGNMENT_STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface Proforma {
  id: string;
  proformaNumber: string;
  partnerPoNumber: string | null;
  partnerId: string;
  partnerName: string;
  dispatchDate: string | null;
  sorExpiryDate: string | null;
  status: string;
  createdAt: string;
  totalQty: number;
  totalTitles: number;
}

export function SorProformaList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['sor-proformas', page, search],
    queryFn: () =>
      api<PaginatedResponse<Proforma>>(
        `/consignments/proformas?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const sendEmailMut = useMutation({
    mutationFn: (consignmentId: string) =>
      api<{ data: { message: string } }>(`/consignments/${consignmentId}/send-proforma`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (res) => alert(res.data.message),
    onError: (err: any) => alert(err.message || 'Failed to send email'),
  });

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Sales PO Agreements"
        subtitle="Agreement documents and pro-formas generated from sales purchase orders"
        action={
          <button
            onClick={() => navigate('/consignments/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            New Sales PO
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate('/consignments')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Orders
        </button>
        <button
          onClick={() => navigate('/consignments/proformas')}
          className="rounded-md border border-green-700 bg-green-700 px-3 py-1.5 text-xs font-medium text-white"
        >
          Agreements
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by agreement/pro-forma number, partner name, or PO number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No sales PO agreements found. They are auto-generated when sales purchase orders are created.
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pro-forma #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner PO</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dispatch Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SOR Expiry</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Titles</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Copies</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const expiryDays = item.sorExpiryDate
                    ? Math.ceil((new Date(item.sorExpiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/consignments/${item.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">
                        {item.proformaNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.partnerName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {item.partnerPoNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.dispatchDate
                          ? new Date(item.dispatchDate).toLocaleDateString('en-ZA')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.sorExpiryDate ? (
                          <span className={expiryDays !== null && expiryDays <= 14 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {new Date(item.sorExpiryDate).toLocaleDateString('en-ZA')}
                            {expiryDays !== null && expiryDays > 0 && (
                              <span className="ml-1 text-xs">({expiryDays}d)</span>
                            )}
                            {expiryDays !== null && expiryDays <= 0 && (
                              <span className="ml-1 text-xs font-bold text-red-700">Expired</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{item.totalTitles}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{item.totalQty}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu items={[
                          { label: 'View Details', onClick: () => navigate(`/consignments/${item.id}`) },
                          { label: 'Download PDF', onClick: () => window.open(`/api/v1/consignments/${item.id}/proforma-pdf`, '_blank') },
                          { label: 'Print', onClick: () => { const w = window.open(`/api/v1/consignments/${item.id}/proforma-pdf`, '_blank'); w?.addEventListener('load', () => w.print()); } },
                          { label: 'Send Email', onClick: () => sendEmailMut.mutate(item.id) },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Remittance {
  id: string;
  partnerId: string;
  partnerRef: string | null;
  totalAmount: string;
  status: string;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string;
  partner: { name: string };
}

export function RemittanceList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['remittances', page, search],
    queryFn: () => api<PaginatedResponse<Remittance>>(`/finance/remittances?page=${page}&limit=20&search=${search}`),
  });

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    MATCHED: 'bg-green-100 text-green-800',
    DISPUTED: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <PageHeader
        title="Remittances"
        subtitle="Payments received from channel partners"
        action={
          <button
            onClick={() => navigate('/remittances/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Record Remittance
          </button>
        }
      />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by reference..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.data?.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/remittances/${r.id}`)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.partner.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{r.partnerRef ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">R {Number(r.totalAmount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${statusColors[r.status] ?? 'bg-gray-100'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString('en-ZA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-30">Prev</button>
            <button disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

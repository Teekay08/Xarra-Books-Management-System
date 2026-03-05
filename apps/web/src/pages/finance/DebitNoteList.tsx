import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface DebitNote {
  id: string;
  number: string;
  total: string;
  reason: string;
  voidedAt: string | null;
  createdAt: string;
  partner: { name: string };
}

export function DebitNoteList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['debit-notes', page, search],
    queryFn: () =>
      api<{ data: DebitNote[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/finance/debit-notes?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Debit Notes"
        action={
          <Link to="/debit-notes/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Create Debit Note
          </Link>
        }
      />

      <div className="mb-4">
        <input
          type="text" placeholder="Search by debit note number..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((dn) => (
              <tr key={dn.id}>
                <td className="px-4 py-3 text-sm font-medium text-green-700">{dn.number}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{dn.partner.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{dn.reason}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">R {Number(dn.total).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    dn.voidedAt ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {dn.voidedAt ? 'VOIDED' : 'ACTIVE'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(dn.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No debit notes found.</td></tr>
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

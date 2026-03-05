import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface RoyaltyEntry {
  id: string;
  titleName: string;
  periodStart: string;
  periodEnd: string;
  unitsSold: number;
  grossAmount: string;
  netAmount: string;
  status: string;
  createdAt: string;
}

export function PortalRoyalties() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-royalties', page],
    queryFn: () =>
      api<{ data: RoyaltyEntry[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/portal/royalties?page=${page}&limit=20`,
      ),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const royalties = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Royalty Ledger</h1>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {royalties.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-sm text-gray-900">{r.titleName}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{r.unitsSold}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">R {Number(r.grossAmount).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">R {Number(r.netAmount).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'PAID'
                        ? 'bg-green-100 text-green-700'
                        : r.status === 'APPROVED'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {royalties.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No royalty entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface RoyaltyEntry {
  id: string;
  title: { title: string };
  periodFrom: string;
  periodTo: string;
  unitsSold: number;
  grossRoyalty: string;
  netPayable: string;
  status: string;
  createdAt: string;
}

function fmt(v: string | number) {
  return `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PortalRoyalties() {
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<RoyaltyEntry | null>(null);

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

      <div className="card overflow-x-auto">
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
              <tr
                key={r.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedEntry(r)}
              >
                <td className="px-4 py-3 text-sm text-gray-900">{r.title?.title ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{r.unitsSold}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{fmt(r.grossRoyalty)}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(r.netPayable)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
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

      {/* Royalty Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Royalty Entry</h2>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Title</p>
                  <p className="font-medium text-gray-900">{selectedEntry.title?.title ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Period</p>
                  <p className="font-medium text-gray-900">
                    {fmtDate(selectedEntry.periodFrom)} – {fmtDate(selectedEntry.periodTo)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Units Sold</p>
                  <p className="font-medium text-gray-900">{selectedEntry.unitsSold}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[selectedEntry.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {selectedEntry.status}
                  </span>
                </div>
              </div>
              <div className="rounded-md bg-gray-50 p-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Gross Royalty</span>
                  <span className="text-gray-900">{fmt(selectedEntry.grossRoyalty)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span className="text-gray-900">Net Payable</span>
                  <span className="text-gray-900">{fmt(selectedEntry.netPayable)}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t px-6 py-4">
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

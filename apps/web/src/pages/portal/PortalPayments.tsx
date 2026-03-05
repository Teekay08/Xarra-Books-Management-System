import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface Payment {
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  grossRoyalty: number;
  advanceDeducted: number;
  netPayable: number;
  amountDue: number;
  amountPaid: number;
  status: string;
  paymentMethod?: string | null;
  bankReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

function fmt(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

const statusColors: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  FAILED: 'bg-red-100 text-red-800',
  REVERSED: 'bg-red-100 text-red-800',
};

export function PortalPayments() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-payments', page],
    queryFn: () =>
      api<{ data: Payment[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/portal/payments?page=${page}&limit=20`,
      ),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const payments = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Payment History</h1>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Royalty</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Advance Deducted</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Payable</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank Ref</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{p.number}</td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {fmtDate(p.periodFrom)} — {fmtDate(p.periodTo)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{fmt(p.grossRoyalty)}</td>
                <td className="px-4 py-3 text-sm text-gray-500 text-right">{fmt(p.advanceDeducted)}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{fmt(p.netPayable)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-green-700 text-right">{fmt(p.amountPaid)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[p.status] || 'bg-gray-100 text-gray-800'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.bankReference ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.paidAt ? fmtDate(p.paidAt) : '—'}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} payments)
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

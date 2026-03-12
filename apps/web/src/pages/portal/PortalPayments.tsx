import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ActionMenu } from '../../components/ActionMenu';

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
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                <td className="px-4 py-3 text-right">
                  <ActionMenu
                    items={[
                      {
                        label: 'View Details',
                        icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                        onClick: () => window.open(`/api/v1/portal/payments/${p.id}/remittance`, '_blank'),
                      },
                      {
                        label: 'Download Receipt',
                        icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                        hidden: p.status !== 'COMPLETED' && p.status !== 'PAID',
                        onClick: () => window.open(`/api/v1/portal/payments/${p.id}/receipt-pdf`, '_blank'),
                      },
                      {
                        label: 'Query Payment',
                        icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                        hidden: p.status === 'COMPLETED' || p.status === 'PAID',
                        onClick: () => {
                          window.location.href = `mailto:royalties@xarrabooks.co.za?subject=Payment Query - ${p.number}`;
                        },
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
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

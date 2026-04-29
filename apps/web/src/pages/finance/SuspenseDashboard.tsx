import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const statusColors: Record<string, string> = {
  SUSPENSE: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  REFUND_DUE: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-gray-100 text-gray-500',
  WRITTEN_OFF: 'bg-gray-100 text-gray-500',
};

const riskColors: Record<string, string> = {
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-500',
  RED: 'bg-red-500',
};

export function SuspenseDashboard() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ['suspense-summary'],
    queryFn: () => api<{ data: any }>('/suspense/summary'),
  });

  const { data: safeSpending } = useQuery({
    queryKey: ['suspense-safe-spending'],
    queryFn: () => api<{ data: any }>('/suspense/safe-spending'),
  });

  const { data: timeline } = useQuery({
    queryKey: ['suspense-timeline'],
    queryFn: () => api<{ data: any[] }>('/suspense/timeline'),
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['suspense-ledger', statusFilter, page],
    queryFn: () => api<{ data: any[]; pagination: any }>(`/suspense/ledger?status=${statusFilter}&page=${page}&limit=15`),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api(`/suspense/${id}/confirm`, { method: 'POST', body: '{}' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suspense-summary'] }); queryClient.invalidateQueries({ queryKey: ['suspense-ledger'] }); },
    onError: (err: Error) => alert(err.message),
  });

  const writeOffMutation = useMutation({
    mutationFn: (id: string) => {
      const reason = prompt('Write-off reason:');
      if (!reason) throw new Error('Cancelled');
      return api(`/suspense/${id}/write-off`, { method: 'POST', body: JSON.stringify({ reason }) });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suspense-summary'] }); queryClient.invalidateQueries({ queryKey: ['suspense-ledger'] }); },
    onError: (err: Error) => { if (err.message !== 'Cancelled') alert(err.message); },
  });

  const s = summary?.data;
  const ss = safeSpending?.data;
  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <PageHeader title="SOR Suspense Account" subtitle="Track contingent revenue from active SOR consignments" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-600 uppercase">Suspense</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{fmt(s?.suspense?.total || 0)}</p>
          <p className="text-xs text-amber-500">{s?.suspense?.count || 0} entries</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-medium text-green-600 uppercase">Confirmed Revenue</p>
          <p className="mt-1 text-xl font-bold text-green-700">{fmt(s?.confirmed?.total || 0)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600 uppercase">Refund Due</p>
          <p className="mt-1 text-xl font-bold text-red-700">{fmt(s?.refundDue?.total || 0)}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-600 uppercase">Safe Spending</p>
          <p className="mt-1 text-xl font-bold text-blue-700">{fmt(ss?.safeSpending?.conservative || 0)}</p>
          <p className="text-xs text-blue-500">Conservative</p>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${riskColors[ss?.riskLevel || 'GREEN']}`} />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Risk Level</p>
            <p className="text-lg font-bold text-gray-900">{ss?.riskLevel || 'GREEN'}</p>
            <p className="text-xs text-gray-400">{ss?.conversionRate || 0}% conversion</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {timeline?.data && timeline.data.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Expected Conversions Timeline</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Week</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Entries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {timeline.data.map((w: any, i: number) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-sm text-gray-700">{new Date(w.week).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-2 text-sm text-right font-medium">{fmt(Number(w.total))}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-500">{w.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Partner Breakdown */}
      {s?.partnerBreakdown && s.partnerBreakdown.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-Partner Breakdown</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Suspense</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Confirmed</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Refund Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {s.partnerBreakdown.map((p: any) => (
                <tr key={p.partner_id}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{p.partner_name}</td>
                  <td className="px-4 py-2 text-sm text-right text-amber-700">{fmt(Number(p.suspense))}</td>
                  <td className="px-4 py-2 text-sm text-right text-green-700">{fmt(Number(p.confirmed))}</td>
                  <td className="px-4 py-2 text-sm text-right text-red-600">{fmt(Number(p.refund_due))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ledger */}
      <div className="card overflow-x-auto">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Suspense Ledger</h3>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value="ALL">All Statuses</option>
            <option value="SUSPENSE">Suspense</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="REFUND_DUE">Refund Due</option>
            <option value="REFUNDED">Refunded</option>
            <option value="WRITTEN_OFF">Written Off</option>
          </select>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Consignment</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SOR Expiry</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {ledger?.data?.map((entry: any) => (
              <tr key={entry.id}>
                <td className="px-4 py-2 text-sm text-gray-500">{new Date(entry.createdAt).toLocaleDateString('en-ZA')}</td>
                <td className="px-4 py-2 text-sm text-gray-900">{entry.partner?.name || '—'}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{entry.consignment?.proformaNumber || '—'}</td>
                <td className="px-4 py-2 text-sm text-right font-medium">{fmt(Number(entry.amount))}</td>
                <td className="px-4 py-2 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[entry.status]}`}>
                    {entry.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-gray-500">{entry.sorExpiryDate ? new Date(entry.sorExpiryDate).toLocaleDateString('en-ZA') : '—'}</td>
                <td className="px-4 py-2 text-sm text-right">
                  {entry.status === 'SUSPENSE' && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => confirmMutation.mutate(entry.id)} className="text-green-700 hover:underline text-xs">Confirm</button>
                      <button onClick={() => writeOffMutation.mutate(entry.id)} className="text-gray-500 hover:underline text-xs">Write Off</button>
                    </div>
                  )}
                  {entry.status === 'REFUND_DUE' && (
                    <button onClick={() => writeOffMutation.mutate(entry.id)} className="text-gray-500 hover:underline text-xs">Write Off</button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && (!ledger?.data || ledger.data.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No suspense entries.</td></tr>
            )}
          </tbody>
        </table>
        {ledger?.pagination && ledger.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {page} of {ledger.pagination.totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= ledger.pagination.totalPages}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

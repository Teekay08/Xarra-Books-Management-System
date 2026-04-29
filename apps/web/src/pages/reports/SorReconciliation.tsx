import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';

interface SorItem {
  id: string;
  number: string;
  partnerName: string;
  partnerId: string;
  dispatchDate: string;
  returnByDate: string | null;
  status: string;
  titleCount: number;
  totalDispatched: number;
  totalSold: number;
  totalReturned: number;
  outstanding: number;
  sellThroughPct: number;
}

interface SorSummary {
  totalDispatched: number;
  totalSold: number;
  totalReturned: number;
  outstanding: number;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-50 text-blue-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  RECONCILED: 'bg-green-50 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
};

export function SorReconciliation() {
  const navigate = useNavigate();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [partnerId, setPartnerId] = useState('');

  const { data: partnersData } = useQuery({
    queryKey: ['partners-list'],
    queryFn: () => api<{ data: { id: string; name: string }[] }>('/partners?limit=200'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sor-reconciliation', from, to, partnerId],
    queryFn: () => {
      const params = new URLSearchParams({ from, to });
      if (partnerId) params.set('partnerId', partnerId);
      return api<{ data: { items: SorItem[]; summary: SorSummary } }>(`/reports/sor-reconciliation?${params}`);
    },
  });

  const items = data?.data?.items ?? [];
  const summary = data?.data?.summary;
  const cls = 'rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <PageHeader
        title="SOR Reconciliation"
        subtitle="Per-consignment breakdown of dispatched, sold, returned, and outstanding stock"
      />

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Partner</label>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={cls}>
            <option value="">All Partners</option>
            {partnersData?.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (items.length > 0) {
              downloadCsv(items, [
                { key: 'number', header: 'SOR Number' },
                { key: 'partnerName', header: 'Partner' },
                { key: 'dispatchDate', header: 'Dispatch Date' },
                { key: 'returnByDate', header: 'Return By' },
                { key: 'status', header: 'Status' },
                { key: 'titleCount', header: 'Titles' },
                { key: 'totalDispatched', header: 'Dispatched' },
                { key: 'totalSold', header: 'Sold' },
                { key: 'totalReturned', header: 'Returned' },
                { key: 'outstanding', header: 'Outstanding' },
                { key: 'sellThroughPct', header: 'Sell-Through %' },
              ], 'sor-reconciliation');
            }
          }},
        ]} />
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Total Dispatched</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalDispatched.toLocaleString()}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Sold</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{summary.totalSold.toLocaleString()}</p>
            {summary.totalDispatched > 0 && (
              <p className="text-xs text-gray-400 mt-1">{Math.round((summary.totalSold / summary.totalDispatched) * 100)}% sell-through</p>
            )}
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Returned</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{summary.totalReturned.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700 uppercase">Outstanding</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{summary.outstanding.toLocaleString()}</p>
            <p className="text-xs text-amber-600 mt-1">Awaiting return/reconciliation</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">No consignments found for this period</div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SOR</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dispatch Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Dispatched</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Returned</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sell-Through</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/consignments/${item.id}`)}
                >
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">{item.number}</td>
                  <td className="px-4 py-3 text-gray-700">{item.partnerName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(item.dispatchDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{item.totalDispatched}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{item.totalSold}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-600">{item.totalReturned}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${item.outstanding > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {item.outstanding}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, item.sellThroughPct)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 font-mono w-10 text-right">{item.sellThroughPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

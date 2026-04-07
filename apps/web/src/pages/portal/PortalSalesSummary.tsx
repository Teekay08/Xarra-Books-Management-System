import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface ChannelBreakdown {
  channel: string;
  unitsSold: number;
  revenue: number;
}

interface TitleSales {
  titleId: string;
  titleName: string;
  channels: ChannelBreakdown[];
  totalUnits: number;
  totalRevenue: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  XARRA_WEBSITE: 'Xarra Website',
  XARRA_STORE: 'Xarra Store',
  AMAZON_KDP: 'Amazon KDP',
  TAKEALOT: 'Takealot',
  PARTNER: 'Partner',
};

function fmt(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortalSalesSummary() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-sales', from, to],
    queryFn: () =>
      api<{ data: TitleSales[] }>(`/portal/sales?from=${from}&to=${to}`),
  });

  const titles = data?.data ?? [];
  const totalUnits = titles.reduce((s, t) => s + t.totalUnits, 0);
  const totalRevenue = titles.reduce((s, t) => s + t.totalRevenue, 0);

  const cls = 'rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Sales Summary</h1>
      <p className="text-sm text-gray-500 mb-6">Units sold by title, broken down by sales channel</p>

      {/* Date filter */}
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cls} />
        </div>
      </div>

      {/* Summary totals */}
      {titles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Total Units Sold</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalUnits.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Total Revenue</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{fmt(totalRevenue)}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : titles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No sales recorded for this period.
        </div>
      ) : (
        <div className="space-y-4">
          {titles.map((t) => (
            <div key={t.titleId} className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{t.titleName}</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">{t.totalUnits.toLocaleString()} units</span>
                  <span className="font-semibold text-gray-900">{fmt(t.totalRevenue)}</span>
                </div>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 uppercase">Channel</th>
                    <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 uppercase">Units Sold</th>
                    <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 uppercase">Revenue</th>
                    <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 uppercase">% of Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {t.channels.map((ch) => (
                    <tr key={ch.channel}>
                      <td className="px-5 py-2.5 text-gray-700">
                        {CHANNEL_LABELS[ch.channel] ?? ch.channel}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono">{ch.unitsSold.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right font-mono">{fmt(ch.revenue)}</td>
                      <td className="px-5 py-2.5 text-right text-gray-500">
                        {t.totalUnits > 0
                          ? `${Math.round((ch.unitsSold / t.totalUnits) * 100)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

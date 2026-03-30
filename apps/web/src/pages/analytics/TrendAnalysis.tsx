import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Partner { id: string; name: string }
interface Title { id: string; title: string }

export function TrendAnalysis() {
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [selectedTitleId, setSelectedTitleId] = useState('');

  // Seasonal data
  const { data: seasonalData } = useQuery({
    queryKey: ['trends-seasonal'],
    queryFn: () => api<{ data: any[] }>('/suspense/predictions/trends/seasonal'),
  });

  // Partners dropdown
  const { data: partnersData } = useQuery({
    queryKey: ['partners-dropdown'],
    queryFn: () => api<{ data: Partner[] }>('/partners?limit=500'),
  });

  // Partner trend
  const { data: partnerTrend } = useQuery({
    queryKey: ['trends-partner', selectedPartnerId],
    queryFn: () => api<{ data: any[] }>(`/suspense/predictions/trends/partner/${selectedPartnerId}?limit=50`),
    enabled: !!selectedPartnerId,
  });

  // Title search
  const { data: titlesData } = useQuery({
    queryKey: ['titles-search-trend', titleSearch],
    queryFn: () => api<{ data: Title[] }>(`/titles?limit=20&search=${titleSearch}`),
    enabled: titleSearch.length > 2,
  });

  // Title trend
  const { data: titleTrend } = useQuery({
    queryKey: ['trends-title', selectedTitleId],
    queryFn: () => api<{ data: any[] }>(`/suspense/predictions/trends/title/${selectedTitleId}`),
    enabled: !!selectedTitleId,
  });

  const currentMonth = new Date().getMonth() + 1;

  return (
    <div>
      <PageHeader title="Trend Analysis" subtitle="Historical sell-through patterns and performance trends" />

      {/* Seasonal Patterns */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Seasonal Sell-Through Patterns</h3>
        {seasonalData?.data && seasonalData.data.length > 0 ? (
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {Array.from({ length: 12 }, (_, i) => {
              const monthData = seasonalData.data.find((d: any) => Number(d.month) === i + 1);
              const pct = Number(monthData?.avg_sell_through || 0);
              const isCurrent = i + 1 === currentMonth;
              const height = Math.max(20, pct);
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-full flex flex-col items-center justify-end" style={{ height: '120px' }}>
                    <div
                      className={`w-full rounded-t ${isCurrent ? 'bg-green-600' : 'bg-blue-400'} transition-all`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${isCurrent ? 'font-bold text-green-700' : 'text-gray-500'}`}>
                    {MONTHS[i]}
                  </p>
                  <p className="text-xs text-gray-400">{pct > 0 ? `${pct}%` : '—'}</p>
                  <p className="text-[10px] text-gray-300">{monthData?.data_points || 0} pts</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No historical data yet. Seasonal patterns will appear as consignments are closed.</p>
        )}
      </div>

      {/* Partner Performance */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Partner Performance</h3>
        <select value={selectedPartnerId} onChange={(e) => setSelectedPartnerId(e.target.value)}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm mb-4">
          <option value="">— Select a partner —</option>
          {partnersData?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {partnerTrend?.data && partnerTrend.data.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Dispatched</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Returned</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sell-Through</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {partnerTrend.data.map((a: any) => {
                const pct = Number(a.sellThroughPct);
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-sm text-gray-500">{a.dispatchDate || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{a.title?.title || '—'}</td>
                    <td className="px-4 py-2 text-sm text-right">{a.qtyDispatched}</td>
                    <td className="px-4 py-2 text-sm text-right text-green-700">{a.qtySold}</td>
                    <td className="px-4 py-2 text-sm text-right text-red-600">{a.qtyReturned}</td>
                    <td className={`px-4 py-2 text-sm text-right font-bold ${pct >= 50 ? 'text-green-700' : pct >= 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : selectedPartnerId ? (
          <p className="text-sm text-gray-400 text-center py-4">No historical data for this partner yet.</p>
        ) : null}
      </div>

      {/* Title Lifecycle */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Title Lifecycle</h3>
        <div className="relative mb-4">
          <input type="text" value={titleSearch} onChange={(e) => { setTitleSearch(e.target.value); setSelectedTitleId(''); }}
            placeholder="Search for a title..."
            className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm" />
          {titlesData?.data && titlesData.data.length > 0 && titleSearch.length > 2 && !selectedTitleId && (
            <div className="absolute z-20 w-full max-w-sm mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {titlesData.data.map((t) => (
                <button key={t.id} onClick={() => { setSelectedTitleId(t.id); setTitleSearch(t.title); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100">
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {titleTrend?.data && titleTrend.data.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Dispatched</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Returned</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sell-Through</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {titleTrend.data.map((a: any) => {
                const pct = Number(a.sellThroughPct);
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{a.partner?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{a.dispatchDate || '—'}</td>
                    <td className="px-4 py-2 text-sm text-right">{a.qtyDispatched}</td>
                    <td className="px-4 py-2 text-sm text-right text-green-700">{a.qtySold}</td>
                    <td className="px-4 py-2 text-sm text-right text-red-600">{a.qtyReturned}</td>
                    <td className={`px-4 py-2 text-sm text-right font-bold ${pct >= 50 ? 'text-green-700' : pct >= 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : selectedTitleId ? (
          <p className="text-sm text-gray-400 text-center py-4">No historical data for this title yet.</p>
        ) : null}
      </div>
    </div>
  );
}

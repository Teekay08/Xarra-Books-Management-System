import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const confidenceColors: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-gray-100 text-gray-600',
};

const riskColors: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
};

export function SellThroughPredictions() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data: predictions, isLoading } = useQuery({
    queryKey: ['predictions-active', page],
    queryFn: () => api<{ data: any[]; pagination: any }>(`/suspense/predictions/active?page=${page}&limit=20`),
  });

  const { data: highRisk } = useQuery({
    queryKey: ['predictions-high-risk'],
    queryFn: () => api<{ data: any[] }>('/suspense/predictions/high-risk'),
  });

  const { data: revForecast } = useQuery({
    queryKey: ['predictions-revenue-forecast'],
    queryFn: () => api<{ data: any[] }>('/suspense/predictions/revenue-forecast'),
  });

  const recalcMutation = useMutation({
    mutationFn: () => api('/suspense/predictions/recalculate', { method: 'POST' }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['predictions-active'] });
      queryClient.invalidateQueries({ queryKey: ['predictions-high-risk'] });
      queryClient.invalidateQueries({ queryKey: ['predictions-revenue-forecast'] });
      alert(`Recalculated: ${data?.data?.processed || 0} predictions, ${data?.data?.highRisk || 0} high-risk`);
    },
    onError: (err: Error) => alert(err.message),
  });

  const fmt = (v: number) => `R ${(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  // Summary KPIs
  const allPredictions = predictions?.data || [];
  const avgSellThrough = allPredictions.length > 0
    ? allPredictions.reduce((s, p) => s + Number(p.predictedSellThroughPct), 0) / allPredictions.length
    : 0;
  const totalPredictedRevenue = allPredictions.reduce((s, p) => s + Number(p.predictedRevenue), 0);
  const highRiskCount = highRisk?.data?.length || 0;

  return (
    <div>
      <PageHeader
        title="Sell-Through Predictions"
        subtitle="AI-powered predictions for active SOR consignments"
        action={
          <button onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate All'}
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Predictions</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{predictions?.pagination?.total || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Avg Sell-Through</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{avgSellThrough.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600 uppercase">High-Risk</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{highRiskCount}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-medium text-green-600 uppercase">Predicted Revenue</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{fmt(totalPredictedRevenue)}</p>
        </div>
      </div>

      {/* High-Risk Alerts */}
      {highRiskCount > 0 && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 p-5 mb-6">
          <h3 className="text-sm font-semibold text-red-800 mb-3">High-Risk Consignments (Sell-Through &lt; 30%)</h3>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-red-600 uppercase">Title</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-red-600 uppercase">Partner</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-red-600 uppercase">Predicted %</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-red-600 uppercase">Qty at Risk</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-red-600 uppercase">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {highRisk?.data?.slice(0, 10).map((p: any) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{p.title?.title || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-700">{p.partner?.name || '—'}</td>
                  <td className="px-3 py-2 text-sm text-right font-bold text-red-700">{Number(p.predictedSellThroughPct).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-sm text-right">{p.predictedQtyReturned}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColors[p.confidenceLevel]}`}>
                      {p.confidenceLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue Forecast */}
      {revForecast?.data && revForecast.data.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Revenue Forecast by Month</h3>
          <div className="flex gap-4 overflow-x-auto">
            {revForecast.data.map((m: any, i: number) => (
              <div key={i} className="flex-shrink-0 rounded-lg border border-gray-200 p-4 min-w-[150px]">
                <p className="text-xs text-gray-500">{new Date(m.month).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}</p>
                <p className="text-lg font-bold text-green-700">{fmt(Number(m.predicted))}</p>
                <p className="text-xs text-gray-400">{m.count} consignments</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Predictions Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Dispatched</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Predicted Sold</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sell-Through</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {allPredictions.map((p: any) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-sm text-gray-900">{p.title?.title || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.partner?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-right">{p.predictedQtySold + p.predictedQtyReturned}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">{p.predictedQtySold}</td>
                <td className="px-4 py-3 text-sm text-right font-bold">{Number(p.predictedSellThroughPct).toFixed(1)}%</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColors[p.confidenceLevel]}`}>
                    {p.confidenceLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${riskColors[p.riskLevel]}`}>
                    {p.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">{fmt(Number(p.predictedRevenue))}</td>
              </tr>
            ))}
            {!isLoading && allPredictions.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No predictions yet. Click "Recalculate All" to generate.</td></tr>
            )}
          </tbody>
        </table>
        {predictions?.pagination && predictions.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {page} of {predictions.pagination.totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= predictions.pagination.totalPages}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

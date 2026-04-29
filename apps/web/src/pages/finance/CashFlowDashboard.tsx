import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const riskColors: Record<string, { bg: string; text: string; label: string }> = {
  GREEN: { bg: 'bg-green-500', text: 'text-green-700', label: 'Safe — spending within confirmed revenue' },
  YELLOW: { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'Caution — dipping into likely revenue' },
  RED: { bg: 'bg-red-500', text: 'text-red-700', label: 'Warning — spending unconfirmed funds' },
};

export function CashFlowDashboard() {
  const { data: wcData } = useQuery({
    queryKey: ['working-capital'],
    queryFn: () => api<{ data: any }>('/suspense/working-capital'),
  });

  const { data: ssData } = useQuery({
    queryKey: ['safe-spending'],
    queryFn: () => api<{ data: any }>('/suspense/safe-spending'),
  });

  const { data: forecastData } = useQuery({
    queryKey: ['cash-forecast'],
    queryFn: () => api<{ data: any[] }>('/suspense/forecast'),
  });

  const wc = wcData?.data;
  const ss = ssData?.data;
  const risk = riskColors[ss?.riskLevel || 'GREEN'];
  const fmt = (v: number) => `R ${(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <PageHeader title="Cash Flow & Working Capital" subtitle="Forward-looking cash position with suspense awareness" />

      {/* Working Capital */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Working Capital Position (This Month)</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
          <div>
            <p className="text-xs text-gray-500 uppercase">Cash Received</p>
            <p className="text-xl font-bold text-gray-900">{fmt(wc?.cashReceived || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Confirmed Revenue</p>
            <p className="text-xl font-bold text-green-700">{fmt(wc?.confirmedRevenue || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">In Suspense</p>
            <p className="text-xl font-bold text-amber-600">{fmt(wc?.suspenseBalance || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Expenses</p>
            <p className="text-xl font-bold text-red-600">{fmt(wc?.expenses || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Net Working Capital</p>
            <p className={`text-xl font-bold ${(wc?.netWorkingCapital || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {fmt(wc?.netWorkingCapital || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Safe Spending + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Safe Spending Threshold</h3>
          <div className="space-y-4">
            {['conservative', 'moderate', 'aggressive'].map((method) => (
              <div key={method} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{method}</p>
                  <p className="text-xs text-gray-400">
                    {method === 'conservative' ? 'Confirmed revenue only' :
                     method === 'moderate' ? 'Confirmed + 70% of likely' :
                     'Confirmed + likely - 15% buffer'}
                  </p>
                </div>
                <p className="text-lg font-bold text-gray-900">{fmt(ss?.safeSpending?.[method] || 0)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Based on {ss?.conversionRate || 0}% historical conversion rate</p>
        </div>

        <div className="card p-5 flex flex-col items-center justify-center">
          <div className={`w-20 h-20 rounded-full ${risk.bg} flex items-center justify-center mb-4`}>
            <span className="text-white text-2xl font-bold">{ss?.riskLevel?.[0] || 'G'}</span>
          </div>
          <h3 className={`text-lg font-bold ${risk.text}`}>{ss?.riskLevel || 'GREEN'}</h3>
          <p className="text-sm text-gray-500 text-center mt-2">{risk.label}</p>
          <div className="mt-4 text-center text-sm text-gray-600">
            <p>Current month spending: {fmt(ss?.currentMonthSpending || 0)}</p>
            <p>Likely additional revenue: {fmt(ss?.likelyRevenue || 0)}</p>
          </div>
        </div>
      </div>

      {/* Forecast */}
      {forecastData?.data && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Cash Flow Forecast</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {forecastData.data.map((period: any) => (
              <div key={period.label} className="rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Next {period.label}</h4>

                <div className="space-y-2 mb-3">
                  <p className="text-xs text-gray-500 uppercase">Projected Inflows</p>
                  <p className="text-lg font-bold text-green-700">{fmt(period.totalInflows)}</p>
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p>Payments due: {fmt(period.inflows.payments)}</p>
                    <p>SOR conversions: {fmt(period.inflows.sorConversions)}</p>
                    <p>Cash sales: {fmt(period.inflows.cashSales)}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <p className="text-xs text-gray-500 uppercase">Projected Outflows</p>
                  <p className="text-lg font-bold text-red-600">{fmt(period.totalOutflows)}</p>
                  <div className="text-xs text-gray-400">
                    <p>Expenses: {fmt(period.outflows.expenses)}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 uppercase">Net Cash Flow</p>
                  <p className={`text-xl font-bold ${period.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(period.net)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

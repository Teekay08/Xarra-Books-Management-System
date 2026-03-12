import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, cleanAxisProps, cleanGridProps } from '../../components/charts';

interface TitleRow {
  id: string; title: string; isbn13: string | null; rrp: number;
  unitsSold: number; revenue: number; revenueExVat: number;
  invoiceCount: number; partnerCount: number; currentStock: number; avgPrice: number;
}

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TitlePerformance() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-title-perf', from, to],
    queryFn: () => api<{ data: TitleRow[] }>(`/reports/title-performance?from=${from}&to=${to}`),
  });

  const titles = data?.data ?? [];
  const chartData = titles.slice(0, 15).map((t) => ({ name: t.title.length > 25 ? t.title.slice(0, 25) + '...' : t.title, revenue: t.revenue, units: t.unitsSold }));
  const totalRevenue = titles.reduce((s, t) => s + t.revenue, 0);
  const totalUnits = titles.reduce((s, t) => s + t.unitsSold, 0);

  return (
    <div>
      <PageHeader title="Title Performance" subtitle="Revenue, units sold and stock per book title" />

      <div className="flex gap-3 mb-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (titles.length > 0) {
              downloadCsv(titles, [
                { key: 'title', header: 'Title' },
                { key: 'isbn13', header: 'ISBN' },
                { key: 'rrp', header: 'RRP' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
                { key: 'avgPrice', header: 'Avg Price' },
                { key: 'partnerCount', header: 'Partners' },
                { key: 'currentStock', header: 'Stock' },
              ], 'title-performance-report');
            }
          }},
        ]} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Titles</p>
          <p className="text-2xl font-bold text-gray-900">{titles.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Revenue</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Units Sold</p>
          <p className="text-2xl font-bold text-gray-900">{totalUnits.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Avg Revenue/Title</p>
          <p className="text-2xl font-bold text-gray-900">{titles.length > 0 ? fmt(totalRevenue / titles.length) : 'R 0.00'}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-gray-200/60 bg-white p-4 mb-6 shadow-sm" style={{ height: Math.max(300, chartData.length * 35) }}>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Top {chartData.length} Titles by Revenue</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 150 }}>
              <ChartGradients>
                <GradientDef id="titleGrad" from="#34d399" to="#059669" direction="horizontal" />
              </ChartGradients>
              <CartesianGrid {...cleanGridProps} />
              <XAxis type="number" {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={140} {...cleanAxisProps} />
              <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
              <Bar dataKey="revenue" fill="url(#titleGrad)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ISBN</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">RRP</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units Sold</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Price</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Partners</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Loading...</td></tr>
            ) : titles.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No data for this period</td></tr>
            ) : titles.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.title}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-500">{t.isbn13 || '-'}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{fmt(t.rrp)}</td>
                <td className="px-4 py-3 text-sm text-right">{t.unitsSold.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-right font-mono font-medium">{fmt(t.revenue)}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{fmt(t.avgPrice)}</td>
                <td className="px-4 py-3 text-sm text-right">{t.partnerCount}</td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${t.currentStock <= 0 ? 'text-red-600' : t.currentStock < 10 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {t.currentStock}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

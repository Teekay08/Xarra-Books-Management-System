import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface TitleRow { id: string; title: string; isbn13?: string; unitsSold: number; revenue: number }
interface AuthorRow { id: string; name: string; revenue: number; unitsSold: number; titleCount: number }
interface ProfitRow { id: string; title: string; revenue: number; unitsSold: number; productionCost: number; royaltyPaid: number; netProfit: number }

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = 'revenue' | 'units' | 'underperformers' | 'authors' | 'profitability';

export function Bestsellers() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [tab, setTab] = useState<Tab>('revenue');

  const { data, isLoading } = useQuery({
    queryKey: ['report-bestsellers', from, to],
    queryFn: () => api<{ data: { bestByRevenue: TitleRow[]; bestByUnits: TitleRow[]; leastPerforming: TitleRow[]; topAuthors: AuthorRow[]; profitability: ProfitRow[] } }>(`/reports/bestsellers?from=${from}&to=${to}&limit=25`),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'revenue', label: 'Top Revenue' },
    { key: 'units', label: 'Top Units' },
    { key: 'underperformers', label: 'Underperformers' },
    { key: 'authors', label: 'Top Authors' },
    { key: 'profitability', label: 'Most Profitable' },
  ];

  const bestRevenue = data?.data.bestByRevenue ?? [];
  const bestUnits = data?.data.bestByUnits ?? [];
  const least = data?.data.leastPerforming ?? [];
  const authors = data?.data.topAuthors ?? [];
  const profit = data?.data.profitability ?? [];

  const chartData = tab === 'revenue' ? bestRevenue.slice(0, 10) :
    tab === 'units' ? bestUnits.slice(0, 10) :
    tab === 'underperformers' ? least.slice(0, 10) : [];

  return (
    <div>
      <PageHeader title="Bestsellers & Performance" subtitle="Top performers, underperformers, highest-earning authors, and profitability" />

      <div className="flex gap-3 mb-4">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (tab === 'revenue' && bestRevenue.length > 0) {
              downloadCsv(bestRevenue, [
                { key: 'title', header: 'Title' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], 'bestsellers-by-revenue');
            } else if (tab === 'units' && bestUnits.length > 0) {
              downloadCsv(bestUnits, [
                { key: 'title', header: 'Title' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], 'bestsellers-by-units');
            } else if (tab === 'underperformers' && least.length > 0) {
              downloadCsv(least, [
                { key: 'title', header: 'Title' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], 'underperformers');
            } else if (tab === 'authors' && authors.length > 0) {
              downloadCsv(authors, [
                { key: 'name', header: 'Author' },
                { key: 'titleCount', header: 'Titles' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], 'top-authors');
            } else if (tab === 'profitability' && profit.length > 0) {
              downloadCsv(profit, [
                { key: 'title', header: 'Title' },
                { key: 'revenue', header: 'Revenue' },
                { key: 'productionCost', header: 'Production Cost' },
                { key: 'royaltyPaid', header: 'Royalties' },
                { key: 'netProfit', header: 'Net Profit' },
              ], 'profitability');
            }
          }},
        ]} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-gray-400">Loading...</p> : (
        <>
          {/* Chart for title tabs */}
          {chartData.length > 0 && (tab === 'revenue' || tab === 'units' || tab === 'underperformers') && (
            <div className="rounded-lg border bg-white p-4 mb-6" style={{ height: Math.max(280, chartData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.map((t) => ({ name: t.title.length > 30 ? t.title.slice(0, 30) + '...' : t.title, value: tab === 'units' ? t.unitsSold : t.revenue }))} layout="vertical" margin={{ left: 180 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={tab === 'units' ? undefined : (v) => `R${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => tab === 'units' ? Number(v).toLocaleString() : fmt(Number(v))} />
                  <Bar dataKey="value" fill={tab === 'underperformers' ? '#dc2626' : '#15803d'} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Revenue / Units / Underperformers table */}
          {(tab === 'revenue' || tab === 'units' || tab === 'underperformers') && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units Sold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(tab === 'revenue' ? bestRevenue : tab === 'units' ? bestUnits : least).map((t, i) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.title}</td>
                      <td className="px-4 py-3 text-sm text-right">{t.unitsSold.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{fmt(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Authors table */}
          {tab === 'authors' && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Titles</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units Sold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {authors.map((a, i) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.name}</td>
                      <td className="px-4 py-3 text-sm text-right">{a.titleCount}</td>
                      <td className="px-4 py-3 text-sm text-right">{a.unitsSold.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium">{fmt(a.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Profitability table */}
          {tab === 'profitability' && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Production Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Royalties</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {profit.map((p, i) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.title}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{fmt(p.revenue)}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{fmt(p.productionCost)}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{fmt(p.royaltyPaid)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${p.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(p.netProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

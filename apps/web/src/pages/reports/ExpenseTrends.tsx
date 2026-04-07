import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';

interface CategoryRow { category: string; total: number; count: number }
interface TrendRow { month: string; category: string; total: number }
interface MonthlyRow { month: string; total: number; taxTotal: number }

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

import { ChartTooltip, ChartGradients, GradientDef, CHART_COLORS, cleanAxisProps, cleanGridProps } from '../../components/charts';
const COLORS = CHART_COLORS;

export function ExpenseTrends() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-expense-trends', from, to],
    queryFn: () => api<{ data: { byCategory: CategoryRow[]; categoryTrend: TrendRow[]; monthlyTotals: MonthlyRow[] } }>(`/reports/expense-trends?from=${from}&to=${to}`),
  });

  const categories = data?.data.byCategory ?? [];
  const monthly = data?.data.monthlyTotals ?? [];
  const trend = data?.data.categoryTrend ?? [];
  const totalExpenses = categories.reduce((s, c) => s + c.total, 0);
  const totalCount = categories.reduce((s, c) => s + c.count, 0);

  // Stacked bar: category trend by month
  const monthsSet = [...new Set(trend.map((t) => t.month))].sort();
  const categoryNames = [...new Set(trend.map((t) => t.category))];
  const stackedData = monthsSet.map((month) => {
    const row: Record<string, any> = { month };
    for (const cat of categoryNames) {
      const entry = trend.find((t) => t.month === month && t.category === cat);
      row[cat] = entry?.total ?? 0;
    }
    return row;
  });

  return (
    <div>
      <PageHeader title="Expense Trends" subtitle="Spending analysis by category with monthly trends" />

      <div className="flex gap-3 mb-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export by Category CSV', onClick: () => {
            if (categories.length > 0) {
              downloadCsv(categories, [
                { key: 'category', header: 'Category' },
                { key: 'count', header: 'Count' },
                { key: 'total', header: 'Total' },
              ], 'expense-trends-by-category');
            }
          }},
          { label: 'Export Monthly CSV', onClick: () => {
            if (monthly.length > 0) {
              downloadCsv(monthly, [
                { key: 'month', header: 'Month' },
                { key: 'total', header: 'Total' },
                { key: 'taxTotal', header: 'VAT Portion' },
              ], 'expense-trends-monthly');
            }
          }},
        ]} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">{fmt(totalExpenses)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Expense Count</p>
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Categories</p>
          <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-gray-400">Loading...</p> : (
        <>
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Donut chart by category */}
            {categories.length > 0 && (
              <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm" style={{ height: 350 }}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Expenses by Category</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={categories.map((c) => ({ name: c.category, value: c.total }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2} cornerRadius={4} label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
                      {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Monthly spending area chart */}
            {monthly.length > 0 && (
              <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm" style={{ height: 350 }}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly Spending Trend</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <AreaChart data={monthly}>
                    <ChartGradients>
                      <GradientDef id="expTotalGrad" from="#fca5a5" to="#fecaca" />
                      <GradientDef id="expVatGrad" from="#c4b5fd" to="#ede9fe" />
                    </ChartGradients>
                    <CartesianGrid {...cleanGridProps} />
                    <XAxis dataKey="month" {...cleanAxisProps} />
                    <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Area type="monotone" dataKey="total" stroke="#ef4444" strokeWidth={2} fill="url(#expTotalGrad)" name="Total" />
                    <Area type="monotone" dataKey="taxTotal" stroke="#8b5cf6" strokeWidth={1.5} fill="url(#expVatGrad)" strokeDasharray="5 5" name="VAT Portion" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Stacked bar by category/month */}
          {stackedData.length > 0 && (
            <div className="rounded-xl border border-gray-200/60 bg-white p-4 mb-6 shadow-sm" style={{ height: 350 }}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Category Breakdown by Month</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={stackedData}>
                  <CartesianGrid {...cleanGridProps} />
                  <XAxis dataKey="month" {...cleanAxisProps} />
                  <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                  <Legend />
                  {categoryNames.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === categoryNames.length - 1 ? [4, 4, 0, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category table */}
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg per Expense</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categories.map((c) => (
                  <tr key={c.category} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.category}</td>
                    <td className="px-4 py-3 text-sm text-right">{c.count}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium">{fmt(c.total)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{totalExpenses > 0 ? ((c.total / totalExpenses) * 100).toFixed(1) : 0}%</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{c.count > 0 ? fmt(c.total / c.count) : '-'}</td>
                  </tr>
                ))}
                {categories.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-sm">Total</td>
                    <td className="px-4 py-3 text-sm text-right">{totalCount}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{fmt(totalExpenses)}</td>
                    <td className="px-4 py-3 text-sm text-right">100%</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{totalCount > 0 ? fmt(totalExpenses / totalCount) : '-'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

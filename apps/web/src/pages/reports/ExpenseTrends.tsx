import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';

interface CategoryRow { category: string; total: number; count: number }
interface TrendRow { month: string; category: string; total: number }
interface MonthlyRow { month: string; total: number; taxTotal: number }

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLORS = ['#15803d', '#1d4ed8', '#dc2626', '#ea580c', '#9333ea', '#0891b2', '#be185d', '#4f46e5', '#059669', '#7c3aed'];

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
            {/* Pie chart by category */}
            {categories.length > 0 && (
              <div className="rounded-lg border bg-white p-4" style={{ height: 350 }}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Expenses by Category</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={categories.map((c) => ({ name: c.category, value: c.total }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} labelLine={false}>
                      {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Monthly total line chart */}
            {monthly.length > 0 && (
              <div className="rounded-lg border bg-white p-4" style={{ height: 350 }}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly Spending Trend</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line type="monotone" dataKey="total" stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} name="Total" />
                    <Line type="monotone" dataKey="taxTotal" stroke="#9333ea" strokeWidth={1} strokeDasharray="5 5" dot={false} name="VAT Portion" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Stacked bar by category/month */}
          {stackedData.length > 0 && (
            <div className="rounded-lg border bg-white p-4 mb-6" style={{ height: 350 }}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Category Breakdown by Month</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={stackedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Legend />
                  {categoryNames.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category table */}
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
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

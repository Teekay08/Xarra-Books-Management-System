import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, CHART_COLORS, cleanAxisProps, cleanGridProps } from '../../components/charts';

interface PartnerRow {
  id: string; name: string; discountPct: number;
  invoiceCount: number; totalRevenue: number; unitsSold: number;
  totalPaid: number; outstanding: number;
  overdueCount: number; overdueAmount: number;
  qtyReturned: number; qtyDispatched: number; returnRate: number;
}

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLORS = CHART_COLORS;

export function PartnerPerformance() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-partner-perf', from, to],
    queryFn: () => api<{ data: PartnerRow[] }>(`/reports/partner-performance?from=${from}&to=${to}`),
  });

  const partners = data?.data ?? [];
  const totalRevenue = partners.reduce((s, p) => s + p.totalRevenue, 0);
  const totalOutstanding = partners.reduce((s, p) => s + p.outstanding, 0);
  const totalOverdue = partners.reduce((s, p) => s + p.overdueAmount, 0);

  const pieData = partners.filter((p) => p.totalRevenue > 0).slice(0, 8).map((p) => ({ name: p.name, value: p.totalRevenue }));

  return (
    <div>
      <PageHeader title="Partner Performance" subtitle="Revenue, payments, return rates and overdue tracking per partner" />

      <div className="flex gap-3 mb-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (partners.length > 0) {
              downloadCsv(partners, [
                { key: 'name', header: 'Partner' },
                { key: 'discountPct', header: 'Discount %' },
                { key: 'invoiceCount', header: 'Invoices' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'totalRevenue', header: 'Revenue' },
                { key: 'totalPaid', header: 'Paid' },
                { key: 'outstanding', header: 'Outstanding' },
                { key: 'overdueAmount', header: 'Overdue Amount' },
                { key: 'returnRate', header: 'Return %' },
              ], 'partner-performance-report');
            }
          }},
        ]} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Active Partners</p>
          <p className="text-2xl font-bold text-gray-900">{partners.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Revenue</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Outstanding</p>
          <p className="text-2xl font-bold text-amber-600">{fmt(totalOutstanding)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{fmt(totalOverdue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Revenue bar chart */}
        {partners.length > 0 && (
          <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm" style={{ height: 350 }}>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Revenue by Partner</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={partners.slice(0, 10).map((p) => ({ name: p.name.length > 20 ? p.name.slice(0, 20) + '...' : p.name, revenue: p.totalRevenue, paid: p.totalPaid }))} layout="vertical" margin={{ left: 120 }}>
                <ChartGradients>
                  <GradientDef id="ppRevGrad" from="#34d399" to="#059669" direction="horizontal" />
                  <GradientDef id="ppPaidGrad" from="#93c5fd" to="#2563eb" direction="horizontal" />
                </ChartGradients>
                <CartesianGrid {...cleanGridProps} />
                <XAxis type="number" {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={110} {...cleanAxisProps} />
                <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                <Bar dataKey="revenue" fill="url(#ppRevGrad)" name="Revenue" radius={[0, 4, 4, 0]} />
                <Bar dataKey="paid" fill="url(#ppPaidGrad)" name="Paid" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Revenue share donut */}
        {pieData.length > 0 && (
          <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm" style={{ height: 350 }}>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Revenue Share</h3>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2} cornerRadius={4} label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Disc %</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Overdue</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Return %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">Loading...</td></tr>
            ) : partners.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                <td className="px-3 py-3 text-sm text-right">{p.discountPct}%</td>
                <td className="px-3 py-3 text-sm text-right">{p.invoiceCount}</td>
                <td className="px-3 py-3 text-sm text-right">{p.unitsSold.toLocaleString()}</td>
                <td className="px-3 py-3 text-sm text-right font-mono">{fmt(p.totalRevenue)}</td>
                <td className="px-3 py-3 text-sm text-right font-mono text-green-700">{fmt(p.totalPaid)}</td>
                <td className={`px-3 py-3 text-sm text-right font-mono ${p.outstanding > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{fmt(p.outstanding)}</td>
                <td className={`px-3 py-3 text-sm text-right ${p.overdueAmount > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  {p.overdueAmount > 0 ? `${fmt(p.overdueAmount)} (${p.overdueCount})` : '-'}
                </td>
                <td className={`px-3 py-3 text-sm text-right ${p.returnRate > 20 ? 'text-red-600 font-medium' : p.returnRate > 10 ? 'text-amber-600' : 'text-gray-500'}`}>
                  {p.returnRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

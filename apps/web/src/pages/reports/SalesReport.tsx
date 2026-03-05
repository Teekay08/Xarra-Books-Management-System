import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SalesRow {
  label: string;
  unitsSold: number;
  revenue: number;
  invoiceCount?: number;
}

function formatR(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SalesReport() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<'title' | 'partner'>('title');

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales', from, to, groupBy],
    queryFn: () => api<{ data: SalesRow[] }>(`/reports/sales?from=${from}&to=${to}&groupBy=${groupBy}`),
  });

  const rows = data?.data ?? [];
  const cls = 'rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <PageHeader title="Sales Report" subtitle={`Sales breakdown by ${groupBy}`} />

      <div className="flex items-end gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Group By</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className={cls}>
            <option value="title">Title</option>
            <option value="partner">Partner</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {rows.length > 0 && (
        <>
          <div className="rounded-lg border bg-white p-5 mb-6">
            <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 35)}>
              <BarChart data={rows.slice(0, 15)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatR(Number(v))} />
                <Bar dataKey="revenue" fill="#166534" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{groupBy === 'title' ? 'Title' : 'Partner'}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units Sold</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="px-4 py-3 font-medium">{r.label}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.unitsSold.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatR(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.unitsSold, 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatR(rows.reduce((s, r) => s + r.revenue, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-gray-400 mt-4">No sales data for this period.</p>
      )}
    </div>
  );
}

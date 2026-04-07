import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatR } from '../../lib/format';
import { ChartTooltip, ChartGradients, GradientDef, cleanAxisProps, cleanGridProps } from '../../components/charts';

interface SalesRow {
  label: string;
  unitsSold: number;
  revenue: number;
  invoiceCount?: number;
  authorId?: string;
}

type GroupBy = 'title' | 'partner' | 'period' | 'author';

const GROUP_LABELS: Record<GroupBy, string> = {
  title: 'Title',
  partner: 'Channel Partner',
  period: 'Month',
  author: 'Author',
};

export function SalesReport() {
  const navigate = useNavigate();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<GroupBy>('title');

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales', from, to, groupBy],
    queryFn: () => api<{ data: SalesRow[] }>(`/reports/sales?from=${from}&to=${to}&groupBy=${groupBy}`),
  });

  const rows = data?.data ?? [];
  const cls = 'rounded-md border border-gray-300 px-3 py-2 text-sm';
  const isPeriod = groupBy === 'period';

  return (
    <div>
      <PageHeader title="Sales Report" subtitle={`Sales breakdown by ${GROUP_LABELS[groupBy].toLowerCase()}`} />

      <div className="flex items-end gap-4 mb-6 flex-wrap">
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
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={cls}>
            <option value="title">Title</option>
            <option value="partner">Channel Partner</option>
            <option value="period">Period (Month)</option>
            <option value="author">Author</option>
          </select>
        </div>
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (rows.length > 0) {
              downloadCsv(rows, [
                { key: 'label', header: GROUP_LABELS[groupBy] },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], `sales-report-by-${groupBy}`);
            }
          }},
        ]} />
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {rows.length > 0 && (
        <>
          <div className="rounded-xl border border-gray-200/60 bg-white p-5 mb-6 shadow-sm">
            {isPeriod ? (
              // Line chart for period view
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={rows}>
                  <ChartGradients>
                    <GradientDef id="salesGrad" from="#34d399" to="#059669" />
                  </ChartGradients>
                  <CartesianGrid {...cleanGridProps} />
                  <XAxis dataKey="label" {...cleanAxisProps} />
                  <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatR(v)} />} />
                  <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={{ r: 4, fill: '#059669' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              // Horizontal bar chart for title/partner/author view
              <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 35)}>
                <BarChart data={rows.slice(0, 15)} layout="vertical">
                  <ChartGradients>
                    <GradientDef id="salesGrad" from="#34d399" to="#059669" direction="horizontal" />
                  </ChartGradients>
                  <CartesianGrid {...cleanGridProps} />
                  <XAxis type="number" {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="label" width={180} {...cleanAxisProps} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatR(v)} />} />
                  <Bar dataKey="revenue" fill="url(#salesGrad)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-lg border bg-white overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{GROUP_LABELS[groupBy]}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units Sold</th>
                  {groupBy === 'partner' && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr
                    key={r.label}
                    className={r.authorId ? 'cursor-pointer hover:bg-gray-50' : ''}
                    onClick={r.authorId ? () => navigate(`/reports/author-royalty?authorId=${r.authorId}`) : undefined}
                  >
                    <td className="px-4 py-3 font-medium">{r.label}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.unitsSold.toLocaleString()}</td>
                    {groupBy === 'partner' && (
                      <td className="px-4 py-3 text-right font-mono">{r.invoiceCount ?? 0}</td>
                    )}
                    <td className="px-4 py-3 text-right font-mono">{formatR(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.unitsSold, 0).toLocaleString()}</td>
                  {groupBy === 'partner' && (
                    <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + (r.invoiceCount ?? 0), 0)}</td>
                  )}
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

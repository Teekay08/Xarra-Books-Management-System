import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PnlMonth {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  vat: number;
}

interface PnlData {
  months: PnlMonth[];
  totals: { revenue: number; expenses: number; net: number; vat: number };
  periodFrom: string;
  periodTo: string;
}

function formatR(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProfitLoss() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['report-pnl', from, to],
    queryFn: () => api<{ data: PnlData }>(`/reports/profit-loss?from=${from}&to=${to}`),
  });

  const pnl = data?.data;
  const cls = 'rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <PageHeader title="Profit & Loss" subtitle="Revenue vs expenses breakdown" />

      <div className="flex items-end gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cls} />
        </div>
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (pnl?.months) {
              downloadCsv(pnl.months, [
                { key: 'month', header: 'Month' },
                { key: 'revenue', header: 'Revenue' },
                { key: 'vat', header: 'VAT' },
                { key: 'expenses', header: 'Expenses' },
                { key: 'net', header: 'Net Profit' },
              ], 'profit-loss-report');
            }
          }},
        ]} />
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {pnl && (
        <>
          {/* Totals summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border bg-white p-4 text-center">
              <p className="text-xs text-gray-500">Total Revenue</p>
              <p className="text-xl font-bold text-gray-900">{formatR(pnl.totals.revenue)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4 text-center">
              <p className="text-xs text-gray-500">Total Expenses</p>
              <p className="text-xl font-bold text-gray-900">{formatR(pnl.totals.expenses)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4 text-center">
              <p className="text-xs text-gray-500">VAT Collected</p>
              <p className="text-xl font-bold text-gray-500">{formatR(pnl.totals.vat)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4 text-center">
              <p className="text-xs text-gray-500">Net Profit</p>
              <p className={`text-xl font-bold ${pnl.totals.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatR(pnl.totals.net)}
              </p>
            </div>
          </div>

          {/* Chart */}
          {pnl.months.length > 0 && (
            <div className="rounded-lg border bg-white p-5 mb-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pnl.months}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatR(Number(v))} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#166534" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expenses</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pnl.months.map((m) => (
                  <tr key={m.month}>
                    <td className="px-4 py-3 font-medium">{m.month}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatR(m.revenue)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatR(m.expenses)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${m.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatR(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right font-mono">{formatR(pnl.totals.revenue)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatR(pnl.totals.expenses)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${pnl.totals.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatR(pnl.totals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

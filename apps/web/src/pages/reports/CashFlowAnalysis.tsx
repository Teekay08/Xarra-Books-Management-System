import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, cleanAxisProps, cleanGridProps } from '../../components/charts';

interface MonthlyRow { month: string; inflow: number; outflow: number; net: number }
interface PaymentSpeed { avgDays: number; minDays: number; maxDays: number }
interface Balances { totalReceivable: number; totalPayable: number }

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CashFlowAnalysis() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-cashflow', from, to],
    queryFn: () => api<{ data: { monthly: MonthlyRow[]; paymentSpeed: PaymentSpeed; balances: Balances } }>(`/reports/cash-flow-analysis?from=${from}&to=${to}`),
  });

  const monthly = data?.data.monthly ?? [];
  const speed = data?.data.paymentSpeed ?? { avgDays: 0, minDays: 0, maxDays: 0 };
  const balances = data?.data.balances ?? { totalReceivable: 0, totalPayable: 0 };
  const totalInflow = monthly.reduce((s, m) => s + m.inflow, 0);
  const totalOutflow = monthly.reduce((s, m) => s + m.outflow, 0);

  return (
    <div>
      <PageHeader title="Cash Flow Analysis" subtitle="Inflows vs outflows, payment speed, and working capital" />

      <div className="flex gap-3 mb-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (monthly.length > 0) {
              downloadCsv(monthly, [
                { key: 'month', header: 'Month' },
                { key: 'inflow', header: 'Cash In' },
                { key: 'outflow', header: 'Cash Out' },
                { key: 'net', header: 'Net' },
              ], 'cash-flow-analysis');
            }
          }},
        ]} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Inflow</p>
          <p className="text-xl font-bold text-green-700">{fmt(totalInflow)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Outflow</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalOutflow)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Net Cash Flow</p>
          <p className={`text-xl font-bold ${totalInflow - totalOutflow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {fmt(totalInflow - totalOutflow)}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Avg Days to Payment</p>
          <p className={`text-xl font-bold ${speed.avgDays > 60 ? 'text-red-600' : speed.avgDays > 30 ? 'text-amber-600' : 'text-green-700'}`}>
            {speed.avgDays || '-'} days
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {speed.minDays > 0 ? `Min: ${speed.minDays}d / Max: ${speed.maxDays}d` : 'No payment data'}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Working Capital</p>
          <p className={`text-xl font-bold ${balances.totalReceivable - balances.totalPayable >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {fmt(balances.totalReceivable - balances.totalPayable)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Receivable: {fmt(balances.totalReceivable)}
          </p>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-gray-400">Loading...</p> : (
        <>
          {/* Cash flow chart */}
          {monthly.length > 0 && (
            <div className="rounded-xl border border-gray-200/60 bg-white p-4 mb-6 shadow-sm" style={{ height: 380 }}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly Cash Flow</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={monthly}>
                  <ChartGradients>
                    <GradientDef id="cfIn" from="#34d399" to="#059669" />
                    <GradientDef id="cfOut" from="#fca5a5" to="#dc2626" />
                  </ChartGradients>
                  <CartesianGrid {...cleanGridProps} />
                  <XAxis dataKey="month" {...cleanAxisProps} />
                  <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Bar dataKey="inflow" fill="url(#cfIn)" name="Cash In (Payments)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="outflow" fill="url(#cfOut)" name="Cash Out (Expenses)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly detail table */}
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cash In</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cash Out</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cumulative</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(() => {
                  let cumulative = 0;
                  return monthly.map((m) => {
                    cumulative += m.net;
                    return (
                      <tr key={m.month} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.month}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-green-700">{fmt(m.inflow)}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-red-600">{fmt(m.outflow)}</td>
                        <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${m.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {fmt(m.net)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-mono ${cumulative >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {fmt(cumulative)}
                        </td>
                      </tr>
                    );
                  });
                })()}
                {monthly.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-sm">Total</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-green-700">{fmt(totalInflow)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-red-600">{fmt(totalOutflow)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-mono ${totalInflow - totalOutflow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmt(totalInflow - totalOutflow)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right"></td>
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

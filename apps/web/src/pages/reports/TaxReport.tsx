import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, cleanAxisProps, cleanGridProps } from '../../components/charts';

interface MonthlyTax {
  month: string;
  taxableIncome: number; vatCollected: number; invoiceCount: number;
  expenseAmount: number; vatPaid: number; expenseCount: number;
  vatAdjustment: number; netVat: number;
}
interface Totals {
  taxableIncome: number; vatCollected: number;
  expenseAmount: number; vatPaid: number;
  vatAdjustment: number; netVat: number;
}

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TaxReport() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-tax', from, to],
    queryFn: () => api<{ data: { monthly: MonthlyTax[]; totals: Totals } }>(`/reports/tax-report?from=${from}&to=${to}`),
  });

  const monthly = data?.data.monthly ?? [];
  const totals = data?.data.totals ?? { taxableIncome: 0, vatCollected: 0, expenseAmount: 0, vatPaid: 0, vatAdjustment: 0, netVat: 0 };

  return (
    <div>
      <PageHeader title="Tax & VAT Report" subtitle="Output VAT (collected), Input VAT (paid), credit note adjustments, and net VAT payable to SARS" />

      <div className="flex gap-3 mb-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (monthly.length > 0) {
              downloadCsv(monthly, [
                { key: 'month', header: 'Month' },
                { key: 'taxableIncome', header: 'Taxable Sales' },
                { key: 'vatCollected', header: 'Output VAT' },
                { key: 'invoiceCount', header: 'Invoice Count' },
                { key: 'expenseAmount', header: 'Expenses' },
                { key: 'vatPaid', header: 'Input VAT' },
                { key: 'expenseCount', header: 'Expense Count' },
                { key: 'vatAdjustment', header: 'CN Adjustment' },
                { key: 'netVat', header: 'Net VAT' },
              ], 'tax-vat-report');
            }
          }},
        ]} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Taxable Income</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totals.taxableIncome)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Output VAT (Collected)</p>
          <p className="text-xl font-bold text-blue-700">{fmt(totals.vatCollected)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Input VAT (Paid)</p>
          <p className="text-xl font-bold text-red-600">{fmt(totals.vatPaid)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Credit Note Adj.</p>
          <p className="text-xl font-bold text-amber-600">{fmt(totals.vatAdjustment)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4 border-l-4 border-l-green-700">
          <p className="text-xs text-gray-500 uppercase">Net VAT Payable</p>
          <p className={`text-xl font-bold ${totals.netVat >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(totals.netVat)}</p>
          <p className="text-xs text-gray-400 mt-1">{totals.netVat >= 0 ? 'Payable to SARS' : 'Refund due from SARS'}</p>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-gray-400">Loading...</p> : (
        <>
          {/* VAT chart */}
          {monthly.length > 0 && (
            <div className="rounded-xl border border-gray-200/60 bg-white p-4 mb-6 shadow-sm" style={{ height: 380 }}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly VAT Summary</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={monthly}>
                  <ChartGradients>
                    <GradientDef id="taxBlue" from="#93c5fd" to="#2563eb" />
                    <GradientDef id="taxRed" from="#fca5a5" to="#dc2626" />
                    <GradientDef id="taxGreen" from="#34d399" to="#059669" />
                  </ChartGradients>
                  <CartesianGrid {...cleanGridProps} />
                  <XAxis dataKey="month" {...cleanAxisProps} />
                  <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Bar dataKey="vatCollected" fill="url(#taxBlue)" name="Output VAT (Collected)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vatPaid" fill="url(#taxRed)" name="Input VAT (Paid)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netVat" fill="url(#taxGreen)" name="Net VAT" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail table */}
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Sales</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output VAT</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inv #</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expenses</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Input VAT</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Exp #</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">CN Adj.</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net VAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {monthly.map((m) => (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{m.month}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono">{fmt(m.taxableIncome)}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono text-blue-700">{fmt(m.vatCollected)}</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-500">{m.invoiceCount}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono">{fmt(m.expenseAmount)}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono text-red-600">{fmt(m.vatPaid)}</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-500">{m.expenseCount}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono text-amber-600">{m.vatAdjustment > 0 ? `-${fmt(m.vatAdjustment)}` : '-'}</td>
                    <td className={`px-3 py-3 text-sm text-right font-mono font-medium ${m.netVat >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmt(m.netVat)}
                    </td>
                  </tr>
                ))}
                {monthly.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-3 text-sm">Total</td>
                    <td className="px-3 py-3 text-sm text-right font-mono">{fmt(totals.taxableIncome)}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono text-blue-700">{fmt(totals.vatCollected)}</td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3 text-sm text-right font-mono">{fmt(totals.expenseAmount)}</td>
                    <td className="px-3 py-3 text-sm text-right font-mono text-red-600">{fmt(totals.vatPaid)}</td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3 text-sm text-right font-mono text-amber-600">{totals.vatAdjustment > 0 ? `-${fmt(totals.vatAdjustment)}` : '-'}</td>
                    <td className={`px-3 py-3 text-sm text-right font-mono ${totals.netVat >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(totals.netVat)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-md bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">VAT Calculation Notes</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-blue-700">
              <li><strong>Output VAT</strong>: VAT collected from customers on invoices (15%)</li>
              <li><strong>Input VAT</strong>: VAT paid on business expenses (claimable)</li>
              <li><strong>Credit Note Adjustments</strong>: VAT refunded via credit notes (reduces output VAT)</li>
              <li><strong>Net VAT</strong> = Output VAT - Input VAT - Credit Note Adjustments</li>
              <li>Positive net = payable to SARS; Negative net = refund claimable from SARS</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

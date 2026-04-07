import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';

interface PrintRunRow {
  id: string;
  printRunNumber: number;
  grnNumber: string;
  title: string;
  isbn13: string | null;
  printerName: string;
  quantityOrdered: number;
  quantityReceived: number | null;
  totalCost: number;
  costPerUnit: number;
  status: string;
  expectedDeliveryDate: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Summary {
  totalRuns: number;
  totalOrdered: number;
  totalReceived: number;
  totalCost: number;
  byStatus: Record<string, number>;
}

const statusColors: Record<string, string> = {
  ORDERED: 'bg-blue-100 text-blue-700',
  IN_PRODUCTION: 'bg-yellow-100 text-yellow-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  RECEIVED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function PrintRunsReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params}` : '';

  const { data, isLoading } = useQuery({
    queryKey: ['report-print-runs', from, to],
    queryFn: () => api<{ data: PrintRunRow[]; summary: Summary }>(`/reports/print-runs${qs}`),
  });

  const rows = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div>
      <PageHeader title="Print Runs Report" subtitle="All print runs across titles with production details and costs" />

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (rows.length > 0) {
              downloadCsv(rows, [
                { key: 'title', header: 'Title' },
                { key: 'isbn13', header: 'ISBN' },
                { key: 'printRunNumber', header: 'Run #' },
                { key: 'grnNumber', header: 'GRN #' },
                { key: 'printerName', header: 'Printer' },
                { key: 'quantityOrdered', header: 'Qty Ordered' },
                { key: 'quantityReceived', header: 'Qty Received' },
                { key: 'totalCost', header: 'Total Cost (ZAR)' },
                { key: 'costPerUnit', header: 'Cost/Unit (ZAR)' },
                { key: 'status', header: 'Status' },
                { key: 'expectedDeliveryDate', header: 'Expected Delivery' },
                { key: 'receivedAt', header: 'Received Date' },
                { key: 'notes', header: 'Notes' },
              ], 'print-runs-report');
            }
          }},
        ]} />
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Total Print Runs</p>
            <p className="text-2xl font-bold">{summary.totalRuns}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Total Copies Ordered</p>
            <p className="text-2xl font-bold">{summary.totalOrdered.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Total Copies Received</p>
            <p className="text-2xl font-bold">{summary.totalReceived.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Total Print Cost</p>
            <p className="text-2xl font-bold font-mono">R {summary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border bg-white overflow-x-auto">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ISBN</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Run #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GRN #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Printer</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Ordered</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Received</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost/Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.title}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.isbn13 ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{r.printRunNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.grnNumber}</td>
                    <td className="px-4 py-3">{r.printerName}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.quantityOrdered.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.quantityReceived?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">R {r.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-mono">R {r.costPerUnit.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500">{r.expectedDeliveryDate ? new Date(r.expectedDeliveryDate).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={5}>Total</td>
                  <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.quantityOrdered, 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + (r.quantityReceived ?? 0), 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">R {rows.reduce((s, r) => s + r.totalCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3" colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-gray-400 mt-4">No print runs found for the selected period.</p>
      )}
    </div>
  );
}

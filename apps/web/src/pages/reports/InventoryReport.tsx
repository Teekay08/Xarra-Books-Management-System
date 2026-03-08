import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';

interface InventoryRow {
  id: string;
  title: string;
  isbn13: string | null;
  stockOnHand: number;
  totalConsigned: number;
  totalSold: number;
}

export function InventoryReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api<{ data: InventoryRow[] }>('/reports/inventory'),
  });

  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader title="Inventory Report" subtitle="Stock levels and movement summary" />

      <div className="flex items-end gap-4 mb-6">
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (rows.length > 0) {
              downloadCsv(rows, [
                { key: 'title', header: 'Title' },
                { key: 'isbn13', header: 'ISBN' },
                { key: 'stockOnHand', header: 'Stock on Hand' },
                { key: 'totalConsigned', header: 'Total Consigned' },
                { key: 'totalSold', header: 'Total Sold' },
              ], 'inventory-report');
            }
          }},
        ]} />
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {rows.length > 0 && (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ISBN</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock on Hand</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Consigned</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.isbn13 ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={r.stockOnHand <= 0 ? 'text-red-600 font-medium' : ''}>
                      {r.stockOnHand.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.totalConsigned.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.totalSold.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>Total</td>
                <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.stockOnHand, 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.totalConsigned, 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.totalSold, 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-gray-400 mt-4">No inventory data.</p>
      )}
    </div>
  );
}

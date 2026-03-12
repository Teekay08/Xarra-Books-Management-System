import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { formatR } from '../../lib/format';

interface AgingData {
  buckets: { current: number; thirtyDays: number; sixtyDays: number; ninetyPlus: number };
  items: {
    id: string;
    number: string;
    total: number;
    dueDate: string;
    partnerName: string;
    daysOverdue: number;
    bucket: string;
  }[];
}


export function OverdueAging() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['report-aging'],
    queryFn: () => api<{ data: AgingData }>('/reports/overdue-aging'),
  });

  const aging = data?.data;
  const grandTotal = aging ? aging.buckets.current + aging.buckets.thirtyDays + aging.buckets.sixtyDays + aging.buckets.ninetyPlus : 0;

  return (
    <div>
      <PageHeader title="Overdue Aging" subtitle="Outstanding invoices by age bucket" />

      <div className="flex items-end gap-4 mb-6">
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => {
            if (aging?.items && aging.items.length > 0) {
              downloadCsv(aging.items, [
                { key: 'number', header: 'Invoice' },
                { key: 'partnerName', header: 'Partner' },
                { key: 'dueDate', header: 'Due Date' },
                { key: 'daysOverdue', header: 'Days Overdue' },
                { key: 'bucket', header: 'Bucket' },
                { key: 'total', header: 'Amount' },
              ], 'overdue-aging-report');
            }
          }},
        ]} />
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {aging && (
        <>
          {/* Bucket summary */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: '1-30 Days', value: aging.buckets.current, color: 'text-amber-600' },
              { label: '31-60 Days', value: aging.buckets.thirtyDays, color: 'text-orange-600' },
              { label: '61-90 Days', value: aging.buckets.sixtyDays, color: 'text-red-500' },
              { label: '90+ Days', value: aging.buckets.ninetyPlus, color: 'text-red-700' },
              { label: 'Total Overdue', value: grandTotal, color: 'text-gray-900' },
            ].map((b) => (
              <div key={b.label} className="rounded-lg border bg-white p-4 text-center">
                <p className="text-xs text-gray-500">{b.label}</p>
                <p className={`text-xl font-bold ${b.color}`}>{formatR(b.value)}</p>
              </div>
            ))}
          </div>

          {/* Detail table */}
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bucket</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {aging.items.map((item) => (
                  <tr key={item.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/invoices/${item.id}`)}>
                    <td className="px-4 py-3 font-mono text-green-700">{item.number}</td>
                    <td className="px-4 py-3">{item.partnerName}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(item.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${item.daysOverdue > 90 ? 'text-red-700' : item.daysOverdue > 60 ? 'text-red-500' : item.daysOverdue > 30 ? 'text-orange-600' : 'text-amber-600'}`}>
                        {item.daysOverdue}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.bucket === '90+' ? 'bg-red-100 text-red-700' :
                        item.bucket === '61-90' ? 'bg-red-50 text-red-500' :
                        item.bucket === '31-60' ? 'bg-orange-100 text-orange-600' :
                        'bg-amber-100 text-amber-600'
                      }`}>{item.bucket}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{formatR(item.total)}</td>
                  </tr>
                ))}
                {aging.items.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No overdue invoices</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

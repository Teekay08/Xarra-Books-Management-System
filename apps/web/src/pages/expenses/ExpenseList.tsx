import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { ActionMenu } from '../../components/ActionMenu';

interface Expense {
  id: string;
  description: string;
  amount: string;
  taxAmount: string;
  expenseDate: string;
  paymentMethod: string | null;
  reference: string | null;
  category: { name: string };
}

export function ExpenseList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', page, search],
    queryFn: () =>
      api<{ data: Expense[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/expenses?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Expenses"
        action={
          <div className="flex gap-2">
            <Link to="/expenses/categories" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Categories
            </Link>
            <Link to="/expenses/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
              Record Expense
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <input type="text" placeholder="Search expenses..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => setExportModalOpen(true) },
        ]} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((exp) => (
              <tr key={exp.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/expenses/${exp.id}`)}>
                <td className="px-4 py-3 text-sm text-gray-900">{new Date(exp.expenseDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {exp.category.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{exp.description}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">R {Number(exp.amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{exp.paymentMethod?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{exp.reference ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    { label: 'View Details', onClick: () => navigate(`/expenses/${exp.id}`) },
                    { label: 'Edit', onClick: () => navigate(`/expenses/${exp.id}/edit`) },
                    { label: 'Delete', onClick: () => { if (confirm('Delete this expense?')) navigate(`/expenses/${exp.id}`); }, variant: 'danger' },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No expenses recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/expenses', from, to), 'expenses-export.csv')}
        title="Export Expenses"
      />
    </div>
  );
}

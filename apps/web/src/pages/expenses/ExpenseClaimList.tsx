import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';
import { formatR } from '../../lib/format';

interface ExpenseClaim {
  id: string;
  number: string;
  claimDate: string;
  total: string;
  status: string;
  notes: string | null;
  claimant: { name: string };
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-purple-100 text-purple-700',
};


export function ExpenseClaimList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['expense-claims', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<ExpenseClaim>>(
        `/expenses/claims?page=${page}&limit=20&search=${encodeURIComponent(search)}${statusFilter ? `&status=${statusFilter}` : ''}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    {
      key: 'number',
      header: 'Claim #',
      render: (claim: ExpenseClaim) => (
        <span className="font-mono font-medium">{claim.number}</span>
      ),
    },
    {
      key: 'claimant',
      header: 'Claimant',
      render: (claim: ExpenseClaim) => claim.claimant.name,
    },
    {
      key: 'claimDate',
      header: 'Date',
      render: (claim: ExpenseClaim) =>
        new Date(claim.claimDate).toLocaleDateString('en-ZA'),
    },
    {
      key: 'total',
      header: 'Total',
      render: (claim: ExpenseClaim) => (
        <span className="font-mono">{formatR(claim.total)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (claim: ExpenseClaim) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[claim.status] ?? ''}`}>
          {claim.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (claim: ExpenseClaim) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={[
            { label: 'View Details', onClick: () => navigate(`/expenses/claims/${claim.id}`) },
            { label: 'Edit', onClick: () => navigate(`/expenses/claims/${claim.id}/edit`), hidden: claim.status !== 'DRAFT' },
            { label: 'Delete', onClick: () => { if (confirm('Delete this expense claim?')) navigate(`/expenses/claims/${claim.id}`); }, variant: 'danger', hidden: claim.status !== 'DRAFT' },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Expense Claims"
        action={
          <button
            onClick={() => navigate('/expenses/claims/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + New Claim
          </button>
        }
      />

      <div className="mb-4 flex gap-3 items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by claim number or claimant..." />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="PAID">Paid</option>
        </select>
        <ExportButton options={[
          { label: 'Export CSV', onClick: () => setExportModalOpen(true) },
        ]} />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(claim) => navigate(`/expenses/claims/${claim.id}`)}
            emptyMessage="No expense claims yet"
          />
          {data?.pagination && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/expense-claims', from, to), 'expense-claims-export.csv')}
        title="Export Expense Claims"
      />
    </div>
  );
}

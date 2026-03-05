import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Requisition {
  id: string;
  number: string;
  department: string;
  requiredByDate: string | null;
  totalEstimate: string;
  status: string;
  requestedBy: { name: string };
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  ORDERED: 'bg-purple-100 text-purple-700',
};

function formatR(val: string | number) {
  return `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RequisitionList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['requisitions', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<Requisition>>(
        `/expenses/requisitions?page=${page}&limit=20&search=${encodeURIComponent(search)}${statusFilter ? `&status=${statusFilter}` : ''}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    {
      key: 'number',
      header: 'Req #',
      render: (req: Requisition) => (
        <span className="font-mono font-medium">{req.number}</span>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Requested By',
      render: (req: Requisition) => req.requestedBy.name,
    },
    {
      key: 'department',
      header: 'Department',
    },
    {
      key: 'requiredByDate',
      header: 'Required By',
      render: (req: Requisition) =>
        req.requiredByDate ? new Date(req.requiredByDate).toLocaleDateString('en-ZA') : '--',
    },
    {
      key: 'totalEstimate',
      header: 'Estimate',
      render: (req: Requisition) => (
        <span className="font-mono">{formatR(req.totalEstimate)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (req: Requisition) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ''}`}>
          {req.status}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Requisitions"
        action={
          <button
            onClick={() => navigate('/procurement/requisitions/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + New Requisition
          </button>
        }
      />

      <div className="mb-4 flex gap-3 items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by requisition number or department..." />
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
          <option value="ORDERED">Ordered</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(req) => navigate(`/procurement/requisitions/${req.id}`)}
            emptyMessage="No requisitions yet"
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
    </div>
  );
}

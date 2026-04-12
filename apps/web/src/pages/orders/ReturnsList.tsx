import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';

interface ReturnSummary {
  id: string;
  number: string;
  partnerId: string;
  partnerName?: string;
  branchName?: string | null;
  status: string;
  reason: string;
  lineCount?: number;
  createdAt: string;
  authorisedAt?: string | null;
  creditNoteNumber?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT:         { label: 'Draft',         color: 'bg-gray-100 text-gray-600' },
  SUBMITTED:     { label: 'Submitted',     color: 'bg-blue-100 text-blue-700' },
  UNDER_REVIEW:  { label: 'Under Review',  color: 'bg-amber-100 text-amber-700' },
  AUTHORIZED:    { label: 'Authorised',    color: 'bg-green-100 text-green-700' },
  REJECTED:      { label: 'Rejected',      color: 'bg-red-100 text-red-700' },
  IN_TRANSIT:    { label: 'In Transit',    color: 'bg-purple-100 text-purple-700' },
  RECEIVED:      { label: 'Received',      color: 'bg-indigo-100 text-indigo-700' },
  INSPECTED:     { label: 'Inspected',     color: 'bg-teal-100 text-teal-700' },
  VERIFIED:      { label: 'Verified',      color: 'bg-emerald-100 text-emerald-700' },
  PROCESSED:     { label: 'Processed',     color: 'bg-green-100 text-green-800' },
  CREDIT_ISSUED: { label: 'Credit Issued', color: 'bg-green-100 text-green-800' },
};

export function ReturnsList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['returns-list', page, search],
    queryFn: () => api<PaginatedResponse<ReturnSummary>>(
      `/returns?page=${page}&limit=20&search=${encodeURIComponent(search)}`
    ),
  });

  const columns = [
    {
      key: 'number',
      header: 'RA Number',
      render: (row: ReturnSummary) => (
        <Link to={`/orders/returns/${row.id}`} className="font-mono text-sm font-semibold text-blue-600 hover:text-blue-800">
          {row.number}
        </Link>
      ),
    },
    {
      key: 'partner',
      header: 'Partner',
      render: (row: ReturnSummary) => (
        <div>
          <p className="text-sm font-medium">{row.partnerName ?? '—'}</p>
          {row.branchName && <p className="text-xs text-gray-500">{row.branchName}</p>}
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row: ReturnSummary) => (
        <p className="text-sm text-gray-600 max-w-xs truncate">{row.reason}</p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: ReturnSummary) => {
        const cfg = STATUS_CONFIG[row.status] ?? { label: row.status, color: 'bg-gray-100 text-gray-600' };
        return (
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'credit',
      header: 'Credit Note',
      render: (row: ReturnSummary) =>
        row.creditNoteNumber
          ? <span className="font-mono text-xs text-green-700">{row.creditNoteNumber}</span>
          : <span className="text-xs text-gray-400">—</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row: ReturnSummary) => (
        <span className="text-xs text-gray-500">
          {new Date(row.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: ReturnSummary) => (
        <ActionMenu items={[
          { label: 'View Return', onClick: () => navigate(`/orders/returns/${row.id}`) },
          { label: 'Download RA PDF', onClick: () => window.open(`/api/v1/returns/${row.id}/pdf`, '_blank') },
        ]} />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        subtitle="Track and process stock returns from partners"
        backTo={{ href: '/orders', label: 'Order Management' }}
        action={
          <Link
            to="/orders/returns/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#8B1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#7a1717]"
          >
            + Capture Return
          </Link>
        }
      />

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search returns..." />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading returns…
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            emptyMessage="No returns found"
          />
        )}

        {data?.pagination && (
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination
              page={page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

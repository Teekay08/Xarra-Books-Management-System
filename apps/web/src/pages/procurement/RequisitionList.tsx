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


export function RequisitionList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

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
    {
      key: 'actions',
      header: 'Actions',
      render: (req: Requisition) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            items={[
              {
                label: 'View Details',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                onClick: () => navigate(`/procurement/requisitions/${req.id}`),
              },
              {
                label: 'Edit',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                hidden: req.status !== 'DRAFT',
                onClick: () => navigate(`/procurement/requisitions/${req.id}`),
              },
              {
                label: 'Duplicate',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                onClick: () => navigate(`/procurement/requisitions/new?from=${req.id}`),
              },
              {
                label: 'Print',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>,
                onClick: () => window.print(),
              },
              {
                label: 'Delete',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                variant: 'danger',
                hidden: req.status !== 'DRAFT',
                onClick: async () => {
                  if (!confirm(`Are you sure you want to delete requisition ${req.number}? This cannot be undone.`)) return;
                  try {
                    await api(`/expenses/requisitions/${req.id}`, { method: 'DELETE' });
                    window.location.reload();
                  } catch { /* handled by api */ }
                },
              },
            ]}
          />
        </div>
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
      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/requisitions', from, to), 'requisitions-export.csv')}
        title="Export Requisitions"
      />
    </div>
  );
}

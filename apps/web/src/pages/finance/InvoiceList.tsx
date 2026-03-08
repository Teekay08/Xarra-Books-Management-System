import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Invoice {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  partner?: { name: string };
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOIDED: 'bg-red-50 text-red-400 line-through',
};

export function InvoiceList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<Invoice>>(
        `/finance/invoices?page=${page}&limit=20&search=${encodeURIComponent(search)}${statusFilter ? `&status=${statusFilter}` : ''}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'number', header: 'Invoice #', render: (inv: Invoice) => (
      <span className="font-mono font-medium">{inv.number}</span>
    )},
    { key: 'partner', header: 'Partner', render: (inv: Invoice) => inv.partner?.name ?? '—' },
    { key: 'invoiceDate', header: 'Date', render: (inv: Invoice) =>
      new Date(inv.invoiceDate).toLocaleDateString('en-ZA')
    },
    { key: 'dueDate', header: 'Due Date', render: (inv: Invoice) => {
      if (!inv.dueDate) return '—';
      const due = new Date(inv.dueDate);
      const isOverdue = due < new Date() && !['PAID', 'VOIDED'].includes(inv.status);
      return <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{due.toLocaleDateString('en-ZA')}</span>;
    }},
    { key: 'total', header: 'Total', render: (inv: Invoice) => (
      <span className="font-mono">R {Number(inv.total).toFixed(2)}</span>
    )},
    { key: 'status', header: 'Status', render: (inv: Invoice) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[inv.status] ?? ''}`}>
        {inv.status}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Tax invoices and billing"
        action={
          <button
            onClick={() => navigate('/invoices/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Create Invoice
          </button>
        }
      />

      <div className="mb-4 flex gap-3 items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by invoice number..." />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ISSUED">Issued</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="VOIDED">Voided</option>
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
            onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
            emptyMessage="No invoices yet"
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
        onExport={(from, to) => downloadFromApi(exportUrl('/export/invoices', from, to), 'invoices.csv')}
        title="Export Invoices"
      />
    </div>
  );
}

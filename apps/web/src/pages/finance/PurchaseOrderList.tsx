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
import { ActionMenu } from '../../components/ActionMenu';

interface PurchaseOrder {
  id: string;
  number: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  CLOSED: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<PurchaseOrder>>(
        `/finance/purchase-orders?page=${page}&limit=20&search=${encodeURIComponent(search)}${statusFilter ? `&status=${statusFilter}` : ''}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'number', header: 'PO #', render: (po: PurchaseOrder) => (
      <span className="font-mono font-medium">{po.number}</span>
    )},
    { key: 'supplierName', header: 'Supplier', render: (po: PurchaseOrder) => po.supplierName || '—' },
    { key: 'orderDate', header: 'Order Date', render: (po: PurchaseOrder) =>
      new Date(po.orderDate).toLocaleDateString('en-ZA')
    },
    { key: 'expectedDeliveryDate', header: 'Expected Delivery', render: (po: PurchaseOrder) =>
      po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-ZA') : '—'
    },
    { key: 'total', header: 'Total', render: (po: PurchaseOrder) => (
      <span className="font-mono">R {Number(po.total).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    )},
    { key: 'status', header: 'Status', render: (po: PurchaseOrder) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[po.status] ?? ''}`}>
        {po.status}
      </span>
    )},
    { key: 'actions', header: 'Actions', render: (po: PurchaseOrder) => (
      <div onClick={(e) => e.stopPropagation()}>
        <ActionMenu items={[
          { label: 'View Details', onClick: () => navigate(`/finance/purchase-orders/${po.id}`) },
          { label: 'Edit', onClick: () => navigate(`/finance/purchase-orders/${po.id}/edit`), hidden: po.status !== 'DRAFT' },
          { label: 'Print', onClick: () => window.open(`/api/v1/finance/purchase-orders/${po.id}/pdf`, '_blank') },
          { label: 'Delete', onClick: () => { if (confirm('Delete this purchase order?')) navigate(`/finance/purchase-orders/${po.id}`); }, variant: 'danger', hidden: po.status !== 'DRAFT' },
        ]} />
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Supplier Purchase Orders"
        subtitle="Orders placed by Xarra to external suppliers"
        action={
          <button
            onClick={() => navigate('/finance/purchase-orders/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Create PO
          </button>
        }
      />

      <div className="mb-4 flex gap-3 items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by PO number or supplier..." />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ISSUED">Issued</option>
          <option value="RECEIVED">Received</option>
          <option value="PARTIAL">Partial</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
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
            onRowClick={(po) => navigate(`/finance/purchase-orders/${po.id}`)}
            emptyMessage="No purchase orders yet"
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
        onExport={(from, to) => downloadFromApi(exportUrl('/export/purchase-orders', from, to), 'purchase-orders.csv')}
        title="Export Purchase Orders"
      />
    </div>
  );
}

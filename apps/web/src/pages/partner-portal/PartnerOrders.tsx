import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { partnerApi, type PaginatedResponse } from '../../lib/partner-api';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { PartnerBranchFilter } from '../../components/PartnerBranchFilter';
import { ActionMenu } from '../../components/ActionMenu';

interface Order {
  id: string;
  number: string;
  customerPoNumber: string | null;
  orderDate: string;
  createdAt: string;
  branch: { id: string; name: string } | null;
  status: string;
  lines: any[];
  total: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  DISPATCHED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function PartnerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');

  async function handleExportCsv(from: string, to: string) {
    setExporting(true);
    try {
      // Fetch all orders within date range (no pagination limit)
      const params = new URLSearchParams({ page: '1', limit: '10000' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await partnerApi<PaginatedResponse<Order>>(`/orders?${params}`);

      let filtered = res.data;
      if (from) {
        const fromDate = new Date(from);
        filtered = filtered.filter((o) => new Date(o.createdAt) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to + 'T23:59:59');
        filtered = filtered.filter((o) => new Date(o.createdAt) <= toDate);
      }

      downloadCsv(
        filtered.map((o) => ({
          number: o.number,
          poNumber: o.customerPoNumber ?? '',
          date: new Date(o.createdAt).toLocaleDateString('en-ZA'),
          branch: o.branch?.name ?? '',
          status: o.status,
          items: o.lines?.length ?? 0,
          total: Number(o.total).toFixed(2),
        })),
        [
          { key: 'number', header: 'Order #' },
          { key: 'poNumber', header: 'PO #' },
          { key: 'date', header: 'Date' },
          { key: 'branch', header: 'Branch' },
          { key: 'status', header: 'Status' },
          { key: 'items', header: 'Items' },
          { key: 'total', header: 'Total (R)' },
        ],
        'my-orders.csv',
      );
    } catch {
      // handled by partnerApi
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '20',
        });
        if (statusFilter) {
          params.set('status', statusFilter);
        }
        if (branchFilter) {
          params.set('branchId', branchFilter);
        }
        const res = await partnerApi<PaginatedResponse<Order>>(`/orders?${params}`);
        setOrders(res.data);
        setTotalPages(res.pagination.totalPages);
        setTotal(res.pagination.total);
      } catch {
        // errors handled by partnerApi (401 redirect, etc.)
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [page, statusFilter, branchFilter]);

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function handleBranchChange(value: string) {
    setBranchFilter(value);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and track all your orders placed with Xarra Books.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <PartnerBranchFilter value={branchFilter} onChange={handleBranchChange} />
        {!loading && (
          <p className="text-sm text-gray-500">
            {total} {total === 1 ? 'order' : 'orders'} found
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ExportButton
            loading={exporting}
            options={[
              { label: 'Export CSV', onClick: () => setExportModalOpen(true) },
              { label: 'Print / PDF', onClick: () => window.print() },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            No orders found.{' '}
            {statusFilter && (
              <button
                onClick={() => handleStatusChange('')}
                className="text-primary hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Order #</th>
                  <th className="px-6 py-3 font-medium">Your PO #</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Branch</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Items</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/partner/orders/${order.id}`)}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-3">
                      <span className="font-medium text-primary">
                        {order.number}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {order.customerPoNumber ?? '-'}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(order.createdAt).toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {order.branch?.name ?? '-'}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {order.lines?.length ?? 0}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      R {Number(order.total).toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        items={[
                          {
                            label: 'View Details',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                            onClick: () => navigate(`/partner/orders/${order.id}`),
                          },
                          {
                            label: 'Reorder',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
                            onClick: () => navigate('/partner/catalog'),
                          },
                          {
                            label: 'Track Shipment',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m10 0H3m10 0h2m0 0a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16h-7z" /></svg>,
                            hidden: order.status !== 'DISPATCHED',
                            onClick: () => navigate(`/partner/orders/${order.id}`),
                          },
                          {
                            label: 'Copy Order #',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                            onClick: () => navigator.clipboard.writeText(order.number),
                          },
                          {
                            label: 'Print',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>,
                            onClick: () => window.print(),
                          },
                          {
                            label: 'Delete Order',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                            variant: 'danger',
                            hidden: order.status !== 'DRAFT',
                            onClick: async () => {
                              if (!confirm(`Are you sure you want to delete order ${order.number}? This cannot be undone.`)) return;
                              try {
                                await partnerApi(`/orders/${order.id}`, { method: 'DELETE' });
                                setOrders((prev) => prev.filter((o) => o.id !== order.id));
                                setTotal((t) => t - 1);
                              } catch { /* handled by partnerApi */ }
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <DateRangeExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportCsv}
        title="Export Orders"
      />
    </div>
  );
}

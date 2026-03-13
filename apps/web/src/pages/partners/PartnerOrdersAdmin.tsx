import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';
import { STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface OrderLine {
  id: string;
  titleId: string;
  title: { id: string; title: string; isbn13: string | null } | null;
  quantity: number;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
  qtyConfirmed: number | null;
  qtyDispatched: number | null;
}

interface PartnerOrder {
  id: string;
  number: string;
  customerPoNumber: string | null;
  status: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  orderDate: string;
  createdAt: string;
  deliveryAddress: string | null;
  notes: string | null;
  partner: { id: string; name: string };
  branch: { id: string; name: string } | null;
  placedBy: { name: string } | null;
  lines: OrderLine[];
  courierCompany: string | null;
  courierWaybill: string | null;
  courierTrackingUrl: string | null;
  deliverySignedBy: string | null;
  consignmentId: string | null;
  invoiceId: string | null;
  quotationId: string | null;
}

export function PartnerOrdersAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PartnerOrder | null>(null);
  const [dispatchModal, setDispatchModal] = useState(false);
  const [deliverModal, setDeliverModal] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '' });
  const [deliverSignedBy, setDeliverSignedBy] = useState('');
  const [linkForm, setLinkForm] = useState({ consignmentId: '', invoiceId: '', quotationId: '' });

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['partner-admin-orders', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<PartnerOrder>>(`/partner-admin/orders?${queryParams.toString()}`),
  });

  const detailQuery = useQuery({
    queryKey: ['partner-admin-order', selectedOrder?.id],
    queryFn: () => api<{ data: PartnerOrder }>(`/partner-admin/orders/${selectedOrder!.id}`),
    enabled: !!selectedOrder,
  });

  const orderDetail = detailQuery.data?.data ?? selectedOrder;

  const confirmMut = useMutation({
    mutationFn: () =>
      api(`/partner-admin/orders/${selectedOrder!.id}/confirm`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-order', selectedOrder?.id] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: () =>
      api(`/partner-admin/orders/${selectedOrder!.id}/cancel`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-order', selectedOrder?.id] });
    },
  });

  const processMut = useMutation({
    mutationFn: () =>
      api(`/partner-admin/orders/${selectedOrder!.id}/process`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-order', selectedOrder?.id] });
    },
  });

  const dispatchMut = useMutation({
    mutationFn: (body?: Record<string, unknown>) =>
      api(`/partner-admin/orders/${selectedOrder!.id}/dispatch`, { method: 'POST', body: JSON.stringify(body || {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-order', selectedOrder?.id] });
      setDispatchModal(false);
    },
  });

  const deliverMut = useMutation({
    mutationFn: (body?: Record<string, unknown>) =>
      api(`/partner-admin/orders/${selectedOrder!.id}/deliver`, { method: 'POST', body: JSON.stringify(body || {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-order', selectedOrder?.id] });
      setDeliverModal(false);
    },
  });

  const linkMut = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api(`/partner-admin/orders/${selectedOrder!.id}/link`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-order', selectedOrder?.id] });
      setLinkModal(false);
    },
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    {
      key: 'number',
      header: 'Order #',
      render: (o: PartnerOrder) => (
        <span className="font-medium text-green-700">{o.number}</span>
      ),
    },
    {
      key: 'customerPoNumber',
      header: 'Customer PO #',
      render: (o: PartnerOrder) => o.customerPoNumber ?? '—',
    },
    { key: 'partner', header: 'Partner', render: (o: PartnerOrder) => o.partner?.name ?? '—' },
    { key: 'branch', header: 'Branch', render: (o: PartnerOrder) => o.branch?.name ?? '—' },
    {
      key: 'orderDate',
      header: 'Date',
      render: (o: PartnerOrder) => new Date(o.orderDate || o.createdAt).toLocaleDateString(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o: PartnerOrder) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {o.status}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: (o: PartnerOrder) => `R ${Number(o.total).toFixed(2)}`,
    },
    {
      key: 'placedBy',
      header: 'Placed By',
      render: (o: PartnerOrder) => o.placedBy?.name ?? '—',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (o: PartnerOrder) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={[
            { label: 'View Details', onClick: () => setSelectedOrder(o) },
            { label: 'Confirm', onClick: () => { setSelectedOrder(o); setTimeout(() => confirmMut.mutate(), 0); }, hidden: o.status !== 'SUBMITTED' },
            { label: 'Cancel Order', onClick: () => { if (confirm('Cancel this order?')) { setSelectedOrder(o); setTimeout(() => cancelMut.mutate(), 0); } }, variant: 'danger', hidden: o.status !== 'SUBMITTED' },
            { label: 'Process', onClick: () => { setSelectedOrder(o); setTimeout(() => processMut.mutate(), 0); }, hidden: o.status !== 'CONFIRMED' },
            { label: 'Dispatch', onClick: () => { setSelectedOrder(o); setDispatchForm({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '' }); setDispatchModal(true); }, hidden: !['CONFIRMED', 'PROCESSING'].includes(o.status) },
            { label: 'Mark Delivered', onClick: () => { setSelectedOrder(o); setDeliverSignedBy(''); setDeliverModal(true); }, hidden: o.status !== 'DISPATCHED' },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Partner Book Orders" subtitle="Orders placed by partners and bookstores for Xarra titles" />

      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by order number or partner..." />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="">All Statuses</option>
          {Object.keys(statusColors).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(o) => setSelectedOrder(o)}
            emptyMessage="No orders found"
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

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Order {orderDetail?.number}
              </h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">
                Close
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="py-8 text-center text-gray-400">Loading details...</div>
            ) : orderDetail ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Partner:</span>{' '}
                    <span className="font-medium">{orderDetail.partner.name}</span>
                  </div>
                  {orderDetail.customerPoNumber && (
                    <div>
                      <span className="text-gray-500">Customer PO #:</span>{' '}
                      <span className="font-medium">{orderDetail.customerPoNumber}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Branch:</span>{' '}
                    <span className="font-medium">{orderDetail.branch?.name ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[orderDetail.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {orderDetail.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total:</span>{' '}
                    <span className="font-medium">R {Number(orderDetail.total).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Date:</span>{' '}
                    {new Date(orderDetail.createdAt).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="text-gray-500">Placed By:</span>{' '}
                    {orderDetail.placedBy?.name ?? '—'}
                  </div>
                </div>

                {orderDetail.notes && (
                  <div className="text-sm">
                    <span className="text-gray-500">Notes:</span> {orderDetail.notes}
                  </div>
                )}

                {/* Line Items */}
                {orderDetail.lines && orderDetail.lines.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">Line Items</h4>
                    <div className="overflow-hidden rounded border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {orderDetail.lines.map((line) => (
                            <tr key={line.id}>
                              <td className="px-3 py-2">{line.title?.title ?? line.titleId}</td>
                              <td className="px-3 py-2 text-right">{line.quantity}</td>
                              <td className="px-3 py-2 text-right">R {Number(line.unitPrice).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right">R {Number(line.lineTotal).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Linked Documents */}
                <div className="text-sm">
                  <h4 className="mb-1 font-semibold text-gray-700">Linked Documents</h4>
                  <div className="flex flex-wrap gap-3 text-gray-600">
                    <span>Consignment: {orderDetail.consignmentId ?? '—'}</span>
                    <span>Invoice: {orderDetail.invoiceId ?? '—'}</span>
                    <span>Quotation: {orderDetail.quotationId ?? '—'}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {orderDetail.status === 'SUBMITTED' && (
                    <>
                      <button
                        onClick={() => confirmMut.mutate()}
                        disabled={confirmMut.isPending}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {confirmMut.isPending ? 'Confirming...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Cancel this order?')) cancelMut.mutate();
                        }}
                        disabled={cancelMut.isPending}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {cancelMut.isPending ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </>
                  )}
                  {orderDetail.status === 'CONFIRMED' && (
                    <>
                      <button
                        onClick={() => processMut.mutate()}
                        disabled={processMut.isPending}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {processMut.isPending ? 'Processing...' : 'Process'}
                      </button>
                      <button
                        onClick={() => {
                          setDispatchForm({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '' });
                          setDispatchModal(true);
                        }}
                        className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
                      >
                        Dispatch
                      </button>
                    </>
                  )}
                  {orderDetail.status === 'PROCESSING' && (
                    <button
                      onClick={() => {
                        setDispatchForm({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '' });
                        setDispatchModal(true);
                      }}
                      className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
                    >
                      Dispatch
                    </button>
                  )}
                  {orderDetail.status === 'DISPATCHED' && (
                    <button
                      onClick={() => {
                        setDeliverSignedBy('');
                        setDeliverModal(true);
                      }}
                      className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                    >
                      Mark Delivered
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setLinkForm({
                        consignmentId: orderDetail.consignmentId ?? '',
                        invoiceId: orderDetail.invoiceId ?? '',
                        quotationId: orderDetail.quotationId ?? '',
                      });
                      setLinkModal(true);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Link Documents
                  </button>
                  {!orderDetail.consignmentId && orderDetail.status !== 'CANCELLED' && orderDetail.status !== 'DRAFT' && (
                    <button
                      onClick={() => {
                        // Navigate to consignment create with partner order context
                        navigate(`/consignments/new?partnerId=${orderDetail.partner.id}&partnerOrderId=${orderDetail.id}&branchId=${orderDetail.branch?.id ?? ''}`);
                      }}
                      className="rounded-md border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100"
                    >
                      Create Consignment
                    </button>
                  )}
                  {!orderDetail.invoiceId && orderDetail.status !== 'CANCELLED' && orderDetail.status !== 'DRAFT' && (
                    <button
                      onClick={() => {
                        // Navigate to invoice create with partner order context
                        navigate(`/invoices/new?partnerId=${orderDetail.partner.id}&partnerOrderId=${orderDetail.id}&branchId=${orderDetail.branch?.id ?? ''}`);
                      }}
                      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                    >
                      Create Invoice
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {dispatchModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Dispatch Order</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                dispatchMut.mutate(dispatchForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Courier Company</label>
                <input
                  type="text"
                  value={dispatchForm.courierCompany}
                  onChange={(e) => setDispatchForm((p) => ({ ...p, courierCompany: e.target.value }))}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Waybill Number</label>
                <input
                  type="text"
                  value={dispatchForm.courierWaybill}
                  onChange={(e) => setDispatchForm((p) => ({ ...p, courierWaybill: e.target.value }))}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tracking URL</label>
                <input
                  type="url"
                  value={dispatchForm.courierTrackingUrl}
                  onChange={(e) => setDispatchForm((p) => ({ ...p, courierTrackingUrl: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDispatchModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchMut.isPending}
                  className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {dispatchMut.isPending ? 'Dispatching...' : 'Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deliver Modal */}
      {deliverModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Mark as Delivered</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                deliverMut.mutate({ signedBy: deliverSignedBy });
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Signed By</label>
                <input
                  type="text"
                  value={deliverSignedBy}
                  onChange={(e) => setDeliverSignedBy(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliverModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deliverMut.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {deliverMut.isPending ? 'Saving...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Documents Modal */}
      {linkModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Link Documents</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const body: Record<string, string> = {};
                if (linkForm.consignmentId) body.consignmentId = linkForm.consignmentId;
                if (linkForm.invoiceId) body.invoiceId = linkForm.invoiceId;
                if (linkForm.quotationId) body.quotationId = linkForm.quotationId;
                linkMut.mutate(body);
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Consignment ID</label>
                <input
                  type="text"
                  value={linkForm.consignmentId}
                  onChange={(e) => setLinkForm((p) => ({ ...p, consignmentId: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Invoice ID</label>
                <input
                  type="text"
                  value={linkForm.invoiceId}
                  onChange={(e) => setLinkForm((p) => ({ ...p, invoiceId: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Quotation ID</label>
                <input
                  type="text"
                  value={linkForm.quotationId}
                  onChange={(e) => setLinkForm((p) => ({ ...p, quotationId: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLinkModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkMut.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {linkMut.isPending ? 'Linking...' : 'Save Links'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

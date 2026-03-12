import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { partnerApi } from '../../lib/partner-api';

interface OrderLineTitle {
  id: string;
  title: string;
  isbn13: string | null;
}

interface OrderLine {
  id: string;
  titleId: string;
  quantity: number;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
  qtyConfirmed: number | null;
  qtyDispatched: number | null;
  title: OrderLineTitle | null;
}

interface OrderBranch {
  id: string;
  name: string;
}

interface PlacedByUser {
  id: string;
  name: string;
}

interface OrderDetail {
  id: string;
  number: string;
  customerPoNumber: string | null;
  status: string;
  orderDate: string;
  createdAt: string;
  deliveryAddress: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  // Courier fields (flat on the order)
  courierCompany: string | null;
  courierWaybill: string | null;
  courierTrackingUrl: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  // Linked document IDs
  consignmentId: string | null;
  invoiceId: string | null;
  quotationId: string | null;
  // Relations
  branch: OrderBranch | null;
  placedBy: PlacedByUser | null;
  lines: OrderLine[];
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

export function PartnerOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPo, setEditingPo] = useState(false);
  const [poValue, setPoValue] = useState('');
  const [savingPo, setSavingPo] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError(null);
      try {
        const res = await partnerApi<{ data: OrderDetail }>(`/orders/${id}`);
        setOrder(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  async function handleSavePo() {
    setSavingPo(true);
    try {
      const res = await partnerApi<{ data: OrderDetail }>(`/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ customerPoNumber: poValue }),
      });
      setOrder((prev) => prev ? { ...prev, customerPoNumber: res.data.customerPoNumber } : prev);
      setEditingPo(false);
    } catch (err: any) {
      alert(err.message || 'Failed to update PO number');
    } finally {
      setSavingPo(false);
    }
  }

  async function handleCancel() {
    if (!order) return;
    const confirmed = window.confirm(
      `Are you sure you want to cancel order ${order.number}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setCancelling(true);
    try {
      await partnerApi(`/orders/${id}/cancel`, { method: 'POST' });
      setOrder((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link to="/partner/orders" className="text-sm font-medium text-primary hover:underline">
          &larr; Back to Orders
        </Link>
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-sm text-red-600">{error || 'Order not found'}</p>
        </div>
      </div>
    );
  }

  const canCancel = order.status === 'DRAFT' || order.status === 'SUBMITTED';
  const hasCourier = !!(order.courierCompany || order.courierWaybill);
  const hasLinkedDocs = !!(order.consignmentId || order.invoiceId || order.quotationId);

  return (
    <div className="space-y-6">
      {/* Back link & Header */}
      <div>
        <Link to="/partner/orders" className="text-sm font-medium text-primary hover:underline">
          &larr; Back to Orders
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{order.number}</h1>
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-800'}`}
          >
            {order.status}
          </span>
        </div>
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Order'}
          </button>
        )}
      </div>

      {/* Order Info */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Order Information</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Date Placed</p>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(order.orderDate || order.createdAt).toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Your PO Number</p>
            {editingPo ? (
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={poValue}
                  onChange={(e) => setPoValue(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Enter PO number"
                  autoFocus
                />
                <button
                  onClick={handleSavePo}
                  disabled={savingPo}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingPo ? '...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingPo(false)}
                  className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <p className="text-sm text-gray-900">{order.customerPoNumber ?? '-'}</p>
                <button
                  onClick={() => { setPoValue(order.customerPoNumber ?? ''); setEditingPo(true); }}
                  className="text-primary hover:text-primary/80 transition-colors"
                  title="Edit PO number"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Branch</p>
            <p className="mt-1 text-sm text-gray-900">{order.branch?.name ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Delivery Address</p>
            <p className="mt-1 text-sm text-gray-900">{order.deliveryAddress ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Placed By</p>
            <p className="mt-1 text-sm text-gray-900">{order.placedBy?.name ?? '-'}</p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-600">
                <th className="px-6 py-3 font-medium">Title</th>
                <th className="px-6 py-3 font-medium">ISBN</th>
                <th className="px-6 py-3 font-medium text-right">Qty Ordered</th>
                <th className="px-6 py-3 font-medium text-right">Qty Confirmed</th>
                <th className="px-6 py-3 font-medium text-right">Qty Dispatched</th>
                <th className="px-6 py-3 font-medium text-right">Unit Price</th>
                <th className="px-6 py-3 font-medium text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.lines ?? []).map((line) => (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="px-6 py-3 text-gray-900">{line.title?.title ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-600 font-mono text-xs">{line.title?.isbn13 ?? '-'}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{line.quantity}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{line.qtyConfirmed ?? '-'}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{line.qtyDispatched ?? '-'}</td>
                  <td className="px-6 py-3 text-right text-gray-600">
                    R {Number(line.unitPrice).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">
                    R {Number(line.lineTotal).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Totals */}
        <div className="border-t px-6 py-4">
          <div className="ml-auto w-full max-w-xs space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>R {Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>VAT (15%)</span>
              <span>R {Number(order.vatAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold text-gray-900">
              <span>Total</span>
              <span>R {Number(order.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Courier Tracking */}
      {hasCourier && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Courier Tracking</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Courier Company</p>
              <p className="mt-1 text-sm text-gray-900">{order.courierCompany ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Waybill Number</p>
              <p className="mt-1 text-sm text-gray-900 font-mono">{order.courierWaybill ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Tracking</p>
              {order.courierTrackingUrl ? (
                <a
                  href={order.courierTrackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                >
                  Track Shipment &rarr;
                </a>
              ) : (
                <p className="mt-1 text-sm text-gray-500">No tracking link available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Linked Documents */}
      {hasLinkedDocs && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Linked Documents</h2>
          </div>
          <div className="px-6 py-4">
            <div className="flex flex-wrap gap-3">
              {order.invoiceId && (
                <Link
                  to="/partner/invoices"
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Invoice
                </Link>
              )}
              {order.consignmentId && (
                <Link
                  to="/partner/consignments"
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Consignment
                </Link>
              )}
              {order.quotationId && (
                <Link
                  to="/partner/orders"
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Quotation
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

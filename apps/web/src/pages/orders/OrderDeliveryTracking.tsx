import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';

interface DispatchedOrder {
  id: string;
  number: string;
  partner?: { id: string; name: string } | null;
  partnerName?: string | null;
  branch?: { id: string; name: string } | null;
  branchName?: string | null;
  deliveryAddress?: string | null;
  status: string;
  dispatchedAt?: string | null;
  expectedDeliveryDate?: string | null;
  deliveredAt?: string | null;
  deliverySignedBy?: string | null;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  courierTrackingUrl?: string | null;
  currentPipelineStep: number;
  lines?: Array<{ quantity: number }>;
  itemCount?: number;
}

const fmt = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysAgo = (d: string | null | undefined): number => {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
};

const isOverdue = (order: DispatchedOrder): boolean => {
  if (order.status !== 'DISPATCHED') return false;
  if (!order.expectedDeliveryDate) return false;
  return new Date(order.expectedDeliveryDate) < new Date();
};

// ── Delivery confirm inline form ─────────────────────────────────────────────
interface ConfirmFormProps {
  order: DispatchedOrder;
  onConfirm: (data: { deliverySignedBy: string; notes: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function DeliveryConfirmForm({ order, onConfirm, onCancel, isPending }: ConfirmFormProps) {
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-lg">
      <p className="text-sm font-semibold text-green-800 mb-3">
        Confirm delivery for {order.number}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Signed by <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={signedBy}
            onChange={e => setSignedBy(e.target.value)}
            placeholder="Name of person who signed"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any delivery notes (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onConfirm({ deliverySignedBy: signedBy, notes })}
          disabled={isPending || !signedBy.trim()}
          className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {isPending ? 'Saving…' : '✓ Mark Delivered'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Order row ─────────────────────────────────────────────────────────────────
interface OrderRowProps {
  order: DispatchedOrder;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelivered: (data: { deliverySignedBy: string; notes: string }) => void;
  isPending: boolean;
}

function OrderRow({ order, isExpanded, onToggleExpand, onDelivered, isPending }: OrderRowProps) {
  const overdue = isOverdue(order);
  const daysInTransit = daysAgo(order.dispatchedAt);
  const itemCount = order.itemCount ?? order.lines?.reduce((s, l) => s + l.quantity, 0) ?? 0;

  return (
    <div className={`p-4 ${overdue ? 'bg-red-50' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Left: order info */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/orders/${order.id}`}
              className="font-mono text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              {order.number}
            </Link>

            {order.status === 'DISPATCHED' && (
              overdue ? (
                <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                  ⚠ Overdue
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                  In Transit
                </span>
              )
            )}

            {order.status === 'DELIVERED' && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                ✓ Delivered
              </span>
            )}

            {daysInTransit > 0 && order.status === 'DISPATCHED' && (
              <span className={`text-xs font-medium ${daysInTransit > 5 ? 'text-red-500' : 'text-gray-400'}`}>
                {daysInTransit}d in transit
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 font-medium">
            {order.partner?.name ?? order.partnerName ?? '—'}
            {(order.branch?.name ?? order.branchName) && (
              <span className="text-gray-400 font-normal"> — {order.branch?.name ?? order.branchName}</span>
            )}
          </p>

          {order.deliveryAddress && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {order.deliveryAddress}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {order.dispatchedAt && <span>Dispatched: {fmt(order.dispatchedAt)}</span>}
            {order.expectedDeliveryDate && (
              <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                Expected: {fmt(order.expectedDeliveryDate)}
                {overdue && ' (overdue)'}
              </span>
            )}
            {order.deliveredAt && <span className="text-green-600">Delivered: {fmt(order.deliveredAt)}</span>}
            {itemCount > 0 && <span>{itemCount} unit{itemCount !== 1 ? 's' : ''}</span>}
          </div>

          {/* Courier info */}
          {(order.courierCompany || order.courierWaybill) && (
            <div className="flex items-center gap-3 text-xs mt-1">
              <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {order.courierCompany && (
                <span className="text-gray-600 font-medium">{order.courierCompany}</span>
              )}
              {order.courierWaybill && (
                order.courierTrackingUrl ? (
                  <a
                    href={order.courierTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-mono"
                  >
                    {order.courierWaybill} ↗
                  </a>
                ) : (
                  <span className="text-gray-500 font-mono">{order.courierWaybill}</span>
                )
              )}
            </div>
          )}

          {order.status === 'DELIVERED' && order.deliverySignedBy && (
            <p className="text-xs text-gray-500">Signed by: <span className="font-medium text-gray-700">{order.deliverySignedBy}</span></p>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex gap-2 flex-shrink-0 items-start">
          <a
            href={`/api/v1/order-tracking/orders/${order.id}/delivery-note`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Delivery Note
          </a>
          {order.status === 'DISPATCHED' && (
            <button
              onClick={onToggleExpand}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                isExpanded
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isExpanded ? 'Cancel' : '✓ Confirm Delivered'}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <DeliveryConfirmForm
          order={order}
          onConfirm={onDelivered}
          onCancel={onToggleExpand}
          isPending={isPending}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function OrderDeliveryTracking() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState<'DISPATCHED' | 'DELIVERED'>('DISPATCHED');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as any)._t);
    (handleSearch as any)._t = setTimeout(() => setDebouncedSearch(v), 300);
  }, []);

  const { data: inTransitData, isLoading: loadingTransit } = useQuery({
    queryKey: ['delivery-tracking-transit', debouncedSearch],
    queryFn: () => api<PaginatedResponse<DispatchedOrder>>(
      `/partner-admin/orders?status=DISPATCHED&limit=100&search=${encodeURIComponent(debouncedSearch)}`
    ),
  });

  const { data: deliveredData, isLoading: loadingDelivered } = useQuery({
    queryKey: ['delivery-tracking-delivered', debouncedSearch],
    queryFn: () => api<PaginatedResponse<DispatchedOrder>>(
      `/partner-admin/orders?status=DELIVERED&limit=50&search=${encodeURIComponent(debouncedSearch)}`
    ),
  });

  const deliverMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; deliverySignedBy: string; notes: string }) =>
      api(`/partner-admin/orders/${id}/deliver`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-tracking-transit'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-tracking-delivered'] });
      queryClient.invalidateQueries({ queryKey: ['orders-hub'] });
      setExpandedId(null);
    },
  });

  const inTransit = inTransitData?.data ?? [];
  const delivered = deliveredData?.data ?? [];
  const isLoading = tab === 'DISPATCHED' ? loadingTransit : loadingDelivered;
  const orders = tab === 'DISPATCHED' ? inTransit : delivered;

  const overdueCount = inTransit.filter(isOverdue).length;
  const deliveredTodayCount = delivered.filter(o => {
    if (!o.deliveredAt) return false;
    const d = new Date(o.deliveredAt);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Tracking"
        subtitle="Monitor dispatched orders and confirm deliveries"
        backTo={{ href: '/orders', label: 'Order Management' }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'In Transit',
            value: loadingTransit ? '…' : inTransit.length,
            color: 'text-purple-700',
            border: 'border-purple-200',
            bg: 'bg-purple-50',
          },
          {
            label: 'Overdue',
            value: loadingTransit ? '…' : overdueCount,
            color: overdueCount > 0 ? 'text-red-700' : 'text-gray-400',
            border: overdueCount > 0 ? 'border-red-200' : 'border-gray-200',
            bg: overdueCount > 0 ? 'bg-red-50' : 'bg-gray-50',
          },
          {
            label: 'Delivered Today',
            value: loadingDelivered ? '…' : deliveredTodayCount,
            color: 'text-green-700',
            border: 'border-green-200',
            bg: 'bg-green-50',
          },
          {
            label: 'Recently Delivered',
            value: loadingDelivered ? '…' : delivered.length,
            color: 'text-gray-600',
            border: 'border-gray-200',
            bg: 'bg-gray-50',
          },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.border} ${card.bg}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-0 gap-3 border-b border-gray-100">
          <div className="flex gap-1">
            <button
              onClick={() => setTab('DISPATCHED')}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                tab === 'DISPATCHED'
                  ? 'text-[#8B1A1A] border-[#8B1A1A]'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              In Transit
              {!loadingTransit && inTransit.length > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  overdueCount > 0 ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {overdueCount > 0 ? `${overdueCount} overdue` : inTransit.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('DELIVERED')}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                tab === 'DELIVERED'
                  ? 'text-[#8B1A1A] border-[#8B1A1A]'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              Recently Delivered
              {!loadingDelivered && delivered.length > 0 && (
                <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                  {delivered.length}
                </span>
              )}
            </button>
          </div>
          <div className="pb-2">
            <SearchBar value={search} onChange={handleSearch} placeholder="Search order, waybill, partner…" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading orders…</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">
              {tab === 'DISPATCHED'
                ? debouncedSearch ? 'No in-transit orders match your search.' : 'No orders currently in transit.'
                : debouncedSearch ? 'No delivered orders match your search.' : 'No recently delivered orders.'}
            </p>
            {tab === 'DISPATCHED' && !debouncedSearch && (
              <p className="text-xs text-gray-400 mt-1">Orders will appear here once dispatched from the processing queue.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map(order => (
              <OrderRow
                key={order.id}
                order={order}
                isExpanded={expandedId === order.id}
                onToggleExpand={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onDelivered={data => deliverMutation.mutate({ id: order.id, ...data })}
                isPending={deliverMutation.isPending && deliverMutation.variables?.id === order.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

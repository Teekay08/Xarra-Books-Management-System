import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: string;
  number: string;
  consignmentId?: string | null;
  partner?: { id: string; name: string } | null;
  partnerName?: string | null;
  branch?: { id: string; name: string } | null;
  branchName?: string | null;
  lines?: Array<unknown>;
  itemCount?: number;
  status: string;
  source?: string | null;
  customerPoNumber?: string | null;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  courierTrackingUrl?: string | null;
  expectedDeliveryDate?: string | null;
  deliveredAt?: string | null;
  deliverySignedBy?: string | null;
  backorderEta?: string | null;
  holdReason?: string | null;
  backorderNotes?: string | null;
  confirmedAt?: string | null;
  createdAt: string;
  dispatchedAt?: string | null;
}

interface HubStats {
  received: number;
  processing: number;
  inTransit: number;
  backOrders: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(date?: string | null): string {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function daysInTransit(dateStr?: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const SOURCE_LABELS: Record<string, string> = {
  PORTAL: 'Portal', ADMIN_ENTRY: 'Staff', EMAIL_PO: 'Email',
  PHONE: 'Phone', FAX: 'Fax', MANUAL: 'Walk-in', MAGIC_LINK: 'Magic Link',
};

const STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  RECEIVED:   { label: 'Received',   color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500' },
  SUBMITTED:  { label: 'Received',   color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500' },
  CONFIRMED:  { label: 'Confirmed',  color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500' },
  PROCESSING: { label: 'Processing', color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500' },
  DISPATCHED: { label: 'Dispatched', color: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
  DELIVERED:  { label: 'Delivered',  color: 'bg-green-50 text-green-700',   dot: 'bg-green-500' },
  BACK_ORDER: { label: 'Back Order', color: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-500' },
  CANCELLED:  { label: 'Cancelled',  color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
  DRAFT:      { label: 'Draft',      color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PartnerCell({ order }: { order: OrderSummary }) {
  const name   = order.partner?.name ?? order.partnerName ?? '—';
  const branch = order.branch?.name ?? order.branchName;
  return (
    <div>
      <p className="font-medium text-sm text-gray-900">{name}</p>
      {branch && <p className="text-xs text-gray-500">{branch}</p>}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading…
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-gray-400 text-center py-12 bg-white rounded-xl border border-gray-200">{message}</p>;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'incoming' | 'confirmed' | 'backorders' | 'delivery';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',   label: 'Overview' },
  { key: 'incoming',   label: 'Incoming' },
  { key: 'confirmed',  label: 'Confirmed' },
  { key: 'backorders', label: 'Back Orders' },
  { key: 'delivery',   label: 'Delivery' },
];

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats, onSwitchTab }: { stats?: HubStats; onSwitchTab: (tab: Tab) => void }) {
  const { data: recentData } = useQuery({
    queryKey: ['orders-recent-activity'],
    queryFn: () => api<PaginatedResponse<OrderSummary>>(
      '/partner-admin/orders?limit=15&page=1&status=RECEIVED,SUBMITTED,CONFIRMED,PROCESSING,DISPATCHED,BACK_ORDER'
    ),
    staleTime: 30_000,
  });
  const recent = recentData?.data ?? [];

  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'error'; message: string; tab: Tab; linkLabel: string }[] = [];
    if ((stats?.received ?? 0) > 0)
      list.push({ type: 'warn', message: `${stats!.received} order(s) received and awaiting confirmation`, tab: 'incoming', linkLabel: 'Review Incoming' });
    if ((stats?.backOrders ?? 0) > 0)
      list.push({ type: 'warn', message: `${stats!.backOrders} order(s) on back order`, tab: 'backorders', linkLabel: 'View Back Orders' });
    return list;
  }, [stats]);

  return (
    <div className="space-y-6 p-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Incoming',    value: stats?.received ?? 0,   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   tab: 'incoming'   as Tab },
          { label: 'Processing',  value: stats?.processing ?? 0, color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  tab: 'confirmed'  as Tab },
          { label: 'In Transit',  value: stats?.inTransit ?? 0,  color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', tab: 'delivery'   as Tab },
          { label: 'Back Orders', value: stats?.backOrders ?? 0, color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', tab: 'backorders' as Tab },
        ].map(c => (
          <button key={c.label} onClick={() => onSwitchTab(c.tab)}
            className={`rounded-xl border ${c.border} ${c.bg} p-4 text-left hover:opacity-80 transition-opacity`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </button>
        ))}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
              a.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span>⚠ {a.message}</span>
              <button onClick={() => onSwitchTab(a.tab)} className="font-semibold underline ml-4 whitespace-nowrap">{a.linkLabel}</button>
            </div>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '+ Capture Order',    href: '/orders/new',       color: 'bg-[#8B1A1A] text-white hover:bg-[#7a1717]' },
          { label: 'Processing Queue',   href: '/orders/processing', color: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' },
          { label: 'Account Settlement', href: '/settlement',        color: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' },
          { label: 'All Returns',        href: '/orders/returns',    color: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' },
        ].map(l => (
          <Link key={l.href} to={l.href} className={`rounded-lg px-4 py-2.5 text-sm font-medium text-center transition-colors ${l.color}`}>
            {l.label}
          </Link>
        ))}
      </div>

      {/* Recent active orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Recent Orders</h3>
          <span className="text-xs text-gray-400">Active orders only</span>
        </div>
        <div className="divide-y divide-gray-50">
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No active orders.</p>
          ) : recent.map(order => (
            <div key={order.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <Link to={`/orders/${order.id}`} className="font-mono text-sm font-semibold text-blue-600 hover:underline">
                  {order.number}
                </Link>
                <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={order.status} />
                <span className="text-xs text-gray-400">{formatAge(order.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Incoming Tab ─────────────────────────────────────────────────────────────
// Shows RECEIVED (staff-captured) and SUBMITTED (portal) orders only.
// DRAFT orders are still with the partner and cannot be confirmed here.
// "Confirm" is the primary action — shown as a visible button, not in the menu.

function IncomingTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders-incoming', page, search],
    queryFn: () => api<PaginatedResponse<OrderSummary>>(
      `/partner-admin/orders?page=${page}&limit=20&status=RECEIVED,SUBMITTED&search=${encodeURIComponent(search)}`
    ),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api(`/partner-admin/orders/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-incoming'] });
      queryClient.invalidateQueries({ queryKey: ['order-hub-stats'] });
    },
    onError: (err: any) => alert(`Failed to confirm order: ${err?.message ?? 'Unknown error'}`),
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Incoming Orders</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Orders received from the partner portal and staff-captured orders awaiting confirmation.
          </p>
        </div>
        <Link to="/orders/new" className="px-3 py-1.5 bg-[#8B1A1A] text-white rounded-lg text-xs font-medium hover:bg-[#7a1717] transition-colors">
          + Capture Order
        </Link>
      </div>

      <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by order number, partner…" />

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message="No incoming orders. All received orders have been confirmed." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Number', 'Partner / Branch', 'Source', 'PO Ref', 'Items', 'Age', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => {
                const isConfirming = confirmMutation.isPending && confirmMutation.variables === order.id;
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                    </td>
                    <td className="px-4 py-3"><PartnerCell order={order} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{SOURCE_LABELS[order.source ?? ''] ?? order.source ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">{order.customerPoNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{order.itemCount ?? order.lines?.length ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatAge(order.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => confirmMutation.mutate(order.id)}
                          disabled={isConfirming}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {isConfirming ? 'Confirming…' : 'Confirm →'}
                        </button>
                        <ActionMenu items={[
                          { label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.pagination && (
            <div className="px-4 py-3 border-t border-gray-100">
              <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Confirmed Tab ────────────────────────────────────────────────────────────
// Shows only CONFIRMED orders (not PROCESSING — those are already in the queue).
// "Send to Processing" sets the order to the PICKING pipeline step, transitioning
// it to PROCESSING status and handing it off to the warehouse team.

function ConfirmedTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders-confirmed', page, search],
    queryFn: () => api<PaginatedResponse<OrderSummary>>(
      `/partner-admin/orders?page=${page}&limit=20&status=CONFIRMED&search=${encodeURIComponent(search)}`
    ),
  });

  const sendToProcessingMutation = useMutation({
    mutationFn: (id: string) => api(`/order-tracking/orders/${id}/pipeline-step`, {
      method: 'POST',
      body: JSON.stringify({ step: 'PICKING', notes: 'Sent to processing queue' }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-confirmed'] });
      queryClient.invalidateQueries({ queryKey: ['order-hub-stats'] });
    },
    onError: (err: any) => alert(`Failed to send order to processing: ${err?.message ?? 'Unknown error'}`),
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Confirmed Orders</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Orders confirmed and ready to hand off to the warehouse for picking and packing.
        </p>
      </div>

      <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search confirmed orders…" />

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message="No confirmed orders awaiting processing." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Number', 'Partner / Branch', 'PO Ref', 'Items', 'Confirmed', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => {
                const isSending = sendToProcessingMutation.isPending && sendToProcessingMutation.variables === order.id;
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                    </td>
                    <td className="px-4 py-3"><PartnerCell order={order} /></td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">{order.customerPoNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{order.itemCount ?? order.lines?.length ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatAge(order.confirmedAt ?? order.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => sendToProcessingMutation.mutate(order.id)}
                          disabled={isSending}
                          className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          {isSending ? 'Sending…' : 'Send to Processing →'}
                        </button>
                        <ActionMenu items={[
                          { label: 'View Details',          onClick: () => navigate(`/orders/${order.id}`) },
                          { label: 'View Processing Queue', onClick: () => navigate('/orders/processing') },
                        ]} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.pagination && (
            <div className="px-4 py-3 border-t border-gray-100">
              <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Back Orders Tab ──────────────────────────────────────────────────────────

const HOLD_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Out of Stock', REPRINTING: 'Reprinting', SUPPLIER_DELAY: 'Supplier Delay',
  CUSTOMS_HOLD: 'Customs Hold', PARTNER_REQUEST: 'Partner Request', OTHER: 'Other',
};

function BackOrdersTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState<'all' | 'pastEta' | 'noEta'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ backorderEta: '', holdReason: '', backorderNotes: '' });

  const now = new Date();

  const { data, isLoading } = useQuery({
    queryKey: ['orders-backorders', page, search],
    queryFn: () => api<PaginatedResponse<OrderSummary>>(
      `/partner-admin/orders?page=${page}&limit=20&status=BACK_ORDER&search=${encodeURIComponent(search)}`
    ),
  });

  const allOrders  = data?.data ?? [];
  const filtered   = useMemo(() => {
    if (subTab === 'pastEta') return allOrders.filter(o => o.backorderEta && new Date(o.backorderEta) < now);
    if (subTab === 'noEta')   return allOrders.filter(o => !o.backorderEta);
    return allOrders;
  }, [allOrders, subTab, now.toDateString()]);

  const pastEtaCount = allOrders.filter(o => o.backorderEta && new Date(o.backorderEta) < now).length;
  const noEtaCount   = allOrders.filter(o => !o.backorderEta).length;

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof editForm }) =>
      api(`/order-tracking/orders/${id}/backorder`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-backorders'] });
      setEditingId(null);
    },
    onError: (err: any) => alert(`Failed to save: ${err?.message ?? 'Unknown error'}`),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => api(`/order-tracking/orders/${id}/pipeline-step`, {
      method: 'POST', body: JSON.stringify({ step: 'CONFIRMED' }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-backorders'] });
      queryClient.invalidateQueries({ queryKey: ['order-hub-stats'] });
    },
    onError: (err: any) => alert(`Failed to release order: ${err?.message ?? 'Unknown error'}`),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Back Orders</h3>
          <p className="text-xs text-gray-500 mt-0.5">Orders on hold due to stock issues. Set ETAs and release when stock is available.</p>
        </div>
        <div className="flex gap-2 text-xs">
          {pastEtaCount > 0 && <span className="px-2 py-1 bg-red-50 text-red-700 rounded-full font-semibold">{pastEtaCount} past ETA</span>}
          {noEtaCount   > 0 && <span className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded-full font-semibold">{noEtaCount} no ETA</span>}
        </div>
      </div>

      <div className="flex gap-2 items-center justify-between">
        <div className="flex gap-1">
          {([['all', 'All'], ['pastEta', 'Past ETA'], ['noEta', 'No ETA']] as [string, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k as any)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${subTab === k ? 'bg-[#8B1A1A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search backorders…" />
      </div>

      {isLoading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <EmptyState message={subTab === 'all' ? 'No back orders. All clear!' : 'No orders in this category.'} />
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map(order => {
              const etaDate  = order.backorderEta ? new Date(order.backorderEta) : null;
              const daysToEta = etaDate ? Math.ceil((etaDate.getTime() - now.getTime()) / 86400000) : null;
              const isEditing    = editingId === order.id;
              const isUpdating   = updateMutation.isPending  && updateMutation.variables?.id  === order.id;
              const isReleasing  = releaseMutation.isPending && releaseMutation.variables     === order.id;

              return (
                <div key={order.id} className={`bg-white rounded-xl border p-4 ${
                  daysToEta !== null && daysToEta < 0 ? 'border-red-200' :
                  daysToEta !== null && daysToEta <= 3 ? 'border-orange-200' : 'border-gray-200'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                        <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                        {order.holdReason && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {HOLD_REASON_LABELS[order.holdReason] ?? order.holdReason}
                          </span>
                        )}
                        {daysToEta !== null && (
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            daysToEta < 0 ? 'bg-red-100 text-red-700' :
                            daysToEta <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                          }`}>
                            ETA: {etaDate!.toLocaleDateString('en-ZA')}
                            {daysToEta < 0 ? ` (${Math.abs(daysToEta)}d overdue)` : daysToEta === 0 ? ' (today)' : ` (${daysToEta}d)`}
                          </span>
                        )}
                        {!order.backorderEta && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-semibold">No ETA set</span>
                        )}
                      </div>
                      {order.backorderNotes && (
                        <p className="text-xs text-gray-500 mt-1">{order.backorderNotes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(isEditing ? null : order.id);
                          setEditForm({
                            backorderEta:   order.backorderEta?.split('T')[0] ?? '',
                            holdReason:     order.holdReason ?? '',
                            backorderNotes: order.backorderNotes ?? '',
                          });
                        }}
                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                      >
                        {isEditing ? 'Cancel' : 'Edit ETA'}
                      </button>
                      <button
                        onClick={() => releaseMutation.mutate(order.id)}
                        disabled={isReleasing}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isReleasing ? 'Releasing…' : 'Release →'}
                      </button>
                      <ActionMenu items={[{ label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) }]} />
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Expected Fulfilment Date</label>
                        <input type="date" value={editForm.backorderEta}
                          onChange={e => setEditForm(f => ({ ...f, backorderEta: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Hold Reason</label>
                        <select value={editForm.holdReason}
                          onChange={e => setEditForm(f => ({ ...f, holdReason: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none">
                          <option value="">Select reason…</option>
                          {Object.entries(HOLD_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                        <input type="text" value={editForm.backorderNotes}
                          onChange={e => setEditForm(f => ({ ...f, backorderNotes: e.target.value }))}
                          placeholder="Optional notes…"
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                      </div>
                      <div className="sm:col-span-3 flex justify-end">
                        <button
                          onClick={() => updateMutation.mutate({ id: order.id, body: editForm })}
                          disabled={isUpdating}
                          className="px-4 py-1.5 bg-[#8B1A1A] text-white rounded text-xs font-medium hover:bg-[#7a1717] transition-colors disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination — server-side since we no longer fetch a flat 100-limit batch */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="px-4 py-3">
              <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Delivery Tab ─────────────────────────────────────────────────────────────

function DeliveryTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState<'transit' | 'delivered'>('transit');
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({ deliverySignedBy: '', notes: '' });
  const [deliveryPage, setDeliveryPage] = useState(1);

  const { data: transitData, isLoading: transitLoading } = useQuery({
    queryKey: ['orders-in-transit', search],
    queryFn: () => api<PaginatedResponse<OrderSummary>>(
      `/partner-admin/orders?status=DISPATCHED&limit=50&page=1&search=${encodeURIComponent(search)}`
    ),
  });

  const { data: deliveredData, isLoading: deliveredLoading } = useQuery({
    queryKey: ['orders-delivered', search, deliveryPage],
    queryFn: () => api<PaginatedResponse<OrderSummary>>(
      `/partner-admin/orders?status=DELIVERED&limit=20&page=${deliveryPage}&search=${encodeURIComponent(search)}`
    ),
  });

  const deliverMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { deliverySignedBy: string; notes: string } }) =>
      api(`/partner-admin/orders/${id}/deliver`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-in-transit'] });
      queryClient.invalidateQueries({ queryKey: ['orders-delivered'] });
      queryClient.invalidateQueries({ queryKey: ['order-hub-stats'] });
      setDeliveringId(null);
      setDeliveryForm({ deliverySignedBy: '', notes: '' });
    },
    onError: (err: any) => alert(`Failed to confirm delivery: ${err?.message ?? 'Unknown error'}`),
  });

  const transitOrders  = transitData?.data ?? [];
  const deliveredOrders = deliveredData?.data ?? [];
  const isLoading = subTab === 'transit' ? transitLoading : deliveredLoading;

  const now          = new Date();
  const inTransitCount  = transitData?.pagination?.total ?? transitOrders.length;
  const overdueCount    = transitOrders.filter(o => o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) < now).length;
  const deliveredToday  = deliveredOrders.filter(o => o.deliveredAt && new Date(o.deliveredAt).toDateString() === now.toDateString()).length;

  return (
    <div className="space-y-4 p-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'In Transit',      value: inTransitCount, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
          { label: 'Overdue',         value: overdueCount,   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
          { label: 'Delivered Today', value: deliveredToday, color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border ${c.border} ${c.bg} p-3`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {([['transit', 'In Transit'], ['delivered', 'Recently Delivered']] as [string, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k as any)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${subTab === k ? 'bg-[#8B1A1A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search orders…" />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <>
          {subTab === 'transit' && (transitOrders.length === 0 ? (
            <EmptyState message="No orders currently in transit." />
          ) : (
            <div className="space-y-3">
              {transitOrders.map(order => {
                const days        = daysInTransit(order.dispatchedAt);
                const overdue     = order.expectedDeliveryDate && new Date(order.expectedDeliveryDate) < now;
                const isOpen      = deliveringId === order.id;
                const isDelivering = deliverMutation.isPending && deliverMutation.variables?.id === order.id;

                return (
                  <div key={order.id} className={`bg-white rounded-xl border p-4 ${overdue ? 'border-red-200' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                          <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                          {overdue && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">Overdue</span>}
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${days > 5 ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                            {days}d in transit
                          </span>
                        </div>
                        {order.courierCompany && (
                          <p className="text-xs text-gray-500 mt-1">
                            {order.courierCompany}
                            {order.courierWaybill && <> · Waybill: <span className="font-mono">{order.courierWaybill}</span></>}
                            {order.courierTrackingUrl && (
                              <> · <a href={order.courierTrackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Track</a></>
                            )}
                          </p>
                        )}
                        {order.expectedDeliveryDate && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Expected: {new Date(order.expectedDeliveryDate).toLocaleDateString('en-ZA')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={`/api/v1/order-tracking/orders/${order.id}/delivery-note`}
                          target="_blank" rel="noopener noreferrer"
                          className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                        >
                          Delivery Note
                        </a>
                        <button
                          onClick={() => {
                            setDeliveringId(isOpen ? null : order.id);
                            if (!isOpen) setDeliveryForm({ deliverySignedBy: '', notes: '' });
                          }}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          {isOpen ? 'Cancel' : 'Confirm Delivered'}
                        </button>
                        <ActionMenu items={[{ label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) }]} />
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Signed By <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={deliveryForm.deliverySignedBy}
                            onChange={e => setDeliveryForm(f => ({ ...f, deliverySignedBy: e.target.value }))}
                            placeholder="Name of person who signed"
                            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                          <input
                            type="text"
                            value={deliveryForm.notes}
                            onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Condition, comments…"
                            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2 flex justify-end">
                          <button
                            onClick={() => deliverMutation.mutate({ id: order.id, body: deliveryForm })}
                            disabled={!deliveryForm.deliverySignedBy.trim() || isDelivering}
                            className="px-4 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            {isDelivering ? 'Saving…' : 'Mark as Delivered'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {subTab === 'delivered' && (deliveredOrders.length === 0 ? (
            <EmptyState message="No recently delivered orders." />
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Number', 'Partner', 'Delivered', 'Signed By', 'Courier', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {deliveredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                        </td>
                        <td className="px-4 py-3"><PartnerCell order={order} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-ZA') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{order.deliverySignedBy ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{order.courierCompany ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/api/v1/order-tracking/orders/${order.id}/delivery-note`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Delivery Note
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {deliveredData?.pagination && deliveredData.pagination.totalPages > 1 && (
                <div className="px-4 py-3">
                  <Pagination page={deliveryPage} totalPages={deliveredData.pagination.totalPages} total={deliveredData.pagination.total} onPageChange={setDeliveryPage} />
                </div>
              )}
            </>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrderManagementHub() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: statsData } = useQuery({
    queryKey: ['order-hub-stats'],
    queryFn: () => api<{ data: HubStats }>('/partner-admin/orders/hub-stats'),
    staleTime: 30_000,
  });
  const stats = statsData?.data;

  return (
    <div className="space-y-0">
      <PageHeader
        title="Order Hub"
        subtitle="Manage orders from intake through to delivery"
        action={
          <Link to="/orders/new" className="inline-flex items-center gap-2 px-4 py-2 bg-[#8B1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#7a1717] transition-colors">
            + Capture Order
          </Link>
        }
      />

      <div className="bg-white border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-6 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-[#8B1A1A] text-[#8B1A1A] bg-red-50/30'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                activeTab === tab.key ? 'bg-[#8B1A1A] text-white' : 'bg-gray-200 text-gray-600'
              }`}>{i + 1}</span>
              {tab.label}
              {tab.key === 'incoming' && (stats?.received ?? 0) > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white min-w-[18px]">
                  {stats!.received}
                </span>
              )}
              {tab.key === 'backorders' && (stats?.backOrders ?? 0) > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-white min-w-[18px]">
                  {stats!.backOrders}
                </span>
              )}
              {tab.key === 'delivery' && (stats?.inTransit ?? 0) > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white min-w-[18px]">
                  {stats!.inTransit}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 min-h-[calc(100vh-220px)]">
        {activeTab === 'overview'   && <OverviewTab stats={stats} onSwitchTab={setActiveTab} />}
        {activeTab === 'incoming'   && <IncomingTab />}
        {activeTab === 'confirmed'  && <ConfirmedTab />}
        {activeTab === 'backorders' && <BackOrdersTab />}
        {activeTab === 'delivery'   && <DeliveryTab />}
      </div>
    </div>
  );
}

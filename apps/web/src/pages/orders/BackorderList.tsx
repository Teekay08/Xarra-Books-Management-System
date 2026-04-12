import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';

interface BackOrderLine {
  id: string;
  titleId: string;
  title?: { id: string; title: string; isbn13: string | null } | null;
  quantity: number;
  backorderQty: number;
  backorderEta?: string | null;
  lineStatus: string;
}

interface BackOrder {
  id: string;
  number: string;
  partner?: { id: string; name: string } | null;
  partnerName?: string | null;
  branch?: { id: string; name: string } | null;
  branchName?: string | null;
  lines?: BackOrderLine[];
  itemCount?: number;
  status: string;
  backorderEta?: string | null;
  holdReason?: string | null;
  backorderNotes?: string | null;
  createdAt: string;
  expectedDeliveryDate?: string | null;
}

const fmt = (d: string | null | undefined): string => {
  if (!d) return 'No ETA';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysUntil = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
};

const isOverdue = (eta: string | null | undefined): boolean => {
  if (!eta) return false;
  return new Date(eta) < new Date();
};

// ── Inline edit form ──────────────────────────────────────────────────────────
interface EditFormProps {
  order: BackOrder;
  onSave: (data: { backorderEta: string; holdReason: string; backorderNotes: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function BackorderEditForm({ order, onSave, onCancel, isPending }: EditFormProps) {
  const [eta, setEta] = useState(order.backorderEta?.slice(0, 10) ?? '');
  const [holdReason, setHoldReason] = useState(order.holdReason ?? '');
  const [notes, setNotes] = useState(order.backorderNotes ?? '');

  return (
    <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-3">
      <p className="text-sm font-semibold text-yellow-900">Update Back Order — {order.number}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Expected Fulfilment Date
          </label>
          <input
            type="date"
            value={eta}
            onChange={e => setEta(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Hold Reason</label>
          <select
            value={holdReason}
            onChange={e => setHoldReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
          >
            <option value="">Select reason…</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="REPRINTING">Reprinting in progress</option>
            <option value="SUPPLIER_DELAY">Supplier delay</option>
            <option value="CUSTOMS_HOLD">Customs hold</option>
            <option value="PARTNER_REQUEST">Partner requested hold</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Internal notes…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ backorderEta: eta, holdReason, backorderNotes: notes })}
          disabled={isPending}
          className="px-4 py-1.5 bg-[#8B1A1A] text-white text-sm rounded-lg hover:bg-[#7a1717] disabled:opacity-50 font-medium"
        >
          {isPending ? 'Saving…' : 'Save'}
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

// ── Order card ────────────────────────────────────────────────────────────────
interface OrderCardProps {
  order: BackOrder;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (data: { backorderEta: string; holdReason: string; backorderNotes: string }) => void;
  onRelease: () => void;
  isUpdating: boolean;
  isReleasing: boolean;
}

function BackorderCard({ order, isExpanded, onToggleExpand, onUpdate, onRelease, isUpdating, isReleasing }: OrderCardProps) {
  const overdue = isOverdue(order.backorderEta);
  const days = daysUntil(order.backorderEta);
  const backorderedLines = order.lines?.filter(l => l.lineStatus === 'BACKORDERED' || l.backorderQty > 0) ?? [];
  const totalBackorderUnits = backorderedLines.reduce((s, l) => s + (l.backorderQty || l.quantity), 0);

  const holdReasonLabel: Record<string, string> = {
    OUT_OF_STOCK: 'Out of stock',
    REPRINTING: 'Reprinting',
    SUPPLIER_DELAY: 'Supplier delay',
    CUSTOMS_HOLD: 'Customs hold',
    PARTNER_REQUEST: 'Partner hold',
    OTHER: 'Other',
  };

  return (
    <div className={`p-4 ${overdue ? 'bg-red-50' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Left: info */}
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/orders/${order.id}`}
              className="font-mono text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              {order.number}
            </Link>

            {overdue ? (
              <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                ⚠ ETA Passed
              </span>
            ) : order.backorderEta ? (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
                days !== null && days <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                ETA {fmt(order.backorderEta)}
                {days !== null && days >= 0 && <span className="ml-1 opacity-75">({days}d)</span>}
              </span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">No ETA set</span>
            )}

            {order.holdReason && holdReasonLabel[order.holdReason] && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {holdReasonLabel[order.holdReason]}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 font-medium">
            {order.partner?.name ?? order.partnerName ?? '—'}
            {(order.branch?.name ?? order.branchName) && (
              <span className="text-gray-400 font-normal"> — {order.branch?.name ?? order.branchName}</span>
            )}
          </p>

          {/* Backordered lines summary */}
          {backorderedLines.length > 0 ? (
            <div className="space-y-1 mt-1">
              {backorderedLines.slice(0, 3).map(line => (
                <div key={line.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"></span>
                  <span className="font-medium truncate">{line.title?.title ?? 'Unknown title'}</span>
                  <span className="text-gray-400 shrink-0">
                    {line.backorderQty > 0 ? `${line.backorderQty} on BO` : `${line.quantity} units`}
                  </span>
                  {line.backorderEta && (
                    <span className={`shrink-0 ${isOverdue(line.backorderEta) ? 'text-red-500' : 'text-gray-400'}`}>
                      · ETA {fmt(line.backorderEta)}
                    </span>
                  )}
                </div>
              ))}
              {backorderedLines.length > 3 && (
                <p className="text-xs text-gray-400 pl-3.5">+{backorderedLines.length - 3} more title{backorderedLines.length - 3 !== 1 ? 's' : ''}</p>
              )}
            </div>
          ) : order.lines && order.lines.length > 0 ? (
            <div className="space-y-1 mt-1">
              {order.lines.slice(0, 2).map(line => (
                <div key={line.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"></span>
                  <span className="truncate">{line.title?.title ?? 'Unknown title'}</span>
                  <span className="text-gray-400 shrink-0">{line.quantity} units</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-1">
            <span>Created {fmt(order.createdAt)}</span>
            {totalBackorderUnits > 0 && (
              <span className="text-yellow-600 font-medium">{totalBackorderUnits} unit{totalBackorderUnits !== 1 ? 's' : ''} on back order</span>
            )}
          </div>

          {order.backorderNotes && (
            <p className="text-xs text-gray-500 italic mt-1 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
              Note: {order.backorderNotes}
            </p>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex gap-2 flex-shrink-0 items-start">
          <button
            onClick={onToggleExpand}
            className={`text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${
              isExpanded
                ? 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isExpanded ? 'Cancel' : (order.backorderEta ? 'Edit' : 'Set ETA')}
          </button>
          <button
            onClick={onRelease}
            disabled={isReleasing}
            title="Release back to processing once stock is available"
            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium whitespace-nowrap"
          >
            {isReleasing ? 'Releasing…' : 'Release →'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <BackorderEditForm
          order={order}
          onSave={onUpdate}
          onCancel={onToggleExpand}
          isPending={isUpdating}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type TabKey = 'all' | 'overdue' | 'no-eta';

export function BackorderList() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as any)._t);
    (handleSearch as any)._t = setTimeout(() => setDebouncedSearch(v), 300);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['backorders', debouncedSearch],
    queryFn: () => api<PaginatedResponse<BackOrder>>(
      `/partner-admin/orders?status=BACK_ORDER&limit=100&search=${encodeURIComponent(debouncedSearch)}`
    ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; backorderEta: string; holdReason: string; backorderNotes: string }) =>
      api(`/order-tracking/orders/${id}/backorder`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backorders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-hub'] });
      setExpandedId(null);
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/order-tracking/orders/${id}/pipeline-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'CONFIRMED' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backorders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-hub'] });
    },
  });

  const allOrders = data?.data ?? [];
  const overdueOrders = allOrders.filter(o => isOverdue(o.backorderEta));
  const noEtaOrders = allOrders.filter(o => !o.backorderEta);
  const totalUnits = allOrders.reduce((s, o) => {
    const lines = o.lines ?? [];
    return s + lines.reduce((ls, l) => ls + (l.backorderQty || l.quantity), 0);
  }, 0);

  const visibleOrders = tab === 'overdue' ? overdueOrders
    : tab === 'no-eta' ? noEtaOrders
    : allOrders;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Back Orders"
        subtitle="Orders on hold due to insufficient or delayed stock"
        backTo={{ href: '/orders', label: 'Order Management' }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'On Back Order',
            value: isLoading ? '…' : allOrders.length,
            color: 'text-yellow-700',
            border: 'border-yellow-200',
            bg: 'bg-yellow-50',
          },
          {
            label: 'Past ETA',
            value: isLoading ? '…' : overdueOrders.length,
            color: overdueOrders.length > 0 ? 'text-red-700' : 'text-gray-400',
            border: overdueOrders.length > 0 ? 'border-red-200' : 'border-gray-200',
            bg: overdueOrders.length > 0 ? 'bg-red-50' : 'bg-gray-50',
          },
          {
            label: 'No ETA Set',
            value: isLoading ? '…' : noEtaOrders.length,
            color: noEtaOrders.length > 0 ? 'text-orange-700' : 'text-gray-400',
            border: noEtaOrders.length > 0 ? 'border-orange-200' : 'border-gray-200',
            bg: noEtaOrders.length > 0 ? 'bg-orange-50' : 'bg-gray-50',
          },
          {
            label: 'Units on Hold',
            value: isLoading ? '…' : totalUnits || allOrders.length > 0 ? (isLoading ? '…' : allOrders.length) : 0,
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
            {([
              { key: 'all',     label: 'All',        count: allOrders.length },
              { key: 'overdue', label: 'Past ETA',   count: overdueOrders.length },
              { key: 'no-eta',  label: 'No ETA Set', count: noEtaOrders.length },
            ] as { key: TabKey; label: string; count: number }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'text-[#8B1A1A] border-[#8B1A1A]'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {t.label}
                {!isLoading && t.count > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    t.key === 'overdue' ? 'bg-red-100 text-red-700' :
                    t.key === 'no-eta' ? 'bg-orange-100 text-orange-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="pb-2">
            <SearchBar value={search} onChange={handleSearch} placeholder="Search back orders…" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading back orders…</span>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="py-16 text-center">
            {tab === 'all' && allOrders.length === 0 ? (
              <>
                <p className="text-2xl mb-2">✓</p>
                <p className="text-gray-700 font-medium text-sm">All clear — no back orders</p>
                <p className="text-gray-400 text-xs mt-1">Orders will appear here when flagged as back ordered.</p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">
                {tab === 'overdue' ? 'No past-ETA orders.' : 'All back orders have an ETA set.'}
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visibleOrders.map(order => (
              <BackorderCard
                key={order.id}
                order={order}
                isExpanded={expandedId === order.id}
                onToggleExpand={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onUpdate={data => updateMutation.mutate({ id: order.id, ...data })}
                onRelease={() => releaseMutation.mutate(order.id)}
                isUpdating={updateMutation.isPending && updateMutation.variables?.id === order.id}
                isReleasing={releaseMutation.isPending && releaseMutation.variables === order.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

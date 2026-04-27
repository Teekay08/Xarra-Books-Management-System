import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { ActionMenu } from '../../components/ActionMenu';
import { Pagination } from '../../components/Pagination';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessingOrder {
  id: string;
  number: string;
  partner?: { id: string; name: string } | null;
  partnerName?: string | null;
  branch?: { id: string; name: string } | null;
  branchName?: string | null;
  lines?: Array<unknown>;
  itemCount?: number;
  status: string;
  currentPipelineStep: number;
  pickingStartedAt?: string | null;
  packingStartedAt?: string | null;
  createdAt: string;
  customerPoNumber?: string | null;
  consignmentId?: string | null;
  consignmentNumber?: string | null;
  courierCompany?: string | null;
  courierWaybill?: string | null;
}

interface ConsignmentSummary {
  id: string;
  proformaNumber: string;
  partnerId: string;
  partnerName: string;
  branchName?: string | null;
  status: string;
  dispatchDate?: string | null;
  sorExpiryDate?: string | null;
  totalDispatched?: number;
  totalSold?: number;
  daysUntilExpiry?: number | null;
  createdAt: string;
}

interface ReturnSummary {
  id: string;
  number: string;
  partner?: { name: string } | null;
  partnerName?: string;
  status: string;
  reason?: string | null;
  consignment?: { proformaNumber: string } | null;
  createdAt: string;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  grnNumber?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Must match ORDER_PIPELINE_STEPS in packages/shared/src/constants.ts exactly
const PIPELINE_STEPS = [
  'ORDER_RECEIVED', 'CONFIRMED', 'PICKING', 'PACKING', 'DISPATCHED',
  'WITH_COURIER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
] as const;

// Human-readable labels for all 9 pipeline steps
const STEP_LABELS: Record<number, string> = {
  0: 'Received',
  1: 'Confirmed',
  2: 'Picking',
  3: 'Packing',
  4: 'Dispatched',
  5: 'With Courier',
  6: 'In Transit',
  7: 'Out for Delivery',
  8: 'Delivered',
};

const STEP_COLOR: Record<number, string> = {
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-orange-100 text-orange-700',
  4: 'bg-purple-100 text-purple-700',
  5: 'bg-indigo-100 text-indigo-700',
  6: 'bg-cyan-100 text-cyan-700',
  7: 'bg-sky-100 text-sky-700',
  8: 'bg-green-100 text-green-700',
};

function formatAge(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

function PartnerCell({ order }: { order: ProcessingOrder }) {
  const name = order.partner?.name ?? order.partnerName ?? '—';
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

function SorExpiryBadge({ daysUntilExpiry }: { daysUntilExpiry?: number | null }) {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return null;
  if (daysUntilExpiry < 0)
    return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">Expired {Math.abs(daysUntilExpiry)}d ago</span>;
  if (daysUntilExpiry <= 7)
    return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">{daysUntilExpiry}d left</span>;
  if (daysUntilExpiry <= 14)
    return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">{daysUntilExpiry}d left</span>;
  return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">{daysUntilExpiry}d left</span>;
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'queue' | 'picking' | 'packing' | 'sor' | 'dispatch' | 'returns';

const TABS: { key: Tab; label: string }[] = [
  { key: 'queue',    label: 'Queue' },
  { key: 'picking',  label: 'Picking' },
  { key: 'packing',  label: 'Packing' },
  { key: 'sor',      label: 'SOR Proforma' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'returns',  label: 'Returns In' },
];

// ─── Queue Tab ────────────────────────────────────────────────────────────────
// Shows all PROCESSING orders. Advance button is limited to steps 1–2
// (up to PICKING). PACKING → DISPATCHED must go through the Dispatch tab.

function QueueTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pq-queue', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&search=${encodeURIComponent(search)}&limit=50`
    ),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, step }: { id: string; step: string }) =>
      api(`/order-tracking/orders/${id}/pipeline-step`, { method: 'POST', body: JSON.stringify({ step }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pq-queue'] }),
    onError:   () => alert('Failed to advance order. Please try again.'),
  });

  const orders = data?.data ?? [];

  // Only allow advance up to PACKING (step 3). Orders at PACKING+ must go
  // through the Dispatch tab which runs the full dispatch flow with inventory
  // deductions, SOR updates and courier records.
  function nextStep(step: number): string | null {
    if (step >= 3) return null; // at PACKING or beyond — no shortcut to DISPATCHED
    return PIPELINE_STEPS[step + 1] ?? null;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Processing Queue</h3>
          <p className="text-xs text-gray-500 mt-0.5">All orders currently being processed — from confirmed through to ready for dispatch.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search orders…" />
      </div>

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message="Processing queue is clear." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Number', 'Partner / Branch', 'PO Ref', 'Items', 'Stage', 'Progress', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => {
                const step = order.currentPipelineStep ?? 1;
                const next = nextStep(step);
                const pct  = Math.round((step / (PIPELINE_STEPS.length - 1)) * 100);
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                    </td>
                    <td className="px-4 py-3"><PartnerCell order={order} /></td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{order.customerPoNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{order.itemCount ?? order.lines?.length ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STEP_COLOR[step] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STEP_LABELS[step] ?? `Step ${step}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-[#8B1A1A] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {next ? (
                          <button
                            onClick={() => advanceMutation.mutate({ id: order.id, step: next })}
                            disabled={advanceMutation.isPending && advanceMutation.variables?.id === order.id}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                          >
                            → {STEP_LABELS[step + 1] ?? next}
                          </button>
                        ) : (
                          // At PACKING or beyond — direct to appropriate tab
                          step === 3 && (
                            <span className="text-xs text-gray-400 italic">Use Dispatch tab →</span>
                          )
                        )}
                        <ActionMenu items={[{ label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) }]} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Picking Tab ──────────────────────────────────────────────────────────────

function PickingTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pq-picking', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=PICKING&search=${encodeURIComponent(search)}&limit=50`
    ),
  });

  const markPackingMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/order-tracking/orders/${id}/pipeline-step`, { method: 'POST', body: JSON.stringify({ step: 'PACKING' }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pq-picking'] }),
    onError:   () => alert('Failed to advance order. Please try again.'),
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Picking</h3>
          <p className="text-xs text-gray-500 mt-0.5">Orders at the picking stage. Print picking slips for warehouse staff to pull stock.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search…" />
      </div>

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message="No orders currently in the picking stage." />
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                  <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                  {(order.branch?.name ?? order.branchName) && (
                    <span className="text-xs text-gray-400">{order.branch?.name ?? order.branchName}</span>
                  )}
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-semibold">Picking</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {order.itemCount ?? order.lines?.length ?? 0} item(s) · Started {order.pickingStartedAt ? formatAge(order.pickingStartedAt) : 'unknown'} ago
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/v1/order-tracking/orders/${order.id}/picking-slip`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors font-medium"
                >
                  Print Picking Slip
                </a>
                <button
                  onClick={() => markPackingMutation.mutate(order.id)}
                  disabled={markPackingMutation.isPending && markPackingMutation.variables === order.id}
                  className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors font-medium disabled:opacity-50"
                >
                  Mark Picked →
                </button>
                <ActionMenu items={[{ label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) }]} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Packing Tab ──────────────────────────────────────────────────────────────
// Purpose: print packing lists and confirm physical packing is done.
// NO status advancement here — "Mark Picked" already set the order to PACKING.
// Actual dispatch happens in the Dispatch tab via the full /dispatch endpoint.

function PackingTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pq-packing', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=PACKING&search=${encodeURIComponent(search)}&limit=50`
    ),
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Packing</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Orders being boxed and labelled. Print packing lists to include in the shipment, then create a SOR Proforma and dispatch in the next tabs.
          </p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search…" />
      </div>

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message="No orders currently in the packing stage." />
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                  <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">Packing</span>
                  {order.consignmentId
                    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">SOR ✓</span>
                    : <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Needs SOR</span>
                  }
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {order.itemCount ?? order.lines?.length ?? 0} item(s) · PO: {order.customerPoNumber ?? '—'}
                  {order.packingStartedAt && ` · Packing for ${formatAge(order.packingStartedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/v1/order-tracking/orders/${order.id}/packing-list`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors font-medium"
                >
                  Print Packing List
                </a>
                {!order.consignmentId && (
                  <Link
                    to={`/consignments/new?orderId=${order.id}`}
                    className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-medium"
                  >
                    Create SOR →
                  </Link>
                )}
                <ActionMenu items={[
                  { label: 'View Details',  onClick: () => navigate(`/orders/${order.id}`) },
                  ...(order.consignmentId
                    ? [{ label: 'Go to Dispatch tab', onClick: () => navigate('/orders/processing?tab=dispatch') }]
                    : []
                  ),
                ]} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SOR Proforma Tab ─────────────────────────────────────────────────────────

function SorProformaTab() {
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<'pending' | 'active' | 'expiring'>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Orders packed but WITHOUT a SOR yet (consignmentId is null)
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pq-sor-pending', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=PACKING&search=${encodeURIComponent(search)}&limit=50`
    ),
    enabled: subTab === 'pending',
  });

  // Active / expiring SORs via settlement endpoint
  const { data: sorData, isLoading: sorLoading } = useQuery({
    queryKey: ['pq-sor-active', page, search, subTab],
    queryFn: () => api<{ data: ConsignmentSummary[]; pagination: any }>(
      `/settlement/sors?filter=active&page=${page}&limit=20&search=${encodeURIComponent(search)}`
    ),
    enabled: subTab === 'active' || subTab === 'expiring',
  });

  // Filter to orders that do NOT yet have a SOR linked
  const pendingOrders = (pendingData?.data ?? []).filter(o => !o.consignmentId);

  const activeSors  = sorData?.data ?? [];
  const displaySors = subTab === 'expiring'
    ? activeSors.filter(s => s.daysUntilExpiry != null && s.daysUntilExpiry <= 14)
    : activeSors;

  const isLoading = subTab === 'pending' ? pendingLoading : sorLoading;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">SOR Proforma Invoices</h3>
          <p className="text-xs text-gray-500 mt-0.5">Create SOR proforma invoices before dispatch. Monitor active SOR periods.</p>
        </div>
        <div className="flex gap-1">
          {(['pending', 'active', 'expiring'] as const).map((k) => {
            const label = k === 'pending' ? 'Pending SOR' : k === 'active' ? 'Active SORs' : 'Expiring Soon';
            return (
              <button key={k} onClick={() => { setSubTab(k); setPage(1); }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${subTab === k ? 'bg-[#8B1A1A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search orders or SOR numbers…" />

      {isLoading ? <LoadingSpinner /> : (
        <>
          {subTab === 'pending' && (
            pendingOrders.length === 0 ? (
              <EmptyState message="All packed orders have SOR proforma invoices." />
            ) : (
              <div className="space-y-3">
                {pendingOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                          <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-semibold">Needs SOR Proforma</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{order.itemCount ?? order.lines?.length ?? 0} items · PO: {order.customerPoNumber ?? '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to={`/consignments/new?orderId=${order.id}`}
                          className="px-3 py-1.5 bg-[#8B1A1A] text-white rounded text-xs font-medium hover:bg-[#7a1717] transition-colors"
                        >
                          Create SOR Proforma
                        </Link>
                        <ActionMenu items={[{ label: 'View Order', onClick: () => navigate(`/orders/${order.id}`) }]} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {(subTab === 'active' || subTab === 'expiring') && (
            displaySors.length === 0 ? (
              <EmptyState message={subTab === 'expiring' ? 'No SORs expiring within 14 days.' : 'No active SOR periods.'} />
            ) : (
              <>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['SOR Number', 'Partner', 'Dispatched', 'Expiry', 'Sold / Dispatched', 'SOR Period', ''].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {displaySors.map(sor => (
                        <tr key={sor.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link to={`/consignments/${sor.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{sor.proformaNumber}</Link>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm">{sor.partnerName}</p>
                            {sor.branchName && <p className="text-xs text-gray-500">{sor.branchName}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {sor.dispatchDate ? new Date(sor.dispatchDate).toLocaleDateString('en-ZA') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {sor.sorExpiryDate ? new Date(sor.sorExpiryDate).toLocaleDateString('en-ZA') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{sor.totalSold ?? 0} / {sor.totalDispatched ?? 0}</td>
                          <td className="px-4 py-3"><SorExpiryBadge daysUntilExpiry={sor.daysUntilExpiry} /></td>
                          <td className="px-4 py-3 text-right">
                            <ActionMenu items={[
                              { label: 'View SOR',          onClick: () => navigate(`/consignments/${sor.id}`) },
                              { label: 'Go to Settlement',  onClick: () => navigate('/settlement') },
                            ]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sorData?.pagination && (
                  <div className="px-4 py-3">
                    <Pagination page={page} totalPages={sorData.pagination.totalPages} total={sorData.pagination.total} onPageChange={setPage} />
                  </div>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

// ─── Dispatch Tab ─────────────────────────────────────────────────────────────
// Only shows PACKING orders that have a SOR (consignmentId set).
// Submitting the form calls /dispatch which:
//   - requires a consignmentId on the order (checked by backend)
//   - sets order status to DISPATCHED
//   - updates qtyDispatched on all lines
//   - creates CONSIGN inventory movements
//   - updates the linked consignment (status, sorExpiryDate)
//   - creates a courierShipments record
//   - notifies the partner

function DispatchTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    courierCompany: '', courierWaybill: '', courierTrackingUrl: '', expectedDeliveryDate: '',
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pq-dispatch', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=PACKING&search=${encodeURIComponent(search)}&limit=50`
    ),
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof dispatchForm }) =>
      api(`/partner-admin/orders/${id}/dispatch`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pq-dispatch'] });
      queryClient.invalidateQueries({ queryKey: ['pq-queue'] });
      setDispatchingId(null);
    },
    onError: (err: any) => {
      setFormError(err?.message ?? 'Dispatch failed. Please try again.');
    },
  });

  // Only show orders that have a SOR proforma linked (consignmentId not null)
  const orders = (data?.data ?? []).filter(o => o.consignmentId);
  const allPackingOrders = data?.data ?? [];
  const noSorCount = allPackingOrders.length - orders.length;

  function openDispatch(id: string) {
    setDispatchingId(id);
    setDispatchForm({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '', expectedDeliveryDate: '' });
    setFormError('');
  }

  function handleConfirmDispatch(orderId: string) {
    if (!dispatchForm.courierCompany.trim()) { setFormError('Courier company is required.'); return; }
    if (!dispatchForm.courierWaybill.trim()) { setFormError('Waybill number is required.'); return; }
    setFormError('');
    dispatchMutation.mutate({ id: orderId, body: dispatchForm });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Ready to Dispatch</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Fully packed orders with SOR proforma issued, awaiting courier pickup.
            {noSorCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">{noSorCount} order(s) still need a SOR — see SOR Proforma tab.</span>
            )}
          </p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search…" />
      </div>

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message={noSorCount > 0
          ? 'No orders ready to dispatch yet — create SOR proformas first.'
          : 'No orders ready for dispatch.'
        } />
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const isOpen      = dispatchingId === order.id;
            const isSubmitting = dispatchMutation.isPending && dispatchMutation.variables?.id === order.id;
            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                      <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">Ready</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {order.itemCount ?? order.lines?.length ?? 0} items · PO: {order.customerPoNumber ?? '—'} · SOR: {order.consignmentNumber ?? '✓ Linked'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => isOpen ? setDispatchingId(null) : openDispatch(order.id)}
                      className="px-2.5 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-colors"
                    >
                      {isOpen ? 'Cancel' : 'Mark Dispatched'}
                    </button>
                    <ActionMenu items={[{ label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) }]} />
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {formError && (
                      <p className="text-xs text-red-600 mb-3 font-medium">{formError}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Courier Company <span className="text-red-500">*</span></label>
                        <input type="text" value={dispatchForm.courierCompany}
                          onChange={e => setDispatchForm(f => ({ ...f, courierCompany: e.target.value }))}
                          placeholder="e.g. Fastway Couriers"
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Waybill Number <span className="text-red-500">*</span></label>
                        <input type="text" value={dispatchForm.courierWaybill}
                          onChange={e => setDispatchForm(f => ({ ...f, courierWaybill: e.target.value }))}
                          placeholder="Waybill / tracking number"
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tracking URL (optional)</label>
                        <input type="url" value={dispatchForm.courierTrackingUrl}
                          onChange={e => setDispatchForm(f => ({ ...f, courierTrackingUrl: e.target.value }))}
                          placeholder="https://track.courier.com/..."
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Expected Delivery Date</label>
                        <input type="date" value={dispatchForm.expectedDeliveryDate}
                          onChange={e => setDispatchForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <button
                          onClick={() => handleConfirmDispatch(order.id)}
                          disabled={isSubmitting}
                          className="px-4 py-1.5 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? 'Dispatching…' : 'Confirm Dispatch'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Returns In Tab ───────────────────────────────────────────────────────────

type ReturnSubTab = 'draft' | 'authorized' | 'transit' | 'received' | 'inspected';

const RETURN_STATUS_CFG: Record<string, { label: string; color: string }> = {
  DRAFT:       { label: 'Draft',       color: 'bg-gray-100 text-gray-600' },
  AUTHORIZED:  { label: 'Authorised',  color: 'bg-blue-100 text-blue-700' },
  IN_TRANSIT:  { label: 'In Transit',  color: 'bg-purple-100 text-purple-700' },
  RECEIVED:    { label: 'Received',    color: 'bg-amber-100 text-amber-700' },
  INSPECTED:   { label: 'Inspected',   color: 'bg-orange-100 text-orange-700' },
  VERIFIED:    { label: 'Verified',    color: 'bg-green-100 text-green-700' },
  PROCESSED:   { label: 'Processed',   color: 'bg-green-100 text-green-700' },
};

function ReturnsInTab() {
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<ReturnSubTab>('draft');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Status values passed to GET /returns?status=...
  // returnsAuthorizations uses: DRAFT, AUTHORIZED, IN_TRANSIT, RECEIVED, INSPECTED, VERIFIED, PROCESSED
  const statusMap: Record<ReturnSubTab, string> = {
    draft:      'DRAFT',
    authorized: 'AUTHORIZED',
    transit:    'IN_TRANSIT',
    received:   'RECEIVED',
    inspected:  'INSPECTED,VERIFIED',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pq-returns', subTab, search, page],
    queryFn: () => api<PaginatedResponse<ReturnSummary>>(
      `/returns?status=${statusMap[subTab]}&page=${page}&limit=20&search=${encodeURIComponent(search)}`
    ),
  });

  const returns = data?.data ?? [];

  const subTabs: { key: ReturnSubTab; label: string }[] = [
    { key: 'draft',      label: 'Draft / New' },
    { key: 'authorized', label: 'Authorised' },
    { key: 'transit',    label: 'In Transit' },
    { key: 'received',   label: 'Received' },
    { key: 'inspected',  label: 'Inspected' },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Returns In</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Inbound returns — authorisation, receiving and inspection. Credit issuance happens in Account Settlement.
          </p>
        </div>
        <Link to="/orders/returns/new" className="px-3 py-1.5 bg-[#8B1A1A] text-white rounded text-xs font-medium hover:bg-[#7a1717] transition-colors">
          + Capture Return
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto flex-wrap">
        {subTabs.map(st => (
          <button key={st.key} onClick={() => { setSubTab(st.key); setPage(1); }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === st.key ? 'bg-[#8B1A1A] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {st.label}
          </button>
        ))}
      </div>

      <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by RA number or partner…" />

      {isLoading ? <LoadingSpinner /> : returns.length === 0 ? (
        <EmptyState message={`No returns in "${subTabs.find(s => s.key === subTab)?.label}" status.`} />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['RA Number', 'Partner', 'SOR Ref', 'GRN', 'Reason', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {returns.map(ret => {
                  const cfg = RETURN_STATUS_CFG[ret.status] ?? { label: ret.status, color: 'bg-gray-100 text-gray-500' };
                  const partnerName = ret.partner?.name ?? ret.partnerName ?? '—';
                  const sorRef      = ret.consignment?.proformaNumber ?? '—';
                  return (
                    <tr key={ret.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/orders/returns/${ret.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{ret.number}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-sm text-gray-900">{partnerName}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{sorRef}</td>
                      <td className="px-4 py-3">
                        {ret.grnNumber ? (
                          <a
                            href={`/api/v1/returns/${ret.id}/grn`}
                            target="_blank" rel="noopener noreferrer"
                            className="font-mono text-xs text-green-700 font-semibold hover:underline"
                          >
                            {ret.grnNumber}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{ret.reason ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {subTab === 'inspected' && (
                            <button
                              onClick={() => navigate('/settlement?tab=returns')}
                              className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
                            >
                              Issue Credit →
                            </button>
                          )}
                          {ret.grnNumber && (
                            <a href={`/api/v1/returns/${ret.id}/grn`} target="_blank" rel="noopener noreferrer"
                              className="px-2.5 py-1 border border-green-200 text-green-700 rounded text-xs font-medium hover:bg-green-50 transition-colors">
                              GRN ↗
                            </a>
                          )}
                          <ActionMenu items={[{ label: 'View Return', onClick: () => navigate(`/orders/returns/${ret.id}`) }]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data?.pagination && (
            <div className="px-4 py-3">
              <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrderProcessingQueue() {
  const [activeTab, setActiveTab] = useState<Tab>('queue');

  return (
    <div className="space-y-0">
      <PageHeader
        title="Processing Queue"
        subtitle="Warehouse operations — picking, packing, SOR proforma, dispatch and returns"
        backTo={{ href: '/orders', label: 'Order Hub' }}
      />

      <div className="bg-white border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-[#8B1A1A] text-[#8B1A1A] bg-red-50/30'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                activeTab === tab.key ? 'bg-[#8B1A1A] text-white' : 'bg-gray-200 text-gray-600'
              }`}>{i + 1}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 min-h-[calc(100vh-220px)]">
        {activeTab === 'queue'    && <QueueTab />}
        {activeTab === 'picking'  && <PickingTab />}
        {activeTab === 'packing'  && <PackingTab />}
        {activeTab === 'sor'      && <SorProformaTab />}
        {activeTab === 'dispatch' && <DispatchTab />}
        {activeTab === 'returns'  && <ReturnsInTab />}
      </div>
    </div>
  );
}

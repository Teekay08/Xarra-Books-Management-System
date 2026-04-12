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
  partnerName: string;
  status: string;
  reason?: string | null;
  sorNumber?: string | null;
  createdAt: string;
  courierCompany?: string | null;
  courierWaybill?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  'ORDER_RECEIVED','CONFIRMED','PICKING','PACKING','DISPATCHED',
  'WITH_COURIER','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED',
];

function formatAge(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

function PartnerCell({ order }: { order: { partnerName?: string | null; partner?: { name: string } | null; branchName?: string | null; branch?: { name: string } | null } }) {
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
  if (daysUntilExpiry < 0) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">Expired {Math.abs(daysUntilExpiry)}d ago</span>;
  if (daysUntilExpiry <= 7) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">{daysUntilExpiry}d left</span>;
  if (daysUntilExpiry <= 14) return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">{daysUntilExpiry}d left</span>;
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
  });

  const orders = data?.data ?? [];
  const nextStep = (step: number) => PIPELINE_STEPS[step + 1] ?? null;

  const STEP_LABELS: Record<number, string> = { 1: 'Confirmed', 2: 'Picking', 3: 'Packing', 4: 'Dispatched' };
  const STEP_COLOR: Record<number, string> = {
    1: 'bg-blue-100 text-blue-700', 2: 'bg-amber-100 text-amber-700',
    3: 'bg-orange-100 text-orange-700', 4: 'bg-purple-100 text-purple-700',
  };

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
                const pct = Math.round((step / (PIPELINE_STEPS.length - 1)) * 100);
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
                        {next && (
                          <button onClick={() => advanceMutation.mutate({ id: order.id, step: next })} disabled={advanceMutation.isPending}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors disabled:opacity-50">
                            → {STEP_LABELS[step + 1] ?? next}
                          </button>
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
    mutationFn: (id: string) => api(`/order-tracking/orders/${id}/pipeline-step`, { method: 'POST', body: JSON.stringify({ step: 'PACKING' }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pq-picking'] }),
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
                  {(order.branch?.name ?? order.branchName) && <span className="text-xs text-gray-400">{order.branch?.name ?? order.branchName}</span>}
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-semibold">Picking</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{order.itemCount ?? order.lines?.length ?? 0} item(s) · Started {order.pickingStartedAt ? formatAge(order.pickingStartedAt) : 'unknown'} ago</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={`/api/v1/order-tracking/orders/${order.id}/picking-slip`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors font-medium">
                  Print Picking Slip
                </a>
                <button onClick={() => markPackingMutation.mutate(order.id)} disabled={markPackingMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors font-medium disabled:opacity-50">
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

function PackingTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pq-packing', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=PACKING&search=${encodeURIComponent(search)}&limit=50`
    ),
  });

  const markReadyMutation = useMutation({
    mutationFn: (id: string) => api(`/order-tracking/orders/${id}/pipeline-step`, { method: 'POST', body: JSON.stringify({ step: 'DISPATCHED' }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pq-packing'] }),
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Packing</h3>
          <p className="text-xs text-gray-500 mt-0.5">Orders being boxed and labelled. Print packing lists to include in the shipment.</p>
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
                </div>
                <p className="text-xs text-gray-500 mt-1">{order.itemCount ?? order.lines?.length ?? 0} item(s) · PO: {order.customerPoNumber ?? '—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={`/api/v1/order-tracking/orders/${order.id}/packing-list`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors font-medium">
                  Print Packing List
                </a>
                <button onClick={() => markReadyMutation.mutate(order.id)} disabled={markReadyMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors font-medium disabled:opacity-50">
                  Mark Packed →
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

// ─── SOR Proforma Tab ─────────────────────────────────────────────────────────

function SorProformaTab() {
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<'pending' | 'active' | 'expiring'>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Orders packed but no SOR yet
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pq-sor-pending', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=DISPATCHED&search=${encodeURIComponent(search)}&limit=50`
    ),
    enabled: subTab === 'pending',
  });

  // Active SORs (dispatched/delivered, SOR window running)
  const { data: sorData, isLoading: sorLoading } = useQuery({
    queryKey: ['pq-sor-active', page, search, subTab],
    queryFn: () => api<{ data: ConsignmentSummary[]; pagination: any }>(
      `/settlement/sors?filter=${subTab === 'expiring' ? 'active' : 'active'}&page=${page}&limit=20&search=${encodeURIComponent(search)}`
    ),
    enabled: subTab === 'active' || subTab === 'expiring',
  });

  const pendingOrders = pendingData?.data ?? [];
  const activeSors = sorData?.data ?? [];
  const displaySors = subTab === 'expiring'
    ? activeSors.filter((s: ConsignmentSummary) => s.daysUntilExpiry !== null && s.daysUntilExpiry !== undefined && s.daysUntilExpiry <= 14)
    : activeSors;

  const isLoading = pendingLoading || sorLoading;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">SOR Proforma Invoices</h3>
          <p className="text-xs text-gray-500 mt-0.5">Create SOR proforma invoices before dispatch. Monitor active SOR periods.</p>
        </div>
        <div className="flex gap-1">
          {([['pending','Pending SOR'], ['active','Active SORs'], ['expiring','Expiring Soon']] as [string,string][]).map(([k,l]) => (
            <button key={k} onClick={() => { setSubTab(k as any); setPage(1); }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${subTab === k ? 'bg-[#8B1A1A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
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
                        <Link to={`/consignments/new?orderId=${order.id}`}
                          className="px-3 py-1.5 bg-[#8B1A1A] text-white rounded text-xs font-medium hover:bg-[#7a1717] transition-colors">
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
                      {displaySors.map((sor: ConsignmentSummary) => (
                        <tr key={sor.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link to={`/consignments/${sor.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{sor.proformaNumber}</Link>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm">{sor.partnerName}</p>
                            {sor.branchName && <p className="text-xs text-gray-500">{sor.branchName}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{sor.dispatchDate ? new Date(sor.dispatchDate).toLocaleDateString('en-ZA') : '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{sor.sorExpiryDate ? new Date(sor.sorExpiryDate).toLocaleDateString('en-ZA') : '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{sor.totalSold ?? 0} / {sor.totalDispatched ?? 0}</td>
                          <td className="px-4 py-3"><SorExpiryBadge daysUntilExpiry={sor.daysUntilExpiry} /></td>
                          <td className="px-4 py-3 text-right">
                            <ActionMenu items={[
                              { label: 'View SOR', onClick: () => navigate(`/consignments/${sor.id}`) },
                              { label: 'Go to Settlement', onClick: () => navigate('/settlement') },
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

function DispatchTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchForm, setDispatchForm] = useState({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '', expectedDeliveryDate: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['pq-dispatch', search],
    queryFn: () => api<PaginatedResponse<ProcessingOrder>>(
      `/partner-admin/orders?status=PROCESSING&pipelineStep=DISPATCHED&search=${encodeURIComponent(search)}&limit=50`
    ),
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api(`/partner-admin/orders/${id}/dispatch`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pq-dispatch'] }); setDispatchingId(null); },
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Ready to Dispatch</h3>
          <p className="text-xs text-gray-500 mt-0.5">Fully packed orders with SOR proforma issued, awaiting courier pickup.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search…" />
      </div>

      {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
        <EmptyState message="No orders ready for dispatch." />
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const isDispatching = dispatchingId === order.id;
            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{order.number}</Link>
                      <span className="text-sm text-gray-600">{order.partner?.name ?? order.partnerName}</span>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">Ready</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{order.itemCount ?? order.lines?.length ?? 0} items · PO: {order.customerPoNumber ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={`/api/v1/order-tracking/orders/${order.id}/delivery-note`} target="_blank" rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 transition-colors">
                      Delivery Note
                    </a>
                    <button onClick={() => { setDispatchingId(isDispatching ? null : order.id); setDispatchForm({ courierCompany: '', courierWaybill: '', courierTrackingUrl: '', expectedDeliveryDate: '' }); }}
                      className="px-2.5 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-colors">
                      {isDispatching ? 'Cancel' : 'Mark Dispatched'}
                    </button>
                    <ActionMenu items={[{ label: 'View Details', onClick: () => navigate(`/orders/${order.id}`) }]} />
                  </div>
                </div>

                {isDispatching && (
                  <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Courier Company</label>
                      <input type="text" value={dispatchForm.courierCompany} onChange={e => setDispatchForm(f => ({ ...f, courierCompany: e.target.value }))}
                        placeholder="e.g. Fastway Couriers" className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Waybill Number</label>
                      <input type="text" value={dispatchForm.courierWaybill} onChange={e => setDispatchForm(f => ({ ...f, courierWaybill: e.target.value }))}
                        placeholder="Waybill / tracking number" className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tracking URL (optional)</label>
                      <input type="url" value={dispatchForm.courierTrackingUrl} onChange={e => setDispatchForm(f => ({ ...f, courierTrackingUrl: e.target.value }))}
                        placeholder="https://track.courier.com/..." className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Expected Delivery Date</label>
                      <input type="date" value={dispatchForm.expectedDeliveryDate} onChange={e => setDispatchForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#8B1A1A] focus:border-[#8B1A1A] outline-none" />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button onClick={() => dispatchMutation.mutate({ id: order.id, body: dispatchForm })} disabled={dispatchMutation.isPending}
                        className="px-4 py-1.5 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50">
                        {dispatchMutation.isPending ? 'Dispatching…' : 'Confirm Dispatch'}
                      </button>
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

type ReturnSubTab = 'pending' | 'authorised' | 'transit' | 'received' | 'inspected';

const RETURN_STATUS_CFG: Record<string, { label: string; color: string }> = {
  DRAFT:       { label: 'Draft',       color: 'bg-gray-100 text-gray-600' },
  AUTHORIZED:  { label: 'Authorised',  color: 'bg-blue-100 text-blue-700' },
  IN_TRANSIT:  { label: 'In Transit',  color: 'bg-purple-100 text-purple-700' },
  RECEIVED:    { label: 'Received',    color: 'bg-amber-100 text-amber-700' },
  INSPECTED:   { label: 'Inspected',   color: 'bg-orange-100 text-orange-700' },
  VERIFIED:    { label: 'Verified',    color: 'bg-green-100 text-green-700' },
  PROCESSED:   { label: 'Processed',   color: 'bg-green-100 text-green-700' },
  REJECTED:    { label: 'Rejected',    color: 'bg-red-100 text-red-700' },
};

function ReturnsInTab() {
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<ReturnSubTab>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const statusMap: Record<ReturnSubTab, string> = {
    pending: 'DRAFT',
    authorised: 'AUTHORIZED',
    transit: 'IN_TRANSIT',
    received: 'RECEIVED',
    inspected: 'INSPECTED,VERIFIED',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pq-returns', subTab, search, page],
    queryFn: () => api<PaginatedResponse<ReturnSummary>>(
      `/returns?status=${statusMap[subTab]}&page=${page}&limit=20&search=${encodeURIComponent(search)}`
    ),
  });

  const returns = data?.data ?? [];

  const subTabs: { key: ReturnSubTab; label: string }[] = [
    { key: 'pending',   label: 'Pending Review' },
    { key: 'authorised',label: 'Authorised' },
    { key: 'transit',   label: 'In Transit' },
    { key: 'received',  label: 'Received' },
    { key: 'inspected', label: 'Inspected' },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Returns In</h3>
          <p className="text-xs text-gray-500 mt-0.5">Inbound returns from partners — authorisation, receiving and inspection. Credit issuance happens in Account Settlement.</p>
        </div>
        <Link to="/orders/returns/new" className="px-3 py-1.5 bg-[#8B1A1A] text-white rounded text-xs font-medium hover:bg-[#7a1717] transition-colors">
          + Capture Return
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto flex-wrap">
        {subTabs.map(st => (
          <button key={st.key} onClick={() => { setSubTab(st.key); setPage(1); }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${subTab === st.key ? 'bg-[#8B1A1A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
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
                  {['RA Number', 'Partner', 'SOR Ref', 'Reason', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {returns.map((ret: ReturnSummary) => {
                  const cfg = RETURN_STATUS_CFG[ret.status] ?? { label: ret.status, color: 'bg-gray-100 text-gray-500' };
                  return (
                    <tr key={ret.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/orders/returns/${ret.id}`} className="font-mono font-semibold text-blue-600 hover:underline">{ret.number}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-sm text-gray-900">{ret.partnerName}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{ret.sorNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate">{ret.reason ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {subTab === 'inspected' && (
                            <button onClick={() => navigate('/settlement?tab=returns')}
                              className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors">
                              Issue Credit →
                            </button>
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

      {/* Process-flow tab bar */}
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

      {/* Tab content */}
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

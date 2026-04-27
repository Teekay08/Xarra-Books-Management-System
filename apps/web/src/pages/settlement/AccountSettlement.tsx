import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { api } from '../../lib/api';
import { Pagination } from '../../components/Pagination';

// ─── Micro-components ──────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-xarra-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon, message, sub }: { icon: string; message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm font-medium text-gray-600">{message}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    ISSUED: 'bg-blue-100 text-blue-700',
    PARTIAL: 'bg-yellow-100 text-yellow-700',
    PAID: 'bg-green-100 text-green-700',
    OVERDUE: 'bg-red-100 text-red-700',
    VOIDED: 'bg-gray-200 text-gray-400',
    PENDING: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    DISPUTED: 'bg-red-100 text-red-700',
    UNDER_REVIEW: 'bg-purple-100 text-purple-700',
    MATCHED: 'bg-purple-100 text-purple-700',
    APPLIED: 'bg-teal-100 text-teal-700',
    SOR_ACTIVE: 'bg-blue-100 text-blue-700',
    SOR_EXPIRED: 'bg-red-100 text-red-700',
    INVOICE_PENDING: 'bg-yellow-100 text-yellow-700',
    INVOICE_ISSUED: 'bg-indigo-100 text-indigo-700',
    AWAITING_PAYMENT: 'bg-orange-100 text-orange-700',
    PAYMENT_RECEIVED: 'bg-teal-100 text-teal-700',
    SETTLED: 'bg-green-100 text-green-700',
    REVIEWED: 'bg-blue-100 text-blue-700',
    SENT: 'bg-green-100 text-green-700',
    SENDING: 'bg-amber-100 text-amber-700',
  };
  const cls = map[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function fmt(n: number | string | null | undefined) {
  if (n == null) return '—';
  return `R ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ExpiryChip({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400 text-xs">No expiry</span>;
  if (days < 0)   return <span className="text-xs font-medium text-red-600">{Math.abs(days)}d overdue</span>;
  if (days <= 7)  return <span className="text-xs font-medium text-orange-600">{days}d left</span>;
  if (days <= 30) return <span className="text-xs font-medium text-yellow-600">{days}d left</span>;
  return <span className="text-xs text-gray-500">{days}d left</span>;
}

// ─── Tab 1 — Active SORs ───────────────────────────────────────────────────────

function ActiveSorsTab() {
  // 'invoiced' replaces the old misleading 'all' — uses filter=invoiced on the backend
  const [sub, setSub] = useState<'active' | 'expired' | 'invoiced'>('active');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Track which SOR ID has a pending invoice generation
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-sors', sub, page],
    queryFn: () => api<any>(`/settlement/sors?filter=${sub}&limit=20&page=${page}`),
  });

  const generateInvoice = useMutation({
    mutationFn: (sorId: string) => {
      setGeneratingId(sorId);
      return api<any>(`/settlement/sors/${sorId}/generate-invoice`, { method: 'POST' });
    },
    onSuccess: (data, sorId) => {
      setGeneratingId(null);
      queryClient.invalidateQueries({ queryKey: ['settlement-sors'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-stats'] });
      const inv = data?.data;
      if (inv?.id) navigate(`/invoices/${inv.id}`);
    },
    onError: (err: any, sorId) => {
      setGeneratingId(null);
      alert(`Failed to generate invoice: ${err?.message ?? 'Unknown error'}`);
    },
  });

  const sors = data?.data ?? [];
  const pagination = data?.pagination;

  const subTabs: { key: typeof sub; label: string }[] = [
    { key: 'active',   label: 'Active' },
    { key: 'expired',  label: 'Expired — Awaiting Invoice' },
    { key: 'invoiced', label: 'Invoiced' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => { setSub(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : sors.length === 0 ? (
        <EmptyState icon="📦" message="No SOR periods found" sub="Dispatched consignments with SOR terms will appear here" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pr-4 text-left font-medium">SOR Number</th>
                  <th className="py-2 pr-4 text-left font-medium">Partner</th>
                  <th className="py-2 pr-4 text-left font-medium">Dispatched</th>
                  <th className="py-2 pr-4 text-left font-medium">Expiry / Status</th>
                  <th className="py-2 pr-4 text-right font-medium">Dispatched</th>
                  <th className="py-2 pr-4 text-right font-medium">Sold</th>
                  <th className="py-2 pr-4 text-right font-medium">Est. Value</th>
                  <th className="py-2 pr-4 text-left font-medium">Invoice</th>
                  <th className="py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {sors.map((sor: any) => {
                  const isGenerating = generatingId === sor.id;
                  return (
                    <tr key={sor.id} className="border-b border-gray-100 hover:bg-white/60 transition-colors">
                      <td className="py-2.5 pr-4">
                        <Link to={`/consignments/${sor.id}`} className="font-mono text-xs text-xarra-red font-medium hover:underline">
                          {sor.proformaNumber}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-gray-800 text-xs">{sor.partnerName}</div>
                        {sor.branchName && <div className="text-[11px] text-gray-400">{sor.branchName}</div>}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(sor.dispatchDate)}</td>
                      <td className="py-2.5 pr-4">
                        <div className="text-xs text-gray-500">{fmtDate(sor.sorExpiryDate)}</div>
                        <ExpiryChip days={sor.daysUntilExpiry} />
                      </td>
                      <td className="py-2.5 pr-4 text-right text-xs text-gray-600">{sor.totalDispatched}</td>
                      <td className="py-2.5 pr-4 text-right text-xs text-gray-600">{sor.totalSold}</td>
                      <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(sor.estimatedValue)}</td>
                      <td className="py-2.5 pr-4">
                        {sor.invoiceNumber ? (
                          <div>
                            <Link to={`/invoices/${sor.invoiceId}`} className="font-mono text-xs text-indigo-600 hover:underline">
                              {sor.invoiceNumber}
                            </Link>
                            <div className="mt-0.5"><StatusBadge status={sor.invoiceStatus} /></div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {!sor.invoiceNumber && sor.totalSold > 0 ? (
                          <button
                            onClick={() => generateInvoice.mutate(sor.id)}
                            disabled={isGenerating}
                            className="px-2.5 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isGenerating ? '…' : 'Generate Invoice'}
                          </button>
                        ) : sor.invoiceId ? (
                          <Link to={`/invoices/${sor.invoiceId}`} className="text-xs text-blue-600 hover:underline">View →</Link>
                        ) : (
                          <span className="text-xs text-gray-400">No sales yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab 2 — Invoicing ─────────────────────────────────────────────────────────
// OVERDUE is not a DB status. We query ISSUED,PARTIAL and filter client-side
// for past-due invoices when the Overdue sub-tab is active.

function InvoicingTab() {
  const [sub, setSub] = useState<'DRAFT' | 'ISSUED' | 'OVERDUE'>('DRAFT');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  // Overdue: query all ISSUED/PARTIAL invoices then filter client-side
  const statusParam = sub === 'OVERDUE' ? 'ISSUED,PARTIAL' : sub;

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-invoices', sub, page],
    queryFn: () => api<any>(`/finance/invoices?status=${statusParam}&limit=50&page=${page}&consignmentOnly=true`),
  });

  const now = new Date();
  const allInvoices: any[] = data?.data ?? [];
  const invoices = sub === 'OVERDUE'
    ? allInvoices.filter(inv => inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'PAID')
    : allInvoices;

  const pagination = sub !== 'OVERDUE' ? data?.pagination : undefined;

  const subTabs = [
    { key: 'DRAFT',   label: 'Draft',              color: '' },
    { key: 'ISSUED',  label: 'Issued / Awaiting',  color: '' },
    { key: 'OVERDUE', label: 'Overdue',             color: '' },
  ] as const;

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => { setSub(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : invoices.length === 0 ? (
        <EmptyState icon="🧾"
          message={`No ${sub === 'OVERDUE' ? 'overdue' : sub.toLowerCase()} SOR invoices`}
          sub="SOR-linked invoices appear here once generated" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pr-4 text-left font-medium">Invoice</th>
                  <th className="py-2 pr-4 text-left font-medium">Partner</th>
                  <th className="py-2 pr-4 text-left font-medium">SOR</th>
                  <th className="py-2 pr-4 text-left font-medium">Invoice Date</th>
                  <th className="py-2 pr-4 text-left font-medium">Due Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th className="py-2 pr-4 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => {
                  const isOverdue = inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'PAID';
                  return (
                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-white/60">
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-indigo-600 font-medium">{inv.number}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-700">{inv.partner?.name ?? inv.partnerName ?? '—'}</td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-xarra-red">{inv.consignmentNumber ?? '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(inv.invoiceDate)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {fmtDate(inv.dueDate)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(inv.total)}</td>
                      <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(inv.balance ?? inv.total)}</td>
                      <td className="py-2.5 pr-4"><StatusBadge status={isOverdue && inv.status !== 'PAID' ? 'OVERDUE' : inv.status} /></td>
                      <td className="py-2.5">
                        <button onClick={() => navigate(`/invoices/${inv.id}`)} className="text-xs text-blue-600 hover:underline">
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab 3 — Returns & Credits ─────────────────────────────────────────────────

function ReturnsCreditTab() {
  const [sub, setSub] = useState<'pending' | 'credit-notes' | 'applied'>('pending');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['settlement-returns-pending', page],
    queryFn: () => api<any>(`/settlement/returns-pending-credit?limit=20&page=${page}`),
    enabled: sub === 'pending',
  });

  const { data: cnData, isLoading: cnLoading } = useQuery({
    queryKey: ['settlement-credit-notes', sub, page],
    queryFn: () => {
      const statusFilter = sub === 'applied' ? '&status=APPLIED' : '';
      return api<any>(`/settlement/credit-notes?limit=20&page=${page}${statusFilter}`);
    },
    enabled: sub !== 'pending',
  });

  const subTabs = [
    { key: 'pending',      label: 'Pending Credit' },
    { key: 'credit-notes', label: 'Credit Notes' },
    { key: 'applied',      label: 'Applied' },
  ] as const;

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => { setSub(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'pending' && (
        pendingLoading ? <LoadingSpinner /> : (pendingData?.data ?? []).length === 0 ? (
          <EmptyState icon="↩️" message="No returns awaiting credit" sub="Inspected/verified returns without a credit note will appear here" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                    <th className="py-2 pr-4 text-left font-medium">RA Number</th>
                    <th className="py-2 pr-4 text-left font-medium">Partner</th>
                    <th className="py-2 pr-4 text-left font-medium">SOR</th>
                    <th className="py-2 pr-4 text-left font-medium">Inspected</th>
                    <th className="py-2 pr-4 text-right font-medium">Good</th>
                    <th className="py-2 pr-4 text-right font-medium">Damaged</th>
                    <th className="py-2 pr-4 text-right font-medium">Est. Credit</th>
                    <th className="py-2 pr-4 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(pendingData?.data ?? []).map((ra: any) => (
                    <tr key={ra.id} className="border-b border-gray-100 hover:bg-white/60">
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-orange-600 font-medium">{ra.raNumber}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-700">{ra.partnerName}</td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-xarra-red">{ra.sorNumber ?? '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(ra.inspectedAt)}</td>
                      <td className="py-2.5 pr-4 text-right text-xs text-green-600 font-medium">{ra.qtyGood}</td>
                      <td className="py-2.5 pr-4 text-right text-xs text-yellow-600 font-medium">{ra.qtyDamaged}</td>
                      <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(ra.estimatedCredit)}</td>
                      <td className="py-2.5 pr-4"><StatusBadge status={ra.status} /></td>
                      <td className="py-2.5">
                        <button onClick={() => navigate(`/orders/returns/${ra.id}`)}
                          className="px-2.5 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700">
                          Issue Credit →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendingData?.pagination && pendingData.pagination.totalPages > 1 && (
              <div className="mt-4">
                <Pagination page={page} totalPages={pendingData.pagination.totalPages} total={pendingData.pagination.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )
      )}

      {sub !== 'pending' && (
        cnLoading ? <LoadingSpinner /> : (cnData?.data ?? []).length === 0 ? (
          <EmptyState icon="📋" message="No credit notes" sub="Credit notes linked to SOR returns appear here" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                    <th className="py-2 pr-4 text-left font-medium">Credit Note</th>
                    <th className="py-2 pr-4 text-left font-medium">Partner</th>
                    <th className="py-2 pr-4 text-left font-medium">RA Ref</th>
                    <th className="py-2 pr-4 text-left font-medium">SOR Ref</th>
                    <th className="py-2 pr-4 text-left font-medium">Invoice Ref</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-left font-medium">Date</th>
                    <th className="py-2 pr-4 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(cnData?.data ?? []).map((cn: any) => (
                    <tr key={cn.id} className="border-b border-gray-100 hover:bg-white/60">
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-teal-600 font-medium">{cn.number}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-700">{cn.partnerName}</td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-orange-500">{cn.raNumber ?? '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-xarra-red">{cn.sorNumber ?? '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-indigo-500">{cn.invoiceNumber ?? '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(cn.total)}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(cn.createdAt)}</td>
                      <td className="py-2.5 pr-4"><StatusBadge status={cn.status} /></td>
                      <td className="py-2.5">
                        <Link to={`/credit-notes/${cn.id}`} className="text-xs text-blue-600 hover:underline">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cnData?.pagination && cnData.pagination.totalPages > 1 && (
              <div className="mt-4">
                <Pagination page={page} totalPages={cnData.pagination.totalPages} total={cnData.pagination.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

// ─── Tab 4 — Statements ────────────────────────────────────────────────────────

function StatementsTab() {
  // Pending: DRAFT, REVIEWED, APPROVED (compiled but not yet sent)
  // Sent: SENT
  const [sub, setSub] = useState<'compile' | 'pending' | 'sent'>('compile');
  const navigate = useNavigate();

  const statusParam = sub === 'pending' ? 'DRAFT,REVIEWED,APPROVED' : 'SENT';

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-statement-batches', sub],
    queryFn: () => api<any>(`/statements/batches?status=${statusParam}`),
    enabled: sub !== 'compile',
  });

  const batches: any[] = data?.data ?? [];

  const subTabs = [
    { key: 'compile', label: 'Compile Statement' },
    { key: 'pending', label: 'Pending Send' },
    { key: 'sent',    label: 'Sent History' },
  ] as const;

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'compile' && (
        <div className="max-w-xl">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Generate Partner Statements</h3>
            <p className="text-xs text-gray-500 mb-5">
              Statements summarise all open invoices, applied credit notes, and outstanding balance for each partner.
              Statements are compiled and sent from the dedicated Statements module.
            </p>
            <Link
              to="/statements"
              className="inline-flex items-center gap-2 px-4 py-2 bg-xarra-red text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
            >
              Open Statements Module →
            </Link>
          </div>
        </div>
      )}

      {sub !== 'compile' && (
        isLoading ? <LoadingSpinner /> : batches.length === 0 ? (
          <EmptyState
            icon="📨"
            message={sub === 'pending' ? 'No statements pending send' : 'No sent statements yet'}
            sub="Statements generated from the Statements module appear here"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pr-4 text-left font-medium">Period</th>
                  <th className="py-2 pr-4 text-left font-medium">Label</th>
                  <th className="py-2 pr-4 text-right font-medium">Items</th>
                  <th className="py-2 pr-4 text-right font-medium">Sent</th>
                  <th className="py-2 pr-4 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b: any) => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-white/60">
                    <td className="py-2.5 pr-4 text-xs text-gray-500">
                      {fmtDate(b.periodFrom)} – {fmtDate(b.periodTo)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs font-medium text-gray-700">{b.periodLabel ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-right text-xs text-gray-600">{b.totalItems ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-right text-xs text-gray-600">{b.totalSent ?? '—'}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={b.status} /></td>
                    <td className="py-2.5">
                      <button onClick={() => navigate(`/statements?batch=${b.id}`)}
                        className="text-xs text-blue-600 hover:underline">
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Tab 5 — Remittances ───────────────────────────────────────────────────────

function RemittancesTab() {
  const [sub, setSub] = useState<'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'DISPUTED'>('PENDING');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-remittances', sub, page],
    queryFn: () => api<any>(`/finance/remittances?status=${sub}&limit=20&page=${page}`),
  });

  const remittances: any[] = data?.data ?? [];
  const pagination = data?.pagination;

  const subTabs: { key: typeof sub; label: string }[] = [
    { key: 'PENDING',      label: 'Pending Review' },
    { key: 'UNDER_REVIEW', label: 'Under Review' },
    { key: 'APPROVED',     label: 'Approved' },
    { key: 'DISPUTED',     label: 'Disputed' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => { setSub(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : remittances.length === 0 ? (
        <EmptyState
          icon="💳"
          message={`No ${sub.replace(/_/g, ' ').toLowerCase()} remittances`}
          sub="Partner payment remittances flow through this stage for review and approval"
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pr-4 text-left font-medium">Reference</th>
                  <th className="py-2 pr-4 text-left font-medium">Partner</th>
                  <th className="py-2 pr-4 text-left font-medium">Submitted</th>
                  <th className="py-2 pr-4 text-left font-medium">Payment Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th className="py-2 pr-4 text-right font-medium">Allocations</th>
                  <th className="py-2 pr-4 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {remittances.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-white/60">
                    <td className="py-2.5 pr-4">
                      {/* partnerRef is the correct field name; r.reference does not exist */}
                      <span className="font-mono text-xs text-purple-600 font-medium">
                        {r.partnerRef ?? r.id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-700">{r.partner?.name ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(r.createdAt)}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(r.paymentDate)}</td>
                    <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">
                      {/* totalAmount is the correct field; r.amount does not exist */}
                      {fmt(r.totalAmount)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-xs text-gray-600">
                      {r.invoiceAllocations?.length ?? '—'}
                    </td>
                    <td className="py-2.5 pr-4"><StatusBadge status={r.status} /></td>
                    <td className="py-2.5">
                      <button
                        onClick={() => navigate(`/remittances/${r.id}`)}
                        className={`px-2.5 py-1 text-white text-xs rounded ${
                          sub === 'PENDING' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-500 hover:bg-gray-600'
                        }`}
                      >
                        {sub === 'PENDING' ? 'Review →' : 'View →'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab 6 — Settled ──────────────────────────────────────────────────────────

function SettledTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-settled', year, page],
    queryFn: () => api<any>(`/settlement/settled?year=${year}&limit=20&page=${page}`),
  });

  const items: any[] = data?.data ?? [];
  const pagination = data?.pagination;

  const totalSettled = items.reduce((s, i) => s + Number(i.invoiceTotal ?? 0), 0);
  const avgDays = items.length
    ? Math.round(items.reduce((s, i) => s + (i.daysToSettle ?? 0), 0) / items.length)
    : 0;

  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500 font-medium">Year:</span>
        <div className="flex gap-1">
          {years.map(y => (
            <button key={y} onClick={() => { setYear(y); setPage(1); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                year === y ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Settled Invoices</p>
            <p className="text-xl font-bold text-gray-800 mt-0.5">{pagination?.total ?? items.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Revenue (this page)</p>
            <p className="text-xl font-bold text-green-700 mt-0.5">{fmt(totalSettled)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Avg. Days to Settle</p>
            <p className="text-xl font-bold text-gray-800 mt-0.5">{avgDays}d</p>
          </div>
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : items.length === 0 ? (
        <EmptyState icon="✅" message={`No settled invoices in ${year}`} sub="Fully paid SOR invoices will appear here" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pr-4 text-left font-medium">Invoice</th>
                  <th className="py-2 pr-4 text-left font-medium">SOR Number</th>
                  <th className="py-2 pr-4 text-left font-medium">Partner</th>
                  <th className="py-2 pr-4 text-left font-medium">Invoice Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 text-right font-medium">Sold / Dispatched</th>
                  <th className="py-2 pr-4 text-right font-medium">Returned</th>
                  <th className="py-2 pr-4 text-right font-medium">Days to Settle</th>
                  <th className="py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.consignmentId} className="border-b border-gray-100 hover:bg-white/60">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs text-indigo-600 font-medium">{item.invoiceNumber}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Link to={`/consignments/${item.consignmentId}`} className="font-mono text-xs text-xarra-red hover:underline">
                        {item.sorNumber}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-700">{item.partnerName}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(item.invoiceDate)}</td>
                    <td className="py-2.5 pr-4 text-right text-xs font-medium text-green-700">{fmt(item.invoiceTotal)}</td>
                    <td className="py-2.5 pr-4 text-right text-xs text-gray-600">
                      {item.totalSold} / {item.totalDispatched}
                      {item.totalDispatched > 0 && (
                        <span className="ml-1 text-gray-400">
                          ({Math.round((item.totalSold / item.totalDispatched) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-xs text-gray-500">{item.totalReturned}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className={`text-xs font-medium ${
                        item.daysToSettle > 90 ? 'text-red-500' :
                        item.daysToSettle > 60 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {item.daysToSettle ?? '—'}d
                      </span>
                    </td>
                    <td className="py-2.5">
                      <Link to={`/invoices/${item.invoiceId}`} className="text-xs text-blue-600 hover:underline">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Stats Banner ─────────────────────────────────────────────────────────────

function StatsBanner() {
  const { data } = useQuery({
    queryKey: ['settlement-stats'],
    queryFn: () => api<any>('/settlement/stats'),
  });
  const stats = data?.data;

  const cards = [
    { label: 'Active SORs',             value: stats?.activeSors          ?? '—', color: 'text-blue-600' },
    { label: 'Expired — Awaiting Inv.', value: stats?.expiredSors         ?? '—', color: (stats?.expiredSors ?? 0) > 0 ? 'text-red-600' : 'text-gray-700' },
    { label: 'Draft Invoices',          value: stats?.invoicePending       ?? '—', color: 'text-yellow-600' },
    { label: 'Issued / Awaiting',       value: stats?.invoiceIssued        ?? '—', color: 'text-indigo-600' },
    { label: 'Overdue',                 value: stats?.overdue              ?? '—', color: (stats?.overdue ?? 0) > 0 ? 'text-red-600 font-bold' : 'text-gray-700' },
    { label: 'Remittances Pending',     value: stats?.paymentReceived      ?? '—', color: 'text-purple-600' },
    { label: 'Settled (this year)',     value: stats?.settled              ?? '—', color: 'text-green-600' },
  ];

  return (
    <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 mb-5">
      {cards.map(c => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'sors' | 'invoicing' | 'returns' | 'statements' | 'remittances' | 'settled';

const TABS: { key: TabKey; num: number; label: string; desc: string }[] = [
  { key: 'sors',        num: 1, label: 'Active SORs',      desc: 'Periods & expiry tracking' },
  { key: 'invoicing',   num: 2, label: 'Invoicing',         desc: 'Draft, issued & overdue' },
  { key: 'returns',     num: 3, label: 'Returns & Credits', desc: 'Credit note issuance' },
  { key: 'statements',  num: 4, label: 'Statements',        desc: 'Compile & send' },
  { key: 'remittances', num: 5, label: 'Remittances',       desc: 'Review & approve' },
  { key: 'settled',     num: 6, label: 'Settled',           desc: 'Completed & metrics' },
];

export function AccountSettlement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam ?? 'sors');

  function switchTab(key: TabKey) {
    setActiveTab(key);
    setSearchParams({ tab: key }, { replace: true });
  }

  return (
    <div className="p-6 max-w-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Account Settlement</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          SOR lifecycle · invoicing · returns &amp; credits · statements · remittances · settlement
        </p>
      </div>

      <StatsBanner />

      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === tab.key
                ? 'bg-xarra-red text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
              activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.num}
            </span>
            <span>
              <span className="block text-[12px] font-semibold leading-tight">{tab.label}</span>
              <span className={`block text-[10px] leading-tight ${activeTab === tab.key ? 'text-white/75' : 'text-gray-400'}`}>
                {tab.desc}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 min-h-[400px]">
        {activeTab === 'sors'        && <ActiveSorsTab />}
        {activeTab === 'invoicing'   && <InvoicingTab />}
        {activeTab === 'returns'     && <ReturnsCreditTab />}
        {activeTab === 'statements'  && <StatementsTab />}
        {activeTab === 'remittances' && <RemittancesTab />}
        {activeTab === 'settled'     && <SettledTab />}
      </div>
    </div>
  );
}

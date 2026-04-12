import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';

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
    APPLIED: 'bg-teal-100 text-teal-700',
    SOR_ACTIVE: 'bg-blue-100 text-blue-700',
    SOR_EXPIRED: 'bg-red-100 text-red-700',
    INVOICE_PENDING: 'bg-yellow-100 text-yellow-700',
    INVOICE_ISSUED: 'bg-indigo-100 text-indigo-700',
    AWAITING_PAYMENT: 'bg-orange-100 text-orange-700',
    PAYMENT_RECEIVED: 'bg-teal-100 text-teal-700',
    SETTLED: 'bg-green-100 text-green-700',
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
  if (days < 0) return <span className="text-xs font-medium text-red-600">{Math.abs(days)}d overdue</span>;
  if (days <= 7) return <span className="text-xs font-medium text-orange-600">{days}d left</span>;
  if (days <= 30) return <span className="text-xs font-medium text-yellow-600">{days}d left</span>;
  return <span className="text-xs text-gray-500">{days}d left</span>;
}

// ─── Tab 1 — Active SORs ───────────────────────────────────────────────────────

function ActiveSorsTab() {
  const [sub, setSub] = useState<'active' | 'expired' | 'all'>('active');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-sors', sub],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settlement/sors?filter=${sub}&limit=100`);
      return res.json();
    },
  });

  const generateInvoice = useMutation({
    mutationFn: async (sorId: string) => {
      const res = await fetch(`/api/v1/settlement/sors/${sorId}/generate-invoice`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? 'Failed to generate invoice');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlement-sors'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-stats'] });
      const inv = data?.data;
      if (inv?.id) navigate(`/invoices/${inv.id}`);
    },
  });

  const sors = data?.data ?? [];

  const subTabs: { key: typeof sub; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'expired', label: 'Expired — Awaiting Invoice' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : sors.length === 0 ? (
        <EmptyState icon="📦" message="No SOR periods found" sub="Dispatched consignments with SOR terms will appear here" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="py-2 pr-4 text-left font-medium">SOR Number</th>
                <th className="py-2 pr-4 text-left font-medium">Partner</th>
                <th className="py-2 pr-4 text-left font-medium">Dispatched</th>
                <th className="py-2 pr-4 text-left font-medium">Expiry</th>
                <th className="py-2 pr-4 text-right font-medium">Dispatched</th>
                <th className="py-2 pr-4 text-right font-medium">Sold</th>
                <th className="py-2 pr-4 text-right font-medium">Est. Value</th>
                <th className="py-2 pr-4 text-left font-medium">Invoice</th>
                <th className="py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {sors.map((sor: any) => (
                <tr key={sor.id} className="border-b border-gray-100 hover:bg-white/60 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs text-xarra-red font-medium">{sor.proformaNumber}</span>
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
                        <span className="font-mono text-xs text-indigo-600">{sor.invoiceNumber}</span>
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
                        disabled={generateInvoice.isPending}
                        className="px-2.5 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {generateInvoice.isPending ? '...' : 'Generate Invoice'}
                      </button>
                    ) : sor.invoiceNumber ? (
                      <a href={`/invoices/${sor.invoiceId}`} className="text-xs text-blue-600 hover:underline">View →</a>
                    ) : (
                      <span className="text-xs text-gray-400">No sales yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2 — Invoicing ─────────────────────────────────────────────────────────

function InvoicingTab() {
  const [sub, setSub] = useState<'DRAFT' | 'ISSUED,PARTIAL' | 'OVERDUE'>('DRAFT');
  const navigate = useNavigate();

  const statusParam = sub; // comma-separated values are supported by the backend

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-invoices', sub],
    queryFn: async () => {
      const res = await fetch(`/api/v1/finance/invoices?status=${statusParam}&limit=100&consignmentOnly=true`);
      return res.json();
    },
  });

  const invoices = (data?.data ?? []).filter((inv: any) => {
    if (sub === 'ISSUED,PARTIAL') return ['ISSUED', 'PARTIAL'].includes(inv.status);
    if (sub === 'OVERDUE') return inv.status === 'OVERDUE' || (inv.status === 'ISSUED' && inv.dueDate && new Date(inv.dueDate) < new Date());
    return inv.status === sub;
  });

  const subTabs: { key: typeof sub; label: string; color: string }[] = [
    { key: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-600' },
    { key: 'ISSUED,PARTIAL', label: 'Issued / Awaiting', color: 'bg-blue-50 text-blue-700' },
    { key: 'OVERDUE', label: 'Overdue', color: 'bg-red-50 text-red-700' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key as any)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : invoices.length === 0 ? (
        <EmptyState icon="🧾" message={`No ${sub.replace(',', '/').toLowerCase()} invoices`} sub="SOR-linked invoices appear here once generated" />
      ) : (
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
              {invoices.map((inv: any) => (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-white/60">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs text-indigo-600 font-medium">{inv.number}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-gray-700">{inv.partnerName ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs text-xarra-red">{inv.consignmentNumber ?? '—'}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(inv.invoiceDate)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs ${inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== 'PAID' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {fmtDate(inv.dueDate)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(inv.total)}</td>
                  <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(inv.balance ?? inv.total)}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={inv.status} /></td>
                  <td className="py-2.5">
                    <button
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3 — Returns & Credits ─────────────────────────────────────────────────

function ReturnsCreditTab() {
  const [sub, setSub] = useState<'pending' | 'credit-notes' | 'applied'>('pending');
  const navigate = useNavigate();

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['settlement-returns-pending'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settlement/returns-pending-credit?limit=100');
      return res.json();
    },
    enabled: sub === 'pending',
  });

  const { data: cnData, isLoading: cnLoading } = useQuery({
    queryKey: ['settlement-credit-notes', sub],
    queryFn: async () => {
      const statusFilter = sub === 'applied' ? '&status=APPLIED' : '';
      const res = await fetch(`/api/v1/settlement/credit-notes?limit=100${statusFilter}`);
      return res.json();
    },
    enabled: sub !== 'pending',
  });

  const subTabs = [
    { key: 'pending', label: 'Pending Credit' },
    { key: 'credit-notes', label: 'Credit Notes' },
    { key: 'applied', label: 'Applied' },
  ] as const;

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'pending' && (
        pendingLoading ? <LoadingSpinner /> : (pendingData?.data ?? []).length === 0 ? (
          <EmptyState icon="↩️" message="No returns awaiting credit" sub="Inspected/verified returns without a credit note will appear here" />
        ) : (
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
                      <button
                        onClick={() => navigate(`/orders/returns/${ra.id}`)}
                        className="px-2.5 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                      >
                        Issue Credit →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {sub !== 'pending' && (
        cnLoading ? <LoadingSpinner /> : (cnData?.data ?? []).length === 0 ? (
          <EmptyState icon="📋" message="No credit notes" sub="Credit notes linked to SOR returns appear here" />
        ) : (
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
                      <a href={`/credit-notes/${cn.id}`} className="text-xs text-blue-600 hover:underline">View →</a>
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

// ─── Tab 4 — Statements ────────────────────────────────────────────────────────

function StatementsTab() {
  const [sub, setSub] = useState<'compile' | 'pending' | 'sent'>('compile');
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-statement-batches', sub],
    queryFn: async () => {
      const statusFilter = sub === 'pending' ? '?status=DRAFT' : sub === 'sent' ? '?status=SENT' : '';
      const res = await fetch(`/api/v1/statements/batches${statusFilter}`);
      return res.json();
    },
    enabled: sub !== 'compile',
  });

  const batches = data?.data ?? [];

  const subTabs = [
    { key: 'compile', label: 'Compile Statement' },
    { key: 'pending', label: 'Pending Send' },
    { key: 'sent', label: 'Sent History' },
  ] as const;

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'compile' && (
        <div className="max-w-xl">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Generate Partner Statement</h3>
            <p className="text-xs text-gray-500 mb-4">
              Statements summarise all open invoices, applied credit notes, and outstanding balance for a partner over a selected period.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date Range</label>
                <div className="flex gap-2">
                  <input type="date" className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-xarra-red" />
                  <input type="date" className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-xarra-red" />
                </div>
              </div>
            </div>
            <div className="mt-5">
              <button
                onClick={() => navigate('/statements')}
                className="px-4 py-2 bg-xarra-red text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
              >
                Go to Statements Module →
              </button>
            </div>
          </div>
        </div>
      )}

      {sub !== 'compile' && (
        isLoading ? <LoadingSpinner /> : batches.length === 0 ? (
          <EmptyState
            icon="📨"
            message={sub === 'pending' ? 'No draft statements pending send' : 'No sent statements yet'}
            sub="Statements generated from the Statements module appear here"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pr-4 text-left font-medium">Batch / Reference</th>
                  <th className="py-2 pr-4 text-left font-medium">Partner</th>
                  <th className="py-2 pr-4 text-left font-medium">Period</th>
                  <th className="py-2 pr-4 text-right font-medium">Invoices</th>
                  <th className="py-2 pr-4 text-right font-medium">Total Due</th>
                  <th className="py-2 pr-4 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b: any) => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-white/60">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs text-gray-700 font-medium">{b.reference ?? b.id.slice(0, 8)}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-700">{b.partnerName ?? 'All Partners'}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">
                      {fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-xs text-gray-600">{b.invoiceCount ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(b.totalDue)}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={b.status} /></td>
                    <td className="py-2.5">
                      <a href={`/statements/${b.id}`} className="text-xs text-blue-600 hover:underline">View →</a>
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
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-remittances', sub],
    queryFn: async () => {
      const res = await fetch(`/api/v1/finance/remittances?status=${sub}&limit=100`);
      return res.json();
    },
  });

  const remittances = data?.data ?? [];

  const subTabs: { key: typeof sub; label: string }[] = [
    { key: 'PENDING', label: 'Pending Review' },
    { key: 'UNDER_REVIEW', label: 'Under Review' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'DISPUTED', label: 'Disputed' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              sub === t.key ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : remittances.length === 0 ? (
        <EmptyState
          icon="💳"
          message={`No ${sub.replace('_', ' ').toLowerCase()} remittances`}
          sub="Partner payment remittances flow through this stage for review and approval"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="py-2 pr-4 text-left font-medium">Reference</th>
                <th className="py-2 pr-4 text-left font-medium">Partner</th>
                <th className="py-2 pr-4 text-left font-medium">Submitted</th>
                <th className="py-2 pr-4 text-left font-medium">Payment Date</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 pr-4 text-right font-medium">Invoices</th>
                <th className="py-2 pr-4 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {remittances.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-white/60">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs text-purple-600 font-medium">{r.reference ?? r.id.slice(0, 8)}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-gray-700">{r.partnerName ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(r.createdAt)}</td>
                  <td className="py-2.5 pr-4 text-xs text-gray-500">{fmtDate(r.paymentDate)}</td>
                  <td className="py-2.5 pr-4 text-right text-xs font-medium text-gray-800">{fmt(r.amount ?? r.totalAmount)}</td>
                  <td className="py-2.5 pr-4 text-right text-xs text-gray-600">{r.invoiceCount ?? '—'}</td>
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
      )}
    </div>
  );
}

// ─── Tab 6 — Settled ──────────────────────────────────────────────────────────

function SettledTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-settled', year],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settlement/settled?year=${year}&limit=100`);
      return res.json();
    },
  });

  const items = data?.data ?? [];

  // Aggregate summary
  const totalSettled = items.reduce((s: number, i: any) => s + Number(i.invoiceTotal ?? 0), 0);
  const avgDays = items.length
    ? Math.round(items.reduce((s: number, i: any) => s + (i.daysToSettle ?? 0), 0) / items.length)
    : 0;

  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div>
      {/* Year selector */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500 font-medium">Year:</span>
        <div className="flex gap-1">
          {years.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                year === y ? 'bg-xarra-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Settled Invoices</p>
            <p className="text-xl font-bold text-gray-800 mt-0.5">{items.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Revenue</p>
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
                    <span className="font-mono text-xs text-xarra-red">{item.sorNumber}</span>
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
                      item.daysToSettle > 60 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {item.daysToSettle ?? '—'}d
                    </span>
                  </td>
                  <td className="py-2.5">
                    <a href={`/invoices/${item.invoiceId}`} className="text-xs text-blue-600 hover:underline">View →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Stats Banner ─────────────────────────────────────────────────────────────

function StatsBanner() {
  const { data } = useQuery({
    queryKey: ['settlement-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settlement/stats');
      return res.json();
    },
  });
  const stats = data?.data;

  const cards = [
    { label: 'Active SORs', value: stats?.activeSors ?? '—', color: 'text-blue-600' },
    { label: 'Expired — Awaiting Invoice', value: stats?.expiredSors ?? '—', color: (stats?.expiredSors ?? 0) > 0 ? 'text-red-600' : 'text-gray-700' },
    { label: 'Draft Invoices', value: stats?.invoicePending ?? '—', color: 'text-yellow-600' },
    { label: 'Issued / Awaiting', value: stats?.invoiceIssued ?? '—', color: 'text-indigo-600' },
    { label: 'Overdue', value: stats?.overdue ?? '—', color: (stats?.overdue ?? 0) > 0 ? 'text-red-600 font-bold' : 'text-gray-700' },
    { label: 'Remittances Pending', value: stats?.paymentReceived ?? '—', color: 'text-purple-600' },
    { label: 'Settled (this year)', value: stats?.settled ?? '—', color: 'text-green-600' },
  ];

  return (
    <div className="grid grid-cols-7 gap-2 mb-5">
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
  { key: 'sors',        num: 1, label: 'Active SORs',       desc: 'Periods & expiry tracking' },
  { key: 'invoicing',   num: 2, label: 'Invoicing',          desc: 'Draft, issued & overdue' },
  { key: 'returns',     num: 3, label: 'Returns & Credits',  desc: 'Credit note issuance' },
  { key: 'statements',  num: 4, label: 'Statements',         desc: 'Compile & send' },
  { key: 'remittances', num: 5, label: 'Remittances',        desc: 'Review & approve' },
  { key: 'settled',     num: 6, label: 'Settled',            desc: 'Completed & metrics' },
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
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Account Settlement</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          SOR lifecycle · invoicing · returns &amp; credits · statements · remittances · settlement
        </p>
      </div>

      {/* Stats */}
      <StatsBanner />

      {/* Process-flow tab bar */}
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

      {/* Tab content */}
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

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { VoidReasonModal } from '../../components/VoidReasonModal';
import { formatR } from '../../lib/format';

interface Author { id: string; legalName: string; penName: string | null }
interface RoyaltyEntry {
  id: string;
  authorId: string;
  titleId: string;
  contractId: string;
  authorPaymentId: string | null;
  triggerType: string;
  periodFrom: string;
  periodTo: string;
  unitsSold: number;
  totalRevenue: string;
  grossRoyalty: string;
  advanceDeducted: string;
  netPayable: string;
  status: 'CALCULATED' | 'APPROVED' | 'PAID' | 'VOIDED';
  paidAt: string | null;
  paymentRef: string | null;
  createdAt: string;
  author: Author;
  title: { id: string; title: string };
}

interface AuthorPayment {
  id: string;
  number: string;
  authorId: string;
  periodFrom: string;
  periodTo: string;
  totalGrossRoyalty: string;
  totalAdvanceDeducted: string;
  totalNetPayable: string;
  amountDue: string;
  amountPaid: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
  paymentMethod: string | null;
  bankReference: string | null;
  paidAt: string | null;
  createdAt: string;
  author: Author;
  lines: { title: { title: string }; unitsSold: number; grossRoyalty: string; netPayable: string }[];
}

interface Contract {
  id: string;
  authorId: string;
  author: Author;
  title: { title: string };
  royaltyRatePrint: string;
  triggerType: string;
  triggerValue: string | null;
  advanceAmount: string | null;
  advanceRecovered: string | null;
  paymentFrequency: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  CALCULATED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  VOIDED: 'bg-gray-100 text-gray-400',
  PENDING: 'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-600',
  REVERSED: 'bg-red-50 text-red-400',
};

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtPeriod(from: string, to: string) {
  const f = new Date(from).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  const t = new Date(to).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  return f === t ? f : `${f} – ${t}`;
}

export function RoyaltiesAdmin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'ledger' | 'payments'>('ledger');

  // Ledger filters
  const [statusFilter, setStatusFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');

  // Selected entries for payment run
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [showCalculate, setShowCalculate] = useState(false);
  const [voidEntry, setVoidEntry] = useState<RoyaltyEntry | null>(null);
  const [showPaymentRun, setShowPaymentRun] = useState(false);
  const [processPayment, setProcessPayment] = useState<AuthorPayment | null>(null);
  const [detailEntry, setDetailEntry] = useState<RoyaltyEntry | null>(null);
  const [error, setError] = useState('');

  // Data
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['royalties-ledger', statusFilter, authorFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      if (authorFilter) params.set('authorId', authorFilter);
      return api<PaginatedResponse<RoyaltyEntry>>(`/royalties/?${params}`);
    },
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['royalties-payments', authorFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (authorFilter) params.set('authorId', authorFilter);
      return api<PaginatedResponse<AuthorPayment>>(`/royalties/payments?${params}`);
    },
    enabled: tab === 'payments',
  });

  const { data: authorsData } = useQuery({
    queryKey: ['authors-select'],
    queryFn: () => api<PaginatedResponse<Author>>('/authors?limit=500'),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => api(`/royalties/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/royalties/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
      setVoidEntry(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const paymentRunMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/royalties/payment-run', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['royalties-payments'] });
      setSelected(new Set());
      setShowPaymentRun(false);
      setTab('payments');
    },
    onError: (err: Error) => setError(err.message),
  });

  const processMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; bankReference: string; paymentMethod: string; notes?: string }) =>
      api(`/royalties/payments/${id}/process`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalties-payments'] });
      queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
      setProcessPayment(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const entries = ledgerData?.data ?? [];
  const payments = paymentsData?.data ?? [];
  const authors = authorsData?.data ?? [];

  // Entries that can form a payment run: APPROVED, same author as first selected
  const approvedEntries = entries.filter(e => e.status === 'APPROVED');
  const selectedEntries = entries.filter(e => selected.has(e.id));
  const selectedAuthorId = selectedEntries[0]?.authorId;
  const canCreateRun = selected.size > 0 &&
    selectedEntries.every(e => e.authorId === selectedAuthorId && e.status === 'APPROVED');

  function toggleSelect(id: string, authorId: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      // Can only select entries from same author
      if (selectedAuthorId && authorId !== selectedAuthorId) {
        setError('All selected entries must belong to the same author');
        return;
      }
      next.add(id);
    }
    setError('');
    setSelected(next);
  }

  return (
    <div>
      <PageHeader
        title="Royalties"
        subtitle="Manage author royalty calculations, approvals, and payments"
        action={
          <button
            onClick={() => setShowCalculate(true)}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Calculate Royalty
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex gap-6">
          {(['ledger', 'payments'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'ledger' ? 'Royalty Ledger' : 'Payment Runs'}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3 flex-wrap">
        <select
          value={authorFilter}
          onChange={(e) => { setAuthorFilter(e.target.value); setSelected(new Set()); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Authors</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>{a.penName ?? a.legalName}</option>
          ))}
        </select>
        {tab === 'ledger' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="CALCULATED">Calculated (pending approval)</option>
            <option value="APPROVED">Approved (ready to pay)</option>
            <option value="PAID">Paid</option>
            <option value="VOIDED">Voided</option>
          </select>
        )}
      </div>

      {/* Payment run action bar */}
      {tab === 'ledger' && selected.size > 0 && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{selected.size}</span> entries selected
            {selectedEntries.length > 0 && (
              <> · Total payable: <span className="font-semibold font-mono">
                {formatR(selectedEntries.reduce((s, e) => s + Number(e.netPayable), 0))}
              </span></>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              onClick={() => canCreateRun ? setShowPaymentRun(true) : setError('Only APPROVED entries from the same author can be included in a payment run')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
                canCreateRun ? 'bg-green-700 hover:bg-green-800' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Create Payment Run
            </button>
          </div>
        </div>
      )}

      {/* LEDGER TAB */}
      {tab === 'ledger' && (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          {ledgerLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No royalty entries found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Author</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Units</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Advance Ded.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Net Payable</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`hover:bg-gray-50 ${selected.has(entry.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {entry.status === 'APPROVED' && (
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={() => toggleSelect(entry.id, entry.authorId)}
                          className="rounded border-gray-300"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {entry.author.penName ?? entry.author.legalName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.title.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtPeriod(entry.periodFrom, entry.periodTo)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">{entry.unitsSold}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">{formatR(entry.grossRoyalty)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-amber-700">
                      {Number(entry.advanceDeducted) > 0 ? `-${formatR(entry.advanceDeducted)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-semibold text-gray-900">
                      {formatR(entry.netPayable)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.status]}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActionMenu items={[
                        {
                          label: 'View Detail',
                          onClick: () => setDetailEntry(entry),
                        },
                        {
                          label: 'Approve',
                          onClick: () => approveMut.mutate(entry.id),
                          hidden: entry.status !== 'CALCULATED',
                        },
                        {
                          label: 'Void',
                          onClick: () => setVoidEntry(entry),
                          variant: 'danger',
                          hidden: entry.status === 'PAID' || entry.status === 'VOIDED' || !!entry.authorPaymentId,
                        },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* PAYMENTS TAB */}
      {tab === 'payments' && (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          {paymentsLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No payment runs found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Author</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Net Payable</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Amount Paid</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Paid Date</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {payments.map((pmt) => (
                  <tr key={pmt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{pmt.number}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{pmt.author.penName ?? pmt.author.legalName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtPeriod(pmt.periodFrom, pmt.periodTo)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">{formatR(pmt.totalGrossRoyalty)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-semibold text-gray-900">{formatR(pmt.amountDue)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-green-700">
                      {Number(pmt.amountPaid) > 0 ? formatR(pmt.amountPaid) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[pmt.status]}`}>
                        {pmt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pmt.paidAt ? fmtDate(pmt.paidAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ActionMenu items={[
                        {
                          label: 'View Lines',
                          onClick: () => navigate(`/royalties/payments/${pmt.id}`),
                        },
                        {
                          label: 'Process Payment',
                          onClick: () => setProcessPayment(pmt),
                          hidden: pmt.status !== 'PENDING',
                        },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CALCULATE ROYALTY MODAL */}
      {showCalculate && (
        <CalculateModal
          authors={authors}
          onClose={() => setShowCalculate(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
            setShowCalculate(false);
          }}
        />
      )}

      {/* VOID MODAL */}
      {voidEntry && (
        <VoidReasonModal
          title="Void Royalty Entry"
          description={`Void royalty for ${voidEntry.author.penName ?? voidEntry.author.legalName} — ${voidEntry.title.title} (${fmtPeriod(voidEntry.periodFrom, voidEntry.periodTo)})`}
          isPending={voidMut.isPending}
          onClose={() => setVoidEntry(null)}
          onConfirm={(reason) => voidMut.mutate({ id: voidEntry.id, reason })}
        />
      )}

      {/* PAYMENT RUN MODAL */}
      {showPaymentRun && selectedAuthorId && (
        <PaymentRunModal
          entries={selectedEntries}
          authorId={selectedAuthorId}
          isPending={paymentRunMut.isPending}
          error={paymentRunMut.error?.message}
          onClose={() => setShowPaymentRun(false)}
          onConfirm={(periodFrom, periodTo, notes) =>
            paymentRunMut.mutate({
              authorId: selectedAuthorId,
              royaltyLedgerIds: selectedEntries.map(e => e.id),
              periodFrom,
              periodTo,
              notes: notes || undefined,
            })
          }
        />
      )}

      {/* PROCESS PAYMENT MODAL */}
      {processPayment && (
        <ProcessPaymentModal
          payment={processPayment}
          isPending={processMut.isPending}
          error={processMut.error?.message}
          onClose={() => setProcessPayment(null)}
          onConfirm={(bankRef, method, notes) =>
            processMut.mutate({ id: processPayment.id, bankReference: bankRef, paymentMethod: method, notes: notes || undefined })
          }
        />
      )}

      {/* DETAIL MODAL */}
      {detailEntry && (
        <EntryDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CalculateModal({ authors, onClose, onSuccess }: {
  authors: Author[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [authorId, setAuthorId] = useState('');
  const [contractId, setContractId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const { data: contractsData, isFetching } = useQuery({
    queryKey: ['author-contracts', authorId],
    queryFn: () => api<{ data: Contract[] }>(`/authors/${authorId}/contracts`),
    enabled: !!authorId,
  });

  const contracts = contractsData?.data ?? [];

  function handleAuthorChange(id: string) {
    setAuthorId(id);
    setContractId('');
  }

  const calcMut = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api('/royalties/calculate', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      if (data.data) {
        setResult({ success: true, entry: data.data, message: data.message });
      } else {
        setResult({ success: false, message: data.message, unitsSold: data.unitsSold, totalRevenue: data.totalRevenue });
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    calcMut.mutate({ contractId, periodFrom, periodTo });
  }

  const cls2 = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Calculate Royalty</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {result ? (
          <div className="space-y-4">
            {result.success ? (
              <div className="rounded-md bg-green-50 border border-green-200 p-4">
                <p className="text-sm font-semibold text-green-800">Royalty calculated successfully</p>
                <div className="mt-2 text-sm text-green-700 space-y-1">
                  <p>Gross Royalty: <span className="font-mono font-semibold">{formatR(result.entry.grossRoyalty)}</span></p>
                  {Number(result.entry.advanceDeducted) > 0 && (
                    <p>Advance Deducted: <span className="font-mono">-{formatR(result.entry.advanceDeducted)}</span></p>
                  )}
                  <p>Net Payable: <span className="font-mono font-semibold">{formatR(result.entry.netPayable)}</span></p>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm font-semibold text-amber-800">Trigger not met — no royalty created</p>
                <p className="text-sm text-amber-700 mt-1">{result.message}</p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              {result.success && (
                <button
                  onClick={() => { onSuccess(); }}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
                >
                  Done
                </button>
              )}
              <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author *</label>
              <select value={authorId} onChange={(e) => handleAuthorChange(e.target.value)} className={cls2} required>
                <option value="">Select author...</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>{a.penName ?? a.legalName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract / Title *</label>
              <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={cls2} required disabled={!authorId || isFetching}>
                <option value="">{isFetching ? 'Loading contracts...' : 'Select contract...'}</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title.title} — {Number(c.royaltyRatePrint) * 100}% ({c.triggerType})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period From *</label>
                <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={cls2} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period To *</label>
                <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={cls2} required />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={calcMut.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {calcMut.isPending ? 'Calculating...' : 'Calculate'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PaymentRunModal({ entries, authorId, isPending, error, onClose, onConfirm }: {
  entries: RoyaltyEntry[];
  authorId: string;
  isPending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (periodFrom: string, periodTo: string, notes: string) => void;
}) {
  const fromDates = entries.map(e => e.periodFrom).sort();
  const toDates = entries.map(e => e.periodTo).sort();
  const totalNet = entries.reduce((s, e) => s + Number(e.netPayable), 0);
  const [notes, setNotes] = useState('');

  const cls2 = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Payment Run</h3>

        <div className="rounded-md bg-gray-50 border border-gray-200 p-4 mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Entries included:</span>
            <span className="font-semibold">{entries.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Period covered:</span>
            <span className="font-mono">{fmtPeriod(fromDates[0], toDates[toDates.length - 1])}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
            <span className="font-semibold text-gray-900">Total Net Payable:</span>
            <span className="font-mono font-semibold text-green-700">{formatR(totalNet)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cls2} />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(fromDates[0], toDates[toDates.length - 1], notes)}
            disabled={isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create Payment Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessPaymentModal({ payment, isPending, error, onClose, onConfirm }: {
  payment: AuthorPayment;
  isPending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (bankRef: string, method: string, notes: string) => void;
}) {
  const [bankRef, setBankRef] = useState('');
  const [method, setMethod] = useState('EFT');
  const [notes, setNotes] = useState('');

  const cls2 = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bankRef.trim()) return;
    onConfirm(bankRef.trim(), method, notes);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Process Payment</h3>
        <p className="text-sm text-gray-500 mb-4">{payment.number} · {formatR(payment.amountDue)}</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Reference *</label>
            <input value={bankRef} onChange={(e) => setBankRef(e.target.value)} required className={cls2}
              placeholder="e.g. EFT-2026-001" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={cls2}>
              <option value="EFT">EFT</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cls2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isPending || !bankRef.trim()}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {isPending ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EntryDetailModal({ entry, onClose }: { entry: RoyaltyEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Royalty Detail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <dl className="space-y-2">
          {([
            ['Author', entry.author.penName ?? entry.author.legalName],
            ['Title', entry.title.title],
            ['Period', fmtPeriod(entry.periodFrom, entry.periodTo)],
            ['Trigger', entry.triggerType],
            ['Units Sold', String(entry.unitsSold)],
            ['Total Revenue', formatR(entry.totalRevenue)],
            ['Gross Royalty', formatR(entry.grossRoyalty)],
            ['Advance Deducted', Number(entry.advanceDeducted) > 0 ? `-${formatR(entry.advanceDeducted)}` : '—'],
            ['Net Payable', formatR(entry.netPayable)],
            ['Status', entry.status],
            ...(entry.paidAt ? [['Paid At', fmtDate(entry.paidAt)]] : []),
            ...(entry.paymentRef ? [['Payment Ref', entry.paymentRef]] : []),
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-xs text-gray-900 font-medium text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

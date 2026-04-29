import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatR } from '../../lib/format';
import { VoidReasonModal } from '../../components/VoidReasonModal';

interface PaymentLine {
  id: string;
  royaltyLedgerId: string;
  titleId: string;
  contractId: string | null;
  periodFrom: string;
  periodTo: string;
  unitsSold: number;
  totalRevenue: string;
  grossRoyalty: string;
  advanceDeducted: string;
  netPayable: string;
  title: { title: string };
  contract: { royaltyRatePrint: string; royaltyRateEbook: string } | null;
}

interface AuthorPaymentDetail {
  id: string;
  number: string;
  authorId: string;
  periodFrom: string;
  periodTo: string;
  totalGrossRoyalty: string;
  totalAdvanceDeducted: string;
  totalNetPayable: string;
  totalPreviouslyPaid: string;
  amountDue: string;
  amountPaid: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
  paymentMethod: string | null;
  bankReference: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  author: { legalName: string; penName: string | null };
  lines: PaymentLine[];
  createdByUser: { name: string; email: string } | null;
  processedByUser: { name: string; email: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:    'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED:  'bg-green-100 text-green-700',
  FAILED:     'bg-red-100 text-red-600',
  REVERSED:   'bg-red-50 text-red-400',
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtPeriod(from: string, to: string) {
  const f = new Date(from).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  const t = new Date(to).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  return f === t ? f : `${f} – ${t}`;
}

export function RoyaltiesPaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showProcess, setShowProcess] = useState(false);
  const [showReverse, setShowReverse] = useState(false);
  const [bankRef, setBankRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('EFT');
  const [processNotes, setProcessNotes] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['royalty-payment', id],
    queryFn: () => api<{ data: AuthorPaymentDetail }>(`/royalties/payments/${id}`),
    enabled: !!id,
  });

  const processMut = useMutation({
    mutationFn: (body: { bankReference: string; paymentMethod: string; notes?: string }) =>
      api(`/royalties/payments/${id}/process`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalty-payment', id] });
      queryClient.invalidateQueries({ queryKey: ['royalties-payments'] });
      queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
      setShowProcess(false);
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const reverseMut = useMutation({
    mutationFn: (reason: string) =>
      api(`/royalties/payments/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalty-payment', id] });
      queryClient.invalidateQueries({ queryKey: ['royalties-payments'] });
      queryClient.invalidateQueries({ queryKey: ['royalties-ledger'] });
      setShowReverse(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading...</div>;
  }

  const pmt = data?.data;
  if (!pmt) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500">Payment not found.</p>
        <Link to="/royalties" className="mt-2 inline-block text-sm text-green-700 hover:underline">← Back to Royalties</Link>
      </div>
    );
  }

  const authorName = pmt.author.penName ?? pmt.author.legalName;

  function handleProcess(e: React.FormEvent) {
    e.preventDefault();
    if (!bankRef.trim()) return;
    processMut.mutate({ bankReference: bankRef.trim(), paymentMethod, notes: processNotes || undefined });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link to="/royalties" className="inline-flex items-center text-sm text-green-700 hover:underline">
        &#8592; Royalties
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{pmt.number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{authorName} · {fmtPeriod(pmt.periodFrom, pmt.periodTo)}</p>
        </div>
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[pmt.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {pmt.status}
        </span>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Gross Royalty',     value: formatR(pmt.totalGrossRoyalty) },
          { label: 'Advance Deducted',  value: Number(pmt.totalAdvanceDeducted) > 0 ? `-${formatR(pmt.totalAdvanceDeducted)}` : '—' },
          { label: 'Amount Due',        value: formatR(pmt.amountDue) },
          { label: 'Amount Paid',       value: Number(pmt.amountPaid) > 0 ? formatR(pmt.amountPaid) : '—' },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1 font-mono">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Payment metadata */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Payment Details</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {[
            ['Payment Method',   pmt.paymentMethod ?? '—'],
            ['Bank Reference',   pmt.bankReference ?? '—'],
            ['Paid Date',        fmtDate(pmt.paidAt)],
            ['Period Covered',   fmtPeriod(pmt.periodFrom, pmt.periodTo)],
            ['Created',          fmtDate(pmt.createdAt)],
            ['Created By',       pmt.createdByUser?.name ?? '—'],
            ['Processed By',     pmt.processedByUser?.name ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-gray-50 py-1.5">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium text-gray-900 text-right">{v}</dd>
            </div>
          ))}
          {pmt.notes && (
            <div className="col-span-2 border-b border-gray-50 py-1.5">
              <dt className="text-gray-500 mb-1">Notes</dt>
              <dd className="text-gray-700 whitespace-pre-wrap text-xs">{pmt.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Line Items ({pmt.lines.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Title', 'Period', 'Units', 'Total Revenue', 'Gross Royalty', 'Advance Ded.', 'Net Payable'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pmt.lines.map(line => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{line.title.title}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{fmtPeriod(line.periodFrom, line.periodTo)}</td>
                  <td className="px-4 py-3 text-right font-mono">{line.unitsSold}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatR(line.totalRevenue)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatR(line.grossRoyalty)}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700">
                    {Number(line.advanceDeducted) > 0 ? `-${formatR(line.advanceDeducted)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatR(line.netPayable)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 text-sm text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatR(pmt.totalGrossRoyalty)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                  {Number(pmt.totalAdvanceDeducted) > 0 ? `-${formatR(pmt.totalAdvanceDeducted)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-green-800">{formatR(pmt.amountDue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {pmt.status === 'PENDING' && (
          <button
            onClick={() => setShowProcess(true)}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Process Payment
          </button>
        )}
        {pmt.status === 'COMPLETED' && (
          <button
            onClick={() => setShowReverse(true)}
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Reverse Payment
          </button>
        )}
        <button
          onClick={() => navigate('/royalties')}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Back to Royalties
        </button>
      </div>

      {/* Process Payment modal */}
      {showProcess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Process Payment</h3>
            <p className="text-sm text-gray-500 mb-4">{pmt.number} · {formatR(pmt.amountDue)}</p>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{error}</p>}
            <form onSubmit={handleProcess} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Reference *</label>
                <input
                  type="text" value={bankRef} onChange={e => setBankRef(e.target.value)} required autoFocus
                  placeholder="e.g. EFT-2026-001"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="EFT">EFT</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={processNotes} onChange={e => setProcessNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowProcess(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={processMut.isPending || !bankRef.trim()}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                  {processMut.isPending ? 'Processing…' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse modal */}
      {showReverse && (
        <VoidReasonModal
          title="Reverse Payment"
          description={`Reverse payment ${pmt.number} for ${authorName}. All linked ledger entries will revert to APPROVED.`}
          isPending={reverseMut.isPending}
          onClose={() => setShowReverse(false)}
          onConfirm={(reason) => reverseMut.mutate(reason)}
        />
      )}
    </div>
  );
}

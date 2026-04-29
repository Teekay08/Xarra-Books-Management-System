import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatR } from '../../lib/format';
import { VoidReasonModal } from '../../components/VoidReasonModal';

interface CreditNoteLine {
  id: string; lineNumber: number; description: string;
  quantity: string; unitPrice: string; lineTotal: string; lineTax: string;
  title?: { title: string; isbn: string } | null;
}

interface CreditNote {
  id: string; number: string; invoiceId: string; partnerId: string;
  subtotal: string; vatAmount: string; total: string;
  applied: string; available: string;
  reason: string; status: string;
  voidedAt: string | null; voidedReason: string | null;
  createdAt: string; reviewedAt: string | null; reviewNotes: string | null;
  reviewedBy: string | null; approvedBy: string | null; approvedAt: string | null;
  sentAt: string | null; sentTo: string | null;
  partner: { name: string }; invoice: { number: string };
  lines: CreditNoteLine[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:          { label: 'Draft',          color: 'text-gray-600',  bg: 'bg-gray-100',  border: 'border-gray-200'  },
  PENDING_REVIEW: { label: 'Pending Review', color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200' },
  APPROVED:       { label: 'Approved',       color: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200' },
  SENT:           { label: 'Sent',           color: 'text-blue-700',  bg: 'bg-blue-50',   border: 'border-blue-200'  },
  VOIDED:         { label: 'Voided',         color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200'   },
};

const LIFECYCLE = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT'];

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function WorkflowTracker({ status }: { status: string }) {
  if (status === 'VOIDED') return null;
  const labels: Record<string, string> = { DRAFT: 'Draft', PENDING_REVIEW: 'In Review', APPROVED: 'Approved', SENT: 'Sent' };
  const currentIdx = LIFECYCLE.indexOf(status);
  return (
    <div className="flex items-center gap-0 mb-5">
      {LIFECYCLE.map((s, i) => {
        const done  = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={`flex flex-col items-center gap-1 ${i < LIFECYCLE.length - 1 ? 'flex-1' : ''}`}>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                done   ? 'bg-green-600 border-green-600 text-white' :
                active ? 'bg-white border-green-600 text-green-600 ring-2 ring-green-100' :
                         'bg-white border-gray-200 text-gray-300'
              }`}>{done ? '✓' : i + 1}</div>
              <span className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                done ? 'text-green-600' : active ? 'text-gray-800' : 'text-gray-300'
              }`}>{labels[s]}</span>
            </div>
            {i < LIFECYCLE.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-0.5 ${done ? 'bg-green-500' : 'bg-gray-100'}`}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CreditNoteDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [reviewNotes,   setReviewNotes]   = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-note', id] });
    queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => api<{ data: CreditNote }>(`/finance/credit-notes/${id}`),
  });

  const submitMutation = useMutation({ mutationFn: () => api(`/finance/credit-notes/${id}/submit`, { method: 'POST' }), onSuccess: invalidate });
  const reviewMutation = useMutation({
    mutationFn: (approve: boolean) => api(`/finance/credit-notes/${id}/review`, { method: 'POST', body: JSON.stringify({ approve, notes: reviewNotes }) }),
    onSuccess: () => { setReviewNotes(''); invalidate(); },
  });
  const sendMutation   = useMutation({ mutationFn: () => api(`/finance/credit-notes/${id}/send`, { method: 'POST' }), onSuccess: invalidate });
  const voidMutation   = useMutation({
    mutationFn: (reason: string) => api(`/finance/credit-notes/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => { setShowVoidModal(false); invalidate(); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="text-sm text-gray-400">Loading…</div></div>;
  if (!data?.data) return <div className="flex flex-col items-center justify-center h-64 gap-3"><p className="text-sm text-gray-400">Credit note not found.</p><Link to="/credit-notes" className="text-xs text-blue-600 hover:underline">← Back</Link></div>;

  const cn     = data.data;
  const status = cn.voidedAt ? 'VOIDED' : (cn.status || 'DRAFT');
  const st     = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  const avail  = Number(cn.available ?? 0);
  const applied= Number(cn.applied ?? 0);
  const total  = Number(cn.total);

  return (
    <div className="space-y-5">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/credit-notes" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
          Credit Notes
        </Link>
        <span className="text-gray-200">/</span>
        <span className="text-xs text-gray-600 font-mono">{cn.number}</span>

        <div className="ml-auto flex items-center gap-2">
          <a href={`/api/v1/finance/credit-notes/${id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
            PDF
          </a>
          {status !== 'VOIDED' && (
            <button onClick={() => setShowVoidModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 shadow-sm transition-colors">
              Void
            </button>
          )}
        </div>
      </div>

      {/* ── Voided banner ───────────────────────────────────────── */}
      {status === 'VOIDED' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
            <span className="text-sm font-semibold text-red-700">This credit note has been voided</span>
          </div>
          {cn.voidedReason && <p className="text-xs text-red-600">{cn.voidedReason}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT: Document ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card px-5 pt-5 pb-5">
            <WorkflowTracker status={status} />

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
                    {st.label}
                  </span>
                  {cn.sentAt && <span className="text-[10px] text-gray-400">Sent {fmtDate(cn.sentAt)}</span>}
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight font-mono">{cn.number}</h1>
                <p className="text-xs text-gray-400 mt-0.5">Against invoice <Link to={`/invoices/${cn.invoiceId}`} className="font-mono text-blue-600 hover:underline">{cn.invoice?.number}</Link></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Credit Total</p>
                <p className="text-3xl font-black text-gray-900">{formatR(cn.total)}</p>
                {avail > 0 && <p className="text-xs font-semibold text-green-600 mt-0.5">{formatR(avail)} available</p>}
                {avail === 0 && applied > 0 && <p className="text-xs text-gray-400 mt-0.5">Fully applied</p>}
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-3 gap-5 mb-6 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">Partner</p>
                <p className="font-semibold text-gray-900">{cn.partner.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">Reason</p>
                <p className="text-gray-700">{cn.reason}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">Created</p>
                <p className="text-gray-700">{fmtDate(cn.createdAt)}</p>
                {cn.reviewedAt && <p className="text-gray-400 mt-1">Reviewed {fmtDate(cn.reviewedAt)}</p>}
              </div>
            </div>

            {/* Line items */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-8">#</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Description</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-14">Qty</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-24">Unit Price</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-20">Tax</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cn.lines.map(line => (
                    <tr key={line.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-300">{line.lineNumber}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {line.description}
                        {line.title?.isbn && <span className="block text-[10px] text-gray-400 font-normal">ISBN: {line.title.isbn}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{Number(line.quantity)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{formatR(line.unitPrice)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono">{formatR(line.lineTax)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatR(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-5">
              <div className="w-72 space-y-2 text-xs">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-mono">{formatR(cn.subtotal)}</span></div>
                <div className="flex justify-between text-gray-500"><span>VAT (15%)</span><span className="font-mono">{formatR(cn.vatAmount)}</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-sm text-gray-900">
                  <span>Credit Total</span><span className="font-mono">{formatR(cn.total)}</span>
                </div>
              </div>
            </div>

            {/* Review notes */}
            {cn.reviewNotes && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Review Notes</p>
                <p className="text-xs text-gray-600">{cn.reviewNotes}</p>
              </div>
            )}
          </div>

          {/* Credit balance card */}
          {status !== 'VOIDED' && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-xs font-semibold text-gray-900">Credit Balance</h3>
              </div>
              <div className="grid grid-cols-3 divide-x divide-gray-100">
                <div className="px-5 py-4 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Total Credit</p>
                  <p className="text-lg font-bold text-gray-900">{formatR(total)}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Applied</p>
                  <p className="text-lg font-bold text-amber-700">{formatR(applied)}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Remaining</p>
                  <p className={`text-lg font-bold ${avail > 0 ? 'text-green-700' : 'text-gray-400'}`}>{formatR(avail)}</p>
                </div>
              </div>
              {avail > 0 && (
                <div className="px-5 py-2 bg-green-50 border-t border-green-100 text-xs text-green-700">
                  {formatR(avail)} available to apply against outstanding invoices
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Workflow sidebar ──────────────────────────── */}
        <div className="space-y-4">

          {/* Workflow action cards */}
          {status === 'DRAFT' && (
            <div className="card p-5 border-2 border-amber-200 bg-amber-50/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Next Step</p>
              <p className="text-sm font-semibold text-gray-900 mb-1">Review line items</p>
              <p className="text-xs text-gray-500 mb-4">Once satisfied, submit for finance approval.</p>
              <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {submitMutation.isPending ? 'Submitting…' : 'Submit for Review →'}
              </button>
            </div>
          )}

          {status === 'PENDING_REVIEW' && (
            <div className="card p-5 border-2 border-orange-200 bg-orange-50/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Awaiting Review</p>
              <p className="text-sm font-semibold text-gray-900 mb-3">Approve or return to draft</p>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                placeholder="Review notes (optional)…" rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"/>
              <div className="flex gap-2">
                <button onClick={() => reviewMutation.mutate(true)} disabled={reviewMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-green-700 text-white text-xs font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors">
                  Approve
                </button>
                <button onClick={() => reviewMutation.mutate(false)} disabled={reviewMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors">
                  Return
                </button>
              </div>
            </div>
          )}

          {status === 'APPROVED' && (
            <div className="card p-5 border-2 border-green-200 bg-green-50/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Approved</p>
              <p className="text-sm font-semibold text-gray-900 mb-1">Ready to send</p>
              <p className="text-xs text-gray-500 mb-4">Mark as sent once transmitted to the partner.</p>
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {sendMutation.isPending ? 'Marking…' : 'Mark as Sent →'}
              </button>
            </div>
          )}

          {status === 'SENT' && (
            <div className="card p-5 border-2 border-blue-200 bg-blue-50/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Completed</p>
              <p className="text-sm font-semibold text-gray-900">Credit note sent</p>
              {cn.sentAt && <p className="text-xs text-gray-500 mt-1">{fmtDate(cn.sentAt)}{cn.sentTo ? ` → ${cn.sentTo}` : ''}</p>}
            </div>
          )}

          {/* Details */}
          <div className="card p-4 space-y-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Details</p>
            <div className="flex justify-between"><span className="text-gray-400">Number</span><span className="font-mono font-medium text-gray-900">{cn.number}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Invoice</span>
              <Link to={`/invoices/${cn.invoiceId}`} className="font-mono text-blue-600 hover:underline">{cn.invoice?.number}</Link>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Partner</span><span className="text-gray-700">{cn.partner.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Created</span><span className="text-gray-700">{fmtDate(cn.createdAt)}</span></div>
            {cn.approvedAt && <div className="flex justify-between"><span className="text-gray-400">Approved</span><span className="text-gray-700">{fmtDate(cn.approvedAt)}</span></div>}
          </div>
        </div>
      </div>

      {showVoidModal && (
        <VoidReasonModal
          title="Void Credit Note"
          description={`Void credit note ${cn.number}? This action cannot be undone.`}
          isPending={voidMutation.isPending}
          onClose={() => setShowVoidModal(false)}
          onConfirm={reason => voidMutation.mutate(reason)}
        />
      )}
    </div>
  );
}

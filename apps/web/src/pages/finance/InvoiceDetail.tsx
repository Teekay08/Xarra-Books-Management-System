import { useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { DocumentEmailModal } from '../../components/DocumentEmailModal';
import { VoidReasonModal } from '../../components/VoidReasonModal';
import { formatR } from '../../lib/format';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  id: string; lineNumber: number; description: string;
  quantity: string; unitPrice: string; discountPct: string;
  lineTotal: string; lineTax: string;
}
interface PaymentRecord {
  paymentId: string; amount: string; paymentDate: string;
  bankReference: string | null; paymentMethod: string | null;
}
interface Invoice {
  id: string; number: string; invoiceDate: string; dueDate: string | null;
  subtotal: string; vatAmount: string; total: string; status: string;
  notes: string | null; purchaseOrderNumber: string | null;
  customerReference: string | null; paymentTermsText: string | null;
  sentAt: string | null; sentTo: string | null; issuedAt: string | null;
  voidedAt: string | null; voidedReason: string | null;
  amountPaid: string; creditNotesTotal: string; effectiveTotal: string; amountDue: string;
  partnerId: string;
  partner: {
    id: string; name: string; contactName: string | null; contactEmail: string | null;
    contactPhone: string | null; addressLine1: string | null; addressLine2: string | null;
    city: string | null; province: string | null; postalCode: string | null; vatNumber: string | null;
  };
  lines: InvoiceLine[];
  creditNotes?: { id: string; number: string; total: string; reason: string }[];
  paymentHistory?: PaymentRecord[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMethod(m: string | null) {
  if (!m) return 'EFT';
  return m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: 'Draft',     color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-200'  },
  ISSUED:    { label: 'Issued',    color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'  },
  SENT:      { label: 'Sent',      color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200'},
  OVERDUE:   { label: 'Overdue',   color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'   },
  PARTIAL:   { label: 'Partial',   color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  PAID:      { label: 'Paid',      color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200' },
  VOIDED:    { label: 'Voided',    color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'   },
  CANCELLED: { label: 'Cancelled', color: 'text-gray-500',   bg: 'bg-gray-100',   border: 'border-gray-200'  },
};

const LIFECYCLE = ['DRAFT', 'ISSUED', 'SENT', 'PAID'];
function LifecycleTracker({ status }: { status: string }) {
  if (status === 'VOIDED' || status === 'CANCELLED') return null;
  const currentIdx = LIFECYCLE.indexOf(status === 'PARTIAL' || status === 'OVERDUE' ? 'SENT' : status);
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
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                done ? 'text-green-600' : active ? 'text-gray-800' : 'text-gray-300'
              }`}>{s}</span>
            </div>
            {i < LIFECYCLE.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-0.5 ${done ? 'bg-green-500' : 'bg-gray-100'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showMoreMenu,      setShowMoreMenu]      = useState(false);
  const [showSendModal,     setShowSendModal]      = useState(false);
  const [showPaymentModal,  setShowPaymentModal]   = useState(false);
  const [showCreditModal,   setShowCreditModal]    = useState(false);
  const [showRecipientModal,setShowRecipientModal] = useState(false);
  const [showVoidModal,     setShowVoidModal]      = useState(false);
  const [cnError,           setCnError]            = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<{ data: Invoice }>(`/finance/invoices/${id}`),
  });

  const issueMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}/issue`, { method: 'POST' }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });
  const voidMutation = useMutation({
    mutationFn: (reason: string) => api(`/finance/invoices/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });
  const markSentMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}/mark-sent`, { method: 'POST' }),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['invoice', id] }); setShowMoreMenu(false); },
  });
  const duplicateMutation = useMutation({
    mutationFn: () => api<{ data: { id: string } }>(`/finance/invoices/${id}/duplicate`, { method: 'POST' }),
    onSuccess:  (res) => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); navigate(`/finance/invoices/${res.data.id}`); },
  });
  const deleteMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}`, { method: 'DELETE' }),
    onSuccess:  () => navigate('/finance/invoices'),
  });
  const sendMutation = useMutation({
    mutationFn: (d: { email: string; cc: string; bcc: string; subject: string; message: string }) =>
      api(`/finance/invoices/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: d.email, cc: d.cc || undefined, bcc: d.bcc || undefined, subject: d.subject, message: d.message || undefined }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoice', id] }); setShowSendModal(false); },
  });
  const paymentMutation = useMutation({
    mutationFn: (body: { partnerId: string; amount: number; paymentDate: string; paymentMethod: string; bankReference?: string; invoiceAllocations: { invoiceId: string; amount: number }[] }) =>
      api('/finance/payments', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Idempotency-Key': crypto.randomUUID() } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoice', id] }); setShowPaymentModal(false); },
  });
  const creditNoteMutation = useMutation({
    mutationFn: (body: { reason: string; lines: { invoiceLineId: string; quantity: number }[] }) => {
      const inv = data?.data;
      const apiLines = body.lines.map(cl => {
        const il = inv?.lines.find(l => l.id === cl.invoiceLineId);
        return { description: il?.description ?? '', quantity: cl.quantity, unitPrice: Number(il?.unitPrice ?? 0), discountPct: Number(il?.discountPct ?? 0) };
      });
      return api(`/finance/invoices/${id}/credit-notes`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason, lines: apiLines }),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoice', id] }); setShowCreditModal(false); },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm text-gray-400">Loading invoice…</div>
    </div>
  );
  if (!data?.data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-sm text-gray-400">Invoice not found.</p>
      <Link to="/finance/invoices" className="text-xs text-blue-600 hover:underline">← Back to invoices</Link>
    </div>
  );

  const inv         = data.data;
  const st          = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT;
  const amountDue   = Number(inv.amountDue   ?? inv.total);
  const amountPaid  = Number(inv.amountPaid  ?? 0);
  const cnTotal     = Number(inv.creditNotesTotal ?? 0);
  const subtotal    = Number(inv.subtotal);
  const vatAmount   = Number(inv.vatAmount);
  const total       = Number(inv.total);
  const isDraft     = inv.status === 'DRAFT';
  const isVoided    = inv.status === 'VOIDED';
  const canPay      = !isDraft && !isVoided && amountDue > 0;
  const canCredit   = !isDraft && !isVoided;
  const canVoid     = !isDraft && !isVoided;
  const canSend     = !isVoided;

  const partnerAddr = [inv.partner.addressLine1, inv.partner.addressLine2, inv.partner.city, inv.partner.province, inv.partner.postalCode].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/finance/invoices" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
          Invoices
        </Link>
        <span className="text-gray-200">/</span>
        <span className="text-xs text-gray-600 font-mono">{inv.number}</span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Primary actions */}
          {isDraft && (
            <>
              <button onClick={() => navigate(`/finance/invoices/${id}/edit`)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                Edit
              </button>
              <button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors disabled:opacity-50">
                {issueMutation.isPending ? 'Issuing…' : 'Issue Invoice →'}
              </button>
            </>
          )}
          {canPay && (
            <button onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors">
              Record Payment
            </button>
          )}
          {/* PDF */}
          <a href={`/api/v1/finance/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            PDF
          </a>
          {/* More */}
          <div className="relative">
            <button onClick={() => setShowMoreMenu(p => !p)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
              More
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden"
                onMouseLeave={() => setShowMoreMenu(false)}>
                {canSend && (
                  <button onClick={() => { setShowSendModal(true); setShowMoreMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
                    Send via Email
                  </button>
                )}
                {!inv.sentAt && canSend && (
                  <button onClick={() => markSentMutation.mutate()}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                    Mark as Sent
                  </button>
                )}
                {canCredit && (
                  <button onClick={() => { setShowCreditModal(true); setShowMoreMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>
                    Issue Credit Note
                  </button>
                )}
                <button onClick={() => { duplicateMutation.mutate(); setShowMoreMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>
                  Duplicate
                </button>
                <div className="border-t border-gray-100 my-0.5" />
                {canVoid && (
                  <button onClick={() => { setShowVoidModal(true); setShowMoreMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                    Void Invoice
                  </button>
                )}
                {isDraft && (
                  <button onClick={() => { if (confirm('Delete this draft?')) { deleteMutation.mutate(); setShowMoreMenu(false); } }}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                    Delete Draft
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Voided banner ───────────────────────────────────────── */}
      {isVoided && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            <span className="text-sm font-semibold text-red-700">This invoice has been voided</span>
          </div>
          {inv.voidedReason && <p className="text-xs text-red-600">{inv.voidedReason}</p>}
          {inv.voidedAt && <p className="text-[10px] text-red-400 mt-1">{fmtDate(inv.voidedAt)}</p>}
        </div>
      )}

      {/* ── Main grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT: Invoice document ──────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Lifecycle tracker */}
          <div className="card px-5 pt-5 pb-4">
            <LifecycleTracker status={inv.status} />

            {/* Header row: status + number + amounts */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
                    {st.label}
                  </span>
                  {inv.sentAt && !isVoided && (
                    <span className="text-[10px] text-gray-400">Sent {fmtDate(inv.sentAt)}{inv.sentTo ? ` → ${inv.sentTo}` : ''}</span>
                  )}
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight font-mono">{inv.number}</h1>
                {inv.purchaseOrderNumber && (
                  <p className="text-[10px] text-gray-400 mt-0.5">PO: {inv.purchaseOrderNumber}</p>
                )}
                {inv.customerReference && (
                  <p className="text-[10px] text-gray-400">Ref: {inv.customerReference}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Invoice Total</p>
                <p className="text-3xl font-black text-gray-900">{formatR(total)}</p>
                {amountDue > 0 && !isVoided && (
                  <p className={`text-xs font-semibold mt-0.5 ${inv.status === 'OVERDUE' ? 'text-red-600' : 'text-amber-600'}`}>
                    {formatR(amountDue)} due {inv.dueDate ? fmtDate(inv.dueDate) : ''}
                  </p>
                )}
                {amountDue <= 0 && !isVoided && inv.status !== 'DRAFT' && (
                  <p className="text-xs font-semibold text-green-600 mt-0.5">Fully paid</p>
                )}
              </div>
            </div>

            {/* From / To / Dates */}
            <div className="grid grid-cols-3 gap-5 mb-6 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">From</p>
                <p className="font-semibold text-gray-900">Xarra Books (Pty) Ltd</p>
                <p className="text-gray-500 mt-0.5">Midrand, Gauteng</p>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Bill To</p>
                  <button onClick={() => setShowRecipientModal(true)}
                    className="text-gray-300 hover:text-blue-500 transition-colors" title="Edit recipient">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                  </button>
                </div>
                <p className="font-semibold text-gray-900">{inv.partner.name}</p>
                {inv.partner.contactName  && <p className="text-gray-500">{inv.partner.contactName}</p>}
                {inv.partner.contactEmail && <p className="text-gray-500">{inv.partner.contactEmail}</p>}
                {partnerAddr && <p className="text-gray-500 mt-0.5">{partnerAddr}</p>}
                {inv.partner.vatNumber && <p className="text-gray-400 mt-0.5">VAT: {inv.partner.vatNumber}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">Dates</p>
                <div className="space-y-1">
                  <div><span className="text-gray-400">Issued: </span><span className="font-medium text-gray-900">{fmtDate(inv.invoiceDate)}</span></div>
                  <div><span className="text-gray-400">Due: </span><span className={`font-medium ${inv.status === 'OVERDUE' ? 'text-red-600' : 'text-gray-900'}`}>{fmtDate(inv.dueDate)}</span></div>
                  {inv.paymentTermsText && <div className="text-gray-400">{inv.paymentTermsText}</div>}
                </div>
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
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-16">Disc</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inv.lines.map(line => (
                    <tr key={line.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-300">{line.lineNumber}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{line.description}</td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{line.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{formatR(line.unitPrice)}</td>
                      <td className="px-4 py-3 text-right">
                        {Number(line.discountPct) > 0
                          ? <span className="text-amber-600 font-medium">{Number(line.discountPct)}%</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatR(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-5">
              <div className="w-72 space-y-2 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>VAT (15%)</span>
                  <span className="font-mono">{formatR(vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-sm text-gray-900">
                  <span>Invoice Total</span>
                  <span className="font-mono">{formatR(total)}</span>
                </div>
                {cnTotal > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Credit Notes Applied</span>
                    <span className="font-mono">− {formatR(cnTotal)}</span>
                  </div>
                )}
                {amountPaid > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Payments Received</span>
                    <span className="font-mono">− {formatR(amountPaid)}</span>
                  </div>
                )}
                {(cnTotal > 0 || amountPaid > 0) && (
                  <div className={`flex justify-between border-t pt-2 font-bold text-sm ${amountDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    <span>Balance Due</span>
                    <span className="font-mono">{formatR(amountDue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {inv.notes && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Notes</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{inv.notes}</p>
              </div>
            )}
          </div>

          {/* Payment History */}
          {inv.paymentHistory && inv.paymentHistory.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-xs font-semibold text-gray-900">Payment History</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {inv.paymentHistory.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-900">{fmtMethod(p.paymentMethod)}</p>
                      <p className="text-[10px] text-gray-400">{fmtDate(p.paymentDate)}{p.bankReference ? ` · Ref: ${p.bankReference}` : ''}</p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-green-700">{formatR(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit Notes */}
          {inv.creditNotes && inv.creditNotes.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-xs font-semibold text-gray-900">Credit Notes</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {inv.creditNotes.map(cn => (
                  <div key={cn.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-mono font-medium text-gray-900">{cn.number}</p>
                      <p className="text-[10px] text-gray-400">{cn.reason}</p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-red-600">− {formatR(cn.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Status sidebar ───────────────────────────── */}
        <div className="space-y-4">

          {/* Amount due / paid card */}
          {!isVoided && (
            <div className={`card p-5 border-2 ${
              inv.status === 'PAID' ? 'border-green-200 bg-green-50/30' :
              amountDue > 0 ? 'border-amber-200 bg-amber-50/30' :
              'border-gray-100'
            }`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                {inv.status === 'PAID' ? 'Paid in Full' : 'Amount Due'}
              </p>
              <p className={`text-3xl font-black leading-none ${
                inv.status === 'PAID' ? 'text-green-700' : amountDue > 0 ? 'text-amber-700' : 'text-gray-900'
              }`}>
                {formatR(inv.status === 'PAID' ? total : amountDue)}
              </p>
              {inv.dueDate && amountDue > 0 && (
                <p className={`text-xs mt-1.5 font-medium ${inv.status === 'OVERDUE' ? 'text-red-600' : 'text-gray-500'}`}>
                  Due {fmtDate(inv.dueDate)}
                </p>
              )}
              {canPay && (
                <button onClick={() => setShowPaymentModal(true)}
                  className="mt-3 w-full py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] transition-colors">
                  Record Payment
                </button>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div className="card p-4 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">Actions</p>
            {canSend && (
              <button onClick={() => setShowSendModal(true)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
                Send Invoice
              </button>
            )}
            <a href={`/api/v1/finance/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
              Download PDF
            </a>
            <button onClick={() => window.print()}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>
              Print
            </button>
            <button onClick={() => duplicateMutation.mutate()}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>
              Duplicate
            </button>
          </div>

          {/* Invoice meta */}
          <div className="card p-4 space-y-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Invoice Details</p>
            <div className="flex justify-between">
              <span className="text-gray-400">Number</span>
              <span className="font-mono font-medium text-gray-900">{inv.number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Invoice Date</span>
              <span className="text-gray-700">{fmtDate(inv.invoiceDate)}</span>
            </div>
            {inv.dueDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Due Date</span>
                <span className={inv.status === 'OVERDUE' ? 'text-red-600 font-medium' : 'text-gray-700'}>{fmtDate(inv.dueDate)}</span>
              </div>
            )}
            {inv.paymentTermsText && (
              <div className="flex justify-between">
                <span className="text-gray-400">Terms</span>
                <span className="text-gray-700">{inv.paymentTermsText}</span>
              </div>
            )}
            {inv.purchaseOrderNumber && (
              <div className="flex justify-between">
                <span className="text-gray-400">PO Number</span>
                <span className="font-mono text-gray-700">{inv.purchaseOrderNumber}</span>
              </div>
            )}
            {inv.customerReference && (
              <div className="flex justify-between">
                <span className="text-gray-400">Customer Ref</span>
                <span className="font-mono text-gray-700">{inv.customerReference}</span>
              </div>
            )}
            {inv.issuedAt && (
              <div className="flex justify-between">
                <span className="text-gray-400">Issued</span>
                <span className="text-gray-700">{fmtDate(inv.issuedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showSendModal && (
        <DocumentEmailModal
          title="Send Invoice via Email"
          documentNumber={inv.number}
          pdfUrl={`/api/v1/finance/invoices/${id}/pdf`}
          defaultEmail={inv.partner.contactEmail ?? ''}
          defaultSubject={`Invoice ${inv.number} from Xarra Books`}
          isPending={sendMutation.isPending}
          error={sendMutation.isError ? (sendMutation.error as Error).message : undefined}
          onClose={() => setShowSendModal(false)}
          onSend={sendMutation.mutate}
        />
      )}
      {showPaymentModal && (
        <RecordPaymentModal
          amountDue={amountDue}
          isPending={paymentMutation.isPending}
          onClose={() => setShowPaymentModal(false)}
          onSubmit={(amount, method, ref, date) => paymentMutation.mutate({
            partnerId: inv.partnerId ?? inv.partner.id,
            amount, paymentDate: date, paymentMethod: method,
            bankReference: ref || undefined,
            invoiceAllocations: [{ invoiceId: inv.id, amount }],
          })}
        />
      )}
      {showCreditModal && (
        <CreditNoteModal
          lines={inv.lines}
          error={cnError}
          isPending={creditNoteMutation.isPending}
          onClose={() => { setShowCreditModal(false); setCnError(''); }}
          onSubmit={(reason, lines) => {
            setCnError('');
            creditNoteMutation.mutate({ reason, lines }, { onError: e => setCnError(e.message) });
          }}
        />
      )}
      {showVoidModal && (
        <VoidReasonModal
          title="Void Invoice"
          description={`Void ${inv.number}? This cannot be undone.`}
          isPending={voidMutation.isPending}
          onClose={() => setShowVoidModal(false)}
          onConfirm={reason => voidMutation.mutate(reason, { onSuccess: () => setShowVoidModal(false) })}
        />
      )}
      {showRecipientModal && (
        <RecipientEditModal
          recipient={{
            partnerId: inv.partnerId ?? inv.partner.id,
            partnerName: inv.partner.name,
            contactName: inv.partner.contactName,
            contactEmail: inv.partner.contactEmail,
            contactPhone: inv.partner.contactPhone,
            addressLine1: inv.partner.addressLine1,
            addressLine2: inv.partner.addressLine2,
            city: inv.partner.city,
            province: inv.partner.province,
            postalCode: inv.partner.postalCode,
            vatNumber: inv.partner.vatNumber,
          }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['invoice', id] })}
        />
      )}
    </div>
  );
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({ amountDue, isPending, onClose, onSubmit }: {
  amountDue: number;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (amount: number, method: string, ref: string, date: string) => void;
}) {
  const [amount, setAmount] = useState(amountDue.toFixed(2));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [ref,    setRef]    = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Record Payment</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="form-label">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0.01"
                className="input pl-7" />
            </div>
          </div>
          <div className="col-span-2">
            <label className="form-label">Payment Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="select">
              <option value="BANK_TRANSFER">Bank Transfer / EFT</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div>
            <label className="form-label">Bank Reference</label>
            <input value={ref} onChange={e => setRef(e.target.value)} className="input" placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">Payment Date *</label>
            <input value={date} onChange={e => setDate(e.target.value)} type="date" className="input" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => onSubmit(Number(amount), method, ref, date)} disabled={!amount || isPending}
            className="flex-1 py-2.5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors">
            {isPending ? 'Recording…' : 'Record Payment'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Credit Note Modal ────────────────────────────────────────────────────────

function CreditNoteModal({ lines, error, isPending, onClose, onSubmit }: {
  lines: InvoiceLine[];
  error: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (reason: string, lines: { invoiceLineId: string; quantity: number }[]) => void;
}) {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cnLines = Object.entries(selected).filter(([, qty]) => qty > 0).map(([invoiceLineId, quantity]) => ({ invoiceLineId, quantity }));
    if (!cnLines.length) return;
    onSubmit(reason, cnLines);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">Issue Credit Note</h3>
            <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}
          <div>
            <label className="form-label">Reason *</label>
            <input value={reason} onChange={e => setReason(e.target.value)} required className="input"
              placeholder="e.g. Damaged goods returned, pricing error" />
          </div>
          <div>
            <label className="form-label mb-2 block">Line items to credit</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
              {lines.map(line => (
                <div key={line.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input type="number" min={0} max={Number(line.quantity)}
                    value={selected[line.id] ?? 0}
                    onChange={e => setSelected(prev => ({ ...prev, [line.id]: Number(e.target.value) }))}
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="flex-1 text-xs">
                    <p className="font-medium text-gray-900">{line.description}</p>
                    <p className="text-gray-400">{line.quantity} × {formatR(line.unitPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending || !reason}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {isPending ? 'Creating…' : 'Create Credit Note'}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

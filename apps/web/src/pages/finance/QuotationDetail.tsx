import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatR } from '../../lib/format';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { DocumentEmailModal } from '../../components/DocumentEmailModal';

interface QuotationLine {
  id: string; lineNumber: number; description: string;
  quantity: string; unitPrice: string; discountPct: string;
  lineTotal: string; lineTax: string;
}

interface Quotation {
  id: string; number: string; quotationDate: string; validUntil: string | null;
  subtotal: string; vatAmount: string; total: string; status: string;
  notes: string | null; partnerId: string;
  partner: {
    id: string; name: string; contactName: string | null; contactEmail: string | null;
    contactPhone: string | null; addressLine1: string | null; addressLine2: string | null;
    city: string | null; province: string | null; postalCode: string | null; vatNumber: string | null;
  };
  lines: QuotationLine[];
  convertedInvoice: { id: string; number: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: 'Draft',     color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-200'   },
  SENT:      { label: 'Sent',      color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  ACCEPTED:  { label: 'Accepted',  color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  EXPIRED:   { label: 'Expired',   color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
  CONVERTED: { label: 'Converted', color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  REJECTED:  { label: 'Rejected',  color: 'text-red-500',    bg: 'bg-red-50',     border: 'border-red-200'    },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showSendModal,      setShowSendModal]      = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showMoreMenu,       setShowMoreMenu]        = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api<{ data: Quotation }>(`/finance/quotations/${id}`),
  });

  const convertMutation = useMutation({
    mutationFn: () => api(`/finance/quotations/${id}/convert`, {
      method: 'POST', headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['quotation', id] });
      navigate(`/invoices/${res.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/finance/quotations/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/quotations'),
  });

  const sendMutation = useMutation({
    mutationFn: (d: { email: string; cc: string; bcc: string; subject: string; message: string }) =>
      api(`/finance/quotations/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: d.email, cc: d.cc || undefined, bcc: d.bcc || undefined, subject: d.subject, message: d.message || undefined }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quotation', id] }); setShowSendModal(false); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="text-sm text-gray-400">Loading quotation…</div></div>;
  if (!data?.data) return <div className="flex flex-col items-center justify-center h-64 gap-3"><p className="text-sm text-gray-400">Quotation not found.</p><Link to="/quotations" className="text-xs text-blue-600 hover:underline">← Back to quotations</Link></div>;

  const q         = data.data;
  const st        = STATUS_CONFIG[q.status] ?? STATUS_CONFIG.DRAFT;
  const canConvert = q.status === 'ACCEPTED' && !q.convertedInvoice;
  const isDraft   = q.status === 'DRAFT';
  const isExpired = q.status === 'EXPIRED';
  const partnerAddr = [q.partner.addressLine1, q.partner.addressLine2, q.partner.city, q.partner.province, q.partner.postalCode].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/quotations" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
          Quotations
        </Link>
        <span className="text-gray-200">/</span>
        <span className="text-xs text-gray-600 font-mono">{q.number}</span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {canConvert && (
            <button onClick={() => { if (confirm('Convert this quotation to an invoice?')) convertMutation.mutate(); }}
              disabled={convertMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors disabled:opacity-50">
              {convertMutation.isPending ? 'Converting…' : 'Convert to Invoice →'}
            </button>
          )}
          {isDraft && (
            <button onClick={() => navigate(`/quotations/${id}/edit`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
              Edit
            </button>
          )}
          <button onClick={() => setShowSendModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
            Email
          </button>
          <a href={`/api/v1/finance/quotations/${id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors">
            PDF
          </a>
          {isDraft && (
            <div className="relative">
              <button onClick={() => setShowMoreMenu(p => !p)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
                onMouseLeave={() => setShowMoreMenu(false)}>
                More
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden"
                  onMouseLeave={() => setShowMoreMenu(false)}>
                  <button onClick={() => { if (confirm('Delete this draft quotation?')) deleteMutation.mutate(); setShowMoreMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                    Delete Draft
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Converted banner ─────────────────────────────────────── */}
      {q.convertedInvoice && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-5 py-3 flex items-center gap-3">
          <svg className="w-4 h-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
          <p className="text-sm font-semibold text-purple-800">
            Converted to invoice{' '}
            <Link to={`/invoices/${q.convertedInvoice.id}`} className="font-mono underline hover:no-underline">
              {q.convertedInvoice.number}
            </Link>
          </p>
        </div>
      )}

      {/* ── Main grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT: Document ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card px-5 pt-5 pb-5">

            {/* Header: number + status + total */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
                    {st.label}
                  </span>
                  {isExpired && (
                    <span className="text-[10px] text-red-500 font-medium">Expired {fmtDate(q.validUntil)}</span>
                  )}
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight font-mono">{q.number}</h1>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Quoted Total</p>
                <p className="text-3xl font-black text-gray-900">{formatR(q.total)}</p>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Prepared For</p>
                  <button onClick={() => setShowRecipientModal(true)}
                    className="text-gray-300 hover:text-blue-500 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                  </button>
                </div>
                <p className="font-semibold text-gray-900">{q.partner.name}</p>
                {q.partner.contactName  && <p className="text-gray-500">{q.partner.contactName}</p>}
                {q.partner.contactEmail && <p className="text-gray-500">{q.partner.contactEmail}</p>}
                {partnerAddr && <p className="text-gray-500 mt-0.5">{partnerAddr}</p>}
                {q.partner.vatNumber && <p className="text-gray-400 mt-0.5">VAT: {q.partner.vatNumber}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">Dates</p>
                <div className="space-y-1">
                  <div><span className="text-gray-400">Quoted: </span><span className="font-medium text-gray-900">{fmtDate(q.quotationDate)}</span></div>
                  <div><span className="text-gray-400">Valid Until: </span>
                    <span className={`font-medium ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>{fmtDate(q.validUntil)}</span>
                  </div>
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
                  {q.lines.map(line => (
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
                  <span>Subtotal</span><span className="font-mono">{formatR(q.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>VAT (15%)</span><span className="font-mono">{formatR(q.vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-sm text-gray-900">
                  <span>Quoted Total</span><span className="font-mono">{formatR(q.total)}</span>
                </div>
              </div>
            </div>

            {q.notes && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Notes</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{q.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sidebar ───────────────────────────────────── */}
        <div className="space-y-4">

          {/* CTA card */}
          {canConvert && (
            <div className="card p-5 border-2 border-green-200 bg-green-50/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Ready to Bill</p>
              <p className="text-sm font-semibold text-gray-900 mb-3">This quotation has been accepted</p>
              <button onClick={() => { if (confirm('Convert this quotation to an invoice?')) convertMutation.mutate(); }}
                disabled={convertMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] transition-colors disabled:opacity-50">
                {convertMutation.isPending ? 'Converting…' : 'Convert to Invoice →'}
              </button>
            </div>
          )}

          {/* Quick actions */}
          <div className="card p-4 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">Actions</p>
            <button onClick={() => setShowSendModal(true)}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
              Email Quotation
            </button>
            <a href={`/api/v1/finance/quotations/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
              Download PDF
            </a>
            {isDraft && (
              <button onClick={() => navigate(`/quotations/${id}/edit`)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                Edit Quotation
              </button>
            )}
          </div>

          {/* Details */}
          <div className="card p-4 space-y-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Details</p>
            <div className="flex justify-between"><span className="text-gray-400">Number</span><span className="font-mono font-medium text-gray-900">{q.number}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-gray-700">{fmtDate(q.quotationDate)}</span></div>
            <div className="flex justify-between">
              <span className="text-gray-400">Valid Until</span>
              <span className={isExpired ? 'text-red-600 font-semibold' : 'text-gray-700'}>{fmtDate(q.validUntil)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showSendModal && (
        <DocumentEmailModal
          title="Send Quotation via Email"
          documentNumber={q.number}
          pdfUrl={`/api/v1/finance/quotations/${id}/pdf`}
          defaultEmail={q.partner.contactEmail ?? ''}
          defaultSubject={`Quotation ${q.number} from Xarra Books`}
          isPending={sendMutation.isPending}
          error={sendMutation.isError ? (sendMutation.error as Error).message : undefined}
          onClose={() => setShowSendModal(false)}
          onSend={sendMutation.mutate}
        />
      )}
      {showRecipientModal && (
        <RecipientEditModal
          recipient={{
            partnerId: q.partnerId ?? q.partner.id,
            partnerName: q.partner.name,
            contactName: q.partner.contactName,
            contactEmail: q.partner.contactEmail,
            contactPhone: q.partner.contactPhone,
            addressLine1: q.partner.addressLine1,
            addressLine2: q.partner.addressLine2,
            city: q.partner.city,
            province: q.partner.province,
            postalCode: q.partner.postalCode,
            vatNumber: q.partner.vatNumber,
          }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['quotation', id] })}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { VAT_RATE, roundAmount } from '@xarra/shared';
import { formatR } from '../../lib/format';

interface InvoiceOption { id: string; number: string; total: string; status: string; partner: { name: string } }
interface InvoiceLine { id: string; titleId: string | null; description: string; quantity: string; unitPrice: string; discountPct: string }
interface LineItem { _id: string; description: string; quantity: number; unitPrice: number; discountPct: number }

function uid() { return crypto.randomUUID(); }
function emptyLine(): LineItem { return { _id: uid(), description: '', quantity: 1, unitPrice: 0, discountPct: 0 }; }

export function CreditNoteCreate() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const qc             = useQueryClient();

  const [isDirty,  setIsDirty]  = useState(false);
  const [error,    setError]    = useState('');
  const [reason,   setReason]   = useState('');
  const [invoiceId,setInvoiceId]= useState(searchParams.get('invoiceId') ?? '');
  const [lines,    setLines]    = useState<LineItem[]>([emptyLine()]);

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-for-credit'],
    queryFn: () => api<{ data: InvoiceOption[] }>('/finance/invoices?limit=500'),
  });
  const { data: invoiceDetail } = useQuery({
    queryKey: ['invoice-detail-for-credit', invoiceId],
    queryFn: () => api<{ data: InvoiceOption & { lines: InvoiceLine[] } }>(`/finance/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  const invoiceOptions = (invoicesData?.data ?? []).map(inv => ({
    value: inv.id,
    label: `${inv.number} — ${inv.partner.name}`,
    subtitle: `${formatR(inv.total)} · ${inv.status}`,
  }));
  const selectedInvoice = invoiceDetail?.data;

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/finance/invoices/${invoiceId}/credit-notes`, {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': uid() },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-notes'] }); qc.invalidateQueries({ queryKey: ['invoices'] }); setIsDirty(false); navigate('/credit-notes'); },
    onError: (e: Error) => setError(e.message || 'Failed to create credit note'),
  });

  function populateFromInvoice() {
    if (!selectedInvoice?.lines?.length) return;
    setLines(selectedInvoice.lines.map(il => ({
      _id: uid(), description: il.description,
      quantity: Number(il.quantity), unitPrice: Number(il.unitPrice), discountPct: Number(il.discountPct),
    })));
    setIsDirty(true);
  }

  function addLine() { setLines(prev => [...prev, emptyLine()]); setIsDirty(true); }
  function removeLine(id: string) { if (lines.length > 1) { setLines(prev => prev.filter(l => l._id !== id)); setIsDirty(true); } }
  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines(prev => prev.map(l => l._id === id ? { ...l, ...patch } : l));
    setIsDirty(true);
  }

  function submit() {
    setError('');
    if (!invoiceId)                        return setError('Select an invoice');
    if (!reason.trim())                    return setError('Reason is required');
    if (lines.every(l => !l.description.trim())) return setError('Add at least one line item');
    mutation.mutate({ reason, lines: lines.map(({ description, quantity, unitPrice, discountPct }) => ({ description, quantity, unitPrice, discountPct })) });
  }

  const lineGross = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 - l.discountPct / 100), 0);
  const subtotal  = roundAmount(lineGross);
  const vat       = roundAmount(subtotal * VAT_RATE);
  const total     = roundAmount(subtotal + vat);

  return (
    <div className="max-w-[860px]">
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Credit Note</h1>
          <p className="text-xs text-gray-400 mt-0.5">Issue a credit against an existing invoice</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/credit-notes')}
            className="px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={mutation.isPending}
            className="px-4 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending ? 'Creating…' : 'Create Credit Note →'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      <div className="space-y-5">

        {/* ── Invoice + Reason ───────────────────────────────────── */}
        <div className="card p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="form-label">Invoice *</label>
              <SearchableSelect options={invoiceOptions} value={invoiceId}
                onChange={v => { setInvoiceId(v); setIsDirty(true); }}
                placeholder="Search by invoice number…" required />
              {selectedInvoice && (
                <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-semibold text-gray-900">{selectedInvoice.partner?.name}</span>
                    <span className="text-gray-500"> · {selectedInvoice.number} · {formatR(selectedInvoice.total)}</span>
                  </div>
                  {selectedInvoice.lines?.length > 0 && (
                    <button type="button" onClick={populateFromInvoice}
                      className="text-[10px] font-semibold text-teal-700 hover:text-teal-900 border border-teal-200 rounded px-2 py-0.5 hover:bg-teal-100 transition-colors shrink-0 ml-2">
                      Copy lines
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="form-label">Reason *</label>
              <input value={reason} onChange={e => { setReason(e.target.value); setIsDirty(true); }}
                className="input" placeholder="e.g. Return of damaged stock, Pricing correction" />
              <p className="text-[10px] text-gray-400 mt-1">This appears on the credit note document sent to the partner.</p>
            </div>
          </div>
        </div>

        {/* ── Line Items ─────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Line Items</p>
            <button type="button" onClick={addLine}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              Add line
            </button>
          </div>

          <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit Price</span>
            <span className="text-right">Disc %</span><span className="text-right">Amount</span><span/>
          </div>

          <div className="divide-y divide-gray-50">
            {lines.map(line => {
              const lt = line.quantity * line.unitPrice * (1 - line.discountPct / 100);
              return (
                <div key={line._id} className="px-6 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 gap-y-2 items-center">
                    <input value={line.description} onChange={e => updateLine(line._id, { description: e.target.value })}
                      className="input" placeholder="Item description" required />
                    <input type="number" min={1} value={line.quantity}
                      onChange={e => updateLine(line._id, { quantity: Math.max(1, Number(e.target.value)) })}
                      className="input text-right font-mono"/>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R</span>
                      <input type="number" min={0} step={0.01} value={line.unitPrice}
                        onChange={e => updateLine(line._id, { unitPrice: Number(e.target.value) })}
                        className="input pl-6 text-right font-mono"/>
                    </div>
                    <div className="relative">
                      <input type="number" min={0} max={100} step={0.5} value={line.discountPct}
                        onChange={e => updateLine(line._id, { discountPct: Number(e.target.value) })}
                        className="input text-right pr-6 font-mono"/>
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-semibold text-sm text-gray-900">{formatR(lt)}</span>
                    </div>
                    <div className="flex justify-end">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(line._id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Totals ────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <div className="w-72 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <div className="px-5 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-mono">{formatR(subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>VAT (15%)</span><span className="font-mono">{formatR(vat)}</span></div>
            </div>
            <div className="px-5 py-4 bg-white border-t border-gray-200 flex justify-between items-center">
              <span className="text-base font-bold text-gray-900">Credit Total</span>
              <span className="text-2xl font-black font-mono text-gray-900">{formatR(total)}</span>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white/95 backdrop-blur border-t border-gray-100 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/credit-notes')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Cancel</button>
          <button type="button" onClick={submit} disabled={mutation.isPending}
            className="px-5 py-2 rounded-lg bg-[#c0392b] text-white text-sm font-semibold hover:bg-[#a93226] shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Creating…</>
              : <>Create Credit Note →</>}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';
import { QuickTitleCreate } from '../../components/QuickTitleCreate';
import { VAT_RATE, roundAmount } from '@xarra/shared';

interface Partner {
  id: string; name: string; discountPct: string;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null;
  province: string | null; postalCode: string | null; vatNumber: string | null;
}
interface Title { id: string; title: string; rrpZar: string; isbn13: string | null }

interface LineItem {
  _id: string; titleId: string; description: string;
  quantity: number; unitPrice: number; discountPct: number;
}

const VALIDITY = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: 'Custom',  days: -1 },
];

function uid() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(date: string, days: number) {
  const d = new Date(date); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function fmtR(n: number) {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function lineTotal(l: LineItem) {
  return roundAmount(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
}
function emptyLine(): LineItem {
  return { _id: uid(), titleId: '', description: '', quantity: 1, unitPrice: 0, discountPct: 0 };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{children}</p>;
}

export function QuotationCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [isDirty,             setIsDirty]            = useState(false);
  const [error,               setError]              = useState('');
  const [partnerId,           setPartnerId]          = useState('');
  const [quotationDate,       setQuotationDate]      = useState(today());
  const [validityDays,        setValidityDays]       = useState(30);
  const [customValidUntil,    setCustomValidUntil]   = useState('');
  const [taxInclusive,        setTaxInclusive]       = useState(false);
  const [notes,               setNotes]              = useState('');
  const [lines,               setLines]              = useState<LineItem[]>([emptyLine()]);
  const [showRecipientModal,  setShowRecipientModal] = useState(false);
  const [showPartnerCreate,   setShowPartnerCreate]  = useState(false);
  const [showTitleCreate,     setShowTitleCreate]    = useState(false);
  const [pendingTitleLineId,  setPendingTitleLineId] = useState<string | null>(null);

  const { data: partnersData } = useQuery({ queryKey: ['partners-select'], queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500') });
  const { data: titlesData }   = useQuery({ queryKey: ['titles-select'],   queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=500') });
  const { data: nextNumData }  = useQuery({ queryKey: ['next-number', 'quotation'], queryFn: () => api<{ data: { number: string } }>('/finance/next-number/quotation') });

  const allPartners     = partnersData?.data ?? [];
  const allTitles       = titlesData?.data ?? [];
  const selectedPartner = allPartners.find(p => p.id === partnerId) ?? null;
  const partnerDiscount = selectedPartner ? Number(selectedPartner.discountPct) : 0;
  const validUntil      = validityDays === -1 ? customValidUntil : addDays(quotationDate, validityDays);

  const lineGross = lines.reduce((s, l) => s + lineTotal(l), 0);
  const subtotal  = roundAmount(taxInclusive ? lineGross / (1 + VAT_RATE) : lineGross);
  const vat       = roundAmount(taxInclusive ? lineGross - subtotal : lineGross * VAT_RATE);
  const total     = roundAmount(subtotal + vat);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/quotations', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Idempotency-Key': uid() } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }); setIsDirty(false); navigate('/quotations'); },
    onError: (e: Error) => setError(e.message || 'Failed to create quotation'),
  });

  function handlePartnerChange(pid: string) {
    const p = allPartners.find(x => x.id === pid);
    setPartnerId(pid);
    setIsDirty(true);
    setLines(prev => prev.map(l => ({ ...l, discountPct: Number(p?.discountPct ?? 0) })));
  }

  function addLine() { setLines(prev => [...prev, emptyLine()]); setIsDirty(true); }
  function removeLine(id: string) { if (lines.length > 1) { setLines(prev => prev.filter(l => l._id !== id)); setIsDirty(true); } }
  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines(prev => prev.map(l => {
      if (l._id !== id) return l;
      const updated = { ...l, ...patch };
      if (patch.titleId !== undefined) {
        const t = allTitles.find(x => x.id === patch.titleId);
        if (t) { updated.description = t.title; updated.unitPrice = Number(t.rrpZar); updated.discountPct = partnerDiscount; }
      }
      return updated;
    }));
    setIsDirty(true);
  }

  function submit() {
    setError('');
    if (!partnerId)               return setError('Select a partner');
    if (!quotationDate)           return setError('Quotation date is required');
    if (lines.some(l => !l.titleId))  return setError('Each line item needs a title');
    if (lines.some(l => l.quantity <= 0)) return setError('Quantity must be at least 1');

    mutation.mutate({
      partnerId, quotationDate, taxInclusive,
      validUntil: validUntil || undefined,
      lines: lines.map(l => ({ titleId: l.titleId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct })),
      notes: notes || undefined,
    });
  }

  const nextNumber  = nextNumData?.data?.number ?? '—';
  const partnerOpts = allPartners.map(p => ({ value: p.id, label: p.name, subtitle: `${Number(p.discountPct)}% discount` }));
  const titleOpts   = allTitles.map(t => ({ value: t.id, label: t.title, subtitle: t.isbn13 ?? undefined }));

  return (
    <div className="max-w-[900px]">
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Quotation</h1>
          <p className="text-xs text-gray-400 mt-0.5">Number: <span className="font-mono font-semibold text-gray-600">{nextNumber}</span></p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/quotations')}
            className="px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={mutation.isPending}
            className="px-4 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending ? 'Creating…' : 'Create Quotation →'}
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

        {/* ── BILL TO + QUOTATION DETAILS ────────────────────────── */}
        <div className="card p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bill To */}
            <div>
              <SectionLabel>Prepared for</SectionLabel>
              {!partnerId ? (
                <div className="space-y-2">
                  <SearchableSelect options={partnerOpts} value={partnerId} onChange={handlePartnerChange}
                    placeholder="Search or select partner…" required onCreateNew={() => setShowPartnerCreate(true)} createNewLabel="+ Create new partner" />
                  <p className="text-[10px] text-gray-400">Select the partner this quotation is prepared for</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <SearchableSelect options={partnerOpts} value={partnerId} onChange={handlePartnerChange}
                    placeholder="Search or select partner…" required onCreateNew={() => setShowPartnerCreate(true)} createNewLabel="+ Create new partner" />
                  {selectedPartner && (
                    <div className="rounded-xl border border-gray-200 bg-white p-4 relative">
                      <div className="font-semibold text-sm text-gray-900">{selectedPartner.name}</div>
                      {selectedPartner.contactName  && <div className="text-xs text-gray-600 mt-0.5">{selectedPartner.contactName}</div>}
                      {selectedPartner.contactEmail && <div className="text-xs text-gray-500">{selectedPartner.contactEmail}</div>}
                      {selectedPartner.contactPhone && <div className="text-xs text-gray-500">{selectedPartner.contactPhone}</div>}
                      {selectedPartner.addressLine1 && <div className="text-xs text-gray-500 mt-1">{[selectedPartner.addressLine1, selectedPartner.city, selectedPartner.province].filter(Boolean).join(', ')}</div>}
                      {selectedPartner.vatNumber && <div className="text-[10px] text-gray-400 mt-1">VAT: {selectedPartner.vatNumber}</div>}
                      <button type="button" onClick={() => setShowRecipientModal(true)}
                        className="absolute top-3 right-3 text-[10px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 transition-colors">
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quotation Details */}
            <div>
              <SectionLabel>Quotation details</SectionLabel>
              <div className="space-y-3">
                <div>
                  <label className="form-label">Quotation Date *</label>
                  <input type="date" value={quotationDate} onChange={e => { setQuotationDate(e.target.value); setIsDirty(true); }}
                    className="input" />
                </div>

                {/* Validity chips */}
                <div>
                  <label className="form-label">Valid for</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {VALIDITY.map(opt => (
                      <button key={opt.days} type="button"
                        onClick={() => { setValidityDays(opt.days); setIsDirty(true); if (opt.days !== -1) setCustomValidUntil(''); }}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                          validityDays === opt.days
                            ? 'bg-[#c0392b] text-white border-[#c0392b]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {validityDays === -1 ? (
                    <input type="date" value={customValidUntil} min={quotationDate}
                      onChange={e => { setCustomValidUntil(e.target.value); setIsDirty(true); }}
                      className="input" required />
                  ) : (
                    <div className="input bg-gray-50 text-gray-500 cursor-default select-none">{validUntil}</div>
                  )}
                </div>

                {/* VAT toggle */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <button type="button" role="switch" aria-checked={taxInclusive}
                    onClick={() => { setTaxInclusive(v => !v); setIsDirty(true); }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${taxInclusive ? 'bg-[#c0392b]' : 'bg-gray-200'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${taxInclusive ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">Prices include VAT (15%)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ── Line Items ─────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <SectionLabel>Items</SectionLabel>
          </div>
          <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <span>Title / Description</span><span className="text-right">Qty</span><span className="text-right">Unit Price</span>
            <span className="text-right">Discount</span><span className="text-right">Amount</span><span/>
          </div>
          <div className="divide-y divide-gray-50">
            {lines.map((line, idx) => {
              const lt = lineTotal(line);
              const selectedTitle = allTitles.find(t => t.id === line.titleId);
              return (
                <div key={line._id} className="px-6 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 gap-y-2 items-start">
                    <div>
                      <SearchableSelect options={titleOpts} value={line.titleId} onChange={val => updateLine(line._id, { titleId: val })} placeholder="Search titles…"
                        onCreateNew={() => { setPendingTitleLineId(line._id); setShowTitleCreate(true); }}
                        createNewLabel="+ Add new title"
                      />
                      {line.titleId && (
                        <input value={line.description} onChange={e => updateLine(line._id, { description: e.target.value })}
                          placeholder="Add a description (optional)"
                          className="mt-1.5 w-full border-0 border-b border-gray-200 bg-transparent px-0 py-1 text-xs text-gray-500 placeholder:text-gray-300 focus:outline-none focus:border-gray-400"/>
                      )}
                      {!line.titleId && idx === 0 && <p className="mt-1 text-[10px] text-gray-400">Select a title from your catalog</p>}
                    </div>
                    <div>
                      <label className="form-label sm:hidden">Qty</label>
                      <input type="number" min={1} step={1} value={line.quantity}
                        onChange={e => updateLine(line._id, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="input text-right font-mono"/>
                    </div>
                    <div>
                      <label className="form-label sm:hidden">Unit Price</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R</span>
                        <input type="number" min={0} step={0.01} value={line.unitPrice}
                          onChange={e => updateLine(line._id, { unitPrice: Number(e.target.value) })}
                          className="input pl-6 text-right font-mono"/>
                      </div>
                    </div>
                    <div>
                      <label className="form-label sm:hidden">Discount %</label>
                      <div className="relative">
                        <input type="number" min={0} max={100} step={0.5} value={line.discountPct}
                          onChange={e => updateLine(line._id, { discountPct: Number(e.target.value) })}
                          className="input text-right pr-6 font-mono"/>
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                      </div>
                      {line.discountPct > 0 && selectedTitle && (
                        <p className="text-[9px] text-gray-400 mt-0.5 text-right">RRP: R{Number(selectedTitle.rrpZar).toFixed(2)}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end justify-center">
                      <label className="form-label sm:hidden">Amount</label>
                      <span className="font-mono font-semibold text-sm text-gray-900">{fmtR(lt)}</span>
                      {line.discountPct > 0 && (
                        <span className="text-[10px] text-green-600 mt-0.5">-{fmtR(line.quantity * line.unitPrice * (line.discountPct / 100))} saved</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end sm:justify-center mt-1">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(line._id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-6 py-3 border-t border-gray-50">
            <button type="button" onClick={addLine}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              Add line item
            </button>
          </div>
        </div>

        {/* ── Memo + Totals ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <label className="form-label">Notes / Terms</label>
            <textarea rows={4} value={notes} onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
              placeholder="Validity conditions, delivery terms, or any notes for the partner…"
              className="textarea resize-none"/>
          </div>
          <div className="flex flex-col justify-end">
            <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="px-5 py-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal (excl. VAT)</span>
                  <span className="font-mono font-medium text-gray-800">{fmtR(subtotal)}</span>
                </div>
                {lines.some(l => l.discountPct > 0) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Discounts applied</span>
                    <span className="font-mono text-green-600">-{fmtR(lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.discountPct / 100), 0))}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">VAT (15%){taxInclusive ? ' (included)' : ''}</span>
                  <span className="font-mono font-medium text-gray-800">{fmtR(vat)}</span>
                </div>
              </div>
              <div className="px-5 py-4 bg-white border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-black font-mono text-gray-900">{fmtR(total)}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 text-right">South African Rand</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom action bar ─────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white/95 backdrop-blur border-t border-gray-100 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/quotations')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Cancel</button>
          <button type="button" onClick={submit} disabled={mutation.isPending}
            className="px-5 py-2 rounded-lg bg-[#c0392b] text-white text-sm font-semibold hover:bg-[#a93226] shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Creating…</>
              : <>Create Quotation →</>}
          </button>
        </div>
      </div>

      {showRecipientModal && selectedPartner && (
        <RecipientEditModal
          recipient={{ partnerId: selectedPartner.id, partnerName: selectedPartner.name, contactName: selectedPartner.contactName, contactEmail: selectedPartner.contactEmail, contactPhone: selectedPartner.contactPhone, addressLine1: selectedPartner.addressLine1, addressLine2: selectedPartner.addressLine2, city: selectedPartner.city, province: selectedPartner.province, postalCode: selectedPartner.postalCode, vatNumber: selectedPartner.vatNumber }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['partners-select'] })}
        />
      )}
      {showPartnerCreate && (
        <QuickPartnerCreate onClose={() => setShowPartnerCreate(false)} onCreated={(p) => { setPartnerId(p.id); setIsDirty(true); }} />
      )}
      {showTitleCreate && (
        <QuickTitleCreate
          onClose={() => { setShowTitleCreate(false); setPendingTitleLineId(null); }}
          onCreated={t => {
            if (pendingTitleLineId) {
              updateLine(pendingTitleLineId, {
                titleId:     t.id,
                description: t.title,
                unitPrice:   Number(t.rrpZar),
              });
            }
            setShowTitleCreate(false);
            setPendingTitleLineId(null);
          }}
        />
      )}
    </div>
  );
}

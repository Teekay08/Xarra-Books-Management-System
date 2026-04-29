import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';
import { formatR } from '../../lib/format';

interface Partner { id: string; name: string }
interface OutstandingInvoice { id: string; number: string; amountDue: string; total: string; dueDate: string | null }

const METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer / EFT' },
  { value: 'CASH',          label: 'Cash'                },
  { value: 'CARD',          label: 'Card'                },
  { value: 'CHEQUE',        label: 'Cheque'              },
  { value: 'OTHER',         label: 'Other'               },
];

function today() { return new Date().toISOString().split('T')[0]; }

export function PaymentCreate() {
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [isDirty,    setIsDirty]    = useState(false);
  const [error,      setError]      = useState('');
  const [partnerId,  setPartnerId]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [payDate,    setPayDate]    = useState(today());
  const [method,     setMethod]     = useState('BANK_TRANSFER');
  const [bankRef,    setBankRef]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Optional: link to outstanding invoices
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, string>>({}); // invoiceId → amount

  const { data: partnersData } = useQuery({ queryKey: ['partners-select'], queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500') });
  const { data: outstandingData } = useQuery({
    queryKey: ['outstanding-invoices', partnerId],
    queryFn: () => api<{ data: OutstandingInvoice[] }>(`/finance/outstanding-invoices?partnerId=${partnerId}`),
    enabled: !!partnerId,
  });

  const partnerOptions  = (partnersData?.data ?? []).map(p => ({ value: p.id, label: p.name }));
  const outstanding     = outstandingData?.data ?? [];
  const totalAllocated  = Object.values(selectedInvoices).reduce((s, v) => s + Number(v || 0), 0);

  function handlePartnerChange(pid: string) {
    setPartnerId(pid);
    setSelectedInvoices({});
    setIsDirty(true);
  }

  function toggleInvoice(invId: string, amtDue: string) {
    setSelectedInvoices(prev => {
      if (invId in prev) {
        const next = { ...prev };
        delete next[invId];
        return next;
      }
      return { ...prev, [invId]: amtDue };
    });
    setIsDirty(true);
  }

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/payments', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Idempotency-Key': crypto.randomUUID() } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['invoices'] }); setIsDirty(false); navigate('/payments'); },
    onError: (e: Error) => setError(e.message || 'Failed to record payment'),
  });

  function submit() {
    setError('');
    if (!partnerId)          return setError('Select a partner');
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
    if (!payDate)            return setError('Payment date is required');

    const invoiceAllocations = Object.entries(selectedInvoices)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([invoiceId, amt]) => ({ invoiceId, amount: Number(amt) }));

    mutation.mutate({
      partnerId, amount: Number(amount), paymentDate: payDate,
      paymentMethod: method,
      bankReference: bankRef || undefined,
      notes: notes || undefined,
      invoiceAllocations: invoiceAllocations.length > 0 ? invoiceAllocations : undefined,
    });
  }

  return (
    <div className="max-w-[720px]">
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Record Payment</h1>
          <p className="text-xs text-gray-400 mt-0.5">Log a payment received from a partner</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/payments')}
            className="px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={mutation.isPending}
            className="px-4 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-800 shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending ? 'Recording…' : 'Record Payment →'}
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

        {/* ── Payment details ────────────────────────────────────── */}
        <div className="card p-6 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Payment Details</p>

          <div>
            <label className="form-label">Partner *</label>
            <SearchableSelect options={partnerOptions} value={partnerId} onChange={handlePartnerChange}
              placeholder="Search partners…" required
              onCreateNew={() => setShowCreate(true)} createNewLabel="+ Create new partner"/>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Amount (ZAR) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R</span>
                <input type="number" step="0.01" min="0.01" value={amount}
                  onChange={e => { setAmount(e.target.value); setIsDirty(true); }}
                  className="input pl-7 text-right font-mono text-base" placeholder="0.00" required/>
              </div>
            </div>
            <div>
              <label className="form-label">Payment Date *</label>
              <input type="date" value={payDate} onChange={e => { setPayDate(e.target.value); setIsDirty(true); }} className="input" required/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Payment Method</label>
              <select value={method} onChange={e => { setMethod(e.target.value); setIsDirty(true); }} className="select">
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Bank Reference</label>
              <input value={bankRef} onChange={e => { setBankRef(e.target.value); setIsDirty(true); }}
                className="input" placeholder="e.g. EFT-20260429-001"/>
            </div>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
              rows={2} className="textarea resize-none" placeholder="Any additional details…"/>
          </div>
        </div>

        {/* ── Outstanding invoices (optional allocation) ────────── */}
        {partnerId && outstanding.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-900">Allocate to Invoices</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Optional — tick invoices this payment covers</p>
                </div>
                {totalAllocated > 0 && (
                  <span className="text-xs font-mono font-semibold text-green-700">
                    {formatR(totalAllocated)} allocated
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {outstanding.map(inv => {
                const checked = inv.id in selectedInvoices;
                const amtDue  = Number(inv.amountDue);
                return (
                  <div key={inv.id} className="flex items-center gap-3 px-5 py-3">
                    <input type="checkbox" checked={checked} onChange={() => toggleInvoice(inv.id, inv.amountDue)}
                      className="w-4 h-4 rounded border-gray-300 text-green-700 focus:ring-green-600"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-semibold text-gray-900">{inv.number}</p>
                      {inv.dueDate && <p className="text-[10px] text-gray-400">Due {new Date(inv.dueDate).toLocaleDateString('en-ZA')}</p>}
                    </div>
                    {checked ? (
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R</span>
                        <input type="number" step="0.01" min="0.01" max={amtDue}
                          value={selectedInvoices[inv.id]}
                          onChange={e => setSelectedInvoices(prev => ({ ...prev, [inv.id]: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1 text-xs font-mono text-right focus:outline-none focus:ring-2 focus:ring-green-400"/>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-amber-700 font-semibold">{formatR(amtDue)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bottom bar ────────────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white/95 backdrop-blur border-t border-gray-100 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/payments')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Cancel</button>
          <div className="flex items-center gap-4">
            {amount && Number(amount) > 0 && (
              <span className="text-sm font-black font-mono text-gray-900">{formatR(Number(amount))}</span>
            )}
            <button type="button" onClick={submit} disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {mutation.isPending
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Recording…</>
                : <>Record Payment →</>}
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <QuickPartnerCreate onClose={() => setShowCreate(false)} onCreated={p => { setPartnerId(p.id); setIsDirty(true); }} />
      )}
    </div>
  );
}

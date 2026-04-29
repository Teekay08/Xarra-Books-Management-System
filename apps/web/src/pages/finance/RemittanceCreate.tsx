import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

interface OutstandingInvoice {
  id: string;
  number: string;
  total: string;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
  creditNotesTotal: string;
  amountPaid: string;
  effectiveTotal: string;
  amountDue: string;
}

interface AvailableCreditNote {
  id: string;
  number: string;
  total: string;
  available: string;
  reason: string;
  createdAt: string;
  invoiceNumber: string | null;
}

interface CreditNoteAllocation {
  creditNoteId: string;
  invoiceId: string;
  amount: number;
}

export function RemittanceCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({});
  const [creditAllocations, setCreditAllocations] = useState<CreditNoteAllocation[]>([]);
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<{ data: { id: string; name: string }[] }>('/partners?limit=500'),
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['partner-outstanding-invoices', partnerId],
    queryFn: () => api<{ data: OutstandingInvoice[] }>(`/finance/invoices/outstanding?partnerId=${partnerId}`),
    enabled: !!partnerId,
  });

  const { data: creditNotesData } = useQuery({
    queryKey: ['partner-available-credits', partnerId],
    queryFn: () => api<{ data: AvailableCreditNote[] }>(`/finance/credit-notes/available?partnerId=${partnerId}`),
    enabled: !!partnerId,
  });

  // Sort: overdue first, then by due date ascending
  const outstandingInvoices = useMemo(() => {
    const list = invoicesData?.data ?? [];
    return [...list].sort((a, b) => {
      const aOverdue = a.dueDate && new Date(a.dueDate) < new Date() ? 0 : 1;
      const bOverdue = b.dueDate && new Date(b.dueDate) < new Date() ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
    });
  }, [invoicesData]);
  const availableCreditNotes = creditNotesData?.data ?? [];

  // Auto-select overdue invoices when data loads
  useEffect(() => {
    if (!outstandingInvoices.length) return;
    const now = new Date();
    const autoSelected: Record<string, number> = {};
    for (const inv of outstandingInvoices) {
      const due = Number(inv.amountDue);
      if (due > 0 && inv.dueDate && new Date(inv.dueDate) <= now) {
        autoSelected[inv.id] = due;
      }
    }
    if (Object.keys(autoSelected).length > 0) {
      setSelectedInvoices(autoSelected);
    }
  }, [outstandingInvoices]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/remittances', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remittances'] });
      setIsDirty(false);
      navigate('/remittances');
    },
  });

  function toggleInvoice(invoiceId: string, amountDue: number) {
    setSelectedInvoices((prev) => {
      if (prev[invoiceId] !== undefined) {
        const next = { ...prev };
        delete next[invoiceId];
        // Remove any credit allocations for this invoice
        setCreditAllocations((ca) => ca.filter((a) => a.invoiceId !== invoiceId));
        return next;
      }
      return { ...prev, [invoiceId]: amountDue };
    });
  }

  function updateInvoiceAmount(invoiceId: string, amount: number) {
    setSelectedInvoices((prev) => ({ ...prev, [invoiceId]: amount }));
  }

  // Calculate how much of each credit note has been allocated in this remittance
  const creditNoteUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const alloc of creditAllocations) {
      usage[alloc.creditNoteId] = (usage[alloc.creditNoteId] || 0) + alloc.amount;
    }
    return usage;
  }, [creditAllocations]);

  // Credit allocated per invoice
  const creditPerInvoice = useMemo(() => {
    const perInv: Record<string, number> = {};
    for (const alloc of creditAllocations) {
      perInv[alloc.invoiceId] = (perInv[alloc.invoiceId] || 0) + alloc.amount;
    }
    return perInv;
  }, [creditAllocations]);

  function addCreditAllocation(creditNoteId: string, invoiceId: string) {
    const cn = availableCreditNotes.find((c) => c.id === creditNoteId);
    if (!cn) return;
    const available = Number(cn.available) - (creditNoteUsage[creditNoteId] || 0);
    const invoiceAmountDue = selectedInvoices[invoiceId] ?? 0;
    const alreadyCredited = creditPerInvoice[invoiceId] ?? 0;
    const maxForInvoice = Math.max(0, invoiceAmountDue - alreadyCredited);
    const amount = Math.min(available, maxForInvoice);
    if (amount <= 0) return;
    setCreditAllocations((prev) => [...prev, { creditNoteId, invoiceId, amount }]);
    setIsDirty(true);
  }

  function updateCreditAllocationAmount(index: number, amount: number) {
    setCreditAllocations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], amount };
      return next;
    });
  }

  function removeCreditAllocation(index: number) {
    setCreditAllocations((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    const invoiceAllocations = Object.entries(selectedInvoices).map(([invoiceId, amount]) => ({
      invoiceId,
      amount,
    }));

    const creditNoteAllocations = creditAllocations
      .filter((a) => a.amount > 0)
      .map((a) => ({
        creditNoteId: a.creditNoteId,
        invoiceId: a.invoiceId,
        amount: a.amount,
      }));

    mutation.mutate({
      partnerId,
      partnerRef: fd.get('partnerRef') || undefined,
      totalAmount: Number(fd.get('totalAmount')),
      periodFrom: fd.get('periodFrom') || undefined,
      periodTo: fd.get('periodTo') || undefined,
      parseMethod: 'MANUAL',
      invoiceAllocations: invoiceAllocations.length > 0 ? invoiceAllocations : undefined,
      creditNoteAllocations: creditNoteAllocations.length > 0 ? creditNoteAllocations : undefined,
      notes: fd.get('notes') || undefined,
    }, { onError: (err) => setError(err.message) });
  }

  const partnerOptions = (partners?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  function handlePartnerChange(id: string) {
    setPartnerId(id);
    setSelectedInvoices({});
    setCreditAllocations([]);
  }

  const allocatedTotal = Object.values(selectedInvoices).reduce((s, v) => s + v, 0);
  const totalCreditsApplied = creditAllocations.reduce((s, a) => s + a.amount, 0);
  const netPayable = allocatedTotal - totalCreditsApplied;

  const selectedInvoiceIds = Object.keys(selectedInvoices);
  const hasSelectedInvoices = selectedInvoiceIds.length > 0;
  const hasAvailableCredits = availableCreditNotes.length > 0;

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="Record Remittance" subtitle="Record a payment received from a channel partner" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-3xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Retail Partner *</label>
          <SearchableSelect
            options={partnerOptions}
            value={partnerId}
            onChange={handlePartnerChange}
            placeholder="Search partners..."
            required
            onCreateNew={() => setShowPartnerCreate(true)}
            createNewLabel="Create new partner"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ZAR) *</label>
            <input name="totalAmount" type="number" step="0.01" required className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner Reference</label>
            <input name="partnerRef" placeholder="e.g. bank ref number" className={cls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period From</label>
            <input name="periodFrom" type="date" className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period To</label>
            <input name="periodTo" type="date" className={cls} />
          </div>
        </div>

        {/* Invoice Allocation Table */}
        {partnerId && outstandingInvoices.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Link to Invoices</label>
            <div className="card overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={outstandingInvoices.length > 0 && outstandingInvoices.every((inv) => selectedInvoices[inv.id] !== undefined)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const all: Record<string, number> = {};
                            for (const inv of outstandingInvoices) {
                              const due = Number(inv.amountDue);
                              if (due > 0) all[inv.id] = due;
                            }
                            setSelectedInvoices(all);
                          } else {
                            setSelectedInvoices({});
                            setCreditAllocations([]);
                          }
                          setIsDirty(true);
                        }}
                        title="Select all"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Invoice Total</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Credits</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount Due</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Allocate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {outstandingInvoices.map((inv) => {
                    const isSelected = selectedInvoices[inv.id] !== undefined;
                    const amountDue = Number(inv.amountDue);
                    const creditTotal = Number(inv.creditNotesTotal);
                    const amountPaid = Number(inv.amountPaid);
                    return (
                      <tr key={inv.id} className={isSelected ? 'bg-green-50' : ''}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleInvoice(inv.id, amountDue)}
                            className="rounded border-gray-300" />
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900">{inv.number}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {new Date(inv.invoiceDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {inv.dueDate ? (() => {
                            const due = new Date(inv.dueDate);
                            const now = new Date();
                            const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000);
                            const dateStr = due.toLocaleDateString('en-ZA');
                            if (daysUntil < 0) return <span className="text-red-600 font-medium">{dateStr} <span className="text-xs">(overdue)</span></span>;
                            if (daysUntil <= 7) return <span className="text-amber-600 font-medium">{dateStr} <span className="text-xs">(due soon)</span></span>;
                            return <span className="text-gray-500">{dateStr}</span>;
                          })() : <span className="text-gray-400">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 text-right">
                          R {Number(inv.total).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {creditTotal > 0 ? (
                            <span className="text-green-700">- R {creditTotal.toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-400">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {amountPaid > 0 ? (
                            <span className="text-blue-700">R {amountPaid.toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-400">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-red-700">
                          R {amountDue.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isSelected && (
                            <input type="number" step="0.01" min="0" max={amountDue}
                              value={selectedInvoices[inv.id]}
                              onChange={(e) => updateInvoiceAmount(inv.id, Number(e.target.value))}
                              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm text-right" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasSelectedInvoices && (
                <div className="px-3 py-2 bg-gray-50 text-right text-sm font-medium text-gray-700">
                  Total Invoices Allocated: R {allocatedTotal.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Credit Note Allocation Section */}
        {partnerId && hasSelectedInvoices && hasAvailableCredits && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Apply Credit Notes
              <span className="ml-1 font-normal text-gray-400">(offset invoices with available credits)</span>
            </label>

            {/* Existing allocations */}
            {creditAllocations.length > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50/30 mb-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-green-100">
                  <thead className="bg-green-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Credit Note</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Applied to Invoice</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {creditAllocations.map((alloc, idx) => {
                      const cn = availableCreditNotes.find((c) => c.id === alloc.creditNoteId);
                      const inv = outstandingInvoices.find((i) => i.id === alloc.invoiceId);
                      const cnAvailable = cn ? Number(cn.available) - (creditNoteUsage[alloc.creditNoteId] || 0) + alloc.amount : 0;
                      const invDue = selectedInvoices[alloc.invoiceId] ?? 0;
                      const otherCreditsOnInvoice = (creditPerInvoice[alloc.invoiceId] ?? 0) - alloc.amount;
                      const maxAmount = Math.min(cnAvailable, invDue - otherCreditsOnInvoice);
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-sm text-green-800 font-medium">{cn?.number ?? '?'}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{inv?.number ?? '?'}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={maxAmount}
                              value={alloc.amount}
                              onChange={(e) => updateCreditAllocationAmount(idx, Number(e.target.value))}
                              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button" onClick={() => removeCreditAllocation(idx)}
                              className="text-red-400 hover:text-red-600 text-sm" title="Remove">
                              &times;
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-3 py-2 bg-green-50 border-t border-green-100 text-right text-sm font-medium text-green-700">
                  Total Credits Applied: R {totalCreditsApplied.toFixed(2)}
                </div>
              </div>
            )}

            {/* Add credit note allocation controls */}
            <div className="card p-3">
              <p className="text-xs text-gray-500 mb-2">
              Available credit notes — select an invoice to apply each credit against.
              A credit note can be split across multiple invoices if its value exceeds a single invoice.
            </p>
              <div className="space-y-2">
                {availableCreditNotes.map((cn) => {
                  const used = creditNoteUsage[cn.id] || 0;
                  const remaining = Number(cn.available) - used;
                  if (remaining <= 0) return null;
                  return (
                    <div key={cn.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-green-700">{cn.number}</span>
                        {cn.invoiceNumber && (
                          <span className="ml-1 text-xs text-gray-400">(from {cn.invoiceNumber})</span>
                        )}
                        <span className="ml-2 text-sm text-gray-600">
                          R {remaining.toFixed(2)} available
                        </span>
                        <span className="ml-1 text-xs text-gray-400 truncate">
                          {cn.reason}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <select
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              addCreditAllocation(cn.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Apply to invoice...</option>
                          {selectedInvoiceIds.map((invId) => {
                            const inv = outstandingInvoices.find((i) => i.id === invId);
                            return (
                              <option key={invId} value={invId}>
                                {inv?.number ?? invId}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Net Calculation Summary */}
        {hasSelectedInvoices && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Reconciliation Summary</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Invoices</span>
                <span className="font-medium text-gray-900">R {allocatedTotal.toFixed(2)}</span>
              </div>
              {totalCreditsApplied > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-700">Less: Credit Notes Applied</span>
                  <span className="font-medium text-green-700">- R {totalCreditsApplied.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
                <span className="text-gray-800">Net Payment Due</span>
                <span className="text-gray-900">R {netPayable.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={3} className={cls} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : 'Record Remittance'}
          </button>
          <button type="button" onClick={() => navigate('/remittances')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
      {showPartnerCreate && (
        <QuickPartnerCreate
          onClose={() => setShowPartnerCreate(false)}
          onCreated={(p) => handlePartnerChange(p.id)}
        />
      )}
    </div>
  );
}

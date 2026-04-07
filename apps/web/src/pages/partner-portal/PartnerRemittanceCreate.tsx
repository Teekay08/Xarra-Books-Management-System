import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { partnerApi, getPartnerUser } from '../../lib/partner-api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

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

export function PartnerRemittanceCreate() {
  const navigate = useNavigate();
  const user = getPartnerUser();
  const isHq = !user?.branchId;

  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [availableCreditNotes, setAvailableCreditNotes] = useState<AvailableCreditNote[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({});
  const [creditAllocations, setCreditAllocations] = useState<CreditNoteAllocation[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isHq) return;
    async function fetchData() {
      try {
        const [invRes, cnRes] = await Promise.all([
          partnerApi<{ data: OutstandingInvoice[] }>('/invoices/outstanding'),
          partnerApi<{ data: AvailableCreditNote[] }>('/credit-notes/available'),
        ]);
        // Sort: overdue first, then by due date ascending
        const sorted = [...invRes.data].sort((a, b) => {
          const aOverdue = a.dueDate && new Date(a.dueDate) < new Date() ? 0 : 1;
          const bOverdue = b.dueDate && new Date(b.dueDate) < new Date() ? 0 : 1;
          if (aOverdue !== bOverdue) return aOverdue - bOverdue;
          return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
        });
        setOutstandingInvoices(sorted);
        setAvailableCreditNotes(cnRes.data);

        // Auto-select all due/overdue invoices
        const now = new Date();
        const autoSelected: Record<string, number> = {};
        for (const inv of sorted) {
          const due = Number(inv.amountDue);
          if (due > 0 && inv.dueDate && new Date(inv.dueDate) <= now) {
            autoSelected[inv.id] = due;
          }
        }
        if (Object.keys(autoSelected).length > 0) {
          setSelectedInvoices(autoSelected);
        }
      } catch {
        // handled by partnerApi
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [isHq]);

  function toggleInvoice(invoiceId: string, amountDue: number) {
    setSelectedInvoices((prev) => {
      if (prev[invoiceId] !== undefined) {
        const next = { ...prev };
        delete next[invoiceId];
        setCreditAllocations((ca) => ca.filter((a) => a.invoiceId !== invoiceId));
        return next;
      }
      return { ...prev, [invoiceId]: amountDue };
    });
    if (!isDirty) setIsDirty(true);
  }

  function updateInvoiceAmount(invoiceId: string, amount: number) {
    setSelectedInvoices((prev) => ({ ...prev, [invoiceId]: amount }));
  }

  const creditNoteUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const alloc of creditAllocations) {
      usage[alloc.creditNoteId] = (usage[alloc.creditNoteId] || 0) + alloc.amount;
    }
    return usage;
  }, [creditAllocations]);

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
    if (!isDirty) setIsDirty(true);
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

  const allocatedTotal = Object.values(selectedInvoices).reduce((s, v) => s + v, 0);
  const totalCreditsApplied = creditAllocations.reduce((s, a) => s + a.amount, 0);
  const netPayable = allocatedTotal - totalCreditsApplied;

  // Auto-sync payment amount with net payable
  useEffect(() => {
    if (netPayable > 0) {
      setPaymentAmount(netPayable.toFixed(2));
    }
  }, [netPayable]);

  const selectedInvoiceIds = Object.keys(selectedInvoices);
  const hasSelectedInvoices = selectedInvoiceIds.length > 0;
  const hasAvailableCredits = availableCreditNotes.length > 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!hasSelectedInvoices) {
      setError('Please select at least one invoice to include in this remittance.');
      return;
    }

    const fd = new FormData(e.currentTarget);
    const totalAmount = Number(paymentAmount);

    if (!totalAmount || totalAmount <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

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

    setSubmitting(true);
    try {
      await partnerApi('/remittances', {
        method: 'POST',
        body: JSON.stringify({
          partnerRef: (fd.get('partnerRef') as string)?.trim() || undefined,
          totalAmount,
          periodFrom: fd.get('periodFrom') || undefined,
          periodTo: fd.get('periodTo') || undefined,
          invoiceAllocations,
          creditNoteAllocations: creditNoteAllocations.length > 0 ? creditNoteAllocations : undefined,
          notes: (fd.get('notes') as string)?.trim() || undefined,
        }),
      });
      setIsDirty(false);
      navigate('/partner/remittances');
    } catch (err: any) {
      setError(err.message || 'Failed to submit remittance.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isHq) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Remittances are managed by your head office.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const cls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';


  return (
    <div className="space-y-6 max-w-3xl">
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Remittance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record a payment to Xarra Books by selecting the invoices being paid and applying any
          available credit notes.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        onChange={() => !isDirty && setIsDirty(true)}
        className="space-y-6"
      >
        {/* Reference & Period */}
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Payment Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Reference
              </label>
              <input name="partnerRef" placeholder="e.g. bank ref number" className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Amount (ZAR) <span className="text-red-500">*</span>
              </label>
              <input
                name="totalAmount"
                type="number"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => { setPaymentAmount(e.target.value); if (!isDirty) setIsDirty(true); }}
                className={cls}
              />
              {hasSelectedInvoices && Math.abs(Number(paymentAmount) - netPayable) > 0.01 && (
                <p className="mt-1 text-xs text-amber-600">
                  Suggested amount based on selected invoices: R {netPayable.toFixed(2)}{' '}
                  <button type="button" onClick={() => setPaymentAmount(netPayable.toFixed(2))} className="underline text-primary">Use this amount</button>
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period From</label>
              <input name="periodFrom" type="date" className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period To</label>
              <input name="periodTo" type="date" className={cls} />
            </div>
          </div>
        </div>

        {/* Invoice Allocation */}
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Select Invoices <span className="text-red-500">*</span>
          </h2>
          {outstandingInvoices.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No outstanding invoices found.
            </p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
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
                          if (!isDirty) setIsDirty(true);
                        }}
                        title="Select all"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Invoice
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Due Date
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Credits
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Paid
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Due
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Allocate
                    </th>
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
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleInvoice(inv.id, amountDue)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">
                          {inv.number}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {new Date(inv.invoiceDate).toLocaleDateString('en-ZA')}
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
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={amountDue}
                              value={selectedInvoices[inv.id]}
                              onChange={(e) =>
                                updateInvoiceAmount(inv.id, Number(e.target.value))
                              }
                              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm text-right"
                            />
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
          )}
        </div>

        {/* Credit Note Allocation */}
        {hasSelectedInvoices && hasAvailableCredits && (
          <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Apply Credit Notes</h2>
            <p className="text-xs text-gray-500">
              Offset invoices with available credit notes. A credit note can be split across
              multiple invoices.
            </p>

            {creditAllocations.length > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50/30 overflow-x-auto">
                <table className="min-w-full divide-y divide-green-100">
                  <thead className="bg-green-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Credit Note
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Applied to Invoice
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {creditAllocations.map((alloc, idx) => {
                      const cn = availableCreditNotes.find((c) => c.id === alloc.creditNoteId);
                      const inv = outstandingInvoices.find((i) => i.id === alloc.invoiceId);
                      const cnAvailable = cn
                        ? Number(cn.available) -
                          (creditNoteUsage[alloc.creditNoteId] || 0) +
                          alloc.amount
                        : 0;
                      const invDue = selectedInvoices[alloc.invoiceId] ?? 0;
                      const otherCreditsOnInvoice =
                        (creditPerInvoice[alloc.invoiceId] ?? 0) - alloc.amount;
                      const maxAmount = Math.min(cnAvailable, invDue - otherCreditsOnInvoice);
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-sm text-green-800 font-medium">
                            {cn?.number ?? '?'}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            {inv?.number ?? '?'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={maxAmount}
                              value={alloc.amount}
                              onChange={(e) =>
                                updateCreditAllocationAmount(idx, Number(e.target.value))
                              }
                              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeCreditAllocation(idx)}
                              className="text-red-400 hover:text-red-600 text-sm"
                              title="Remove"
                            >
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

            <div className="space-y-2">
              {availableCreditNotes.map((cn) => {
                const used = creditNoteUsage[cn.id] || 0;
                const remaining = Number(cn.available) - used;
                if (remaining <= 0) return null;
                return (
                  <div
                    key={cn.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-green-700">{cn.number}</span>
                      {cn.invoiceNumber && (
                        <span className="ml-1 text-xs text-gray-400">
                          (from {cn.invoiceNumber})
                        </span>
                      )}
                      <span className="ml-2 text-sm text-gray-600">
                        R {remaining.toFixed(2)} available
                      </span>
                    </div>
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
                );
              })}
            </div>
          </div>
        )}

        {/* Reconciliation Summary */}
        {hasSelectedInvoices && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Reconciliation Summary</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Invoices</span>
                <span className="font-medium text-gray-900">R {allocatedTotal.toFixed(2)}</span>
              </div>
              {totalCreditsApplied > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-700">Less: Credit Notes Applied</span>
                  <span className="font-medium text-green-700">
                    - R {totalCreditsApplied.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold">
                <span className="text-gray-800">Net Payment Due</span>
                <span className="text-gray-900">R {netPayable.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Any additional information about this payment..."
            className={cls}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/partner/remittances')}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            )}
            Submit Remittance
          </button>
        </div>
      </form>
    </div>
  );
}

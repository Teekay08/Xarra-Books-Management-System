import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

interface Invoice {
  id: string;
  number: string;
  total: string;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
}

export function RemittanceCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({});
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<{ data: { id: string; name: string }[] }>('/partners?limit=500'),
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['partner-invoices', partnerId],
    queryFn: () => api<{ data: Invoice[] }>(`/finance/invoices?search=&limit=100&partnerId=${partnerId}`),
    enabled: !!partnerId,
  });

  // Filter to outstanding invoices only
  const outstandingInvoices = (invoicesData?.data ?? []).filter(
    (inv) => inv.status === 'ISSUED' || inv.status === 'PARTIAL'
  );

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/remittances', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remittances'] });
      setIsDirty(false);
      navigate('/remittances');
    },
  });

  function toggleInvoice(invoiceId: string, total: number) {
    setSelectedInvoices((prev) => {
      if (prev[invoiceId] !== undefined) {
        const next = { ...prev };
        delete next[invoiceId];
        return next;
      }
      return { ...prev, [invoiceId]: total };
    });
  }

  function updateInvoiceAmount(invoiceId: string, amount: number) {
    setSelectedInvoices((prev) => ({ ...prev, [invoiceId]: amount }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    const invoiceAllocations = Object.entries(selectedInvoices).map(([invoiceId, amount]) => ({
      invoiceId,
      amount,
    }));

    mutation.mutate({
      partnerId,
      partnerRef: fd.get('partnerRef') || undefined,
      totalAmount: Number(fd.get('totalAmount')),
      periodFrom: fd.get('periodFrom') || undefined,
      periodTo: fd.get('periodTo') || undefined,
      parseMethod: 'MANUAL',
      invoiceAllocations: invoiceAllocations.length > 0 ? invoiceAllocations : undefined,
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
  }

  const allocatedTotal = Object.values(selectedInvoices).reduce((s, v) => s + v, 0);
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="Record Remittance" subtitle="Record a payment received from a channel partner" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-2xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel Partner *</label>
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

        {partnerId && outstandingInvoices.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Link to Invoices (optional)</label>
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Allocate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {outstandingInvoices.map((inv) => {
                    const isSelected = selectedInvoices[inv.id] !== undefined;
                    const total = Number(inv.total);
                    return (
                      <tr key={inv.id} className={isSelected ? 'bg-green-50' : ''}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleInvoice(inv.id, total)}
                            className="rounded border-gray-300" />
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900">{inv.number}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {new Date(inv.invoiceDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 text-right">R {total.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          {isSelected && (
                            <input type="number" step="0.01" min="0" max={total}
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
              {Object.keys(selectedInvoices).length > 0 && (
                <div className="px-3 py-2 bg-gray-50 text-right text-sm font-medium text-gray-700">
                  Total Allocated: R {allocatedTotal.toFixed(2)}
                </div>
              )}
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

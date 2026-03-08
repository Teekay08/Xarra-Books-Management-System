import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { VAT_RATE, roundAmount } from '@xarra/shared';
import { v4 as uuidv4 } from 'uuid';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

interface LineItem {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

export function DebitNoteCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([
    { key: uuidv4(), description: '', quantity: 1, unitPrice: 0, discountPct: 0 },
  ]);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<{ data: { id: string; name: string }[] }>('/partners?limit=500'),
  });

  const partnerOptions = (partners?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/debit-notes', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': uuidv4() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
      setIsDirty(false);
      navigate('/debit-notes');
    },
  });

  function addLine() {
    setLines((prev) => [...prev, { key: uuidv4(), description: '', quantity: 1, unitPrice: 0, discountPct: 0 }]);
  }

  function updateLine(key: string, field: keyof LineItem, value: string | number) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const subtotal = lines.reduce((s, l) => {
    const lineTotal = l.quantity * l.unitPrice;
    const discount = lineTotal * (l.discountPct / 100);
    return s + lineTotal - discount;
  }, 0);
  const vat = roundAmount(subtotal * VAT_RATE);
  const total = subtotal + vat;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      partnerId,
      reason: fd.get('reason'),
      lines: lines.map(({ description, quantity, unitPrice, discountPct }) => ({
        description, quantity, unitPrice, discountPct,
      })),
    }, { onError: (err) => setError(err.message) });
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="Create Debit Note" subtitle="Charge a partner for surcharges or adjustments" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-3xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel Partner *</label>
            <SearchableSelect
              options={partnerOptions}
              value={partnerId}
              onChange={setPartnerId}
              placeholder="Search partners..."
              required
              onCreateNew={() => setShowPartnerCreate(true)}
              createNewLabel="Create new partner"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <input name="reason" required className={cls} placeholder="e.g. Damaged stock surcharge" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Line Items</label>
            <button type="button" onClick={addLine} className="text-xs text-green-700 hover:underline">+ Add Line</button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-20">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">Unit Price</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-20">Disc %</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">Total</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lines.map((line) => {
                  const lineTotal = line.quantity * line.unitPrice * (1 - line.discountPct / 100);
                  return (
                    <tr key={line.key}>
                      <td className="px-3 py-2">
                        <input value={line.description} onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" required />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', Number(e.target.value))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" min="0" value={line.unitPrice} onChange={(e) => updateLine(line.key, 'unitPrice', Number(e.target.value))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.1" min="0" max="100" value={line.discountPct} onChange={(e) => updateLine(line.key, 'discountPct', Number(e.target.value))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2 text-sm text-right font-medium">R {lineTotal.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(line.key)} className="text-red-500 hover:text-red-700 text-xs">x</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm text-right font-medium text-gray-700">Subtotal</td>
                  <td className="px-3 py-2 text-sm text-right font-medium">R {subtotal.toFixed(2)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm text-right text-gray-500">VAT (15%)</td>
                  <td className="px-3 py-2 text-sm text-right text-gray-500">R {vat.toFixed(2)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm text-right font-bold text-gray-900">Total</td>
                  <td className="px-3 py-2 text-sm text-right font-bold text-gray-900">R {total.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Debit Note'}
          </button>
          <button type="button" onClick={() => navigate('/debit-notes')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
      {showPartnerCreate && (
        <QuickPartnerCreate
          onClose={() => setShowPartnerCreate(false)}
          onCreated={(p) => setPartnerId(p.id)}
        />
      )}
    </div>
  );
}

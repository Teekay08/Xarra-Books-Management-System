import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';
import { VAT_RATE, roundAmount } from '@xarra/shared';

interface Partner {
  id: string; name: string;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null;
  province: string | null; postalCode: string | null; vatNumber: string | null;
}

interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function PurchaseOrderCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);
  const [lines, setLines] = useState<LineInput[]>([
    { description: '', quantity: 1, unitPrice: 0, discountPct: 0 },
  ]);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
  });

  const { data: nextNumber } = useQuery({
    queryKey: ['next-number', 'purchase-order'],
    queryFn: () => api<{ data: { number: string } }>('/finance/next-number/purchase-order'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID(),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setIsDirty(false);
      navigate('/finance/purchase-orders');
    },
  });

  const partnerOptions = (partners?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const selectedPartner = partners?.data.find((p) => p.id === supplierId);

  function addLine() {
    setLines([...lines, { description: '', quantity: 1, unitPrice: 0, discountPct: 0 }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineInput, value: string | number) {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    setLines(updated);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    const orderDate = fd.get('orderDate') as string;
    const supplierName = fd.get('supplierName') as string;

    if (!orderDate) { setError('Order date is required'); return; }
    if (!supplierName && !supplierId) { setError('Supplier name is required'); return; }
    if (lines.some((l) => !l.description || l.quantity <= 0 || l.unitPrice <= 0)) {
      setError('All lines must have a description, quantity, and unit price');
      return;
    }

    const resolvedSupplierName = supplierId
      ? selectedPartner?.name ?? supplierName
      : supplierName;

    mutation.mutate({
      supplierId: supplierId || undefined,
      supplierName: resolvedSupplierName,
      contactName: fd.get('contactName') || undefined,
      contactEmail: fd.get('contactEmail') || undefined,
      orderDate,
      expectedDeliveryDate: fd.get('expectedDeliveryDate') || undefined,
      deliveryAddress: fd.get('deliveryAddress') || undefined,
      taxInclusive,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
      })),
      notes: fd.get('notes') || undefined,
    }, { onError: (err) => setError(err.message) });
  }

  const lineGross = lines.reduce((sum, l) => {
    const line = l.quantity * l.unitPrice;
    return sum + line - line * (l.discountPct / 100);
  }, 0);
  const subtotal = roundAmount(taxInclusive ? lineGross / (1 + VAT_RATE) : lineGross);
  const vat = roundAmount(taxInclusive ? lineGross - subtotal : lineGross * VAT_RATE);

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="Create Purchase Order" subtitle={nextNumber?.data?.number ? `Next: ${nextNumber.data.number}` : undefined} />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (existing partner)</label>
            <SearchableSelect
              options={partnerOptions}
              value={supplierId}
              onChange={(v) => setSupplierId(v)}
              placeholder="Search partners..."
              onCreateNew={() => setShowPartnerCreate(true)}
              createNewLabel="Create new partner"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
            <input
              name="supplierName"
              className={cls}
              placeholder="e.g. PrintCo Supplies"
              defaultValue={selectedPartner?.name ?? ''}
              key={supplierId}
            />
          </div>
        </div>

        {/* Recipient details card — visible after partner selection */}
        {selectedPartner && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">Supplier Details</h4>
              <button
                type="button"
                onClick={() => setShowRecipientModal(true)}
                className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
              <div>
                <span className="font-medium text-gray-900">{selectedPartner.name}</span>
                {selectedPartner.contactName && <p>{selectedPartner.contactName}</p>}
                {selectedPartner.contactEmail && <p>{selectedPartner.contactEmail}</p>}
                {selectedPartner.contactPhone && <p>{selectedPartner.contactPhone}</p>}
              </div>
              <div>
                {selectedPartner.addressLine1 && <p>{selectedPartner.addressLine1}</p>}
                {selectedPartner.addressLine2 && <p>{selectedPartner.addressLine2}</p>}
                {(selectedPartner.city || selectedPartner.province) && (
                  <p>{[selectedPartner.city, selectedPartner.province].filter(Boolean).join(', ')}</p>
                )}
                {selectedPartner.postalCode && <p>{selectedPartner.postalCode}</p>}
                {selectedPartner.vatNumber && <p className="text-xs text-gray-500 mt-1">VAT: {selectedPartner.vatNumber}</p>}
              </div>
            </div>
          </div>
        )}

        {!supplierId && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input name="contactName" className={cls} placeholder="e.g. John Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input name="contactEmail" type="email" className={cls} placeholder="e.g. john@supplier.co.za" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order Date *</label>
            <input
              name="orderDate"
              type="date"
              required
              defaultValue={new Date().toISOString().split('T')[0]}
              className={cls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
            <input name="expectedDeliveryDate" type="date" className={cls} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
          <textarea name="deliveryAddress" rows={2} className={cls} placeholder="Delivery address..." />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="taxInclusive" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)}
            className="rounded border-gray-300" />
          <label htmlFor="taxInclusive" className="text-sm text-gray-700">Prices include VAT</label>
        </div>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Line Items</legend>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Description</label>}
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    placeholder="Item description..."
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                  <input
                    type="number" min={1} value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price</label>}
                  <input
                    type="number" step="0.01" value={line.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Disc %</label>}
                  <input
                    type="number" step="0.01" value={line.discountPct}
                    onChange={(e) => updateLine(i, 'discountPct', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Total</label>}
                  <span className="block py-1.5 text-sm font-mono text-right">
                    {(line.quantity * line.unitPrice * (1 - line.discountPct / 100)).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={() => removeLine(i)}
                    className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLine}
              className="text-sm text-green-700 hover:text-green-800">+ Add Line</button>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-mono">R {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">VAT ({VAT_RATE * 100}%)</span>
              <span className="font-mono">R {vat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="font-mono">R {(taxInclusive ? lineGross : subtotal + vat).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={2} className={cls} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Purchase Order'}
          </button>
          <button type="button" onClick={() => navigate('/finance/purchase-orders')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>

      {/* Recipient Edit Modal */}
      {showRecipientModal && selectedPartner && (
        <RecipientEditModal
          recipient={{
            partnerId: selectedPartner.id,
            partnerName: selectedPartner.name,
            contactName: selectedPartner.contactName,
            contactEmail: selectedPartner.contactEmail,
            contactPhone: selectedPartner.contactPhone,
            addressLine1: selectedPartner.addressLine1,
            addressLine2: selectedPartner.addressLine2,
            city: selectedPartner.city,
            province: selectedPartner.province,
            postalCode: selectedPartner.postalCode,
            vatNumber: selectedPartner.vatNumber,
          }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['partners-select'] })}
        />
      )}

      {showPartnerCreate && (
        <QuickPartnerCreate
          onClose={() => setShowPartnerCreate(false)}
          onCreated={(p) => { setSupplierId(p.id); setIsDirty(true); }}
        />
      )}
    </div>
  );
}

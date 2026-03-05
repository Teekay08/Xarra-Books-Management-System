import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { VAT_RATE, roundAmount } from '@xarra/shared';

interface Partner { id: string; name: string }

interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

export function PurchaseOrderCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<LineInput[]>([
    { description: '', quantity: 1, unitPrice: 0, discountPct: 0 },
  ]);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=100'),
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
      navigate('/finance/purchase-orders');
    },
  });

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

    // Resolve supplier name from partner if selected
    const resolvedSupplierName = supplierId
      ? partners?.data.find((p) => p.id === supplierId)?.name ?? supplierName
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
      <PageHeader title="Create Purchase Order" />

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (existing partner)</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">Select partner (optional)...</option>
              {partners?.data.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
            <input
              name="supplierName"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. PrintCo Supplies"
              defaultValue={supplierId ? partners?.data.find((p) => p.id === supplierId)?.name ?? '' : ''}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input
              name="contactName"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. John Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input
              name="contactEmail"
              type="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. john@supplier.co.za"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order Date *</label>
            <input
              name="orderDate"
              type="date"
              required
              defaultValue={new Date().toISOString().split('T')[0]}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
            <input
              name="expectedDeliveryDate"
              type="date"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
          <textarea
            name="deliveryAddress"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder="Delivery address..."
          />
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
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price</label>}
                  <input
                    type="number"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Disc %</label>}
                  <input
                    type="number"
                    step="0.01"
                    value={line.discountPct}
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
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addLine}
              className="text-sm text-green-700 hover:text-green-800"
            >
              + Add Line
            </button>
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
          <textarea
            name="notes"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Purchase Order'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/finance/purchase-orders')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

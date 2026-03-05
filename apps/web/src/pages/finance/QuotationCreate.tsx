import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { VAT_RATE, roundAmount } from '@xarra/shared';

interface Partner { id: string; name: string; discountPct: string }
interface Title { id: string; title: string; rrpZar: string }

interface LineInput {
  titleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

export function QuotationCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<LineInput[]>([
    { titleId: '', description: '', quantity: 1, unitPrice: 0, discountPct: 0 },
  ]);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=100'),
  });

  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=100'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/finance/quotations', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      navigate('/quotations');
    },
  });

  function addLine() {
    setLines([...lines, { titleId: '', description: '', quantity: 1, unitPrice: 0, discountPct: 0 }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineInput, value: string | number) {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    if (field === 'titleId' && titlesData?.data) {
      const title = titlesData.data.find((t) => t.id === value);
      if (title) {
        updated[i].unitPrice = Number(title.rrpZar);
        updated[i].description = title.title;
      }
    }
    setLines(updated);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const partnerId = fd.get('partnerId') as string;
    if (!partnerId) { setError('Select a partner'); return; }

    const partner = partners?.data.find((p) => p.id === partnerId);
    const partnerDiscount = partner ? Number(partner.discountPct) : 0;

    mutation.mutate({
      partnerId,
      quotationDate: fd.get('quotationDate'),
      validUntil: fd.get('validUntil') || undefined,
      taxInclusive,
      lines: lines.map((l) => ({
        titleId: l.titleId || undefined,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct || partnerDiscount,
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

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  const today = new Date().toISOString().split('T')[0];
  const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  return (
    <div>
      <PageHeader title="Create Quotation" subtitle="Pro-forma invoice / quotation" />

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner *</label>
            <select name="partnerId" required className={cls}>
              <option value="">Select partner...</option>
              {partners?.data.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input name="quotationDate" type="date" required defaultValue={today} className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
            <input name="validUntil" type="date" defaultValue={thirtyDays} className={cls} />
          </div>
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
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Title</label>}
                  <select value={line.titleId} onChange={(e) => updateLine(i, 'titleId', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">Select title...</option>
                    {titlesData?.data.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price</label>}
                  <input type="number" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Disc %</label>}
                  <input type="number" step="0.01" value={line.discountPct} onChange={(e) => updateLine(i, 'discountPct', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-1">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Total</label>}
                  <span className="block py-1.5 text-sm font-mono text-right">
                    {(line.quantity * line.unitPrice * (1 - line.discountPct / 100)).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-sm text-green-700 hover:text-green-800">+ Add Line</button>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">R {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">VAT ({VAT_RATE * 100}%)</span><span className="font-mono">R {vat.toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span className="font-mono">R {(taxInclusive ? lineGross : subtotal + vat).toFixed(2)}</span></div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={2} className={cls} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Quotation'}
          </button>
          <button type="button" onClick={() => navigate('/quotations')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}

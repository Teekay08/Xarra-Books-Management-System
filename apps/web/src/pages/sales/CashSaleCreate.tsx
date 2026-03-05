import { useState, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { VAT_RATE, roundAmount } from '@xarra/shared';

interface Title {
  id: string;
  title: string;
  isbn13: string | null;
  rrp: string | null;
}

interface LineInput {
  titleId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface CreateResponse {
  data: { id: string };
}

const PAYMENT_METHODS = ['CASH', 'CARD', 'EFT', 'MOBILE'] as const;

function formatCurrency(val: number): string {
  return `R ${val.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CashSaleCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [lines, setLines] = useState<LineInput[]>([
    { titleId: '', quantity: 1, unitPrice: 0, discount: 0 },
  ]);

  const today = new Date().toISOString().split('T')[0];

  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=100'),
  });

  const titlesMap = useMemo(() => {
    const map = new Map<string, Title>();
    titlesData?.data.forEach((t) => map.set(t.id, t));
    return map;
  }, [titlesData]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<CreateResponse>('/sales/cash-sales', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cash-sales'] });
      navigate(`/sales/cash-sales/${res.data.id}`);
    },
  });

  function addLine() {
    setLines([...lines, { titleId: '', quantity: 1, unitPrice: 0, discount: 0 }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineInput, value: string | number) {
    const updated = [...lines];
    if (field === 'titleId') {
      updated[i].titleId = value as string;
      const title = titlesMap.get(value as string);
      if (title?.rrp) {
        updated[i].unitPrice = Number(title.rrp);
      }
    } else {
      (updated[i] as any)[field] = Number(value);
    }
    setLines(updated);
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const line of lines) {
      const lineGross = line.quantity * line.unitPrice;
      const lineDiscount = roundAmount(lineGross * (line.discount / 100));
      subtotal += roundAmount(lineGross - lineDiscount);
    }

    let vatAmount: number;
    let netSubtotal: number;

    if (taxInclusive) {
      vatAmount = roundAmount(subtotal - subtotal / (1 + VAT_RATE));
      netSubtotal = roundAmount(subtotal - vatAmount);
    } else {
      vatAmount = roundAmount(subtotal * VAT_RATE);
      netSubtotal = subtotal;
    }

    const total = roundAmount(netSubtotal + vatAmount);
    return { subtotal: netSubtotal, vatAmount, total };
  }, [lines, taxInclusive]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    if (lines.some((l) => !l.titleId || l.quantity <= 0)) {
      setError('All lines must have a title and quantity greater than 0');
      return;
    }

    mutation.mutate(
      {
        saleDate: fd.get('saleDate') || today,
        customerName: fd.get('customerName') || undefined,
        paymentMethod: fd.get('paymentMethod'),
        paymentReference: fd.get('paymentReference') || undefined,
        taxInclusive,
        notes: fd.get('notes') || undefined,
        lines: lines.map((l) => ({
          titleId: l.titleId,
          quantity: l.quantity,
          unitPrice: String(l.unitPrice),
          discount: String(l.discount),
        })),
      },
      { onError: (err) => setError(err.message) }
    );
  }

  return (
    <div>
      <PageHeader title="New Cash Sale" subtitle="Record a walk-in or counter sale" />

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sale Date *</label>
            <input
              name="saleDate"
              type="date"
              defaultValue={today}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
            <input
              name="customerName"
              placeholder="Walk-in customer (optional)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
            <select
              name="paymentMethod"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
            <input
              name="paymentReference"
              placeholder="e.g., card auth code"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={taxInclusive}
                onChange={(e) => setTaxInclusive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-500"
              />
              Tax Inclusive
            </label>
          </div>
        </div>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Line Items</legend>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Title</label>}
                  <select
                    value={line.titleId}
                    onChange={(e) => updateLine(i, 'titleId', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select title...</option>
                    {titlesData?.data.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} {t.isbn13 ? `(${t.isbn13})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-1">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price</label>}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Discount %</label>}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={line.discount}
                    onChange={(e) => updateLine(i, 'discount', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-1 text-right text-sm font-mono text-gray-600 pb-1">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Line Total</label>}
                  {formatCurrency(
                    roundAmount(
                      line.quantity * line.unitPrice -
                        roundAmount(line.quantity * line.unitPrice * (line.discount / 100))
                    )
                  )}
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        {/* Totals preview */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-mono">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">VAT (15%)</span>
                <span className="font-mono">{formatCurrency(totals.vatAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-300 pt-2 font-semibold">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Processing...' : 'Complete Sale'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/sales/cash-sales')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

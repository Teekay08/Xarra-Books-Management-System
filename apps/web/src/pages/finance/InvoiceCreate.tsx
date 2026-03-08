import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';
import { VAT_RATE, roundAmount } from '@xarra/shared';

interface Partner {
  id: string; name: string; discountPct: string; paymentTermsDays: number | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null;
  province: string | null; postalCode: string | null; vatNumber: string | null;
}
interface Title { id: string; title: string; rrpZar: string; isbn13: string | null }

interface LineInput {
  titleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

const PAYMENT_TERM_OPTIONS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: 'Custom', days: -1 },
];

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function InvoiceCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState(searchParams.get('partnerId') ?? '');
  const partnerOrderId = searchParams.get('partnerOrderId');
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [customDueDate, setCustomDueDate] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [lines, setLines] = useState<LineInput[]>([
    { titleId: '', description: '', quantity: 1, unitPrice: 0, discountPct: 0 },
  ]);

  // Pre-fill lines from partner order if coming from partner order workflow
  useEffect(() => {
    if (!partnerOrderId) return;
    api<{ data: { lines: { titleId: string; title: { title: string } | null; quantity: number; unitPrice: string; discountPct: string }[] } }>(`/partner-admin/orders/${partnerOrderId}`)
      .then((res) => {
        const orderLines = res.data.lines;
        if (orderLines?.length) {
          setLines(orderLines.map((l) => ({
            titleId: l.titleId,
            description: l.title?.title ?? '',
            quantity: l.quantity,
            unitPrice: Number(l.unitPrice),
            discountPct: 0, // discount already applied in unitPrice
          })));
        }
      })
      .catch(() => { /* ignore — user can fill manually */ });
  }, [partnerOrderId]);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
  });

  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=500'),
  });

  const { data: nextNumber } = useQuery({
    queryKey: ['next-number', 'invoice'],
    queryFn: () => api<{ data: { number: string } }>('/finance/next-number/invoice'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: { id: string } }>('/finance/invoices', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID(),
        },
      }),
    onSuccess: async (result) => {
      // Auto-link invoice to partner order if created from partner order workflow
      if (partnerOrderId && result.data?.id) {
        try {
          await api(`/partner-admin/orders/${partnerOrderId}/link`, {
            method: 'PATCH',
            body: JSON.stringify({ invoiceId: result.data.id }),
          });
        } catch { /* best effort — user can link manually */ }
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      setIsDirty(false);
      navigate('/invoices');
    },
  });

  const selectedPartner = partners?.data.find((p) => p.id === selectedPartnerId);

  const dueDate = paymentTermsDays === -1
    ? customDueDate
    : addDays(invoiceDate, paymentTermsDays);

  const partnerOptions = (partners?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    subtitle: `${Number(p.discountPct)}% discount`,
  }));

  const titleOptions = (titlesData?.data ?? []).map((t) => ({
    value: t.id,
    label: t.title,
    subtitle: t.isbn13 ?? undefined,
  }));

  function handlePartnerChange(partnerId: string) {
    setSelectedPartnerId(partnerId);
    setIsDirty(true);
    const partner = partners?.data.find((p) => p.id === partnerId);
    if (partner?.paymentTermsDays) {
      const preset = PAYMENT_TERM_OPTIONS.find((o) => o.days === partner.paymentTermsDays);
      setPaymentTermsDays(preset ? preset.days : -1);
      if (!preset) setCustomDueDate(addDays(invoiceDate, partner.paymentTermsDays));
    }
  }

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
    if (!isDirty) setIsDirty(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!selectedPartnerId) { setError('Select a partner'); return; }
    if (!invoiceDate) { setError('Invoice date is required'); return; }
    if (lines.some((l) => !l.titleId || l.quantity <= 0 || l.unitPrice <= 0)) {
      setError('All lines must have a title, quantity, and unit price');
      return;
    }

    const partnerDiscount = selectedPartner ? Number(selectedPartner.discountPct) : 0;
    const paymentTermsText = paymentTermsDays === -1
      ? `Due by ${new Date(customDueDate).toLocaleDateString('en-ZA')}`
      : `Net ${paymentTermsDays} days`;

    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      partnerId: selectedPartnerId,
      invoiceDate,
      taxInclusive,
      lines: lines.map((l) => ({
        titleId: l.titleId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct || partnerDiscount,
      })),
      purchaseOrderNumber: fd.get('purchaseOrderNumber') || undefined,
      customerReference: fd.get('customerReference') || undefined,
      paymentTermsText,
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
      <PageHeader title="Create Invoice" subtitle={nextNumber?.data?.number ? `Next: ${nextNumber.data.number}` : undefined} />

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner *</label>
            <SearchableSelect
              options={partnerOptions}
              value={selectedPartnerId}
              onChange={handlePartnerChange}
              placeholder="Search partners..."
              required
              onCreateNew={() => setShowPartnerCreate(true)}
              createNewLabel="Create new partner"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
            <input
              name="invoiceDate"
              type="date"
              required
              value={invoiceDate}
              onChange={(e) => { setInvoiceDate(e.target.value); if (!isDirty) setIsDirty(true); }}
              className={cls}
            />
          </div>
        </div>

        {/* Recipient details card */}
        {selectedPartner && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">Recipient Details</h4>
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
            <input name="purchaseOrderNumber" className={cls} placeholder="e.g. PO-12345" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Reference</label>
            <input name="customerReference" className={cls} placeholder="e.g. Order #ABC" />
          </div>
        </div>

        {/* Payment Terms */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
            <select
              value={paymentTermsDays}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPaymentTermsDays(val);
                if (val === -1) setCustomDueDate(addDays(invoiceDate, 30));
                if (!isDirty) setIsDirty(true);
              }}
              className={cls}
            >
              {PAYMENT_TERM_OPTIONS.map((opt) => (
                <option key={opt.days} value={opt.days}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            {paymentTermsDays === -1 ? (
              <input type="date" value={customDueDate} onChange={(e) => setCustomDueDate(e.target.value)}
                min={invoiceDate} required className={cls} />
            ) : (
              <input type="date" value={dueDate} readOnly className={`${cls} bg-gray-50 text-gray-500`} />
            )}
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
                  <SearchableSelect
                    options={titleOptions}
                    value={line.titleId}
                    onChange={(val) => updateLine(i, 'titleId', val)}
                    placeholder="Search titles..."
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                  <input type="number" min={1} value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit Price</label>}
                  <input type="number" step="0.01" value={line.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Disc %</label>}
                  <input type="number" step="0.01" value={line.discountPct}
                    onChange={(e) => updateLine(i, 'discountPct', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
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
            {mutation.isPending ? 'Creating...' : 'Create Invoice'}
          </button>
          <button type="button" onClick={() => navigate('/invoices')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>

      {/* Modals */}
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
          onCreated={(p) => { setSelectedPartnerId(p.id); setIsDirty(true); }}
        />
      )}
    </div>
  );
}

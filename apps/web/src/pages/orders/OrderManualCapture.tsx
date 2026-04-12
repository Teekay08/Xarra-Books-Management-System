import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';
import { StockCheckModal } from './components/StockCheckModal';

interface Partner { id: string; name: string; discountPct: string; contactEmail?: string | null }
interface Branch { id: string; name: string; partnerId: string }
interface Title { id: string; title: string; isbn13: string | null; rrpZar?: string | null }

interface LineInput {
  titleId: string;
  titleLabel: string;
  quantity: number;
  unitPrice: number;
  rrp: number;
}

const SOURCE_OPTIONS = [
  { value: 'EMAIL',  label: 'Email',   icon: '✉' },
  { value: 'PHONE',  label: 'Phone',   icon: '📞' },
  { value: 'FAX',    label: 'Fax',     icon: '📠' },
  { value: 'MANUAL', label: 'Walk-in', icon: '🚶' },
] as const;
type Source = typeof SOURCE_OPTIONS[number]['value'];

const fmt = (n: number) =>
  'R\u00a0' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Order Preview Modal ──────────────────────────────────────────────────────
interface PreviewProps {
  partner: Partner | undefined;
  branch: Branch | undefined;
  source: Source;
  partnerPoNumber: string;
  expectedDeliveryDate: string;
  deliveryAddress: string;
  notes: string;
  lines: LineInput[];
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function OrderPreviewModal({
  partner, branch, source, partnerPoNumber, expectedDeliveryDate,
  deliveryAddress, notes, lines, onClose, onConfirm, isPending,
}: PreviewProps) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Order Preview</h2>
            <p className="text-xs text-gray-400 mt-0.5">Review before capturing</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Partner + meta */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Retail Partner</p>
              <p className="font-semibold text-gray-900">{partner?.name ?? '—'}</p>
              {branch && <p className="text-gray-500 text-xs">{branch.name}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Received Via</p>
              <p className="font-semibold text-gray-900">
                {SOURCE_OPTIONS.find(s => s.value === source)?.icon}{' '}
                {SOURCE_OPTIONS.find(s => s.value === source)?.label}
              </p>
            </div>
            {partnerPoNumber && (
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Partner PO</p>
                <p className="font-mono font-semibold text-gray-900">{partnerPoNumber}</p>
              </div>
            )}
            {expectedDeliveryDate && (
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Expected Delivery</p>
                <p className="font-semibold text-gray-900">
                  {new Date(expectedDeliveryDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}
            {deliveryAddress && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Delivery Address</p>
                <p className="text-gray-700">{deliveryAddress}</p>
              </div>
            )}
          </div>

          {/* Lines table */}
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Order Lines</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Title</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 w-16">Qty</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 w-32">Unit Price</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 w-32">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.filter(l => l.titleId).map((line, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900 text-sm">{line.titleLabel}</p>
                        {line.rrp > 0 && <p className="text-xs text-gray-400">RRP: {fmt(line.rrp)}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{line.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">{fmt(line.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 font-mono text-xs">{fmt(line.quantity * line.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500">Subtotal (excl. VAT)</td>
                    <td className="px-4 py-2 text-right font-mono text-sm font-medium text-gray-700">{fmt(subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-4 py-1 text-right text-xs text-gray-500">VAT (15%)</td>
                    <td className="px-4 py-1 text-right font-mono text-sm font-medium text-gray-700">{fmt(vat)}</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono text-base font-bold text-[#8B1A1A]">{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {notes && (
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Notes to Partner</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{notes}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-white transition-colors"
          >
            Back to Edit
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-6 py-2 bg-[#8B1A1A] text-white rounded-lg text-sm font-semibold hover:bg-[#7a1717] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Capturing…
              </>
            ) : (
              'Confirm & Capture Order'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export function OrderManualCapture() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showStockCheck, setShowStockCheck] = useState(false);

  const [partnerId, setPartnerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [partnerPoNumber, setPartnerPoNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [source, setSource] = useState<Source>('EMAIL');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [sendIntakeEmail, setSendIntakeEmail] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [lines, setLines] = useState<LineInput[]>([
    { titleId: '', titleLabel: '', quantity: 1, unitPrice: 0, rrp: 0 },
  ]);
  const [titleSearch, setTitleSearch] = useState('');

  const { data: partnersData } = useQuery({
    queryKey: ['partners-list'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
  });
  const partners = partnersData?.data ?? [];
  const selectedPartner = partners.find(p => p.id === partnerId);
  const discountPct = selectedPartner ? Number(selectedPartner.discountPct) : 0;

  const { data: branchesData } = useQuery({
    queryKey: ['partner-branches', partnerId],
    queryFn: () => api<{ data: Branch[] }>(`/partners/${partnerId}/branches`),
    enabled: !!partnerId,
  });
  const branches = branchesData?.data ?? [];
  const selectedBranch = branches.find(b => b.id === branchId);

  const { data: titlesData } = useQuery({
    queryKey: ['titles-search', titleSearch],
    queryFn: () => api<PaginatedResponse<Title>>(
      `/titles?limit=30&search=${encodeURIComponent(titleSearch)}`
    ),
    enabled: titleSearch.length > 1,
  });
  const titleOptions = (titlesData?.data ?? []).map(t => ({
    value: t.id,
    label: t.title,
    subtitle: t.isbn13 ?? undefined,
  }));

  const addLine = useCallback(() => {
    setLines(prev => [...prev, { titleId: '', titleLabel: '', quantity: 1, unitPrice: 0, rrp: 0 }]);
    setIsDirty(true);
  }, []);

  const removeLine = useCallback((i: number) => {
    setLines(prev => prev.filter((_, idx) => idx !== i));
    setIsDirty(true);
  }, []);

  const selectLineTitle = useCallback((i: number, titleId: string) => {
    const t = (titlesData?.data ?? []).find(x => x.id === titleId);
    if (!t) return;
    const rrp = Number(t.rrpZar ?? 0);
    const discounted = rrp * (1 - discountPct / 100);
    setLines(prev => prev.map((l, idx) =>
      idx === i
        ? { ...l, titleId: t.id, titleLabel: t.title, rrp, unitPrice: Math.round(discounted * 100) / 100 }
        : l
    ));
    setIsDirty(true);
  }, [titlesData, discountPct]);

  const updateLine = useCallback((i: number, field: 'quantity' | 'unitPrice', value: number) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
    setIsDirty(true);
  }, []);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;
  const totalItems = lines.reduce((s, l) => s + (l.titleId ? l.quantity : 0), 0);

  const doSubmit = useCallback(() => {
    mutation.mutate({
      partnerId,
      branchId: branchId || undefined,
      customerPoNumber: partnerPoNumber || undefined,
      deliveryAddress: deliveryAddress || undefined,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      source,
      notes: notes || undefined,
      internalNotes: internalNotes || undefined,
      sendIntakeEmail,
      notifyEmail: (sendIntakeEmail && notifyEmail) ? notifyEmail : undefined,
      lines: lines.map(l => ({
        titleId: l.titleId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    });
  }, [partnerId, branchId, partnerPoNumber, deliveryAddress, expectedDeliveryDate, source, notes, internalNotes, sendIntakeEmail, notifyEmail, lines]);

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      api('/order-tracking/orders/create-on-behalf', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-hub'] });
      setIsDirty(false);
      setShowPreview(false);
      navigate('/orders');
    },
    onError: (err: any) => {
      setShowPreview(false);
      setError(err.message ?? 'Failed to capture order');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setShowPreview(true);
  };

  const validate = () => {
    if (!partnerId) { setError('Please select a retail partner'); return false; }
    if (lines.some(l => !l.titleId)) { setError('All lines must have a title selected'); return false; }
    if (lines.some(l => l.quantity < 1)) { setError('All quantities must be at least 1'); return false; }
    setError('');
    return true;
  };

  const isValid = !!partnerId && lines.length > 0 && lines.every(l => l.titleId && l.quantity >= 1);

  return (
    <UnsavedChangesGuard hasUnsavedChanges={isDirty}>
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Capture Order"
          subtitle="Log an order received via email, phone, or walk-in"
          backTo={{ href: '/orders', label: 'Order Management' }}
        />

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="flex gap-6 items-start">

            {/* ── Left column: form ── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Section 1: Retail Partner */}
              <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#8B1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                  <h2 className="text-sm font-semibold text-gray-700">Retail Partner</h2>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Partner <span className="text-red-500">*</span>
                      </label>
                      <SearchableSelect
                        options={partners.map(p => ({ value: p.id, label: p.name }))}
                        value={partnerId}
                        onChange={v => {
                          setPartnerId(v);
                          setBranchId('');
                          setIsDirty(true);
                          // Pre-fill notify email from partner contact
                          const p = partners.find(x => x.id === v);
                          if (p?.contactEmail) setNotifyEmail(p.contactEmail);
                        }}
                        placeholder="Select retail partner…"
                        onCreateNew={() => setShowQuickCreate(true)}
                        createNewLabel="+ Create new retail partner"
                      />
                      {/* Partner meta + edit link */}
                      {selectedPartner && (
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-gray-400">
                            Discount: <span className="font-semibold text-gray-600">{discountPct}%</span>
                          </span>
                          {selectedPartner.contactEmail && (
                            <span className="text-xs text-gray-400">
                              {selectedPartner.contactEmail}
                            </span>
                          )}
                          <Link
                            to={`/partners/${partnerId}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            Edit partner
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                        </div>
                      )}
                    </div>

                    {branches.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Branch</label>
                        <select
                          value={branchId}
                          onChange={e => { setBranchId(e.target.value); setIsDirty(true); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                        >
                          <option value="">All branches / Head office</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Source selector */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Order Received Via</label>
                    <div className="flex gap-2 flex-wrap">
                      {SOURCE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { setSource(opt.value); setIsDirty(true); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                            source === opt.value
                              ? 'bg-[#8B1A1A] text-white border-[#8B1A1A]'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-base leading-none">{opt.icon}</span> {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Partner PO Number</label>
                      <input
                        type="text"
                        value={partnerPoNumber}
                        onChange={e => { setPartnerPoNumber(e.target.value); setIsDirty(true); }}
                        placeholder="e.g. BGN-4521"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Expected Delivery</label>
                      <input
                        type="date"
                        value={expectedDeliveryDate}
                        onChange={e => { setExpectedDeliveryDate(e.target.value); setIsDirty(true); }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Delivery Address</label>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={e => { setDeliveryAddress(e.target.value); setIsDirty(true); }}
                        placeholder="Full delivery address"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Order Lines */}
              <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#8B1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                    <h2 className="text-sm font-semibold text-gray-700">Order Lines</h2>
                    {lines.filter(l => l.titleId).length > 0 && (
                      <span className="text-xs text-gray-400">
                        {lines.filter(l => l.titleId).length} title{lines.filter(l => l.titleId).length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-semibold text-[#8B1A1A] hover:text-[#7a1717] flex items-center gap-1"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="p-5">
                  {/* Column headers */}
                  <div className="grid grid-cols-12 gap-3 mb-2 px-1">
                    <div className="col-span-6 text-xs font-semibold text-gray-400 uppercase tracking-wide">Title</div>
                    <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Qty</div>
                    <div className="col-span-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Unit Price (excl.)</div>
                    <div className="col-span-1" />
                  </div>

                  <div className="space-y-2">
                    {lines.map((line, i) => (
                      <div key={i} className="grid grid-cols-12 gap-3 items-center p-2 rounded-lg hover:bg-gray-50 transition-colors group">
                        <div className="col-span-6">
                          <SearchableSelect
                            options={titleOptions}
                            value={line.titleId}
                            selectedLabel={line.titleLabel || undefined}
                            onChange={v => selectLineTitle(i, v)}
                            onSearchChange={setTitleSearch}
                            placeholder={partnerId ? 'Search title…' : 'Select partner first'}
                            disabled={!partnerId}
                          />
                          {line.rrp > 0 && (
                            <p className="text-[11px] text-gray-400 mt-0.5 pl-1">
                              RRP {fmt(line.rrp)} · {discountPct}% → {fmt(line.rrp * (1 - discountPct / 100))}
                            </p>
                          )}
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                          />
                        </div>
                        <div className="col-span-3">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R</span>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.unitPrice || ''}
                              onChange={e => updateLine(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                            />
                          </div>
                          {line.unitPrice > 0 && line.quantity > 0 && (
                            <p className="text-[11px] text-gray-400 mt-0.5 pl-1">
                              Line total: {fmt(line.quantity * line.unitPrice)}
                            </p>
                          )}
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              className="text-gray-200 group-hover:text-gray-400 hover:!text-red-500 transition-colors text-xl leading-none"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Section 3: Notes */}
              <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#8B1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                  <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Partner Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
                      rows={3}
                      placeholder="Shown on packing lists and delivery notes sent to the partner…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Internal Notes
                      <span className="ml-1.5 font-normal text-gray-400 normal-case tracking-normal">(staff only)</span>
                    </label>
                    <textarea
                      value={internalNotes}
                      onChange={e => { setInternalNotes(e.target.value); setIsDirty(true); }}
                      rows={3}
                      placeholder="Visible to Xarra staff only…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] bg-amber-50 border-amber-200 placeholder:text-amber-400"
                    />
                  </div>
                </div>
              </section>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                  <span className="text-red-400 shrink-0">⚠</span> {error}
                </div>
              )}
            </div>

            {/* ── Right column: sticky summary ── */}
            <div className="w-72 shrink-0 sticky top-6 space-y-4">

              {/* Order summary card */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Order Summary</h3>
                </div>
                <div className="p-5 space-y-3">
                  <div className="text-xs space-y-0.5">
                    <span className="text-gray-400">Partner</span>
                    <p className="font-semibold text-gray-900 text-sm">
                      {selectedPartner?.name ?? <span className="text-gray-400 font-normal italic">Not selected</span>}
                    </p>
                    {selectedBranch && <p className="text-gray-500">{selectedBranch.name}</p>}
                  </div>

                  <div className="text-xs space-y-0.5">
                    <span className="text-gray-400">Source</span>
                    <p className="font-medium text-gray-800">
                      {SOURCE_OPTIONS.find(s => s.value === source)?.label}
                      {partnerPoNumber && <span className="text-gray-500"> · PO: {partnerPoNumber}</span>}
                    </p>
                  </div>

                  <div className="text-xs space-y-0.5">
                    <span className="text-gray-400">Lines</span>
                    <p className="font-medium text-gray-800">
                      {lines.filter(l => l.titleId).length} title{lines.filter(l => l.titleId).length !== 1 ? 's' : ''} · {totalItems} unit{totalItems !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal (excl. VAT)</span>
                      <span className="font-medium text-gray-700">{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>VAT (15%)</span>
                      <span className="font-medium text-gray-700">{fmt(vat)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-gray-900 pt-1.5 border-t border-gray-100">
                      <span>Total</span>
                      <span>{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email toggle + recipient */}
              <div className={`rounded-xl border p-4 transition-colors ${sendIntakeEmail ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendIntakeEmail}
                    onChange={e => setSendIntakeEmail(e.target.checked)}
                    className="mt-0.5 accent-[#8B1A1A] w-4 h-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Send confirmation email</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Notify the partner that their order has been logged
                    </p>
                  </div>
                </label>

                {sendIntakeEmail && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Recipient email
                    </label>
                    <input
                      type="email"
                      value={notifyEmail}
                      onChange={e => setNotifyEmail(e.target.value)}
                      placeholder={selectedPartner?.contactEmail ?? 'partner@example.com'}
                      className="w-full border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 placeholder:text-gray-400"
                    />
                    {!notifyEmail && !selectedPartner?.contactEmail && (
                      <p className="text-xs text-amber-600 mt-1">No email on file — enter a recipient or uncheck to skip.</p>
                    )}
                    {!notifyEmail && selectedPartner?.contactEmail && (
                      <p className="text-xs text-blue-500 mt-1">Will use {selectedPartner.contactEmail}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {/* Preview button */}
                <button
                  type="button"
                  disabled={!isValid}
                  onClick={() => { if (validate()) setShowPreview(true); }}
                  className="w-full py-2.5 border-2 border-[#8B1A1A] text-[#8B1A1A] rounded-lg text-sm font-semibold hover:bg-[#8B1A1A]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Preview Order
                </button>

                {/* Submit (also shows preview first) */}
                <button
                  type="submit"
                  disabled={mutation.isPending || !isValid}
                  className="w-full py-2.5 bg-[#8B1A1A] text-white rounded-lg text-sm font-semibold hover:bg-[#7a1717] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Capture Order
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/orders')}
                  className="w-full py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {!isValid && (
                <p className="text-xs text-gray-400 text-center">
                  {!partnerId ? 'Select a partner to continue' : 'All lines need a title selected'}
                </p>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Quick Create Partner Modal */}
      {showQuickCreate && (
        <QuickPartnerCreate
          onClose={() => setShowQuickCreate(false)}
          onCreated={created => {
            setPartnerId(created.id);
            setBranchId('');
            setIsDirty(true);
          }}
        />
      )}

      {/* Order Preview Modal */}
      {showPreview && (
        <OrderPreviewModal
          partner={selectedPartner}
          branch={selectedBranch}
          source={source}
          partnerPoNumber={partnerPoNumber}
          expectedDeliveryDate={expectedDeliveryDate}
          deliveryAddress={deliveryAddress}
          notes={notes}
          lines={lines}
          onClose={() => setShowPreview(false)}
          onConfirm={() => {
            setShowPreview(false);
            setShowStockCheck(true);
          }}
          isPending={mutation.isPending}
        />
      )}

      {/* Stock Check Modal */}
      {showStockCheck && (
        <StockCheckModal
          lines={lines.filter(l => l.titleId).map(l => ({
            titleId: l.titleId,
            titleLabel: l.titleLabel,
            quantity: l.quantity,
          }))}
          onProceed={() => {
            setShowStockCheck(false);
            doSubmit();
          }}
          onCancel={() => {
            setShowStockCheck(false);
            setShowPreview(true);
          }}
        />
      )}
    </UnsavedChangesGuard>
  );
}

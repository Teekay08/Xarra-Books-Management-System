import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';
import { SearchableSelect } from '../../components/SearchableSelect';
import { VAT_RATE, roundAmount } from '@xarra/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Partner {
  id: string; name: string; discountPct: string; paymentTermsDays: number | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null;
  province: string | null; postalCode: string | null; vatNumber: string | null;
}
interface Title { id: string; title: string; rrpZar: string; isbn13: string | null }
interface ConsignmentOption {
  id: string; proformaNumber: string | null; status: string;
  partnerPoNumber: string | null; dispatchDate: string | null;
  lines: { titleId: string; qtyDispatched: number; unitRrp: string; discountPct: string; title?: { title: string; isbn13: string | null } | null }[];
}

interface LineItem {
  _id:         string;   // stable key for React
  titleId:     string;
  description: string;
  quantity:    number;
  unitPrice:   number;
  discountPct: number;   // explicit — empty string means "not set, use partner default"
  discountExplicit: boolean; // true = user deliberately typed this value
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(date: string, days: number) {
  const d = new Date(date); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtR(n: number) {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function lineTotal(l: LineItem) {
  return roundAmount(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
}

const TERMS = [
  { label: 'Due on receipt', days: 0 },
  { label: 'Net 7',  days: 7 },
  { label: 'Net 14', days: 14 },
  { label: 'Net 30', days: 30 },
  { label: 'Net 60', days: 60 },
  { label: 'Custom', days: -1 },
];

function emptyLine(partnerDiscount = 0): LineItem {
  return { _id: uid(), titleId: '', description: '', quantity: 1, unitPrice: 0, discountPct: partnerDiscount, discountExplicit: false };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{children}</p>
  );
}

function PartnerCard({ partner, onEdit }: { partner: Partner; onEdit: () => void }) {
  const addr = [partner.addressLine1, partner.addressLine2, partner.city, partner.province, partner.postalCode].filter(Boolean).join(', ');
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 relative">
      <div className="font-semibold text-sm text-gray-900">{partner.name}</div>
      {partner.contactName  && <div className="text-xs text-gray-600 mt-0.5">{partner.contactName}</div>}
      {partner.contactEmail && <div className="text-xs text-gray-500">{partner.contactEmail}</div>}
      {partner.contactPhone && <div className="text-xs text-gray-500">{partner.contactPhone}</div>}
      {addr && <div className="text-xs text-gray-500 mt-1">{addr}</div>}
      {partner.vatNumber && <div className="text-[10px] text-gray-400 mt-1">VAT: {partner.vatNumber}</div>}
      <button type="button" onClick={onEdit}
        className="absolute top-3 right-3 text-[10px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 transition-colors">
        Edit
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoiceCreate() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit         = !!editId;
  const qc             = useQueryClient();

  // ── Form state ──────────────────────────────────────────────────
  const [loaded, setLoaded]             = useState(!isEdit); // skip guard until data loaded
  const [isDirty, setIsDirty]           = useState(false);
  const [error, setError]               = useState('');
  const [partnerId, setPartnerId]       = useState(searchParams.get('partnerId') ?? '');
  const [invoiceDate, setInvoiceDate]   = useState(today());
  const [termsDays, setTermsDays]       = useState(30);
  const [customDue, setCustomDue]       = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [poNumber, setPoNumber]         = useState('');
  const [custRef, setCustRef]           = useState('');
  const [notes, setNotes]               = useState('');
  const [consignmentId, setConsignmentId] = useState(searchParams.get('consignmentId') ?? '');
  const [lines, setLines]               = useState<LineItem[]>([emptyLine()]);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showPartnerCreate, setShowPartnerCreate]   = useState(false);

  const partnerOrderId = searchParams.get('partnerOrderId');

  // ── Fetch existing invoice when editing ──────────────────────────
  const { data: editData } = useQuery({
    queryKey: ['invoice-edit', editId],
    queryFn: () => api<{ data: any }>(`/finance/invoices/${editId}`),
    enabled: isEdit,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!isEdit || !editData?.data) return;
    const inv = editData.data;
    setPartnerId(inv.partnerId ?? inv.partner?.id ?? '');
    setInvoiceDate(inv.invoiceDate?.split('T')[0] ?? today());
    setTermsDays(-1);
    setCustomDue(inv.dueDate?.split('T')[0] ?? '');
    setTaxInclusive(inv.taxInclusive ?? false);
    setPoNumber(inv.purchaseOrderNumber ?? '');
    setCustRef(inv.customerReference ?? '');
    setNotes(inv.notes ?? '');
    setConsignmentId(inv.consignmentId ?? '');
    if (inv.lines?.length) {
      setLines(inv.lines.map((l: any) => ({
        _id: uid(),
        titleId:     l.titleId ?? '',
        description: l.description ?? '',
        quantity:    Number(l.quantity),
        unitPrice:   Number(l.unitPrice),
        discountPct: Number(l.discountPct),
        discountExplicit: true,
      })));
    }
    setLoaded(true);
  }, [editData]);

  // ── Data fetching ────────────────────────────────────────────────
  const { data: partnersData } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
  });
  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=500'),
  });
  const { data: nextNumData } = useQuery({
    queryKey: ['next-number', 'invoice'],
    queryFn: () => api<{ data: { number: string } }>('/finance/next-number/invoice'),
  });
  const { data: consignmentsData } = useQuery({
    queryKey: ['partner-consignments', partnerId],
    queryFn: () => api<{ data: ConsignmentOption[] }>(`/consignments?partnerId=${partnerId}&limit=100`),
    enabled: !!partnerId,
  });

  const allPartners    = partnersData?.data ?? [];
  const allTitles      = titlesData?.data ?? [];
  const selectedPartner = allPartners.find(p => p.id === partnerId) ?? null;
  const partnerDiscount = selectedPartner ? Number(selectedPartner.discountPct) : 0;

  const consignmentOptions = (consignmentsData?.data ?? []).filter(c =>
    ['DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN'].includes(c.status),
  );

  // ── Derived values ────────────────────────────────────────────────
  const dueDate = termsDays === -1 ? customDue : addDays(invoiceDate, termsDays);

  const lineGross = lines.reduce((s, l) => s + lineTotal(l), 0);
  const subtotal  = roundAmount(taxInclusive ? lineGross / (1 + VAT_RATE) : lineGross);
  const vat       = roundAmount(taxInclusive ? lineGross - subtotal : lineGross * VAT_RATE);
  const total     = roundAmount(subtotal + vat);

  // ── Partner change ────────────────────────────────────────────────
  function handlePartnerChange(pid: string) {
    const p = allPartners.find(x => x.id === pid);
    setPartnerId(pid);
    setConsignmentId('');
    setIsDirty(true);
    if (p?.paymentTermsDays) {
      const preset = TERMS.find(t => t.days === p.paymentTermsDays);
      setTermsDays(preset ? preset.days : -1);
      if (!preset) setCustomDue(addDays(invoiceDate, p.paymentTermsDays));
    }
    // Reset lines with new partner discount but keep any user-typed explicit values
    setLines(prev => prev.map(l => ({
      ...l,
      discountPct: l.discountExplicit ? l.discountPct : Number(p?.discountPct ?? 0),
    })));
  }

  // ── Consignment auto-fill ─────────────────────────────────────────
  function applyConsignment(cid: string) {
    setConsignmentId(cid);
    setIsDirty(true);
    if (!cid) return;
    const c = consignmentOptions.find(x => x.id === cid);
    if (!c) return;
    if (c.partnerPoNumber) setPoNumber(c.partnerPoNumber);
    if (c.lines?.length) {
      setLines(c.lines.map(l => {
        const disc = Number(l.discountPct) || partnerDiscount;
        return {
          _id: uid(), titleId: l.titleId,
          description: l.title?.title ?? '',
          quantity: l.qtyDispatched,
          unitPrice: roundAmount(Number(l.unitRrp) * (1 - disc / 100)),
          discountPct: disc, discountExplicit: !!l.discountPct,
        };
      }));
    }
  }

  // Auto-apply consignment from URL once options load
  useEffect(() => {
    const urlC = searchParams.get('consignmentId');
    if (urlC && consignmentOptions.find(c => c.id === urlC)) applyConsignment(urlC);
  }, [consignmentOptions.length]);

  // Auto-fill from partner order
  useEffect(() => {
    if (!partnerOrderId || consignmentId) return;
    api<{ data: { lines: any[] } }>(`/partner-admin/orders/${partnerOrderId}`)
      .then(res => {
        const ol = res.data.lines;
        if (ol?.length) {
          setLines(ol.map((l: any) => ({
            _id: uid(), titleId: l.titleId,
            description: l.title?.title ?? '',
            quantity: l.quantity,
            unitPrice: Number(l.unitPrice),
            discountPct: 0, discountExplicit: false,
          })));
        }
      }).catch(() => {});
  }, [partnerOrderId]);

  // ── Line item operations ──────────────────────────────────────────
  function addLine() {
    setLines(prev => [...prev, emptyLine(partnerDiscount)]);
    setIsDirty(true);
  }

  function removeLine(id: string) {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter(l => l._id !== id));
    setIsDirty(true);
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines(prev => prev.map(l => {
      if (l._id !== id) return l;
      const updated = { ...l, ...patch };
      // When title changes, auto-fill price and description
      if (patch.titleId !== undefined) {
        const t = allTitles.find(x => x.id === patch.titleId);
        if (t) {
          updated.description = t.title;
          updated.unitPrice   = Number(t.rrpZar);
          if (!l.discountExplicit) updated.discountPct = partnerDiscount;
        }
      }
      // Track whether discount was explicitly typed
      if (patch.discountPct !== undefined) updated.discountExplicit = true;
      return updated;
    }));
    setIsDirty(true);
  }

  // ── Submit ────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? api<{ data: { id: string } }>(`/finance/invoices/${editId}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
          })
        : api<{ data: { id: string } }>('/finance/invoices', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': uid() },
          }),
    onSuccess: async res => {
      if (!isEdit && partnerOrderId && res.data?.id) {
        await api(`/partner-admin/orders/${partnerOrderId}/link`, {
          method: 'PATCH', body: JSON.stringify({ invoiceId: res.data.id }),
        }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', editId] });
      qc.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      setIsDirty(false);
      navigate(isEdit ? `/invoices/${editId}` : '/invoices');
    },
    onError: (e: Error) => setError(e.message || (isEdit ? 'Failed to save changes' : 'Failed to create invoice')),
  });

  function validate() {
    if (!partnerId)   return 'Select a partner';
    if (!invoiceDate) return 'Invoice date is required';
    if (termsDays === -1 && !customDue) return 'Enter a due date or select a payment term';
    if (lines.some(l => !l.titleId))    return 'Each line item needs a title';
    if (lines.some(l => l.quantity <= 0)) return 'Quantity must be at least 1';
    if (lines.some(l => l.unitPrice <= 0)) return 'Unit price must be greater than 0';
    return null;
  }

  function submit() {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }

    const paymentTermsText = termsDays === -1
      ? `Due by ${fmtDate(customDue)}`
      : termsDays === 0 ? 'Due on receipt' : `Net ${termsDays} days`;

    mutation.mutate({
      partnerId, invoiceDate, taxInclusive,
      ...(consignmentId ? { consignmentId } : {}),
      lines: lines.map(l => ({
        titleId: l.titleId, description: l.description,
        quantity: l.quantity, unitPrice: l.unitPrice,
        discountPct: l.discountPct,
      })),
      purchaseOrderNumber: poNumber || undefined,
      customerReference:  custRef || undefined,
      paymentTermsText, notes: notes || undefined,
      ...(partnerOrderId ? { partnerOrderId } : {}),
    });
  }

  const nextNumber  = nextNumData?.data?.number ?? '—';
  const partnerOpts = allPartners.map(p => ({ value: p.id, label: p.name, subtitle: `${Number(p.discountPct)}% discount` }));
  const titleOpts   = allTitles.map(t => ({ value: t.id, label: t.title, subtitle: t.isbn13 ?? undefined }));

  if (isEdit && !loaded) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm text-gray-400">Loading invoice…</div>
    </div>
  );

  return (
    <div className="max-w-[900px]">
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
          {isEdit
            ? <p className="text-xs text-gray-400 mt-0.5">Only DRAFT invoices can be edited</p>
            : <p className="text-xs text-gray-400 mt-0.5">Number will be assigned: <span className="font-mono font-semibold text-gray-600">{nextNumber}</span></p>
          }
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(isEdit ? `/invoices/${editId}` : '/invoices')}
            className="px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          {!isEdit && (
            <button type="button" onClick={submit} disabled={mutation.isPending}
              className="px-3.5 py-2 rounded-lg border border-xarra-red text-xarra-red text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
              Save as Draft
            </button>
          )}
          <button type="button" onClick={submit} disabled={mutation.isPending}
            className="px-4 py-2 rounded-lg bg-xarra-red text-white text-xs font-semibold hover:bg-xarra-red-dark shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending
              ? <><span className="animate-spin text-sm">⏳</span> {isEdit ? 'Saving…' : 'Creating…'}</>
              : <>{isEdit ? 'Save Changes' : 'Create Invoice'} <span className="opacity-70">→</span></>}
          </button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────── */}
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      <div className="space-y-5">

        {/* ── BILL TO + INVOICE DETAILS ──────────────────────────── */}
        <div className="card p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bill To */}
            <div>
              <SectionLabel>Bill to</SectionLabel>
              {!partnerId ? (
                <div className="space-y-2">
                  <SearchableSelect
                    options={partnerOpts}
                    value={partnerId}
                    onChange={handlePartnerChange}
                    placeholder="Search or select partner…"
                    required
                    onCreateNew={() => setShowPartnerCreate(true)}
                    createNewLabel="+ Create new partner"
                  />
                  <p className="text-[10px] text-gray-400">Select the retail partner or client you're invoicing</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <SearchableSelect
                    options={partnerOpts}
                    value={partnerId}
                    onChange={handlePartnerChange}
                    placeholder="Search or select partner…"
                    required
                    onCreateNew={() => setShowPartnerCreate(true)}
                    createNewLabel="+ Create new partner"
                  />
                  {selectedPartner && (
                    <PartnerCard partner={selectedPartner} onEdit={() => setShowRecipientModal(true)} />
                  )}
                </div>
              )}
            </div>

            {/* Invoice Details */}
            <div className="space-y-4">
              <SectionLabel>Invoice details</SectionLabel>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Invoice Date *</label>
                  <input type="date" value={invoiceDate}
                    onChange={e => { setInvoiceDate(e.target.value); setIsDirty(true); }}
                    className="input" />
                </div>
                <div>
                  <label className="form-label">Due Date</label>
                  {termsDays === -1 ? (
                    <input type="date" value={customDue}
                      onChange={e => { setCustomDue(e.target.value); setIsDirty(true); }}
                      min={invoiceDate} className="input" />
                  ) : (
                    <div className="input bg-gray-50 text-gray-500 cursor-default select-none">
                      {dueDate ? fmtDate(dueDate) : '—'}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment terms chips */}
              <div>
                <label className="form-label">Payment Terms</label>
                <div className="flex flex-wrap gap-1.5">
                  {TERMS.map(t => (
                    <button key={t.days} type="button"
                      onClick={() => { setTermsDays(t.days); if (t.days === -1) setCustomDue(addDays(invoiceDate, 30)); setIsDirty(true); }}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                        termsDays === t.days
                          ? 'bg-xarra-red text-white border-xarra-red shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">PO Number</label>
                  <input value={poNumber} onChange={e => { setPoNumber(e.target.value); setIsDirty(true); }}
                    placeholder="e.g. PO-12345" className="input" />
                </div>
                <div>
                  <label className="form-label">Customer Ref</label>
                  <input value={custRef} onChange={e => { setCustRef(e.target.value); setIsDirty(true); }}
                    placeholder="e.g. Order #ABC" className="input" />
                </div>
              </div>

              {/* VAT toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <button type="button" role="switch" aria-checked={taxInclusive}
                  onClick={() => { setTaxInclusive(v => !v); setIsDirty(true); }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${taxInclusive ? 'bg-xarra-red' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${taxInclusive ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">
                  Prices include VAT ({(VAT_RATE * 100).toFixed(0)}%)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Consignment link (optional) ────────────────────────── */}
        {partnerId && consignmentOptions.length > 0 && (
          <div className="card border-teal-200 bg-teal-50/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-teal-800 mb-1.5">Link to SOR Consignment <span className="font-normal text-teal-600">(optional — auto-fills items and PO number)</span></p>
                <select value={consignmentId} onChange={e => applyConsignment(e.target.value)}
                  className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400">
                  <option value="">— Select a consignment to link —</option>
                  {consignmentOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.proformaNumber ?? c.id.slice(0, 8)} · {c.status}
                      {c.partnerPoNumber ? ` · PO: ${c.partnerPoNumber}` : ''}
                      {c.dispatchDate ? ` · ${fmtDate(c.dispatchDate)}` : ''}
                      {` · ${c.lines?.length ?? 0} item${c.lines?.length !== 1 ? 's' : ''}`}
                    </option>
                  ))}
                </select>
              </div>
              {consignmentId && (
                <button type="button" onClick={() => applyConsignment('')}
                  className="text-teal-500 hover:text-teal-700 text-xs mt-1">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Line Items ─────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <SectionLabel>Items</SectionLabel>
          </div>

          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <span>Title / Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Discount</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {/* Lines */}
          <div className="divide-y divide-gray-50">
            {lines.map((line, idx) => {
              const total = lineTotal(line);
              const selectedTitle = allTitles.find(t => t.id === line.titleId);
              return (
                <div key={line._id} className="px-6 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 gap-y-2 items-start">

                    {/* Title + description */}
                    <div>
                      <SearchableSelect
                        options={titleOpts}
                        value={line.titleId}
                        onChange={val => updateLine(line._id, { titleId: val })}
                        placeholder="Search titles…"
                      />
                      {line.titleId && (
                        <input
                          value={line.description}
                          onChange={e => updateLine(line._id, { description: e.target.value })}
                          placeholder="Add a description (optional)"
                          className="mt-1.5 w-full border-0 border-b border-gray-200 bg-transparent px-0 py-1 text-xs text-gray-500 placeholder:text-gray-300 focus:outline-none focus:border-gray-400"
                        />
                      )}
                      {!line.titleId && idx === 0 && (
                        <p className="mt-1 text-[10px] text-gray-400">Select a title from your catalog</p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="form-label sm:hidden">Qty</label>
                      <input type="number" min={1} step={1}
                        value={line.quantity}
                        onChange={e => updateLine(line._id, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="input text-right font-mono" />
                    </div>

                    {/* Unit price */}
                    <div>
                      <label className="form-label sm:hidden">Unit Price</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R</span>
                        <input type="number" min={0} step={0.01}
                          value={line.unitPrice}
                          onChange={e => updateLine(line._id, { unitPrice: Number(e.target.value) })}
                          className="input pl-6 text-right font-mono" />
                      </div>
                    </div>

                    {/* Discount */}
                    <div>
                      <label className="form-label sm:hidden">Discount %</label>
                      <div className="relative">
                        <input type="number" min={0} max={100} step={0.5}
                          value={line.discountPct}
                          onChange={e => updateLine(line._id, { discountPct: Number(e.target.value) })}
                          className="input text-right pr-6 font-mono" />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                      </div>
                      {line.discountPct > 0 && selectedTitle && (
                        <p className="text-[9px] text-gray-400 mt-0.5 text-right">
                          RRP: R{Number(selectedTitle.rrpZar).toFixed(2)}
                        </p>
                      )}
                    </div>

                    {/* Line total */}
                    <div className="flex flex-col items-end justify-center">
                      <label className="form-label sm:hidden">Amount</label>
                      <span className="font-mono font-semibold text-sm text-gray-900">
                        {fmtR(total)}
                      </span>
                      {line.discountPct > 0 && (
                        <span className="text-[10px] text-green-600 mt-0.5">
                          -{fmtR(line.quantity * line.unitPrice * (line.discountPct / 100))} saved
                        </span>
                      )}
                    </div>

                    {/* Remove */}
                    <div className="flex items-center justify-end sm:justify-center mt-1">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(line._id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                          title="Remove line">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add line */}
          <div className="px-6 py-3 border-t border-gray-50">
            <button type="button" onClick={addLine}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add line item
            </button>
          </div>
        </div>

        {/* ── Memo + Totals ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Memo / Notes */}
          <div>
            <label className="form-label">Memo to Customer</label>
            <textarea rows={4}
              value={notes}
              onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
              placeholder="Payment instructions, thank-you note, or any additional info visible to the customer…"
              className="textarea resize-none" />
            <p className="text-[10px] text-gray-400 mt-1">This appears on the invoice PDF sent to your customer.</p>
          </div>

          {/* Totals panel */}
          <div className="flex flex-col justify-end">
            <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="px-5 py-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal (excl. VAT)</span>
                  <span className="font-mono font-medium text-gray-800">{fmtR(subtotal)}</span>
                </div>
                {lines.some(l => l.discountPct > 0) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Discounts applied</span>
                    <span className="font-mono text-green-600">
                      -{fmtR(lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.discountPct / 100), 0))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">VAT ({(VAT_RATE * 100).toFixed(0)}%){taxInclusive ? ' (included)' : ''}</span>
                  <span className="font-mono font-medium text-gray-800">{fmtR(vat)}</span>
                </div>
              </div>
              <div className="px-5 py-4 bg-white border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-black font-mono text-gray-900">{fmtR(total)}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 text-right">South African Rand</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom action bar ─────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white/95 backdrop-blur border-t border-gray-100 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate(isEdit ? `/invoices/${editId}` : '/invoices')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ← Cancel
          </button>
          <div className="flex gap-2">
            {!isEdit && (
              <button type="button" onClick={submit} disabled={mutation.isPending}
                className="px-4 py-2 rounded-lg border border-xarra-red text-xarra-red text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                Save as Draft
              </button>
            )}
            <button type="button" onClick={submit} disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg bg-xarra-red text-white text-sm font-semibold hover:bg-xarra-red-dark shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {mutation.isPending ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> {isEdit ? 'Saving…' : 'Creating…'}</>
              ) : <>{isEdit ? 'Save Changes →' : 'Create Invoice →'}</>}
            </button>
          </div>
        </div>

      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
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
          onSaved={() => qc.invalidateQueries({ queryKey: ['partners-select'] })}
        />
      )}
      {showPartnerCreate && (
        <QuickPartnerCreate
          onClose={() => setShowPartnerCreate(false)}
          onCreated={p => { setPartnerId(p.id); setIsDirty(true); setShowPartnerCreate(false); }}
        />
      )}
    </div>
  );
}

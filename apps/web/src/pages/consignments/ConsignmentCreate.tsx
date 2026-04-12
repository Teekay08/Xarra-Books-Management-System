import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

interface Partner { id: string; name: string; discountPct: string }
interface Title { id: string; title: string; isbn13: string | null }

interface LineInput { titleId: string; qtyDispatched: number }

export function ConsignmentCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [partnerId, setPartnerId] = useState(searchParams.get('partnerId') ?? '');
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);
  const [lines, setLines] = useState<LineInput[]>([{ titleId: '', qtyDispatched: 1 }]);
  const partnerOrderId = searchParams.get('partnerOrderId');

  // Pre-fill lines from partner order if coming from partner order workflow
  useEffect(() => {
    if (!partnerOrderId) return;
    api<{ data: { lines: { titleId: string; quantity: number }[] } }>(`/partner-admin/orders/${partnerOrderId}`)
      .then((res) => {
        const orderLines = res.data.lines;
        if (orderLines?.length) {
          setLines(orderLines.map((l) => ({ titleId: l.titleId, qtyDispatched: l.quantity })));
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

  const partnerOptions = (partners?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const titleOptions = (titlesData?.data ?? []).map((t) => ({
    value: t.id,
    label: t.title,
    subtitle: t.isbn13 ?? undefined,
  }));

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: { id: string } }>('/consignments', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async (result) => {
      setIsDirty(false);
      // Auto-link consignment to partner order if created from partner order workflow
      if (partnerOrderId && result.data?.id) {
        try {
          await api(`/partner-admin/orders/${partnerOrderId}/link`, {
            method: 'PATCH',
            body: JSON.stringify({ consignmentId: result.data.id }),
          });
        } catch { /* best effort — user can link manually */ }
      }
      queryClient.invalidateQueries({ queryKey: ['consignments'] });
      queryClient.invalidateQueries({ queryKey: ['partner-admin-orders'] });
      navigate('/consignments');
    },
  });

  function addLine() {
    setLines([...lines, { titleId: '', qtyDispatched: 1 }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    if (lines.some((l) => !l.titleId || l.qtyDispatched <= 0)) {
      setError('All lines must have a title and quantity');
      return;
    }

    mutation.mutate({
      partnerId,
      partnerPoNumber: fd.get('partnerPoNumber') || undefined,
      dispatchDate: fd.get('dispatchDate') || undefined,
      courierCompany: fd.get('courierCompany') || undefined,
      courierWaybill: fd.get('courierWaybill') || undefined,
      notes: fd.get('notes') || undefined,
      lines,
      ...(partnerOrderId ? { partnerOrderId } : {}),
    }, { onError: (err) => setError(err.message) });
  }

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="New Sales Purchase Order" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-3xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date</label>
            <input name="dispatchDate" type="date" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner PO Number</label>
            <input name="partnerPoNumber" defaultValue={searchParams.get('poNumber') ?? ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="Partner's purchase order reference" />
          </div>
          <div />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Courier</label>
            <input name="courierCompany" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="e.g., The Courier Guy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Waybill #</label>
            <input name="courierWaybill" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>
        </div>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Titles to Include</legend>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-8">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Title</label>}
                  <SearchableSelect
                    options={titleOptions}
                    value={line.titleId}
                    onChange={(v) => {
                      const updated = [...lines];
                      updated[i].titleId = v;
                      setLines(updated);
                    }}
                    placeholder="Search titles..."
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                  <input
                    type="number"
                    min={1}
                    value={line.qtyDispatched}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[i].qtyDispatched = Number(e.target.value);
                      setLines(updated);
                    }}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-sm">
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-sm text-green-700 hover:text-green-800">
              + Add Title
            </button>
          </div>
        </fieldset>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Sales PO'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
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

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

interface Partner { id: string; name: string }
interface Title { id: string; title: string; isbn13: string | null }
interface Consignment { id: string; dispatchDate: string; status: string }

interface LineInput {
  titleId: string;
  quantity: number;
  condition: 'GOOD' | 'DAMAGED' | 'UNSALEABLE';
  notes: string;
}

export function ReturnsCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [lines, setLines] = useState<LineInput[]>([
    { titleId: '', quantity: 1, condition: 'GOOD', notes: '' },
  ]);
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);
  const [consignmentId, setConsignmentId] = useState('');

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
  });

  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=500'),
  });

  const { data: consignments } = useQuery({
    queryKey: ['consignments-partner', partnerId],
    queryFn: () => api<PaginatedResponse<Consignment>>(`/consignments?partnerId=${partnerId}&limit=50`),
    enabled: !!partnerId,
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/returns', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      navigate('/returns');
    },
  });

  function addLine() {
    setLines([...lines, { titleId: '', quantity: 1, condition: 'GOOD', notes: '' }]);
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
    if (!partnerId) { setError('Select a partner'); return; }

    mutation.mutate({
      partnerId,
      consignmentId: consignmentId || undefined,
      returnDate: fd.get('returnDate'),
      reason: fd.get('reason'),
      lines: lines.filter((l) => l.titleId),
      notes: fd.get('notes') || undefined,
    }, { onError: (err) => setError(err.message) });
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  const today = new Date().toISOString().split('T')[0];

  const partnerOptions = (partners?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const titleOptions = (titlesData?.data ?? []).map((t) => ({
    value: t.id,
    label: t.title,
    subtitle: t.isbn13 ?? undefined,
  }));

  const consignmentOptions = (consignments?.data ?? []).map((c) => ({
    value: c.id,
    label: `${new Date(c.dispatchDate).toLocaleDateString('en-ZA')} — ${c.status}`,
  }));

  function handlePartnerChange(id: string) {
    setPartnerId(id);
    setConsignmentId('');
  }

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="Create Return Authorization" subtitle="Record books returned by a partner" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner *</label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
            <input name="returnDate" type="date" required defaultValue={today} className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Consignment (optional)</label>
            <SearchableSelect
              options={consignmentOptions}
              value={consignmentId}
              onChange={setConsignmentId}
              placeholder="Select consignment..."
              disabled={!partnerId}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
          <input name="reason" required className={cls} placeholder="e.g. SOR expiry, damaged stock, overstock..." />
        </div>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Return Lines</legend>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Title</label>}
                  <SearchableSelect
                    options={titleOptions}
                    value={line.titleId}
                    onChange={(v) => updateLine(i, 'titleId', v)}
                    placeholder="Search titles..."
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-3">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Condition</label>}
                  <select value={line.condition} onChange={(e) => updateLine(i, 'condition', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="GOOD">Good</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="UNSALEABLE">Unsaleable</option>
                  </select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Notes</label>}
                  <input type="text" value={line.notes} onChange={(e) => updateLine(i, 'notes', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Optional" />
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-sm text-green-700 hover:text-green-800">+ Add Line</button>
          </div>
        </fieldset>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={2} className={cls} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Return'}
          </button>
          <button type="button" onClick={() => navigate('/returns')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
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

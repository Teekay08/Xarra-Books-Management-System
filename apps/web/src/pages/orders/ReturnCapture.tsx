import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';

interface Partner { id: string; name: string }
interface Consignment { id: string; number: string; partnerName?: string }
interface Title { id: string; title: string; isbn13: string | null }

interface LineInput {
  titleId: string;
  titleName: string;
  quantity: number;
  condition: 'GOOD' | 'DAMAGED' | 'UNSALEABLE';
  notes: string;
}

export function ReturnCapture() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');

  const [partnerId, setPartnerId] = useState('');
  const [consignmentId, setConsignmentId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineInput[]>([{ titleId: '', titleName: '', quantity: 1, condition: 'GOOD', notes: '' }]);
  const [titleSearch, setTitleSearch] = useState('');

  const { data: partnersData } = useQuery({
    queryKey: ['partners-list'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=200'),
  });

  const { data: consignmentsData } = useQuery({
    queryKey: ['partner-consignments', partnerId],
    queryFn: () => api<PaginatedResponse<Consignment>>(`/consignments?partnerId=${partnerId}&limit=50`),
    enabled: !!partnerId,
  });

  const { data: titlesData } = useQuery({
    queryKey: ['titles-search', titleSearch],
    queryFn: () => api<PaginatedResponse<Title>>(`/titles?limit=20&search=${encodeURIComponent(titleSearch)}`),
    enabled: titleSearch.length > 1,
  });

  const addLine = useCallback(() => {
    setLines(prev => [...prev, { titleId: '', titleName: '', quantity: 1, condition: 'GOOD', notes: '' }]);
    setIsDirty(true);
  }, []);

  const removeLine = useCallback((i: number) => {
    setLines(prev => prev.filter((_, idx) => idx !== i));
    setIsDirty(true);
  }, []);

  const updateLine = useCallback((i: number, updates: Partial<LineInput>) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...updates } : l));
    setIsDirty(true);
  }, []);

  const mutation = useMutation({
    mutationFn: (payload: object) => api('/returns', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['returns-list'] });
      setIsDirty(false);
      navigate(`/orders/returns/${res.data?.id}`);
    },
    onError: (err: any) => setError(err.message ?? 'Failed to capture return'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId) { setError('Please select a partner'); return; }
    if (!reason.trim()) { setError('Return reason is required'); return; }
    if (lines.some(l => !l.titleId)) { setError('All lines must have a title selected'); return; }
    setError('');

    mutation.mutate({
      partnerId,
      consignmentId: consignmentId || undefined,
      returnDate: new Date().toISOString(),
      reason,
      notes: notes || undefined,
      lines: lines.map(l => ({
        titleId: l.titleId,
        quantity: l.quantity,
        condition: l.condition,
        notes: l.notes || undefined,
      })),
    });
  };

  const partners = partnersData?.data ?? [];
  const consignments = consignmentsData?.data ?? [];

  return (
    <UnsavedChangesGuard hasUnsavedChanges={isDirty}>
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="Capture Return"
          subtitle="Log a return request on behalf of a partner"
          backTo={{ href: '/orders/returns', label: 'Returns' }}
        />

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <strong>Staff capture form.</strong> Use this when a partner calls or emails with a return request.
          The partner will receive a notification once the return is logged.
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Partner + consignment */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Return Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Partner <span className="text-red-500">*</span></label>
                <select
                  value={partnerId}
                  onChange={e => { setPartnerId(e.target.value); setConsignmentId(''); setIsDirty(true); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select partner...</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {consignments.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Related SOR / Consignment</label>
                  <select
                    value={consignmentId}
                    onChange={e => { setConsignmentId(e.target.value); setIsDirty(true); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {consignments.map(c => <option key={c.id} value={c.id}>{c.number}</option>)}
                  </select>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Return Reason <span className="text-red-500">*</span></label>
                <select
                  value={reason}
                  onChange={e => { setReason(e.target.value); setIsDirty(true); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select reason...</option>
                  <option value="Overstock — end of season">Overstock — end of season</option>
                  <option value="Damaged in transit">Damaged in transit</option>
                  <option value="Wrong titles delivered">Wrong titles delivered</option>
                  <option value="SOR period expired — unsold stock">SOR period expired — unsold stock</option>
                  <option value="Defective / printing error">Defective / printing error</option>
                  <option value="Customer-returned (remaindered)">Customer-returned (remaindered)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
                  rows={3}
                  placeholder="Any additional context"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Return Lines</h2>
              <button type="button" onClick={addLine} className="text-sm text-[#8B1A1A] font-medium">+ Add Line</button>
            </div>

            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-3 items-start p-3 bg-gray-50 rounded-lg">
                <div className="col-span-5">
                  <label className="text-xs text-gray-500 mb-1 block">Title</label>
                  <SearchableSelect
                    placeholder="Search title..."
                    value={line.titleId}
                    selectedLabel={line.titleName || undefined}
                    onSearchChange={setTitleSearch}
                    onChange={titleId => {
                      const t = (titlesData?.data ?? []).find(x => x.id === titleId);
                      if (t) updateLine(i, { titleId: t.id, titleName: t.title });
                    }}
                    options={(titlesData?.data ?? []).map(t => ({
                      value: t.id,
                      label: t.title,
                      subtitle: t.isbn13 ?? undefined,
                    }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Qty</label>
                  <input type="number" min={1} value={line.quantity}
                    onChange={e => updateLine(i, { quantity: parseInt(e.target.value) || 1 })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Condition</label>
                  <select value={line.condition} onChange={e => updateLine(i, { condition: e.target.value as typeof line.condition })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm">
                    <option value="GOOD">Good</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="UNSALEABLE">Unsaleable</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                  <input type="text" value={line.notes}
                    onChange={e => updateLine(i, { notes: e.target.value })}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                </div>
                <div className="col-span-1 flex items-end pb-1">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-xl">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={mutation.isPending}
              className="px-6 py-2.5 bg-[#8B1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#7a1717] disabled:opacity-50">
              {mutation.isPending ? 'Saving...' : 'Log Return'}
            </button>
            <button type="button" onClick={() => navigate('/orders/returns')}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </UnsavedChangesGuard>
  );
}

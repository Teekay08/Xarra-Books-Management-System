import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Partner { id: string; name: string; discountPct: string }
interface Title { id: string; title: string; isbn13: string | null }

interface LineInput { titleId: string; qtyDispatched: number }

export function ConsignmentCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [lines, setLines] = useState<LineInput[]>([{ titleId: '', qtyDispatched: 1 }]);

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
      api('/consignments', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignments'] });
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
      partnerId: fd.get('partnerId'),
      dispatchDate: fd.get('dispatchDate') || undefined,
      courierCompany: fd.get('courierCompany') || undefined,
      courierWaybill: fd.get('courierWaybill') || undefined,
      notes: fd.get('notes') || undefined,
      lines,
    }, { onError: (err) => setError(err.message) });
  }

  return (
    <div>
      <PageHeader title="New Consignment" />

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner *</label>
            <select name="partnerId" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500">
              <option value="">Select partner...</option>
              {partners?.data.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date</label>
            <input name="dispatchDate" type="date" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>
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
          <legend className="px-2 text-sm font-medium text-gray-600">Titles to Consign</legend>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-8">
                  {i === 0 && <label className="block text-xs text-gray-500 mb-1">Title</label>}
                  <select
                    value={line.titleId}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[i].titleId = e.target.value;
                      setLines(updated);
                    }}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select title...</option>
                    {titlesData?.data.map((t) => (
                      <option key={t.id} value={t.id}>{t.title} {t.isbn13 ? `(${t.isbn13})` : ''}</option>
                    ))}
                  </select>
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
            {mutation.isPending ? 'Creating...' : 'Create Consignment'}
          </button>
          <button type="button" onClick={() => navigate('/consignments')} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

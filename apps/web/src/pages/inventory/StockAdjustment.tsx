import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { INVENTORY_LOCATIONS } from '@xarra/shared';

interface Title {
  id: string;
  title: string;
  isbn13: string | null;
}

export function StockAdjustment({ mode = 'adjust' }: { mode?: 'adjust' | 'receive' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=100'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(mode === 'receive' ? '/inventory/receive' : '/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      navigate('/inventory');
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    if (mode === 'receive') {
      mutation.mutate({
        titleId: fd.get('titleId'),
        quantity: Number(fd.get('quantity')),
        location: fd.get('location') || 'XARRA_WAREHOUSE',
        notes: fd.get('notes') || undefined,
      }, { onError: (err) => setError(err.message) });
    } else {
      mutation.mutate({
        titleId: fd.get('titleId'),
        quantity: Number(fd.get('quantity')),
        location: fd.get('location'),
        reason: fd.get('reason'),
        notes: fd.get('notes') || undefined,
      }, { onError: (err) => setError(err.message) });
    }
  }

  const isReceive = mode === 'receive';

  return (
    <div>
      <PageHeader title={isReceive ? 'Receive Stock' : 'Stock Adjustment'} />

      <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <select
            name="titleId"
            required
            defaultValue={searchParams.get('titleId') ?? ''}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="">Select a title...</option>
            {titlesData?.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} {t.isbn13 ? `(${t.isbn13})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity * {!isReceive && <span className="text-gray-400">(negative to reduce)</span>}
            </label>
            <input
              name="quantity"
              type="number"
              required
              min={isReceive ? 1 : undefined}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
            <select
              name="location"
              required
              defaultValue="XARRA_WAREHOUSE"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {INVENTORY_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>{loc.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {!isReceive && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <input
              name="reason"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g., Physical count correction, Damaged stock"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : isReceive ? 'Receive Stock' : 'Record Adjustment'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

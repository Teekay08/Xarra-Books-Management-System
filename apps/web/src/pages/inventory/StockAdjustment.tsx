import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { INVENTORY_LOCATIONS } from '@xarra/shared';

interface Title {
  id: string;
  title: string;
  isbn13: string | null;
}

interface Partner {
  id: string;
  name: string;
}

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function StockAdjustment({ mode = 'adjust' }: { mode?: 'adjust' | 'receive' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [titleId, setTitleId] = useState(searchParams.get('titleId') ?? '');
  const [supplierId, setSupplierId] = useState('');

  const { data: titlesData } = useQuery({
    queryKey: ['titles-select'],
    queryFn: () => api<PaginatedResponse<Title>>('/titles?limit=500'),
  });

  const { data: partnersData } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
    enabled: mode === 'receive',
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(mode === 'receive' ? '/inventory/receive' : '/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setIsDirty(false);
      navigate('/inventory');
    },
  });

  const titleOptions = (titlesData?.data ?? []).map((t) => ({
    value: t.id,
    label: t.title,
    subtitle: t.isbn13 ?? undefined,
  }));

  const supplierOptions = (partnersData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);

    if (!titleId) { setError('Please select a title'); return; }

    if (mode === 'receive') {
      const selectedSupplier = partnersData?.data.find((p) => p.id === supplierId);
      mutation.mutate({
        titleId,
        quantity: Number(fd.get('quantity')),
        location: fd.get('location') || 'XARRA_WAREHOUSE',
        receivedDate: fd.get('receivedDate') || undefined,
        batchNumber: fd.get('batchNumber') || undefined,
        supplierId: supplierId || undefined,
        supplierName: supplierId
          ? selectedSupplier?.name
          : (fd.get('supplierName') as string) || undefined,
        notes: fd.get('notes') || undefined,
      }, { onError: (err) => setError(err.message) });
    } else {
      mutation.mutate({
        titleId,
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
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title={isReceive ? 'Receive Stock' : 'Stock Adjustment'} />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-lg space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <SearchableSelect
            options={titleOptions}
            value={titleId}
            onChange={(v) => { setTitleId(v); if (!isDirty) setIsDirty(true); }}
            placeholder="Search titles by name or ISBN..."
            required
          />
        </div>

        {isReceive && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Received Date *</label>
                <input
                  name="receivedDate"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className={cls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number</label>
                <input
                  name="batchNumber"
                  className={cls}
                  placeholder="e.g. BATCH-2026-001"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <SearchableSelect
                options={supplierOptions}
                value={supplierId}
                onChange={(v) => { setSupplierId(v); if (!isDirty) setIsDirty(true); }}
                placeholder="Search suppliers..."
              />
            </div>

            {!supplierId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name (if not in system)</label>
                <input
                  name="supplierName"
                  className={cls}
                  placeholder="e.g. PrintCo Supplies"
                />
              </div>
            )}
          </>
        )}

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
              className={cls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
            <select
              name="location"
              required
              defaultValue="XARRA_WAREHOUSE"
              className={cls}
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
              className={cls}
              placeholder="e.g., Physical count correction, Damaged stock"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className={cls}
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

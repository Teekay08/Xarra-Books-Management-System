import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { INVENTORY_LOCATIONS } from '@xarra/shared';
import { MOVEMENT_TYPE_COLORS as typeColors } from '../../lib/statusColors';

interface Movement {
  id: string;
  titleId: string;
  movementType: string;
  referenceType: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
  batchNumber: string | null;
  supplierName: string | null;
  supplierId: string | null;
  receivedDate: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function MovementHistory() {
  const { titleId } = useParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['movements', titleId, page],
    queryFn: () =>
      api<PaginatedResponse<Movement>>(
        `/inventory/titles/${titleId}/movements?page=${page}&limit=20`
      ),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/inventory/movements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements', titleId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setEditingMovement(null);
    },
  });

  const columns = [
    { key: 'createdAt', header: 'Date', render: (m: Movement) =>
      new Date(m.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    },
    { key: 'movementType', header: 'Type', render: (m: Movement) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[m.movementType] ?? ''}`}>
        {m.movementType}
      </span>
    )},
    { key: 'quantity', header: 'Qty', render: (m: Movement) => (
      <span className={`font-mono ${
        ['IN', 'RETURN'].includes(m.movementType) ? 'text-green-700' : 'text-red-600'
      }`}>
        {['IN', 'RETURN', 'ADJUST'].includes(m.movementType) && m.quantity > 0 ? '+' : ''}{m.quantity}
      </span>
    )},
    { key: 'fromLocation', header: 'From', render: (m: Movement) => m.fromLocation?.replace(/_/g, ' ') ?? '—' },
    { key: 'toLocation', header: 'To', render: (m: Movement) => m.toLocation?.replace(/_/g, ' ') ?? '—' },
    { key: 'reason', header: 'Reason / Batch', render: (m: Movement) =>
      m.movementType === 'IN'
        ? [m.batchNumber, m.supplierName].filter(Boolean).join(' · ') || '—'
        : (m.reason ?? '—')
    },
    { key: 'actions', header: '', render: (m: Movement) =>
      m.movementType === 'IN' && m.referenceType === 'PRINT_RUN' ? (
        <button
          onClick={() => setEditingMovement(m)}
          className="text-xs text-green-700 hover:text-green-900 font-medium"
        >
          Edit
        </button>
      ) : null
    },
  ];

  return (
    <div>
      <PageHeader title="Movement History" subtitle={`Title: ${titleId}`} backTo={{ label: 'Back to Inventory', href: '/inventory' }} />

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            emptyMessage="No movements recorded for this title"
          />
          {data?.pagination && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {editingMovement && (
        <EditReceiptModal
          movement={editingMovement}
          isPending={editMutation.isPending}
          error={editMutation.isError ? (editMutation.error as Error).message : ''}
          onClose={() => setEditingMovement(null)}
          onSubmit={(body) => editMutation.mutate({ id: editingMovement.id, body })}
        />
      )}
    </div>
  );
}

function EditReceiptModal({ movement, isPending, error, onClose, onSubmit }: {
  movement: Movement;
  isPending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [fields, setFields] = useState({
    quantity: movement.quantity,
    toLocation: movement.toLocation ?? 'XARRA_WAREHOUSE',
    receivedDate: movement.receivedDate ? movement.receivedDate.split('T')[0] : new Date().toISOString().split('T')[0],
    batchNumber: movement.batchNumber ?? '',
    supplierName: movement.supplierName ?? '',
    notes: movement.notes ?? '',
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      quantity: fields.quantity,
      toLocation: fields.toLocation,
      receivedDate: fields.receivedDate,
      batchNumber: fields.batchNumber || null,
      supplierName: fields.supplierName || null,
      notes: fields.notes || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Edit Stock Receipt</h3>
            <p className="text-xs text-gray-500 mt-1">
              Recorded {new Date(movement.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                required
                min={1}
                value={fields.quantity}
                onChange={(e) => setFields((p) => ({ ...p, quantity: Number(e.target.value) }))}
                className={cls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Received Date *</label>
              <input
                type="date"
                required
                value={fields.receivedDate}
                onChange={(e) => setFields((p) => ({ ...p, receivedDate: e.target.value }))}
                className={cls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location *</label>
            <select
              required
              value={fields.toLocation}
              onChange={(e) => setFields((p) => ({ ...p, toLocation: e.target.value }))}
              className={cls}
            >
              {INVENTORY_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>{loc.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Batch Number</label>
              <input
                type="text"
                value={fields.batchNumber}
                onChange={(e) => setFields((p) => ({ ...p, batchNumber: e.target.value }))}
                placeholder="e.g. BATCH-2026-001"
                className={cls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
              <input
                type="text"
                value={fields.supplierName}
                onChange={(e) => setFields((p) => ({ ...p, supplierName: e.target.value }))}
                placeholder="e.g. Paarl Media"
                className={cls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={fields.notes}
              onChange={(e) => setFields((p) => ({ ...p, notes: e.target.value }))}
              className={cls}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

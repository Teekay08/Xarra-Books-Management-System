import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Supplier { id: string; name: string }
interface User { id: string; name: string; email: string }

export function RateCardForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    type: 'INTERNAL' as 'INTERNAL' | 'EXTERNAL',
    role: '',
    hourlyRateZar: '',
    dailyRateZar: '',
    staffUserId: '',
    supplierId: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    currency: 'ZAR',
    notes: '',
  });
  const [error, setError] = useState('');

  const { data: existing } = useQuery({
    queryKey: ['rate-card', id],
    queryFn: () => api<{ data: any }>(`/budgeting/rate-cards/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing?.data) {
      const rc = existing.data;
      setForm({
        name: rc.name || '',
        type: rc.type || 'INTERNAL',
        role: rc.role || '',
        hourlyRateZar: rc.hourlyRateZar || '',
        dailyRateZar: rc.dailyRateZar || '',
        staffUserId: rc.staffUserId || '',
        supplierId: rc.supplierId || '',
        effectiveFrom: rc.effectiveFrom ? rc.effectiveFrom.split('T')[0] : '',
        effectiveTo: rc.effectiveTo ? rc.effectiveTo.split('T')[0] : '',
        currency: rc.currency || 'ZAR',
        notes: rc.notes || '',
      });
    }
  }, [existing]);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-dropdown'],
    queryFn: () => api<{ data: Supplier[] }>('/suppliers?limit=500'),
  });
  const { data: usersData } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => api<{ data: User[] }>('/users?limit=500'),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        hourlyRateZar: Number(form.hourlyRateZar),
        dailyRateZar: form.dailyRateZar ? Number(form.dailyRateZar) : null,
        staffUserId: form.staffUserId || null,
        supplierId: form.supplierId || null,
        effectiveTo: form.effectiveTo || null,
      };
      if (isEdit) {
        return api(`/budgeting/rate-cards/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      return api('/budgeting/rate-cards', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
      navigate('/budgeting/rate-cards');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate();
  };

  // Auto-calc daily rate
  const autoDaily = () => {
    if (form.hourlyRateZar && !form.dailyRateZar) {
      setForm((f) => ({ ...f, dailyRateZar: String(Number(f.hourlyRateZar) * 8) }));
    }
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Rate Card' : 'New Rate Card'}
        backTo={{ label: 'Rate Cards', href: '/budgeting/rate-cards' }}
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="card p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Senior Editor - Internal"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any, staffUserId: '', supplierId: '' })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="INTERNAL">Internal</option>
                <option value="EXTERNAL">External</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <input type="text" required value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="e.g. Editor, Typesetter, Cover Designer"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (ZAR) *</label>
              <input type="number" required min={0} step={0.01} value={form.hourlyRateZar}
                onChange={(e) => setForm({ ...form, hourlyRateZar: e.target.value })}
                onBlur={autoDaily}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Daily Rate (ZAR)</label>
              <input type="number" min={0} step={0.01} value={form.dailyRateZar}
                onChange={(e) => setForm({ ...form, dailyRateZar: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">Auto-calculated as hourly x 8 if left blank</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {form.type === 'INTERNAL' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
                <select value={form.staffUserId} onChange={(e) => setForm({ ...form, staffUserId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">— Select staff —</option>
                  {usersData?.data?.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
            {form.type === 'EXTERNAL' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier/Contractor</label>
                <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">— Select supplier —</option>
                  {suppliersData?.data?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective From *</label>
              <input type="date" required value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective To</label>
              <input type="date" value={form.effectiveTo}
                onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">Leave blank for open-ended</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={2} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Rate Card' : 'Create Rate Card'}
          </button>
          <button type="button" onClick={() => navigate('/budgeting/rate-cards')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

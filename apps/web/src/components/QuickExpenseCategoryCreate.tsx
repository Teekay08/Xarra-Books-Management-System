import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: (cat: { id: string; name: string }) => void;
}

export function QuickExpenseCategoryCreate({ onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: { id: string; name: string } }>('/expenses/categories', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      onCreated(res.data);
      onClose();
    },
    onError: (e: Error) => setError(e.message || 'Failed to create category'),
  });

  function submit() {
    setError('');
    if (!name.trim()) return setError('Category name is required');
    mutation.mutate({ name: name.trim(), description: desc.trim() || undefined, isActive: true });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-gray-900">New Expense Category</h3>
              <p className="text-xs text-gray-400 mt-0.5">Add a category to this expense</p>
            </div>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{error}</div>
          )}

          <div className="space-y-3">
            <div>
              <label className="form-label">Category Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} autoFocus
                className="input" placeholder="e.g. Office Supplies, Travel, Marketing" />
            </div>
            <div>
              <label className="form-label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                className="input" placeholder="Brief description of this category" />
            </div>
          </div>

          <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
            <button onClick={submit} disabled={mutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-[#c0392b] text-white text-sm font-semibold hover:bg-[#a93226] disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Creating…' : 'Create Category'}
            </button>
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

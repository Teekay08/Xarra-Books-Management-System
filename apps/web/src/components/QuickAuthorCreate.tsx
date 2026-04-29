import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: (author: { id: string; legalName: string; penName: string | null }) => void;
}

export function QuickAuthorCreate({ onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [legalName, setLegalName] = useState('');
  const [penName,   setPenName]   = useState('');
  const [type,      setType]      = useState<'HYBRID' | 'TRADITIONAL'>('HYBRID');
  const [email,     setEmail]     = useState('');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: { id: string; legalName: string; penName: string | null } }>('/authors', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['authors-select'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
      onCreated(res.data);
      onClose();
    },
    onError: (e: Error) => setError(e.message || 'Failed to create author'),
  });

  function submit() {
    setError('');
    if (!legalName.trim()) return setError('Legal name is required');
    mutation.mutate({
      legalName: legalName.trim(),
      penName:   penName.trim() || undefined,
      type,
      email:     email.trim() || undefined,
      isActive:  true,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-gray-900">Add Author</h3>
              <p className="text-xs text-gray-400 mt-0.5">Create a new author record</p>
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
              <label className="form-label">Legal Name *</label>
              <input value={legalName} onChange={e => setLegalName(e.target.value)} autoFocus
                className="input" placeholder="e.g. Thabo Nkosi" />
            </div>
            <div>
              <label className="form-label">Pen Name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={penName} onChange={e => setPenName(e.target.value)}
                className="input" placeholder="If different from legal name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Author Type</label>
                <select value={type} onChange={e => setType(e.target.value as any)} className="select">
                  <option value="HYBRID">Hybrid</option>
                  <option value="TRADITIONAL">Traditional</option>
                </select>
              </div>
              <div>
                <label className="form-label">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input" placeholder="author@email.com" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
            <button onClick={submit} disabled={mutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-[#c0392b] text-white text-sm font-semibold hover:bg-[#a93226] disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Creating…' : 'Create Author'}
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

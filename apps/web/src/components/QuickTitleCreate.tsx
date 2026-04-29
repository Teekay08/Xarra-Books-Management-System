import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../lib/api';
import { SearchableSelect } from './SearchableSelect';
import { QuickAuthorCreate } from './QuickAuthorCreate';

interface Author { id: string; legalName: string; penName: string | null }

interface Props {
  onClose: () => void;
  onCreated: (title: { id: string; title: string; rrpZar: string; isbn13: string | null }) => void;
}

const FORMAT_OPTIONS = [
  { value: 'PRINT',  label: 'Print' },
  { value: 'EBOOK',  label: 'eBook' },
  { value: 'PDF',    label: 'PDF'   },
];

export function QuickTitleCreate({ onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [error,      setError]      = useState('');
  const [titleName,  setTitleName]  = useState('');
  const [rrpZar,     setRrpZar]     = useState('');
  const [isbn13,     setIsbn13]     = useState('');
  const [authorId,   setAuthorId]   = useState('');
  const [formats,    setFormats]    = useState<string[]>(['PRINT']);
  const [showAuthorCreate, setShowAuthorCreate] = useState(false);

  const { data: authorsData } = useQuery({
    queryKey: ['authors-select'],
    queryFn: () => api<PaginatedResponse<Author>>('/authors?limit=500&isActive=true'),
  });

  const authorOptions = (authorsData?.data ?? []).map(a => ({
    value: a.id,
    label: a.penName ? `${a.penName} (${a.legalName})` : a.legalName,
  }));

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: { id: string; title: string; rrpZar: string; isbn13: string | null } }>('/titles', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['titles-select'] });
      qc.invalidateQueries({ queryKey: ['titles'] });
      onCreated(res.data);
      onClose();
    },
    onError: (e: Error) => setError(e.message || 'Failed to create title'),
  });

  function toggleFormat(fmt: string) {
    setFormats(prev =>
      prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]
    );
  }

  function submit() {
    setError('');
    if (!titleName.trim())       return setError('Title name is required');
    if (!rrpZar || Number(rrpZar) <= 0) return setError('RRP (price) must be greater than 0');
    if (formats.length === 0)    return setError('Select at least one format');
    if (isbn13 && !/^\d{13}$/.test(isbn13)) return setError('ISBN-13 must be exactly 13 digits');

    mutation.mutate({
      title:           titleName.trim(),
      rrpZar:          Number(rrpZar),
      isbn13:          isbn13 || undefined,
      primaryAuthorId: authorId || undefined,
      formats,
      status:          'PRODUCTION',
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-gray-900">Add Title</h3>
                <p className="text-xs text-gray-400 mt-0.5">Create a new title to add to this document</p>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{error}</div>
            )}

            <div className="space-y-4">
              {/* Title name */}
              <div>
                <label className="form-label">Title / Product Name *</label>
                <input value={titleName} onChange={e => setTitleName(e.target.value)} autoFocus
                  className="input" placeholder="e.g. Ubuntu and the African Dream" />
              </div>

              {/* Price */}
              <div>
                <label className="form-label">RRP (ZAR) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R</span>
                  <input type="number" min={0} step={0.01} value={rrpZar}
                    onChange={e => setRrpZar(e.target.value)}
                    className="input pl-7 font-mono" placeholder="299.00" />
                </div>
              </div>

              {/* Format checkboxes */}
              <div>
                <label className="form-label">Format *</label>
                <div className="flex gap-2">
                  {FORMAT_OPTIONS.map(f => (
                    <button key={f.value} type="button" onClick={() => toggleFormat(f.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        formats.includes(f.value)
                          ? 'bg-[#c0392b] text-white border-[#c0392b]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Author */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Author <span className="text-gray-400 font-normal">(optional)</span></label>
                  <button type="button" onClick={() => setShowAuthorCreate(true)}
                    className="text-[10px] font-semibold text-[#c0392b] hover:text-[#a93226] transition-colors">
                    + New author
                  </button>
                </div>
                <SearchableSelect
                  options={authorOptions}
                  value={authorId}
                  onChange={setAuthorId}
                  placeholder="Search authors…"
                  onCreateNew={() => setShowAuthorCreate(true)}
                  createNewLabel="+ Add new author"
                />
              </div>

              {/* ISBN */}
              <div>
                <label className="form-label">ISBN-13 <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={isbn13} onChange={e => setIsbn13(e.target.value.replace(/\D/g, '').slice(0, 13))}
                  className="input font-mono" placeholder="9780000000000" maxLength={13} />
                {isbn13 && isbn13.length < 13 && (
                  <p className="text-[10px] text-amber-600 mt-0.5">{13 - isbn13.length} more digits needed</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
              <button onClick={submit} disabled={mutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-[#c0392b] text-white text-sm font-semibold hover:bg-[#a93226] disabled:opacity-50 transition-colors">
                {mutation.isPending ? 'Creating…' : 'Create Title'}
              </button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAuthorCreate && (
        <QuickAuthorCreate
          onClose={() => setShowAuthorCreate(false)}
          onCreated={(a) => { setAuthorId(a.id); setShowAuthorCreate(false); }}
        />
      )}
    </>
  );
}

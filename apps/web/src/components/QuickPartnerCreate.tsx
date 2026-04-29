import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface QuickPartnerCreateProps {
  onClose: () => void;
  onCreated: (partner: { id: string; name: string }) => void;
}

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function QuickPartnerCreate({ onClose, onCreated }: QuickPartnerCreateProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: { id: string; name: string } }>('/partners', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['partners-select'] });
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partners-list'] });
      onCreated(res.data);
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const name = (fd.get('name') as string).trim();
    if (!name) { setError('Partner name is required'); return; }

    mutation.mutate({
      name,
      discountPct: Number(fd.get('discountPct')) || 0,
      contactName: fd.get('contactName') || undefined,
      contactEmail: fd.get('contactEmail') || undefined,
      contactPhone: fd.get('contactPhone') || undefined,
      addressLine1: fd.get('addressLine1') || undefined,
      city: fd.get('city') || undefined,
      province: fd.get('province') || undefined,
      postalCode: fd.get('postalCode') || undefined,
      vatNumber: fd.get('vatNumber') || undefined,
      paymentTermsDays: Number(fd.get('paymentTermsDays')) || 30,
    }, { onError: (err) => setError(err.message) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Quick Add Partner</h3>
              <p className="text-sm text-gray-500 mt-0.5">Create a new retail partner</p>
            </div>
            <button type="button" onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {mutation.isError && !error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{(mutation.error as Error).message}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner Name *</label>
            <input name="name" required className={cls} placeholder="e.g. Exclusive Books" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Discount %</label>
              <input name="discountPct" type="number" step="0.01" min="0" max="100" defaultValue="0" className={cls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Terms (days)</label>
              <input name="paymentTermsDays" type="number" min="0" defaultValue="30" className={cls} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700 mb-1">Contact</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact Name</label>
                <input name="contactName" className={cls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input name="contactPhone" type="tel" className={cls} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input name="contactEmail" type="email" className={cls} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700 mb-1">Address</legend>
            <input name="addressLine1" className={cls} placeholder="Street address" />
            <div className="grid grid-cols-3 gap-3">
              <input name="city" className={cls} placeholder="City" />
              <input name="province" className={cls} placeholder="Province" />
              <input name="postalCode" className={cls} placeholder="Code" />
            </div>
          </fieldset>

          <div>
            <label className="block text-xs text-gray-500 mb-1">VAT Number</label>
            <input name="vatNumber" className={cls} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {mutation.isPending ? 'Creating...' : 'Create Partner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

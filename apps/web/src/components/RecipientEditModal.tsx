import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface RecipientDetails {
  partnerId: string;
  partnerName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  vatNumber: string | null;
}

interface RecipientEditModalProps {
  recipient: RecipientDetails;
  onClose: () => void;
  onSaved?: (updated: RecipientDetails) => void;
}

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function RecipientEditModal({ recipient, onClose, onSaved }: RecipientEditModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    contactName: recipient.contactName ?? '',
    contactEmail: recipient.contactEmail ?? '',
    contactPhone: recipient.contactPhone ?? '',
    addressLine1: recipient.addressLine1 ?? '',
    addressLine2: recipient.addressLine2 ?? '',
    city: recipient.city ?? '',
    province: recipient.province ?? '',
    postalCode: recipient.postalCode ?? '',
    vatNumber: recipient.vatNumber ?? '',
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ data: RecipientDetails }>(`/partners/${recipient.partnerId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['partner', recipient.partnerId] });
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      onSaved?.({ ...recipient, ...res.data });
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      contactName: form.contactName || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      addressLine1: form.addressLine1 || null,
      addressLine2: form.addressLine2 || null,
      city: form.city || null,
      province: form.province || null,
      postalCode: form.postalCode || null,
      vatNumber: form.vatNumber || null,
    });
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Edit Recipient Details</h3>
              <p className="text-sm text-gray-500 mt-0.5">{recipient.partnerName}</p>
            </div>
            <button type="button" onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {mutation.isError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {(mutation.error as Error).message}
            </div>
          )}

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700 mb-1">Contact Information</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact Name</label>
                <input value={form.contactName} onChange={(e) => update('contactName', e.target.value)}
                  className={cls} placeholder="e.g. John Smith" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact Phone</label>
                <input value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)}
                  type="tel" className={cls} placeholder="e.g. 012 345 6789" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Contact Email</label>
              <input value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)}
                type="email" className={cls} placeholder="e.g. accounts@partner.co.za" />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700 mb-1">Address</legend>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Address Line 1</label>
              <input value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)}
                className={cls} placeholder="Street address" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Address Line 2</label>
              <input value={form.addressLine2} onChange={(e) => update('addressLine2', e.target.value)}
                className={cls} placeholder="Suite, unit, etc. (optional)" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">City</label>
                <input value={form.city} onChange={(e) => update('city', e.target.value)}
                  className={cls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Province</label>
                <input value={form.province} onChange={(e) => update('province', e.target.value)}
                  className={cls} placeholder="e.g. Gauteng" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Postal Code</label>
                <input value={form.postalCode} onChange={(e) => update('postalCode', e.target.value)}
                  className={cls} />
              </div>
            </div>
          </fieldset>

          <div>
            <label className="block text-xs text-gray-500 mb-1">VAT Number</label>
            <input value={form.vatNumber} onChange={(e) => update('vatNumber', e.target.value)}
              className={cls} placeholder="e.g. 4123456789" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

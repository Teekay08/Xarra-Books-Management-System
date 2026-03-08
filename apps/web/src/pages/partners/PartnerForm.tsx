import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface Partner {
  id: string;
  name: string;
  discountPct: string;
  sorDays: number | null;
  paymentTermsDays: number | null;
  paymentDay: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  remittanceEmail: string | null;
  isActive: boolean;
  notes: string | null;
}

export function PartnerForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['partner', id],
    queryFn: () => api<{ data: Partner }>(`/partners/${id}`),
    enabled: isEdit,
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? api(`/partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/partners', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      setIsDirty(false);
      navigate('/partners');
    },
  });

  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: fd.get('name'),
      discountPct: Number(fd.get('discountPct')),
      sorDays: fd.get('sorDays') ? Number(fd.get('sorDays')) : undefined,
      paymentTermsDays: fd.get('paymentTermsDays') ? Number(fd.get('paymentTermsDays')) : undefined,
      paymentDay: fd.get('paymentDay') ? Number(fd.get('paymentDay')) : undefined,
      contactName: fd.get('contactName') || undefined,
      contactEmail: fd.get('contactEmail') || undefined,
      contactPhone: fd.get('contactPhone') || undefined,
      remittanceEmail: fd.get('remittanceEmail') || undefined,
      addressLine1: fd.get('addressLine1') || undefined,
      addressLine2: fd.get('addressLine2') || undefined,
      city: fd.get('city') || undefined,
      province: fd.get('province') || undefined,
      postalCode: fd.get('postalCode') || undefined,
      vatNumber: fd.get('vatNumber') || undefined,
      isActive: fd.get('isActive') === 'on',
      notes: fd.get('notes') || undefined,
    };
    mutation.mutate(body, { onError: (err) => setError(err.message) });
  }

  if (isEdit && isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const partner = existing?.data;

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title={isEdit ? 'Edit Partner' : 'New Channel Partner'} />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <Field label="Partner Name *" name="name" defaultValue={partner?.name} required />

        <div className="grid grid-cols-3 gap-4">
          <Field label="Discount %" name="discountPct" type="number" defaultValue={partner?.discountPct ?? ''} required />
          <Field label="SOR Days" name="sorDays" type="number" defaultValue={partner?.sorDays?.toString() ?? ''} />
          <Field label="Payment Terms (days)" name="paymentTermsDays" type="number" defaultValue={partner?.paymentTermsDays?.toString() ?? ''} />
        </div>

        <Field label="Payment Day (1-31)" name="paymentDay" type="number" defaultValue={partner?.paymentDay?.toString() ?? ''} />

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Contact Information</legend>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Name" name="contactName" defaultValue={partner?.contactName ?? ''} />
              <Field label="Contact Email" name="contactEmail" type="email" defaultValue={partner?.contactEmail ?? ''} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Phone" name="contactPhone" defaultValue={partner?.contactPhone ?? ''} />
              <Field label="Remittance Email" name="remittanceEmail" type="email" defaultValue={partner?.remittanceEmail ?? ''} />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Address & Tax</legend>
          <div className="space-y-3">
            <Field label="Address Line 1" name="addressLine1" defaultValue={(partner as any)?.addressLine1 ?? ''} />
            <Field label="Address Line 2" name="addressLine2" defaultValue={(partner as any)?.addressLine2 ?? ''} />
            <div className="grid grid-cols-3 gap-4">
              <Field label="City" name="city" defaultValue={(partner as any)?.city ?? ''} />
              <Field label="Province" name="province" defaultValue={(partner as any)?.province ?? ''} />
              <Field label="Postal Code" name="postalCode" defaultValue={(partner as any)?.postalCode ?? ''} />
            </div>
            <Field label="VAT Number" name="vatNumber" defaultValue={(partner as any)?.vatNumber ?? ''} />
          </div>
        </fieldset>

        <Field label="Notes" name="notes" defaultValue={partner?.notes ?? ''} textarea />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            id="isActive"
            defaultChecked={partner?.isActive ?? true}
            className="rounded border-gray-300"
          />
          <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Partner' : 'Create Partner'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/partners')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, name, defaultValue = '', type = 'text', required, textarea,
}: {
  label: string; name: string; defaultValue?: string; type?: string; required?: boolean; textarea?: boolean;
}) {
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {textarea ? (
        <textarea name={name} defaultValue={defaultValue} rows={3} className={cls} />
      ) : (
        <input name={name} type={type} defaultValue={defaultValue} required={required} step={type === 'number' ? 'any' : undefined} className={cls} />
      )}
    </div>
  );
}

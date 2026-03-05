import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { AUTHOR_TYPES } from '@xarra/shared';

interface Author {
  id: string;
  legalName: string;
  penName: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  taxNumber: string | null;
  isActive: boolean;
  notes: string | null;
}

export function AuthorForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['author', id],
    queryFn: () => api<{ data: Author }>(`/authors/${id}`),
    enabled: isEdit,
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? api(`/authors/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/authors', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['authors'] });
      navigate('/authors');
    },
  });

  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      legalName: fd.get('legalName'),
      penName: fd.get('penName') || undefined,
      type: fd.get('type'),
      email: fd.get('email') || undefined,
      phone: fd.get('phone') || undefined,
      addressLine1: fd.get('addressLine1') || undefined,
      addressLine2: fd.get('addressLine2') || undefined,
      city: fd.get('city') || undefined,
      province: fd.get('province') || undefined,
      postalCode: fd.get('postalCode') || undefined,
      country: fd.get('country') || undefined,
      taxNumber: fd.get('taxNumber') || undefined,
      notes: fd.get('notes') || undefined,
      isActive: fd.get('isActive') === 'on',
    };
    mutation.mutate(body, { onError: (err) => setError(err.message) });
  }

  if (isEdit && isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const author = existing?.data;

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Author' : 'New Author'} />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Legal Name *" name="legalName" defaultValue={author?.legalName} required />
          <Field label="Pen Name" name="penName" defaultValue={author?.penName ?? ''} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select
              name="type"
              required
              defaultValue={author?.type ?? 'HYBRID'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {AUTHOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Field label="Email" name="email" type="email" defaultValue={author?.email ?? ''} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" name="phone" defaultValue={author?.phone ?? ''} />
          <Field label="Tax Number" name="taxNumber" defaultValue={author?.taxNumber ?? ''} />
        </div>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Address</legend>
          <div className="space-y-3">
            <Field label="Address Line 1" name="addressLine1" defaultValue={author?.addressLine1 ?? ''} />
            <Field label="Address Line 2" name="addressLine2" defaultValue={author?.addressLine2 ?? ''} />
            <div className="grid grid-cols-3 gap-4">
              <Field label="City" name="city" defaultValue={author?.city ?? ''} />
              <Field label="Province" name="province" defaultValue={author?.province ?? ''} />
              <Field label="Postal Code" name="postalCode" defaultValue={author?.postalCode ?? ''} />
            </div>
            <Field label="Country" name="country" defaultValue={author?.country ?? 'South Africa'} />
          </div>
        </fieldset>

        <Field label="Notes" name="notes" defaultValue={author?.notes ?? ''} textarea />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            id="isActive"
            defaultChecked={author?.isActive ?? true}
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
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Author' : 'Create Author'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/authors')}
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
        <input name={name} type={type} defaultValue={defaultValue} required={required} className={cls} />
      )}
    </div>
  );
}

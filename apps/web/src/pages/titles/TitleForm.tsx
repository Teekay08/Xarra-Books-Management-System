import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { TITLE_FORMATS, TITLE_STATUSES } from '@xarra/shared';

interface Title {
  id: string;
  title: string;
  subtitle: string | null;
  isbn13: string | null;
  asin: string | null;
  rrpZar: string;
  costPriceZar: string | null;
  formats: string[];
  status: string;
  description: string | null;
  publishDate: string | null;
  pageCount: number | null;
  weightGrams: number | null;
  coverImageUrl: string | null;
}

export function TitleForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['title', id],
    queryFn: () => api<{ data: Title }>(`/titles/${id}`),
    enabled: isEdit,
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? api(`/titles/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/titles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['titles'] });
      navigate('/titles');
    },
  });

  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const formats = TITLE_FORMATS.filter((f) => fd.get(`format_${f}`) === 'on');
    if (formats.length === 0) {
      setError('Select at least one format');
      return;
    }

    const body: Record<string, unknown> = {
      title: fd.get('title'),
      subtitle: fd.get('subtitle') || undefined,
      isbn13: fd.get('isbn13') || undefined,
      asin: fd.get('asin') || undefined,
      rrpZar: Number(fd.get('rrpZar')),
      costPriceZar: fd.get('costPriceZar') ? Number(fd.get('costPriceZar')) : undefined,
      formats,
      status: fd.get('status'),
      description: fd.get('description') || undefined,
      publishDate: fd.get('publishDate') || undefined,
      pageCount: fd.get('pageCount') ? Number(fd.get('pageCount')) : undefined,
      weightGrams: fd.get('weightGrams') ? Number(fd.get('weightGrams')) : undefined,
      coverImageUrl: fd.get('coverImageUrl') || undefined,
    };
    mutation.mutate(body, { onError: (err) => setError(err.message) });
  }

  if (isEdit && isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const title = existing?.data;

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Title' : 'New Title'} />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Title *" name="title" defaultValue={title?.title} required />
          <Field label="Subtitle" name="subtitle" defaultValue={title?.subtitle ?? ''} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="ISBN-13" name="isbn13" defaultValue={title?.isbn13 ?? ''} />
          <Field label="ASIN" name="asin" defaultValue={title?.asin ?? ''} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="RRP (ZAR) *" name="rrpZar" type="number" defaultValue={title?.rrpZar ?? ''} required />
          <Field label="Cost Price (ZAR)" name="costPriceZar" type="number" defaultValue={title?.costPriceZar ?? ''} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
            <select
              name="status"
              required
              defaultValue={title?.status ?? 'PRODUCTION'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {TITLE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Formats *</legend>
          <div className="flex gap-4">
            {TITLE_FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name={`format_${f}`}
                  defaultChecked={title?.formats?.includes(f)}
                  className="rounded border-gray-300"
                />
                {f}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Publish Date" name="publishDate" type="date" defaultValue={title?.publishDate?.split('T')[0] ?? ''} />
          <Field label="Page Count" name="pageCount" type="number" defaultValue={title?.pageCount?.toString() ?? ''} />
          <Field label="Weight (g)" name="weightGrams" type="number" defaultValue={title?.weightGrams?.toString() ?? ''} />
        </div>

        <Field label="Cover Image URL" name="coverImageUrl" defaultValue={title?.coverImageUrl ?? ''} />
        <Field label="Description" name="description" defaultValue={title?.description ?? ''} textarea />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Title' : 'Create Title'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/titles')}
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

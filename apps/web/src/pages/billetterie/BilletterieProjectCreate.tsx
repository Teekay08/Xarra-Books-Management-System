import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

export function BilletterieProjectCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    client: '',
    description: '',
    startDate: '',
    targetEndDate: '',
    budget: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (body: typeof form) =>
      api<{ data: { id: string; number: string } }>('/billetterie/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => navigate(`/billetterie/projects/${res.data.id}`),
    onError: (err: any) => setError(err.message || 'Failed to create project'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate(form);
  }

  const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div>
      <PageHeader
        title="New Project"
        subtitle="Create a Billetterie Software project"
        backTo={{ label: 'Projects', href: '/billetterie/projects' }}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Project Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Project Details</h2>

          <div>
            <label className={labelCls}>Project Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Ticketing Platform — Phase 2"
            />
          </div>

          <div>
            <label className={labelCls}>Client / Company</label>
            <input
              value={form.client}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Ticketmaster SA"
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className={inputCls}
              placeholder="Brief overview of the project scope"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Target End Date</label>
              <input
                type="date"
                value={form.targetEndDate}
                onChange={(e) => setForm((f) => ({ ...f, targetEndDate: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Project Budget (R)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              className={inputCls}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Client Contact */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Client Contact</h2>

          <div>
            <label className={labelCls}>Contact Name</label>
            <input
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className={inputCls}
              placeholder="Primary contact at the client"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contact Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <label className={labelCls}>Internal Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className={inputCls}
            placeholder="Any internal context or constraints"
          />
        </div>

        {/* Info: phases start automatically */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm text-blue-700">
            <strong>Phase gate lifecycle:</strong> All projects start in the{' '}
            <strong>Initiation</strong> phase. Each phase must be completed and approved before the
            next unlocks. Phases: Initiation → Elicitation → Architecture → Development → Testing →
            Sign-off → Closure.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/billetterie/projects')}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

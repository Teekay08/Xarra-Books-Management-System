import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface FormState {
  name: string;
  client: string;
  description: string;
  startDate: string;
  targetEndDate: string;
  budget: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  managerId: string;
  sponsorId: string;
  projectType: string;
  isAdaptive: boolean;
}

const EMPTY: FormState = {
  name: '', client: '', description: '', startDate: '',
  targetEndDate: '', budget: '', contactName: '',
  contactEmail: '', contactPhone: '', notes: '',
  managerId: '', sponsorId: '', projectType: '', isAdaptive: false,
};

export function BilletterieProjectCreate() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');

  const { data: staffData } = useQuery({
    queryKey: ['bil-staff-all'],
    queryFn: () => api<{ data: any[] }>('/billetterie/team'),
  });
  const staff: any[] = staffData?.data ?? [];

  // Load existing project when editing
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['billetterie-project-edit', id],
    queryFn: () => api<{ data: any }>(`/billetterie/projects/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing?.data) return;
    const p = existing.data;
    setForm({
      name:          p.name          ?? '',
      client:        p.client        ?? '',
      description:   p.description   ?? '',
      startDate:     p.startDate     ?? '',
      targetEndDate: p.targetEndDate ?? '',
      budget:        p.budget        ? String(Number(p.budget)) : '',
      contactName:   p.contactName   ?? '',
      contactEmail:  p.contactEmail  ?? '',
      contactPhone:  p.contactPhone  ?? '',
      notes:         p.notes         ?? '',
      managerId:     p.managerId     ?? '',
      sponsorId:     p.sponsorId     ?? '',
      projectType:   p.projectType   ?? '',
      isAdaptive:    p.isAdaptive    ?? false,
    });
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: async (body: FormState) => {
      const res = await api<{ data: { id: string } }>('/billetterie/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const projectId = res.data.id;
      // Auto-enroll PM and Sponsor into the project team
      const enrollments: Promise<any>[] = [];
      if (body.managerId) {
        enrollments.push(api(`/billetterie/projects/${projectId}/team`, {
          method: 'POST',
          body: JSON.stringify({ staffMemberId: body.managerId, role: 'PM' }),
        }).catch(() => {}));
      }
      if (body.sponsorId && body.sponsorId !== body.managerId) {
        enrollments.push(api(`/billetterie/projects/${projectId}/team`, {
          method: 'POST',
          body: JSON.stringify({ staffMemberId: body.sponsorId, role: 'SPONSOR' }),
        }).catch(() => {}));
      }
      await Promise.all(enrollments);
      return res;
    },
    onSuccess: (res) => navigate(`/billetterie/projects/${res.data.id}?view=team`),
    onError: (err: any) => setError(err.message || 'Failed to create project'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: FormState) =>
      api<{ data: any }>(`/billetterie/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => navigate(`/billetterie/projects/${id}`),
    onError: (err: any) => setError(err.message || 'Failed to update project'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      managerId:   form.managerId   || null,
      sponsorId:   form.sponsorId   || null,
      projectType: form.projectType || null,
    } as any;
    if (isEdit) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  if (isEdit && loadingExisting) {
    return <div className="p-8 text-gray-400">Loading project…</div>;
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Project' : 'New Project'}
        subtitle={isEdit ? `Editing ${existing?.data?.number ?? ''}` : 'Create a Billetterie Software project'}
        backTo={{ label: 'Projects', href: isEdit ? `/billetterie/projects/${id}` : '/billetterie/projects' }}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Project Details */}
        <div className="card p-5 space-y-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Project Type</label>
              <select value={form.projectType} onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))} className={inputCls}>
                <option value="">Not specified</option>
                <option value="ADAPTIVE">Adaptive</option>
                <option value="CORRECTIVE">Corrective</option>
                <option value="PERFECTIVE">Perfective</option>
                <option value="STRATEGIC">Strategic</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
            <div className="flex items-center pt-6">
              <input type="checkbox" id="create-is-adaptive" checked={form.isAdaptive}
                onChange={(e) => setForm((f) => ({ ...f, isAdaptive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              <label htmlFor="create-is-adaptive" className="ml-2 text-sm text-gray-700 cursor-pointer">
                Adaptive project (Day-20 gate)
              </label>
            </div>
          </div>
        </div>

        {/* Project Team */}
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Project Team</h2>
            <p className="text-xs text-gray-500 mt-0.5">Assign the core team now. Additional members can be added from the Team tab after creation.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Project Manager</label>
              <select
                value={form.managerId}
                onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
                className={inputCls}
              >
                <option value="">— Select PM —</option>
                {staff.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Project Sponsor</label>
              <select
                value={form.sponsorId}
                onChange={(e) => setForm((f) => ({ ...f, sponsorId: e.target.value }))}
                className={inputCls}
              >
                <option value="">— Select Sponsor —</option>
                {staff.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Client Contact */}
        <div className="card p-5 space-y-4">
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

        {/* Internal Notes */}
        <div className="card p-5">
          <label className={labelCls}>Internal Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className={inputCls}
            placeholder="Any internal context or constraints"
          />
        </div>

        {!isEdit && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              <strong>Phase gate lifecycle:</strong> All projects start in the{' '}
              <strong>Initiation</strong> phase. Each phase must be approved before the next unlocks.
              Phases: Initiation → Elicitation → Architecture → Development → Testing → Sign-off → Closure.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Project')}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/billetterie/projects/${id}` : '/billetterie/projects')}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

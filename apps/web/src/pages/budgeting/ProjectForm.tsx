import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const PROJECT_TYPES = [
  { value: 'NEW_TITLE', label: 'New Title' },
  { value: 'REPRINT', label: 'Reprint' },
  { value: 'REVISED_EDITION', label: 'Revised Edition' },
  { value: 'TRANSLATION', label: 'Translation' },
  { value: 'ANTHOLOGY', label: 'Anthology' },
  { value: 'CUSTOM', label: 'Custom' },
];

const CONTRACT_TYPES = [
  { value: 'TRADITIONAL', label: 'Traditional (Xarra invests, recoups via advance)' },
  { value: 'HYBRID', label: 'Hybrid (Author contributes to production costs)' },
];

interface Author { id: string; legalName: string; penName?: string; type: string }
interface Title { id: string; title: string; isbn13?: string }
interface User { id: string; name: string; email: string }

export function ProjectForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    titleId: '',
    authorId: '',
    projectManager: '',
    projectType: 'NEW_TITLE',
    contractType: 'TRADITIONAL',
    authorContribution: 0,
    description: '',
    startDate: '',
    targetCompletionDate: '',
    currency: 'ZAR',
    notes: '',
  });
  const [error, setError] = useState('');

  // Load existing project for edit
  const { data: existing } = useQuery({
    queryKey: ['budgeting-project', id],
    queryFn: () => api<{ data: any }>(`/budgeting/projects/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing?.data) {
      const p = existing.data;
      setForm({
        name: p.name || '',
        titleId: p.titleId || '',
        authorId: p.authorId || '',
        projectManager: p.projectManager || '',
        projectType: p.projectType || 'NEW_TITLE',
        contractType: p.contractType || 'TRADITIONAL',
        authorContribution: Number(p.authorContribution) || 0,
        description: p.description || '',
        startDate: p.startDate ? p.startDate.split('T')[0] : '',
        targetCompletionDate: p.targetCompletionDate ? p.targetCompletionDate.split('T')[0] : '',
        currency: p.currency || 'ZAR',
        notes: p.notes || '',
      });
    }
  }, [existing]);

  // Load authors, titles, users for dropdowns
  const { data: authorsData } = useQuery({
    queryKey: ['authors-dropdown'],
    queryFn: () => api<{ data: Author[] }>('/authors?limit=500'),
  });
  const { data: titlesData } = useQuery({
    queryKey: ['titles-dropdown'],
    queryFn: () => api<{ data: Title[] }>('/titles?limit=500'),
  });
  const { data: usersData } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => api<{ data: User[] }>('/users?limit=500'),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        titleId: form.titleId || null,
        authorId: form.authorId || null,
        projectManager: form.projectManager || null,
        startDate: form.startDate || null,
        targetCompletionDate: form.targetCompletionDate || null,
      };

      if (isEdit) {
        return api(`/budgeting/projects/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        return api('/budgeting/projects', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        });
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-projects'] });
      queryClient.invalidateQueries({ queryKey: ['budgeting-dashboard'] });
      navigate(`/budgeting/projects/${data?.data?.id || id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Auto-set contract type when author is selected
  useEffect(() => {
    if (form.authorId && authorsData?.data) {
      const author = authorsData.data.find((a) => a.id === form.authorId);
      if (author) {
        setForm((f) => ({ ...f, contractType: author.type === 'HYBRID' ? 'HYBRID' : 'TRADITIONAL' }));
      }
    }
  }, [form.authorId, authorsData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate();
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Project' : 'New Project'}
        backTo={{ label: 'Projects', href: '/budgeting/projects' }}
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Project Identity */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Project Details</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input type="text" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. The Art of Zulu Beadwork — 2nd Edition"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
              <select value={form.authorId} onChange={(e) => setForm({ ...form, authorId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">— Select author —</option>
                {authorsData?.data?.map((a) => (
                  <option key={a.id} value={a.id}>{a.penName || a.legalName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Linked Title</label>
              <select value={form.titleId} onChange={(e) => setForm({ ...form, titleId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">— Select title (optional) —</option>
                {titlesData?.data?.map((t) => (
                  <option key={t.id} value={t.id}>{t.title} {t.isbn13 ? `(${t.isbn13})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Manager</label>
              <select value={form.projectManager} onChange={(e) => setForm({ ...form, projectManager: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">— Select manager —</option>
                {usersData?.data?.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Type *</label>
              <select value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Brief description of the project scope..." />
          </div>
        </div>

        {/* Contract & Funding */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Contract & Funding</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract Type</label>
            <select value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              {CONTRACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {form.contractType === 'HYBRID' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author Contribution (ZAR)</label>
              <input type="number" min={0} step={0.01} value={form.authorContribution}
                onChange={(e) => setForm({ ...form, authorContribution: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">Amount the author is contributing toward production costs</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Timeline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Completion</label>
              <input type="date" value={form.targetCompletionDate}
                onChange={(e) => setForm({ ...form, targetCompletionDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea rows={2} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Project' : 'Create Project'}
          </button>
          <button type="button" onClick={() => navigate('/budgeting/projects')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { AiSuggestButton } from '../../components/AiSuggestButton';

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
  const location = useLocation();
  const fromPM = location.state?.from === 'pm';
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
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);

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
  // Fetch users with PM/admin system role for the Project Manager picker
  const { data: staffData } = useQuery({
    queryKey: ['pm-managers-dropdown'],
    queryFn: () => api<{ data: Array<{ id: string; name: string; email: string; role: string }> }>('/users/managers'),
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
      queryClient.invalidateQueries({ queryKey: ['pm-projects'] });
      queryClient.invalidateQueries({ queryKey: ['pm-all-projects'] });
      const projectId = data?.data?.id || id;
      navigate(fromPM ? `/pm/projects/${projectId}` : `/budgeting/projects/${projectId}`);
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
                {staffData?.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
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

        {/* Description */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            {!isEdit && form.name && (
              <AiSuggestButton
                endpoint="/ai/suggest/project"
                payload={{
                  bookTitle: form.name,
                  authorName: authorsData?.data?.find((a) => a.id === form.authorId)?.legalName || 'Unknown',
                  projectType: form.projectType,
                  contractType: form.contractType,
                }}
                onSuggestion={(data) => {
                  if (data.description && !form.description) {
                    setForm((f) => ({ ...f, description: data.description }));
                  }
                  setAiSuggestions(data);
                }}
                label="AI Suggest"
                disabled={!form.name}
              />
            )}
          </div>
          <textarea rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of the project scope, goals, and deliverables..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {/* AI Suggestions Panel */}
        {aiSuggestions && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12" strokeLinecap="round" />
                  <path d="M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" strokeLinecap="round" />
                </svg>
                AI Suggestions
              </h3>
              <button type="button" onClick={() => setAiSuggestions(null)} className="text-xs text-purple-500 hover:text-purple-700">dismiss</button>
            </div>

            {aiSuggestions.estimatedTimeline && (
              <p className="text-sm text-purple-800">
                <strong>Estimated Timeline:</strong> {aiSuggestions.estimatedTimeline}
              </p>
            )}

            {aiSuggestions.keyConsiderations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-700 uppercase mb-1">Key Considerations</p>
                <ul className="text-sm text-purple-800 list-disc list-inside space-y-0.5">
                  {aiSuggestions.keyConsiderations.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiSuggestions.suggestedMilestones?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-700 uppercase mb-1">Suggested Milestones</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {aiSuggestions.suggestedMilestones.map((m: any, i: number) => (
                    <div key={i} className="rounded-md bg-white border border-purple-100 p-2.5">
                      <p className="text-sm font-medium text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.estimatedWeeks} weeks — {m.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiSuggestions.suggestedBudgetCategories?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-700 uppercase mb-1">Budget Estimate Ranges</p>
                <div className="text-sm space-y-1">
                  {aiSuggestions.suggestedBudgetCategories.map((b: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-700">{b.category}: <span className="text-gray-500 text-xs">{b.description}</span></span>
                      <span className="text-purple-700 font-medium text-xs">{b.estimatedRangeZAR}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
          <button type="button" onClick={() => navigate(fromPM ? '/pm/projects' : '/budgeting/projects')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

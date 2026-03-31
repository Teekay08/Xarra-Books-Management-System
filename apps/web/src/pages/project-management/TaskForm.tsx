import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface TeamMember {
  id: string;
  staffMemberId: string;
  role: string;
  staffMember?: { id: string; name: string; email: string; role: string; hourlyRate: string } | null;
}

interface Milestone {
  id: string;
  name: string;
  code: string;
}

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

export function TaskForm() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    staffMemberId: '',
    milestoneId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    allocatedHours: 0,
    hourlyRate: 0,
    startDate: '',
    dueDate: '',
    deliverables: [''],
  });
  const [error, setError] = useState('');
  const [showNewMilestone, setShowNewMilestone] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ code: '', name: '' });

  const createMilestoneMutation = useMutation({
    mutationFn: () => api(`/budgeting/projects/${projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify({ code: newMilestone.code, name: newMilestone.name, sortOrder: 99 }),
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-project-milestones', projectId] });
      setForm((f) => ({ ...f, milestoneId: data?.data?.id || '' }));
      setShowNewMilestone(false);
      setNewMilestone({ code: '', name: '' });
    },
    onError: (err: Error) => alert(`Failed to create milestone: ${err.message}`),
  });

  const { data: teamData } = useQuery({
    queryKey: ['pm-project-team', projectId],
    queryFn: () => api<{ data: TeamMember[] }>(`/project-management/projects/${projectId}/team`),
    enabled: !!projectId,
  });

  const { data: milestonesData } = useQuery({
    queryKey: ['budgeting-project-milestones', projectId],
    queryFn: () => api<{ data: Milestone[] }>(`/budgeting/projects/${projectId}/milestones`),
    enabled: !!projectId,
  });

  // Auto-fill hourly rate when staff member is selected
  useEffect(() => {
    if (form.staffMemberId && teamData?.data) {
      const member = teamData.data.find((m) => m.staffMemberId === form.staffMemberId);
      const rate = Number(member?.staffMember?.hourlyRate || 0);
      if (rate > 0) {
        setForm((f) => ({ ...f, hourlyRate: rate }));
      }
    }
  }, [form.staffMemberId, teamData]);

  const totalCost = form.allocatedHours * form.hourlyRate;

  function updateDeliverable(index: number, value: string) {
    setForm((f) => {
      const deliverables = [...f.deliverables];
      deliverables[index] = value;
      return { ...f, deliverables };
    });
  }

  function addDeliverable() {
    setForm((f) => ({ ...f, deliverables: [...f.deliverables, ''] }));
  }

  function removeDeliverable(index: number) {
    setForm((f) => ({
      ...f,
      deliverables: f.deliverables.length <= 1 ? f.deliverables : f.deliverables.filter((_, i) => i !== index),
    }));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        staffMemberId: form.staffMemberId || null,
        milestoneId: form.milestoneId || null,
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        allocatedHours: form.allocatedHours,
        hourlyRate: form.hourlyRate,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        deliverables: form.deliverables.filter((d) => d.trim()).map((d) => ({ description: d, completed: false })),
      };
      return api(`/project-management/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-tasks', projectId] });
      navigate(`/project-management/projects/${projectId}/tasks`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title) {
      setError('Task title is required.');
      return;
    }
    mutation.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Create Task"
        backTo={{ label: 'Tasks', href: `/project-management/projects/${projectId}/tasks` }}
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Assignment */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Assignment</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
              <select value={form.staffMemberId}
                onChange={(e) => setForm({ ...form, staffMemberId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">-- Select team member --</option>
                {teamData?.data?.map((m) => (
                  <option key={m.staffMemberId} value={m.staffMemberId}>
                    {m.staffMember?.name || '—'} ({m.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Milestone</label>
              <div className="flex gap-2">
                <select value={form.milestoneId}
                  onChange={(e) => {
                    if (e.target.value === '__CREATE_NEW__') {
                      setShowNewMilestone(true);
                    } else {
                      setForm({ ...form, milestoneId: e.target.value });
                    }
                  }}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">-- No milestone --</option>
                  {milestonesData?.data?.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                  ))}
                  <option value="__CREATE_NEW__">+ Create New Milestone</option>
                </select>
              </div>
            </div>
          </div>

          {/* Inline New Milestone Form */}
          {showNewMilestone && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-green-800">New Milestone</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Code *</label>
                  <input type="text" value={newMilestone.code}
                    onChange={(e) => setNewMilestone({ ...newMilestone, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                    placeholder="e.g. EDITING, COVER_DESIGN"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input type="text" value={newMilestone.name}
                    onChange={(e) => setNewMilestone({ ...newMilestone, name: e.target.value })}
                    placeholder="e.g. Editing, Cover Design"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => createMilestoneMutation.mutate()}
                  disabled={!newMilestone.code || !newMilestone.name || createMilestoneMutation.isPending}
                  className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
                  {createMilestoneMutation.isPending ? 'Creating...' : 'Create Milestone'}
                </button>
                <button type="button" onClick={() => setShowNewMilestone(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Task Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Task Details</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input type="text" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. First round of manuscript editing"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Detailed description of the task..." />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm">
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Time & Cost */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Time & Cost</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Allocated Hours</label>
              <input type="number" min={0} step={0.5} value={form.allocatedHours}
                onChange={(e) => setForm({ ...form, allocatedHours: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (ZAR)</label>
              <input type="number" min={0} step={0.01} value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">Auto-filled from staff rate</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost</label>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
                R {totalCost.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Deliverables */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Deliverables</h3>

          <div className="space-y-2">
            {form.deliverables.map((d, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={d}
                  onChange={(e) => updateDeliverable(i, e.target.value)}
                  placeholder={`Deliverable ${i + 1}`}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => removeDeliverable(i)}
                  className="text-red-400 hover:text-red-600 px-2 text-sm" title="Remove">
                  X
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addDeliverable}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            + Add Deliverable
          </button>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
          <button type="button" onClick={() => navigate(`/project-management/projects/${projectId}/tasks`)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

type TaskRequest = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
  title: string;
  description: string;
  justification: string;
  estimatedHours: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  project: { id: string; number: string; name: string } | null;
  requestedBy: { id: string; name: string; role: string } | null;
  linkedTask: { id: string; number: string; title: string } | null;
  createdTask: { id: string; number: string; title: string } | null;
};

type Milestone = { id: string; name: string };

export function TaskRequestsInbox() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO' | 'ALL'>('PENDING');
  const [active, setActive] = useState<TaskRequest | null>(null);
  const [approveForm, setApproveForm] = useState({
    milestoneId: '',
    allocatedHours: '',
    hourlyRate: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    dueDate: '',
    reviewNotes: '',
  });
  const [rejectNotes, setRejectNotes] = useState('');
  const [needsInfoNotes, setNeedsInfoNotes] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['task-requests', filter],
    queryFn: () =>
      api<{ data: TaskRequest[] }>(
        `/project-management/task-requests${filter === 'ALL' ? '' : `?status=${filter}`}`,
      ),
  });

  const milestonesQuery = useQuery({
    queryKey: ['project-milestones', active?.project?.id],
    queryFn: () =>
      api<{ data: Milestone[] }>(`/budgeting/projects/${active?.project?.id}/milestones`),
    enabled: !!active?.project?.id,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['task-requests'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/project-management/task-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          milestoneId: approveForm.milestoneId || null,
          allocatedHours: Number(approveForm.allocatedHours),
          hourlyRate: Number(approveForm.hourlyRate),
          priority: approveForm.priority,
          dueDate: approveForm.dueDate || null,
          reviewNotes: approveForm.reviewNotes || null,
        }),
      }),
    onSuccess: async () => {
      await refresh();
      showToast('success', 'Task created.');
      setActive(null);
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to approve.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/project-management/task-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewNotes: rejectNotes }),
      }),
    onSuccess: async () => {
      await refresh();
      showToast('success', 'Request rejected.');
      setActive(null);
      setRejectNotes('');
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to reject.'),
  });

  const needsInfoMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/project-management/task-requests/${id}/needs-info`, {
        method: 'POST',
        body: JSON.stringify({ reviewNotes: needsInfoNotes }),
      }),
    onSuccess: async () => {
      await refresh();
      showToast('success', 'Asked staff for more info.');
      setActive(null);
      setNeedsInfoNotes('');
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to send.'),
  });

  const openActive = (r: TaskRequest) => {
    setActive(r);
    setApproveForm({
      milestoneId: '',
      allocatedHours: r.estimatedHours,
      hourlyRate: '',
      priority: 'MEDIUM',
      dueDate: '',
      reviewNotes: '',
    });
    setRejectNotes('');
    setNeedsInfoNotes('');
  };

  const items = data?.data || [];

  return (
    <div>
      {toast && (
        <div className="mb-3">
          <div className={`rounded border px-3 py-2 text-sm ${toast.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {toast.message}
          </div>
        </div>
      )}
      <PageHeader title="Task Requests" subtitle="Review tasks staff have asked you to add" />

      <div className="mb-4 flex flex-wrap gap-2">
        {(['PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              filter === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Requested by</th>
              <th className="px-3 py-2 text-right">Est. hours</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">Loading…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">No task requests in this view.</td></tr>
            )}
            {items.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-900">{r.title}</td>
                <td className="px-3 py-2 text-gray-700">{r.project?.number} — {r.project?.name}</td>
                <td className="px-3 py-2 text-gray-700">{r.requestedBy?.name}</td>
                <td className="px-3 py-2 text-right text-gray-900">{Number(r.estimatedHours).toFixed(1)}h</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] ${
                    r.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    r.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    r.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {r.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-ZA')}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => openActive(r)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{active.title}</h3>
                <p className="text-xs text-gray-500">
                  {active.project?.number} — {active.project?.name} · Requested by {active.requestedBy?.name}
                </p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setActive(null)}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">What they'd be doing</p>
                <p className="whitespace-pre-wrap text-gray-800">{active.description}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Why it's needed</p>
                <p className="whitespace-pre-wrap text-gray-800">{active.justification}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Estimated hours</p>
                <p className="text-gray-800">{Number(active.estimatedHours).toFixed(1)}h</p>
              </div>
              {active.linkedTask && (
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Linked task</p>
                  <p className="text-gray-800">{active.linkedTask.number} — {active.linkedTask.title}</p>
                </div>
              )}
              {active.createdTask && (
                <div className="rounded border border-green-200 bg-green-50 p-2">
                  <p className="text-xs font-medium text-green-800">Created task: {active.createdTask.number} — {active.createdTask.title}</p>
                </div>
              )}
              {active.reviewNotes && (
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Review notes</p>
                  <p className="whitespace-pre-wrap text-gray-800">{active.reviewNotes}</p>
                </div>
              )}
            </div>

            {(active.status === 'PENDING' || active.status === 'NEEDS_INFO') && (
              <>
                <div className="mt-5 rounded border border-green-200 bg-green-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-green-800">Approve and create task</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600">Milestone</label>
                      <select
                        value={approveForm.milestoneId}
                        onChange={(e) => setApproveForm({ ...approveForm, milestoneId: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="">— None —</option>
                        {(milestonesQuery.data?.data || []).map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Priority</label>
                      <select
                        value={approveForm.priority}
                        onChange={(e) => setApproveForm({ ...approveForm, priority: e.target.value as any })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Allocated hours</label>
                      <input
                        type="number" min={0.25} step="0.25"
                        value={approveForm.allocatedHours}
                        onChange={(e) => setApproveForm({ ...approveForm, allocatedHours: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Hourly rate (R)</label>
                      <input
                        type="number" min={0} step="1"
                        value={approveForm.hourlyRate}
                        onChange={(e) => setApproveForm({ ...approveForm, hourlyRate: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Due date (optional)</label>
                      <input
                        type="date"
                        value={approveForm.dueDate}
                        onChange={(e) => setApproveForm({ ...approveForm, dueDate: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Optional approval notes…"
                    value={approveForm.reviewNotes}
                    onChange={(e) => setApproveForm({ ...approveForm, reviewNotes: e.target.value })}
                    className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => approveMutation.mutate(active.id)}
                    disabled={approveMutation.isPending || !approveForm.allocatedHours || !approveForm.hourlyRate}
                    className="mt-2 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {approveMutation.isPending ? 'Creating…' : 'Approve & Create Task'}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded border border-blue-200 bg-blue-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-blue-800">Ask for more info</p>
                    <textarea
                      rows={2}
                      value={needsInfoNotes}
                      onChange={(e) => setNeedsInfoNotes(e.target.value)}
                      placeholder="What clarification do you need?"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => needsInfoMutation.mutate(active.id)}
                      disabled={needsInfoMutation.isPending || !needsInfoNotes.trim() || active.status !== 'PENDING'}
                      className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>

                  <div className="rounded border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-red-800">Reject</p>
                    <textarea
                      rows={2}
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder="Reason for rejection"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => rejectMutation.mutate(active.id)}
                      disabled={rejectMutation.isPending || !rejectNotes.trim()}
                      className="mt-2 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface PendingDeliverable {
  id: string;
  title: string;
  description: string | null;
  estimatedHours: string | null;
  status: string;
  submittedAt: string | null;
  taskAssignment: {
    id: string;
    number: string;
    title: string;
    staffMember: { id: string; name: string } | null;
    project: { id: string; name: string; number: string } | null;
  };
}

export function DeliverableReviewQueue() {
  const queryClient = useQueryClient();
  const [rejectModal, setRejectModal] = useState<{ id: string; taskId: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['deliverable-review-queue'],
    queryFn: () => api<{ data: PendingDeliverable[] }>('/project-management/deliverables/review-queue'),
  });

  const pending = data?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: ({ taskId, deliverableId }: { taskId: string; deliverableId: string }) =>
      api(`/project-management/tasks/${taskId}/deliverables/${deliverableId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverable-review-queue'] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ taskId, deliverableId, reason }: { taskId: string; deliverableId: string; reason: string }) =>
      api(`/project-management/tasks/${taskId}/deliverables/${deliverableId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverable-review-queue'] });
      setRejectModal(null);
      setRejectReason('');
    },
    onError: (err: Error) => alert(err.message),
  });

  return (
    <div>
      <PageHeader
        title="Deliverable Review Queue"
        backTo={{ label: 'PM Dashboard', href: '/pm' }}
      />

      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>}

      {!isLoading && pending.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-gray-400 text-sm">No deliverables pending review.</p>
          <p className="text-xs text-gray-400 mt-1">Staff-submitted deliverables will appear here for approval.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            {pending.length} deliverable{pending.length !== 1 ? 's' : ''} awaiting review
          </p>
          {pending.map((d) => (
            <div key={d.id} className="rounded-lg border border-purple-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      SUBMITTED
                    </span>
                    {d.estimatedHours && (
                      <span className="text-xs text-gray-400">est. {Number(d.estimatedHours).toFixed(1)}h</span>
                    )}
                    {d.submittedAt && (
                      <span className="text-xs text-gray-400">
                        Submitted {new Date(d.submittedAt).toLocaleDateString('en-ZA')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900">{d.title}</p>
                  {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}

                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span>Task: <Link to={`/pm/tasks/${d.taskAssignment.id}`} className="text-blue-600 hover:underline">
                      {d.taskAssignment.number} — {d.taskAssignment.title}
                    </Link></span>
                    {d.taskAssignment.staffMember && <span>Staff: <strong>{d.taskAssignment.staffMember.name}</strong></span>}
                    {d.taskAssignment.project && (
                      <span>Project: <Link to={`/pm/projects/${d.taskAssignment.project.id}`} className="text-blue-600 hover:underline">
                        {d.taskAssignment.project.number}
                      </Link></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => approveMutation.mutate({ taskId: d.taskAssignment.id, deliverableId: d.id })}
                    disabled={approveMutation.isPending}
                    className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                    Approve
                  </button>
                  <button
                    onClick={() => { setRejectModal({ id: d.id, taskId: d.taskAssignment.id, title: d.title }); setRejectReason(''); }}
                    className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                    Return
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Return for Rework</h3>
            <p className="text-sm text-gray-600 mb-3">
              Deliverable: <span className="font-medium">{rejectModal.title}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain what needs to be revised or improved..."
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={() => rejectMutation.mutate({ taskId: rejectModal.taskId, deliverableId: rejectModal.id, reason: rejectReason })}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {rejectMutation.isPending ? 'Returning...' : 'Return for Rework'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

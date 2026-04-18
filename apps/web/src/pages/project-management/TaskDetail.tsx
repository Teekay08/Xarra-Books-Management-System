import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { usePermissions } from '../../hooks/usePermissions';

interface TimeLog {
  id: string;
  workDate: string;
  hours: string;
  description: string;
  status: string;
  rejectionReason?: string | null;
}

interface ExtensionRequest {
  id: string;
  requestedHours: number;
  reason: string;
  status: string;
  createdAt: string;
}

interface Deliverable {
  id: string;
  taskAssignmentId: string;
  title: string;
  description: string | null;
  estimatedHours: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  sortOrder: number;
  rejectionReason: string | null;
  submittedAt: string | null;
}

interface Task {
  id: string;
  number: string;  // TA-YYYY-NNNN
  title: string;
  description: string | null;
  priority: string;
  status: string;
  allocatedHours: string;
  loggedHours: string;
  remainingHours: string;
  hourlyRate: string;
  timeExhausted: boolean;
  startDate: string | null;
  dueDate: string | null;
  staffMember: { id: string; name: string; email: string } | null;
  project: { id: string; name: string; number: string } | null;
  milestone: { id: string; name: string } | null;
  timeLogs: TimeLog[];
  extensionRequests: ExtensionRequest[];
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const timeLogStatusColors: Record<string, string> = {
  LOGGED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const extensionStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
};

const deliverableStatusColors: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  SUBMITTED: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function TaskDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { isAdmin, isProjectManager } = usePermissions();
  const isPM = isAdmin || isProjectManager;

  // Get current user to check if they're the assigned staff
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { id: string } }>('/me'),
  });

  const [logForm, setLogForm] = useState({ date: '', hours: '', description: '' });
  const [logError, setLogError] = useState('');
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [extensionForm, setExtensionForm] = useState({ requestedHours: '', reason: '' });
  const [extensionError, setExtensionError] = useState('');
  const [approvalForm, setApprovalForm] = useState<{ extId: string; grantedHours: string; notes: string } | null>(null);
  const [transitionError, setTransitionError] = useState('');
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [rejectModal, setRejectModal] = useState<{ logId: string; staffName: string; hours: string; description: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Deliverable state
  const [newDelivForm, setNewDelivForm] = useState({ title: '', description: '', estimatedHours: '' });
  const [showNewDeliv, setShowNewDeliv] = useState(false);
  const [delivLogForm, setDelivLogForm] = useState<{ deliverableId: string; date: string; hours: string; description: string } | null>(null);
  const [delivRejectModal, setDelivRejectModal] = useState<{ deliverableId: string; title: string } | null>(null);
  const [delivRejectReason, setDelivRejectReason] = useState('');
  const [delivError, setDelivError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pm-task', id],
    queryFn: () => api<{ data: Task }>(`/project-management/tasks/${id}`),
    enabled: !!id,
  });

  const task = data?.data;

  // Map status to the correct backend endpoint
  const STATUS_ENDPOINTS: Record<string, string> = {
    IN_PROGRESS: 'start',
    REVIEW: 'submit-review',
    COMPLETED: 'complete',
    SEND_BACK: 'send-back',
  };

  const transitionMutation = useMutation({
    mutationFn: ({ status, body }: { status: string; body?: Record<string, any> }) => {
      const endpoint = STATUS_ENDPOINTS[status];
      return api(`/project-management/tasks/${id}/${endpoint}`, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
    },
    onError: (err: Error) => setTransitionError(err.message),
  });

  const logTimeMutation = useMutation({
    mutationFn: () =>
      api(`/project-management/tasks/${id}/log-time`, {
        method: 'POST',
        body: JSON.stringify({
          workDate: logForm.date,
          hours: Number(logForm.hours),
          description: logForm.description,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
      setLogForm({ date: '', hours: '', description: '' });
      setLogError('');
    },
    onError: (err: Error) => setLogError(err.message),
  });

  const approveLogMutation = useMutation({
    mutationFn: ({ logId, action, reason }: { logId: string; action: 'approve' | 'reject'; reason?: string }) =>
      api(`/project-management/time-logs/${logId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const extensionMutation = useMutation({
    mutationFn: ({ extId, action, grantedHours, notes }: { extId: string; action: 'approve' | 'decline'; grantedHours?: number; notes?: string }) =>
      api(`/project-management/extensions/${extId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ grantedHours, notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
      setApprovalForm(null);
    },
    onError: (err: Error) => alert(err.message),
  });

  const requestExtensionMutation = useMutation({
    mutationFn: () =>
      api(`/project-management/tasks/${id}/request-extension`, {
        method: 'POST',
        body: JSON.stringify({
          requestedHours: Number(extensionForm.requestedHours),
          reason: extensionForm.reason,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
      setShowExtensionForm(false);
      setExtensionForm({ requestedHours: '', reason: '' });
      setExtensionError('');
    },
    onError: (err: Error) => setExtensionError(err.message),
  });

  // Deliverable queries & mutations
  const { data: delivData, isLoading: delivLoading } = useQuery({
    queryKey: ['task-deliverables', id],
    queryFn: () => api<{ data: Deliverable[] }>(`/project-management/tasks/${id}/deliverables`),
    enabled: !!id,
  });
  const deliverables = delivData?.data ?? [];

  const invalidateDeliverables = () => {
    queryClient.invalidateQueries({ queryKey: ['task-deliverables', id] });
    queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
  };

  const addDeliverableMutation = useMutation({
    mutationFn: () =>
      api(`/project-management/tasks/${id}/deliverables`, {
        method: 'POST',
        body: JSON.stringify({
          title: newDelivForm.title,
          description: newDelivForm.description || undefined,
          estimatedHours: newDelivForm.estimatedHours ? Number(newDelivForm.estimatedHours) : undefined,
        }),
      }),
    onSuccess: () => {
      invalidateDeliverables();
      setNewDelivForm({ title: '', description: '', estimatedHours: '' });
      setShowNewDeliv(false);
      setDelivError('');
    },
    onError: (err: Error) => setDelivError(err.message),
  });

  const logDeliverableMutation = useMutation({
    mutationFn: ({ deliverableId, date, hours, description }: { deliverableId: string; date: string; hours: number; description: string }) =>
      api(`/project-management/tasks/${id}/deliverables/${deliverableId}/log`, {
        method: 'POST',
        body: JSON.stringify({ workDate: date, hours, description }),
      }),
    onSuccess: () => {
      invalidateDeliverables();
      setDelivLogForm(null);
      setDelivError('');
    },
    onError: (err: Error) => setDelivError(err.message),
  });

  const submitDeliverableMutation = useMutation({
    mutationFn: (deliverableId: string) =>
      api(`/project-management/tasks/${id}/deliverables/${deliverableId}/submit`, { method: 'POST' }),
    onSuccess: () => invalidateDeliverables(),
    onError: (err: Error) => alert(err.message),
  });

  const approveDeliverableMutation = useMutation({
    mutationFn: (deliverableId: string) =>
      api(`/project-management/tasks/${id}/deliverables/${deliverableId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      invalidateDeliverables();
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const rejectDeliverableMutation = useMutation({
    mutationFn: ({ deliverableId, reason }: { deliverableId: string; reason: string }) =>
      api(`/project-management/tasks/${id}/deliverables/${deliverableId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: reason }),
      }),
    onSuccess: () => {
      invalidateDeliverables();
      setDelivRejectModal(null);
      setDelivRejectReason('');
    },
    onError: (err: Error) => alert(err.message),
  });

  if (isLoading) {
    return <div className="py-12 text-center text-gray-400">Loading task...</div>;
  }

  if (!task) {
    return <div className="py-12 text-center text-gray-500">Task not found.</div>;
  }

  // Check if current user is the assigned staff member
  const currentUserId = meData?.user?.id;
  const isAssignedStaff = !!(task.staffMember as any)?.userId && (task.staffMember as any)?.userId === currentUserId;
  const canRequestExtension = isAssignedStaff && !isPM; // staff requests, PM approves
  const canApproveExtension = isPM;
  const canLogTime = isAssignedStaff || isPM; // both can log (PM logs on behalf)

  return (
    <div>
      <PageHeader
        title={`${task.number}: ${task.title}`}
        backTo={{ label: 'Tasks', href: task.project?.id ? `/pm/projects/${task.project.id}/tasks` : '/pm/staff' }}
        action={
          <button onClick={() => window.print()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 print:hidden">
            Print / Save as PDF
          </button>
        }
      />

      {/* Status badge next to header */}
      <div className="-mt-4 mb-4">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[task.status] || ''}`}>
          {task.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Time Exhausted Warning + Extension Request */}
      {task.timeExhausted && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800">
              {canRequestExtension
                ? 'Your allocated time is exhausted. Request an extension from your Project Manager to log additional hours.'
                : isPM
                  ? 'Allocated time exhausted. Waiting for staff to request an extension, or you can grant additional hours below.'
                  : 'Allocated time exhausted.'}
            </p>
            {canRequestExtension && !showExtensionForm && (
              <button onClick={() => setShowExtensionForm(true)}
                className="rounded-md bg-red-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-800">
                Request Extension
              </button>
            )}
          </div>

          {showExtensionForm && canRequestExtension && (
            <div className="mt-4 rounded-md bg-white border border-red-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">Request Time Extension</h4>
              {extensionError && <p className="text-xs text-red-600">{extensionError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Additional Hours Needed *</label>
                  <input type="number" min={0.5} step={0.5} value={extensionForm.requestedHours}
                    onChange={(e) => setExtensionForm({ ...extensionForm, requestedHours: e.target.value })}
                    placeholder="e.g. 8"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={() => requestExtensionMutation.mutate()}
                    disabled={!extensionForm.requestedHours || !extensionForm.reason || requestExtensionMutation.isPending}
                    className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                    {requestExtensionMutation.isPending ? 'Submitting...' : 'Submit Request'}
                  </button>
                  <button onClick={() => { setShowExtensionForm(false); setExtensionError(''); }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason *</label>
                <textarea rows={2} value={extensionForm.reason}
                  onChange={(e) => setExtensionForm({ ...extensionForm, reason: e.target.value })}
                  placeholder="Explain why additional time is needed..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Assigned To</p>
          <p className="text-sm font-medium text-gray-900 mt-1">{task.staffMember?.name || '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Project</p>
          <p className="text-sm font-medium text-gray-900 mt-1">{task.project?.number || '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Milestone</p>
          <p className="text-sm font-medium text-gray-900 mt-1">{task.milestone?.name || '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Priority</p>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${priorityColors[task.priority] || ''}`}>
            {task.priority}
          </span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Allocated Hours</p>
          <p className="text-sm font-medium text-gray-900 mt-1 font-mono">{Number(task.allocatedHours).toFixed(1)}h</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Logged Hours</p>
          <p className="text-sm font-medium text-gray-900 mt-1 font-mono">{Number(task.loggedHours).toFixed(1)}h</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Remaining</p>
          <p className={`text-sm font-medium mt-1 font-mono ${Number(task.remainingHours) <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {Number(task.remainingHours).toFixed(1)}h
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Cost</p>
          <p className="text-sm font-medium text-gray-900 mt-1">R {(Number(task.loggedHours) * Number(task.hourlyRate)).toFixed(2)}</p>
        </div>
      </div>

      {/* Workflow Actions — enforced by backend */}
      {(() => {
        const logs = task.timeLogs || [];
        const totalLogs = logs.length;
        const approvedLogs = logs.filter((l: any) => l.status === 'APPROVED').length;
        const pendingLogs = logs.filter((l: any) => l.status === 'LOGGED').length;
        const rejectedLogs = logs.filter((l: any) => l.status === 'REJECTED').length;
        const pendingExtensions = (task.extensionRequests || []).filter((e: any) => e.status === 'PENDING').length;

        // Readiness checks for submit-for-review
        const canSubmitForReview = totalLogs > 0 && pendingLogs === 0 && rejectedLogs === 0;
        // Readiness checks for complete
        const canComplete = pendingLogs === 0 && rejectedLogs === 0 && pendingExtensions === 0;

        return (
          <div className="mb-6 space-y-3">
            {/* Transition error from backend */}
            {transitionError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {transitionError}
                <button onClick={() => setTransitionError('')} className="ml-2 underline text-xs">dismiss</button>
              </div>
            )}

            {/* Workflow status guide */}
            {task.status === 'IN_PROGRESS' && isAssignedStaff && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                <p className="font-medium">What's needed to submit for review:</p>
                <ul className="mt-1 text-xs space-y-0.5">
                  <li className={totalLogs > 0 ? 'text-green-700' : 'text-gray-500'}>{totalLogs > 0 ? '✓' : '○'} Log at least one time entry</li>
                  <li className={pendingLogs === 0 && totalLogs > 0 ? 'text-green-700' : 'text-gray-500'}>{pendingLogs === 0 && totalLogs > 0 ? '✓' : '○'} All time logs approved by PM ({approvedLogs}/{totalLogs} approved)</li>
                  <li className={rejectedLogs === 0 ? 'text-green-700' : 'text-red-600'}>{rejectedLogs === 0 ? '✓' : '✗'} No rejected time logs ({rejectedLogs} rejected)</li>
                </ul>
              </div>
            )}

            {task.status === 'REVIEW' && isPM && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                <p className="font-medium">Review checklist:</p>
                <ul className="mt-1 text-xs space-y-0.5">
                  <li className={pendingLogs === 0 ? 'text-green-700' : 'text-amber-600'}>{pendingLogs === 0 ? '✓' : '○'} All time logs reviewed ({pendingLogs} pending)</li>
                  <li className={rejectedLogs === 0 ? 'text-green-700' : 'text-red-600'}>{rejectedLogs === 0 ? '✓' : '✗'} No rejected logs outstanding ({rejectedLogs} rejected)</li>
                  <li className={pendingExtensions === 0 ? 'text-green-700' : 'text-amber-600'}>{pendingExtensions === 0 ? '✓' : '○'} All extension requests resolved ({pendingExtensions} pending)</li>
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* ASSIGNED → IN_PROGRESS: assigned staff starts working */}
              {task.status === 'ASSIGNED' && (isAssignedStaff || isPM) && (
                <button onClick={() => { setTransitionError(''); transitionMutation.mutate({ status: 'IN_PROGRESS' }); }}
                  disabled={transitionMutation.isPending}
                  className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50">
                  {isAssignedStaff ? 'Start Working' : 'Start Task'}
                </button>
              )}

              {/* IN_PROGRESS → REVIEW: staff submits (backend enforces time log requirements) */}
              {task.status === 'IN_PROGRESS' && isAssignedStaff && (
                <button onClick={() => { setTransitionError(''); transitionMutation.mutate({ status: 'REVIEW' }); }}
                  disabled={transitionMutation.isPending || !canSubmitForReview}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${canSubmitForReview ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 cursor-not-allowed'}`}>
                  Submit for Review
                </button>
              )}

              {/* REVIEW → COMPLETED: PM approves (backend enforces all checks) */}
              {task.status === 'REVIEW' && isPM && (
                <>
                  <button onClick={() => { setTransitionError(''); transitionMutation.mutate({ status: 'COMPLETED' }); }}
                    disabled={transitionMutation.isPending || !canComplete}
                    className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${canComplete ? 'bg-green-700 hover:bg-green-800' : 'bg-gray-400 cursor-not-allowed'}`}>
                    Approve & Complete
                  </button>
                  <button onClick={() => setShowSendBack(true)}
                    disabled={transitionMutation.isPending}
                    className="rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50">
                    Send Back for Rework
                  </button>
                </>
              )}
            </div>

            {/* Send Back Modal */}
            {showSendBack && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Send Back for Rework</h3>
                  <p className="text-sm text-gray-600 mb-3">This will move the task back to IN PROGRESS so the staff member can address the issues.</p>
                  <textarea
                    value={sendBackReason}
                    onChange={(e) => setSendBackReason(e.target.value)}
                    placeholder="Reason for sending back (required)..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowSendBack(false); setSendBackReason(''); }}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
                    <button
                      onClick={() => {
                        setTransitionError('');
                        transitionMutation.mutate({ status: 'SEND_BACK', body: { reason: sendBackReason } }, {
                          onSuccess: () => { setShowSendBack(false); setSendBackReason(''); },
                        });
                      }}
                      disabled={!sendBackReason.trim() || transitionMutation.isPending}
                      className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                      {transitionMutation.isPending ? 'Sending...' : 'Send Back'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Description */}
      {task.description && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* Deliverables Panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Deliverables
            {deliverables.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({deliverables.filter((d) => d.status === 'APPROVED').length}/{deliverables.length} approved)
              </span>
            )}
          </h3>
          {isPM && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
            <button onClick={() => setShowNewDeliv(!showNewDeliv)}
              className="text-xs rounded-md bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800">
              + Add Deliverable
            </button>
          )}
        </div>

        {delivError && <p className="mb-3 text-xs text-red-600">{delivError}</p>}

        {/* Add deliverable inline form */}
        {showNewDeliv && isPM && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-800">New Deliverable</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Title *</label>
                <input type="text" value={newDelivForm.title}
                  onChange={(e) => setNewDelivForm({ ...newDelivForm, title: e.target.value })}
                  placeholder="e.g. Draft manuscript chapter 1"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Est. Hours</label>
                <input type="number" min={0.5} step={0.5} value={newDelivForm.estimatedHours}
                  onChange={(e) => setNewDelivForm({ ...newDelivForm, estimatedHours: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input type="text" value={newDelivForm.description}
                onChange={(e) => setNewDelivForm({ ...newDelivForm, description: e.target.value })}
                placeholder="Optional acceptance criteria or notes..."
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                  if (!newDelivForm.title.trim()) { setDelivError('Title is required'); return; }
                  addDeliverableMutation.mutate();
                }}
                disabled={addDeliverableMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
                {addDeliverableMutation.isPending ? 'Saving...' : 'Save Deliverable'}
              </button>
              <button onClick={() => { setShowNewDeliv(false); setDelivError(''); }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700">Cancel</button>
            </div>
          </div>
        )}

        {delivLoading && <p className="text-sm text-gray-400">Loading deliverables...</p>}

        {!delivLoading && deliverables.length === 0 && (
          <p className="text-sm text-gray-400">
            {isPM ? 'No deliverables defined yet. Add deliverables to track staff work.' : 'No deliverables assigned yet.'}
          </p>
        )}

        <div className="space-y-3">
          {deliverables.map((d) => (
            <div key={d.id} className={`rounded-md border p-4 ${d.status === 'APPROVED' ? 'border-green-200 bg-green-50' : d.status === 'SUBMITTED' ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{d.title}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${deliverableStatusColors[d.status]}`}>
                      {d.status.replace(/_/g, ' ')}
                    </span>
                    {d.estimatedHours && (
                      <span className="text-xs text-gray-400">est. {Number(d.estimatedHours).toFixed(1)}h</span>
                    )}
                  </div>
                  {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
                  {d.rejectionReason && d.status === 'IN_PROGRESS' && (
                    <p className="text-xs text-red-600 mt-1">Returned: {d.rejectionReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Staff: log work on deliverable */}
                  {isAssignedStaff && d.status !== 'APPROVED' && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                    <button onClick={() => setDelivLogForm({ deliverableId: d.id, date: '', hours: '', description: '' })}
                      className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200">
                      Log Work
                    </button>
                  )}
                  {/* Staff: submit for review */}
                  {isAssignedStaff && (d.status === 'IN_PROGRESS') && (
                    <button onClick={() => submitDeliverableMutation.mutate(d.id)}
                      disabled={submitDeliverableMutation.isPending}
                      className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50">
                      Submit for Review
                    </button>
                  )}
                  {/* PM: approve / reject submitted */}
                  {isPM && d.status === 'SUBMITTED' && (
                    <>
                      <button onClick={() => approveDeliverableMutation.mutate(d.id)}
                        disabled={approveDeliverableMutation.isPending}
                        className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50">
                        Approve
                      </button>
                      <button onClick={() => { setDelivRejectModal({ deliverableId: d.id, title: d.title }); setDelivRejectReason(''); }}
                        className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
                        Return
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline log work form for this deliverable */}
              {delivLogForm?.deliverableId === d.id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <h5 className="text-xs font-semibold text-gray-700 mb-2">Log Work on: {d.title}</h5>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date *</label>
                      <input type="date" value={delivLogForm.date}
                        onChange={(e) => setDelivLogForm({ ...delivLogForm, date: e.target.value })}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Hours *</label>
                      <input type="number" step="0.25" min="0.25" value={delivLogForm.hours}
                        onChange={(e) => setDelivLogForm({ ...delivLogForm, hours: e.target.value })}
                        className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-gray-500 mb-1">Description *</label>
                      <input type="text" value={delivLogForm.description}
                        onChange={(e) => setDelivLogForm({ ...delivLogForm, description: e.target.value })}
                        placeholder="What did you work on..."
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!delivLogForm.date || !delivLogForm.hours || !delivLogForm.description) {
                            setDelivError('Date, hours, and description are required');
                            return;
                          }
                          logDeliverableMutation.mutate({
                            deliverableId: d.id,
                            date: delivLogForm.date,
                            hours: Number(delivLogForm.hours),
                            description: delivLogForm.description,
                          });
                        }}
                        disabled={logDeliverableMutation.isPending}
                        className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
                        {logDeliverableMutation.isPending ? 'Logging...' : 'Log'}
                      </button>
                      <button onClick={() => { setDelivLogForm(null); setDelivError(''); }}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Deliverable Rejection Modal */}
      {delivRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Return Deliverable for Rework</h3>
            <p className="text-sm text-gray-600 mb-1">Deliverable: <span className="font-medium">{delivRejectModal.title}</span></p>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea value={delivRejectReason} onChange={(e) => setDelivRejectReason(e.target.value)}
                placeholder="Explain what needs to be fixed or improved..."
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" autoFocus />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setDelivRejectModal(null); setDelivRejectReason(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={() => rejectDeliverableMutation.mutate({ deliverableId: delivRejectModal.deliverableId, reason: delivRejectReason })}
                disabled={!delivRejectReason.trim() || rejectDeliverableMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {rejectDeliverableMutation.isPending ? 'Returning...' : 'Return for Rework'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Logs */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Time Logs</h3>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {task.timeLogs?.map((log) => (
                <tr key={log.id} className={log.status === 'REJECTED' ? 'bg-red-50' : ''}>
                  <td className="px-4 py-2 text-sm text-gray-700">{new Date(log.workDate).toLocaleDateString('en-ZA')}</td>
                  <td className="px-4 py-2 text-sm text-right font-mono">{Number(log.hours).toFixed(1)}h</td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {log.description}
                    {log.status === 'REJECTED' && log.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">Rejection reason: {log.rejectionReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${timeLogStatusColors[log.status] || ''}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-right">
                    {log.status === 'LOGGED' && isPM && (
                      <ActionMenu items={[
                        { label: 'Approve', onClick: () => approveLogMutation.mutate({ logId: log.id, action: 'approve' }) },
                        { label: 'Reject', variant: 'danger', onClick: () => {
                          setRejectModal({ logId: log.id, staffName: task.staffMember?.name || 'Staff', hours: log.hours, description: log.description });
                          setRejectReason('');
                        }},
                      ]} />
                    )}
                    {log.status === 'REJECTED' && isAssignedStaff && (
                      <button onClick={() => {
                        // Re-log the same hours as a dispute/correction
                        setLogForm({ date: log.workDate.split('T')[0], hours: log.hours, description: `[DISPUTE] ${log.description} — original rejected: ${log.rejectionReason || 'no reason given'}` });
                      }}
                        className="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200">
                        Dispute / Re-submit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(!task.timeLogs || task.timeLogs.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-400">No time logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Log Time Inline Form */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Log Time</h4>
          {logError && (
            <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{logError}</div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={logForm.date}
                onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hours</label>
              <input type="number" step="0.25" min="0" value={logForm.hours}
                onChange={(e) => setLogForm({ ...logForm, hours: e.target.value })}
                className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input type="text" value={logForm.description}
                onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
                placeholder="What was done..."
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!logForm.date || !logForm.hours || !logForm.description) {
                  setLogError('Date, hours, and description are required.');
                  return;
                }
                logTimeMutation.mutate();
              }}
              disabled={logTimeMutation.isPending}
              className="rounded-md bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {logTimeMutation.isPending ? 'Logging...' : 'Log'}
            </button>
          </div>
        </div>
      </div>

      {/* Extension Requests */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Extension Requests</h3>

        {task.extensionRequests?.length > 0 ? (
          <div className="space-y-3">
            {task.extensionRequests.map((ext) => (
              <div key={ext.id} className="flex items-start justify-between rounded-md border border-gray-100 bg-gray-50 p-3">
                <div>
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">+{Number(ext.requestedHours)}h</span> requested
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">{ext.reason}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(ext.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${extensionStatusColors[ext.status] || ''}`}>
                    {ext.status}
                  </span>
                  {ext.status === 'PENDING' && canApproveExtension && approvalForm?.extId !== ext.id && (
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => setApprovalForm({ extId: ext.id, grantedHours: String(Number(ext.requestedHours)), notes: '' })}
                        className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200">
                        Grant Hours
                      </button>
                      <button
                        onClick={() => extensionMutation.mutate({ extId: ext.id, action: 'decline', notes: '' })}
                        disabled={extensionMutation.isPending}
                        className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              {/* Approval form for this extension */}
              {approvalForm?.extId === ext.id && (
                <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 w-full">
                  <p className="text-xs font-semibold text-gray-900 mb-2">Grant Additional Hours</p>
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Hours to Grant *</label>
                      <input type="number" min={0.5} step={0.5} value={approvalForm.grantedHours}
                        onChange={(e) => setApprovalForm({ ...approvalForm, grantedHours: e.target.value })}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
                      <input type="text" value={approvalForm.notes}
                        onChange={(e) => setApprovalForm({ ...approvalForm, notes: e.target.value })}
                        placeholder="e.g. Granted less due to budget constraints"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                    <button onClick={() => extensionMutation.mutate({
                        extId: ext.id,
                        action: 'approve',
                        grantedHours: Number(approvalForm.grantedHours),
                        notes: approvalForm.notes || undefined,
                      })}
                      disabled={!approvalForm.grantedHours || extensionMutation.isPending}
                      className="rounded-md bg-green-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
                      {extensionMutation.isPending ? 'Granting...' : 'Grant'}
                    </button>
                    <button onClick={() => setApprovalForm(null)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700">
                      Cancel
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Staff requested {Number(ext.requestedHours)}h. You can grant more or less.
                  </p>
                </div>
              )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No extension requests.</p>
        )}
      </div>

      {/* Time Log Rejection Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Reject Time Log</h3>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Staff:</span>
                <span className="font-medium text-gray-900">{rejectModal.staffName}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Hours:</span>
                <span className="font-medium text-gray-900">{rejectModal.hours}h</span>
              </div>
              <div className="mt-1">
                <span className="text-gray-600">Work done:</span>
                <p className="text-gray-800 text-xs mt-0.5">{rejectModal.description}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this time log is being rejected. The staff member will see this reason and can dispute or re-submit."
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Be specific — e.g. "Hours seem high for this deliverable" or "Description doesn't match assigned task scope"
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  approveLogMutation.mutate(
                    { logId: rejectModal.logId, action: 'reject', reason: rejectReason || undefined },
                    { onSuccess: () => { setRejectModal(null); setRejectReason(''); } },
                  );
                }}
                disabled={!rejectReason.trim() || approveLogMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {approveLogMutation.isPending ? 'Rejecting...' : 'Reject Time Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

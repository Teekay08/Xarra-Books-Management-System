import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface TimeLog {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: string;
}

interface ExtensionRequest {
  id: string;
  requestedHours: number;
  reason: string;
  status: string;
  createdAt: string;
}

interface Task {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  allocatedHours: number;
  loggedHours: number;
  remainingHours: number;
  hourlyRate: number;
  timeExhausted: boolean;
  startDate: string | null;
  dueDate: string | null;
  deliverables: Array<{ description: string; completed: boolean }>;
  assignedTo: { id: string; name: string } | null;
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

export function TaskDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [logForm, setLogForm] = useState({ date: '', hours: '', description: '' });
  const [logError, setLogError] = useState('');

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
  };

  const transitionMutation = useMutation({
    mutationFn: (newStatus: string) => {
      const endpoint = STATUS_ENDPOINTS[newStatus];
      return api(`/project-management/tasks/${id}/${endpoint}`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
    },
    onError: (err: Error) => alert(err.message),
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
    mutationFn: ({ logId, action }: { logId: string; action: 'approve' | 'reject' }) =>
      api(`/project-management/time-logs/${logId}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const extensionMutation = useMutation({
    mutationFn: ({ extId, action }: { extId: string; action: 'approve' | 'decline' }) =>
      api(`/project-management/extensions/${extId}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-task', id] });
    },
    onError: (err: Error) => alert(err.message),
  });

  if (isLoading) {
    return <div className="py-12 text-center text-gray-400">Loading task...</div>;
  }

  if (!task) {
    return <div className="py-12 text-center text-gray-500">Task not found.</div>;
  }

  return (
    <div>
      <PageHeader
        title={`${task.taskNumber}: ${task.title}`}
        backTo={{ label: 'Tasks', href: task.project?.id ? `/pm/projects/${task.project.id}/tasks` : '/pm/staff' }}
      />

      {/* Status badge next to header */}
      <div className="-mt-4 mb-4">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[task.status] || ''}`}>
          {task.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Time Exhausted Warning */}
      {task.timeExhausted && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">
            Allocated time exhausted. Staff must request an extension before logging additional hours.
          </p>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Assigned To</p>
          <p className="text-sm font-medium text-gray-900 mt-1">{task.assignedTo?.name || '—'}</p>
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
          <p className="text-sm font-medium text-gray-900 mt-1 font-mono">{task.allocatedHours}h</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Logged Hours</p>
          <p className="text-sm font-medium text-gray-900 mt-1 font-mono">{task.loggedHours}h</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Remaining</p>
          <p className={`text-sm font-medium mt-1 font-mono ${task.remainingHours < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {task.remainingHours}h
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Cost</p>
          <p className="text-sm font-medium text-gray-900 mt-1">R {(task.loggedHours * task.hourlyRate).toFixed(2)}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {task.status === 'ASSIGNED' && (
          <button onClick={() => transitionMutation.mutate('IN_PROGRESS')}
            disabled={transitionMutation.isPending}
            className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50">
            Start Task
          </button>
        )}
        {task.status === 'IN_PROGRESS' && (
          <button onClick={() => transitionMutation.mutate('REVIEW')}
            disabled={transitionMutation.isPending}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
            Submit for Review
          </button>
        )}
        {task.status === 'REVIEW' && (
          <button onClick={() => transitionMutation.mutate('COMPLETED')}
            disabled={transitionMutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            Complete Task
          </button>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* Deliverables Checklist */}
      {task.deliverables?.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Deliverables</h3>
          <ul className="space-y-2">
            {task.deliverables.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={d.completed} className="rounded border-gray-300 text-green-700" readOnly />
                {d.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Time Logs */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Time Logs</h3>

        <div className="overflow-hidden">
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
                <tr key={log.id}>
                  <td className="px-4 py-2 text-sm text-gray-700">{new Date(log.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-sm text-right font-mono">{log.hours}h</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{log.description}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${timeLogStatusColors[log.status] || ''}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-right">
                    {log.status === 'LOGGED' && (
                      <ActionMenu items={[
                        { label: 'Approve', onClick: () => approveLogMutation.mutate({ logId: log.id, action: 'approve' }) },
                        { label: 'Reject', variant: 'danger', onClick: () => approveLogMutation.mutate({ logId: log.id, action: 'reject' }) },
                      ]} />
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
                    <span className="font-medium">+{ext.requestedHours}h</span> requested
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">{ext.reason}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(ext.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${extensionStatusColors[ext.status] || ''}`}>
                    {ext.status}
                  </span>
                  {ext.status === 'PENDING' && (
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => extensionMutation.mutate({ extId: ext.id, action: 'approve' })}
                        disabled={extensionMutation.isPending}
                        className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50">
                        Approve
                      </button>
                      <button
                        onClick={() => extensionMutation.mutate({ extId: ext.id, action: 'decline' })}
                        disabled={extensionMutation.isPending}
                        className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No extension requests.</p>
        )}
      </div>
    </div>
  );
}

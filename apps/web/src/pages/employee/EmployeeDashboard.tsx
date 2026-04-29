import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface MyTask {
  id: string;
  taskNumber: string;
  title: string;
  status: string;
  priority: string;
  allocatedHours: number;
  loggedHours: number;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectNumber: string;
}

interface TimeLogEntry {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: string;
  taskTitle: string;
  projectName: string;
}

interface ExtensionEntry {
  id: string;
  requestedHours: number;
  reason: string;
  status: string;
  createdAt: string;
  taskTitle: string;
  projectName: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
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

export function EmployeeDashboard() {
  const queryClient = useQueryClient();
  const [requestModal, setRequestModal] = useState<{
    projectId: string;
    title: string;
    description: string;
    justification: string;
    estimatedHours: string;
  } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };

  // Get current user info
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { id: string; name: string; email: string; role: string } }>('/me'),
  });

  const { data: tasksData, isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api<{ data: MyTask[] }>('/project-management/my/tasks'),
    retry: false, // Don't retry 400s (no staff profile)
  });

  const noStaffProfileDetected = !!tasksError;

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['my-time-logs'],
    queryFn: () => api<{ data: TimeLogEntry[] }>('/project-management/my/time-logs?limit=10'),
    enabled: !noStaffProfileDetected, // Don't fetch if no staff profile
    retry: false,
  });

  const { data: extensionsData, isLoading: extensionsLoading } = useQuery({
    queryKey: ['my-extensions'],
    queryFn: () => api<{ data: ExtensionEntry[] }>('/project-management/my/extensions?status=PENDING'),
    enabled: !noStaffProfileDetected,
    retry: false,
  });

  const requestTaskMutation = useMutation({
    mutationFn: (payload: {
      projectId: string;
      title: string;
      description: string;
      justification: string;
      estimatedHours: number;
    }) =>
      api('/project-management/task-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      showToast('success', 'Task request sent. Your PM will review it.');
      setRequestModal(null);
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to send task request.'),
  });

  const submitRequest = () => {
    if (!requestModal) return;
    if (!requestModal.projectId) return showToast('error', 'Pick a project.');
    if (!requestModal.title.trim()) return showToast('error', 'Title is required.');
    if (!requestModal.description.trim()) return showToast('error', 'Describe what you need to do.');
    if (!requestModal.justification.trim()) return showToast('error', 'Explain why this task is needed.');
    const hours = Number(requestModal.estimatedHours);
    if (!hours || Number.isNaN(hours) || hours <= 0) return showToast('error', 'Estimated hours must be positive.');
    requestTaskMutation.mutate({
      projectId: requestModal.projectId,
      title: requestModal.title.trim(),
      description: requestModal.description.trim(),
      justification: requestModal.justification.trim(),
      estimatedHours: hours,
    });
  };

  const tasks = tasksData?.data ?? [];
  const logs = logsData?.data ?? [];
  const extensions = extensionsData?.data ?? [];
  const userName = meData?.user?.name || 'there';
  const noStaffProfile = noStaffProfileDetected;

  // Compute summary
  const activeTasks = tasks.filter((t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const totalAllocated = tasks.reduce((s: number, t: any) => s + Number(t.allocatedHours || 0), 0);
  const totalLogged = tasks.reduce((s: number, t: any) => s + Number(t.loggedHours || 0), 0);
  const overdueTasks = tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED');
  const exhaustedTasks = tasks.filter((t: any) => t.timeExhausted);

  return (
    <div>
      <PageHeader title={`Welcome back, ${userName}`} subtitle="Your personal workspace — tasks, time logs, and deadlines" />

      {toast && (
        <div className="mb-3">
          <div className={`rounded border px-3 py-2 text-sm ${toast.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {toast.message}
          </div>
        </div>
      )}

      {!noStaffProfile && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link to="/employee/planner" className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100">
            Open My Planner
          </Link>
          <button
            type="button"
            onClick={() => {
              const firstProject = tasks[0] as any;
              const pid = firstProject?.projectId || firstProject?.project?.id;
              if (!pid) {
                showToast('error', 'You need at least one assigned task on a project before requesting more.');
                return;
              }
              setRequestModal({
                projectId: pid,
                title: '',
                description: '',
                justification: '',
                estimatedHours: '',
              });
            }}
            className="inline-flex rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            + Request Task
          </button>
        </div>
      )}

      {/* No Staff Profile Warning */}
      {noStaffProfile && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5 mb-6 text-center">
          <p className="text-sm font-medium text-yellow-800">Your account isn't linked to a staff profile yet.</p>
          <p className="text-xs text-yellow-600 mt-1">Ask your Project Manager to create a staff profile and link it to your account. Once linked, your assigned tasks will appear here.</p>
        </div>
      )}

      {/* Summary Cards */}
      {!noStaffProfile && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Active Tasks</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{activeTasks.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Hours Logged</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalLogged.toFixed(1)}h</p>
            <p className="text-xs text-gray-400">of {totalAllocated.toFixed(1)}h allocated</p>
          </div>
          <div className={`rounded-lg border p-4 ${overdueTasks.length > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
            <p className={`text-xs uppercase ${overdueTasks.length > 0 ? 'text-red-600' : 'text-gray-500'}`}>Overdue</p>
            <p className={`mt-1 text-2xl font-bold ${overdueTasks.length > 0 ? 'text-red-700' : 'text-gray-900'}`}>{overdueTasks.length}</p>
          </div>
          <div className={`rounded-lg border p-4 ${exhaustedTasks.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
            <p className={`text-xs uppercase ${exhaustedTasks.length > 0 ? 'text-orange-600' : 'text-gray-500'}`}>Time Exhausted</p>
            <p className={`mt-1 text-2xl font-bold ${exhaustedTasks.length > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{exhaustedTasks.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Pending Extensions</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600">{extensions.length}</p>
          </div>
        </div>
      )}

      {/* My Tasks */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">My Tasks</h3>

        {tasksLoading && <p className="text-sm text-gray-400">Loading tasks...</p>}

        {!tasksLoading && tasks.length === 0 && !noStaffProfile && (
          <div className="card p-5 text-center text-sm text-gray-500">
            No tasks assigned to you yet. Your Project Manager will assign tasks when ready.
          </div>
        )}

        {!tasksLoading && tasks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t: any) => {
              const allocated = Number(t.allocatedHours || 0);
              const logged = Number(t.loggedHours || 0);
              const remaining = Number(t.remainingHours || Math.max(0, allocated - logged));
              const pct = allocated > 0 ? Math.min((logged / allocated) * 100, 100) : 0;
              const overBudget = logged > allocated;
              const isExhausted = t.timeExhausted || remaining <= 0;
              const projName = t.project?.name || t.projectName || '';
              const projNumber = t.project?.number || t.projectNumber || '';
              const taskNum = t.number || t.taskNumber || '';
              const daysUntilDue = t.dueDate ? Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000) : null;

              return (
                <Link
                  key={t.id}
                  to={`/pm/tasks/${t.id}`}
                  className={`block rounded-lg border bg-white p-4 hover:shadow-md transition-shadow ${isExhausted ? 'border-red-300' : 'border-gray-200'}`}
                >
                  {isExhausted && (
                    <div className="mb-2 rounded bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
                      TIME EXHAUSTED — Request extension
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-mono text-gray-400">{taskNum}</span>
                    <div className="flex gap-1">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${priorityColors[t.priority] || ''}`}>
                        {t.priority}
                      </span>
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusColors[t.status] || ''}`}>
                        {t.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">{t.title}</p>
                  <p className="text-xs text-gray-500 mb-3">{projNumber} — {projName}</p>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>{logged.toFixed(1)}h / {allocated.toFixed(1)}h logged</span>
                    <span className={remaining > 0 ? 'text-green-700' : 'text-red-600'}>{remaining.toFixed(1)}h left</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full rounded-full bg-gray-200 h-2">
                    <div
                      className={`h-2 rounded-full ${overBudget ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>

                  {t.dueDate && (
                    <p className={`text-xs mt-2 ${daysUntilDue !== null && daysUntilDue < 3 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      Due: {new Date(t.dueDate).toLocaleDateString('en-ZA')}
                      {daysUntilDue !== null && daysUntilDue >= 0 && ` (${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} left)`}
                      {daysUntilDue !== null && daysUntilDue < 0 && ` (${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''} overdue)`}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Time Logs */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Time Logs</h3>

        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logsLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!logsLoading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-700">{new Date(log.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{log.taskTitle}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{log.projectName}</td>
                  <td className="px-4 py-2 text-sm text-right font-mono">{log.hours}h</td>
                  <td className="px-4 py-2 text-sm text-gray-700 max-w-xs truncate">{log.description}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${timeLogStatusColors[log.status] || ''}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!logsLoading && logs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">No time logs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Extensions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending Extension Requests</h3>

        {extensionsLoading && <p className="text-sm text-gray-400">Loading...</p>}

        {!extensionsLoading && extensions.length === 0 && (
          <div className="card p-5 text-center text-sm text-gray-500">
            No pending extension requests.
          </div>
        )}

        {!extensionsLoading && extensions.length > 0 && (
          <div className="space-y-3">
            {extensions.map((ext) => (
              <div key={ext.id} className="card p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    +{ext.requestedHours}h for "{ext.taskTitle}"
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{ext.projectName}</p>
                  <p className="text-sm text-gray-600 mt-1">{ext.reason}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(ext.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${extensionStatusColors[ext.status] || ''}`}>
                  {ext.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md card p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Request Additional Task</h3>
            <p className="mt-1 text-xs text-gray-500">Your PM will review and approve, reject, or ask for more info.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Project</label>
                <select
                  value={requestModal.projectId}
                  onChange={(e) => setRequestModal((prev) => (prev ? { ...prev, projectId: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {Array.from(
                    new Map(
                      tasks
                        .filter((t: any) => t.projectId || t.project?.id)
                        .map((t: any) => {
                          const pid = t.projectId || t.project?.id;
                          return [pid, {
                            id: pid,
                            number: t.projectNumber || t.project?.number || '',
                            name: t.projectName || t.project?.name || '',
                          }];
                        }),
                    ).values(),
                  ).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.number} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Task title</label>
                <input
                  type="text"
                  value={requestModal.title}
                  onChange={(e) => setRequestModal((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Re-edit chapter 3 after author rewrite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">What you'd be doing</label>
                <textarea
                  rows={3}
                  value={requestModal.description}
                  onChange={(e) => setRequestModal((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Why is this needed?</label>
                <textarea
                  rows={2}
                  value={requestModal.justification}
                  onChange={(e) => setRequestModal((prev) => (prev ? { ...prev, justification: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Estimated hours</label>
                <input
                  type="number" min={0.25} step="0.25"
                  value={requestModal.estimatedHours}
                  onChange={(e) => setRequestModal((prev) => (prev ? { ...prev, estimatedHours: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setRequestModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={submitRequest}
                disabled={requestTaskMutation.isPending}
              >
                {requestTaskMutation.isPending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

const logStatusColors: Record<string, string> = {
  LOGGED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function ContractorPortal() {
  const { token } = useParams();
  const queryClient = useQueryClient();
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [logForm, setLogForm] = useState({ workDate: '', hours: '', description: '' });
  const [logError, setLogError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['contractor-portal', token],
    queryFn: () => api<{ data: any }>(`/project-management/contractor-portal/${token}`),
    enabled: !!token,
  });

  const logTimeMutation = useMutation({
    mutationFn: (taskId: string) => api(`/project-management/contractor-portal/${token}/tasks/${taskId}/log-time`, {
      method: 'POST',
      body: JSON.stringify({
        workDate: logForm.workDate,
        hours: Number(logForm.hours),
        description: logForm.description,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-portal', token] });
      setLogForm({ workDate: '', hours: '', description: '' });
      setLogError('');
      setActiveTask(null);
    },
    onError: (err: Error) => setLogError(err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading your workspace...</p>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Invalid or Expired</h1>
          <p className="text-gray-500">This access link is no longer valid. Please contact your project manager for a new one.</p>
        </div>
      </div>
    );
  }

  const { staff, project, tasks } = data.data;

  const totalAllocated = tasks.reduce((s: number, t: any) => s + Number(t.allocatedHours || 0), 0);
  const totalLogged = tasks.reduce((s: number, t: any) => s + Number(t.loggedHours || 0), 0);
  const totalRemaining = Math.max(0, totalAllocated - totalLogged);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-green-800">Xarra Books</h1>
            <p className="text-xs text-gray-500">Contractor Portal</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{staff.name}</p>
            <p className="text-xs text-gray-500">{staff.role} &middot; {project.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Project Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900">{project.name}</h2>
          <p className="text-sm text-gray-500">{project.number} {project.titleName ? `— ${project.titleName}` : ''}</p>
        </div>

        {/* Hours Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Allocated</p>
            <p className="text-xl font-bold text-gray-900">{totalAllocated.toFixed(1)}h</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Logged</p>
            <p className="text-xl font-bold text-blue-700">{totalLogged.toFixed(1)}h</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Remaining</p>
            <p className={`text-xl font-bold ${totalRemaining > 0 ? 'text-green-700' : 'text-red-600'}`}>{totalRemaining.toFixed(1)}h</p>
          </div>
        </div>

        {/* Tasks */}
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Tasks</h3>
        <div className="space-y-4">
          {tasks.map((task: any) => {
            const allocated = Number(task.allocatedHours || 0);
            const logged = Number(task.loggedHours || 0);
            const remaining = Number(task.remainingHours || Math.max(0, allocated - logged));
            const pct = allocated > 0 ? (logged / allocated) * 100 : 0;
            const isActive = activeTask === task.id;

            return (
              <div key={task.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                {/* Task Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{task.number}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[task.status] || ''}`}>
                        {task.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {task.dueDate && (
                      <span className="text-xs text-gray-500">Due: {new Date(task.dueDate).toLocaleDateString('en-ZA')}</span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">{task.title}</h4>
                  {task.description && <p className="text-xs text-gray-600 mt-1">{task.description}</p>}
                  {task.milestone && <p className="text-xs text-gray-400 mt-1">Milestone: {task.milestone}</p>}

                  {/* Hours bar */}
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                    <span>{logged.toFixed(1)}h / {allocated.toFixed(1)}h</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className={remaining > 0 ? 'text-green-700' : 'text-red-600'}>{remaining.toFixed(1)}h left</span>
                  </div>

                  {task.timeExhausted && (
                    <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700 font-medium">
                      Time exhausted. Contact your project manager for an extension.
                    </div>
                  )}

                  {/* Deliverables */}
                  {task.deliverables?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">Deliverables:</p>
                      <ul className="space-y-1">
                        {(task.deliverables as any[]).map((d: any, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                            <input type="checkbox" checked={d.completed} readOnly className="rounded border-gray-300 text-green-600" />
                            {d.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    {!task.timeExhausted && task.status !== 'COMPLETED' && (
                      <button onClick={() => setActiveTask(isActive ? null : task.id)}
                        className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800">
                        {isActive ? 'Cancel' : 'Log Hours'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Log Time Form (inline) */}
                {isActive && (
                  <div className="border-t border-gray-200 bg-green-50 p-4">
                    <h5 className="text-xs font-semibold text-gray-900 mb-2">Log Working Hours</h5>
                    {logError && <p className="text-xs text-red-600 mb-2">{logError}</p>}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Date *</label>
                        <input type="date" value={logForm.workDate} onChange={(e) => setLogForm({ ...logForm, workDate: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Hours *</label>
                        <input type="number" min={0.25} max={24} step={0.25} value={logForm.hours}
                          onChange={(e) => setLogForm({ ...logForm, hours: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div className="flex items-end">
                        <button onClick={() => logTimeMutation.mutate(task.id)}
                          disabled={!logForm.workDate || !logForm.hours || !logForm.description || logTimeMutation.isPending}
                          className="w-full rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
                          {logTimeMutation.isPending ? 'Saving...' : 'Submit'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">What did you work on? *</label>
                      <input type="text" value={logForm.description} onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
                        placeholder="e.g. Edited chapters 3-5, fixed formatting issues"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                )}

                {/* Previous time logs */}
                {task.timeLogs?.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-medium text-gray-700 mb-2">Time Log History</p>
                    <div className="space-y-1">
                      {task.timeLogs.map((log: any) => (
                        <div key={log.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{new Date(log.workDate).toLocaleDateString('en-ZA')}</span>
                            <span className="font-medium">{Number(log.hours).toFixed(1)}h</span>
                            <span className="text-gray-500 truncate max-w-[200px]">{log.description}</span>
                          </div>
                          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${logStatusColors[log.status] || ''}`}>
                            {log.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {tasks.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No tasks assigned yet. Your project manager will assign tasks to you.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          <p>Xarra Books Management System &middot; Contractor Portal</p>
          <p className="mt-1">If you have questions, contact your project manager.</p>
        </div>
      </main>
    </div>
  );
}

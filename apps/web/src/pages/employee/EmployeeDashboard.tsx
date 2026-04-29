import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSession } from '../../lib/auth-client';

interface MyTask {
  id: string; taskNumber: string; title: string; status: string; priority: string;
  allocatedHours: number; loggedHours: number; remainingHours?: number;
  timeExhausted?: boolean; dueDate: string | null;
  projectId: string; projectName: string; projectNumber: string;
}
interface TimeLogEntry {
  id: string; date: string; hours: number; description: string;
  status: string; taskTitle: string; projectName: string;
}
interface ExtensionEntry {
  id: string; requestedHours: number; reason: string; status: string;
  createdAt: string; taskTitle: string; projectName: string;
}

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-gray-300', MEDIUM: 'bg-blue-400', HIGH: 'bg-orange-400', URGENT: 'bg-red-500',
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
};
const LOG_STATUS: Record<string, string> = {
  LOGGED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function EmployeeDashboard() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [requestModal, setRequestModal] = useState<{
    projectId: string; title: string; description: string;
    justification: string; estimatedHours: string;
  } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  const { data: tasksData, isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api<{ data: MyTask[] }>('/project-management/my/tasks'),
    retry: false,
  });

  const noStaffProfile = !!tasksError;

  const { data: logsData } = useQuery({
    queryKey: ['my-time-logs'],
    queryFn: () => api<{ data: TimeLogEntry[] }>('/project-management/my/time-logs?limit=8'),
    enabled: !noStaffProfile, retry: false,
  });

  const { data: extensionsData } = useQuery({
    queryKey: ['my-extensions'],
    queryFn: () => api<{ data: ExtensionEntry[] }>('/project-management/my/extensions?status=PENDING'),
    enabled: !noStaffProfile, retry: false,
  });

  const requestMut = useMutation({
    mutationFn: (p: any) => api('/project-management/task-requests', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-tasks'] }); showToast('success', 'Task request sent — your PM will review it.'); setRequestModal(null); },
    onError: (e: Error) => showToast('error', e.message || 'Failed to send request.'),
  });

  const tasks      = tasksData?.data ?? [];
  const logs       = logsData?.data ?? [];
  const extensions = extensionsData?.data ?? [];
  const userName   = session?.user?.name?.split(' ')[0] ?? '';

  const activeTasks    = tasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status));
  const overdueTasks   = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED');
  const exhaustedTasks = tasks.filter(t => t.timeExhausted);
  const totalLogged    = tasks.reduce((s, t) => s + Number(t.loggedHours || 0), 0);
  const totalAllocated = tasks.reduce((s, t) => s + Number(t.allocatedHours || 0), 0);

  function openRequestModal() {
    const pid = (tasks[0] as any)?.projectId || (tasks[0] as any)?.project?.id;
    if (!pid) return showToast('error', 'You need at least one assigned task before requesting more.');
    setRequestModal({ projectId: pid, title: '', description: '', justification: '', estimatedHours: '' });
  }

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ── Greeting + quick actions ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {greeting()}{userName ? `, ${userName}` : ''} 👋
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {!noStaffProfile && (
          <div className="flex gap-2">
            <Link to="/employee/planner"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
              My Planner
            </Link>
            <button onClick={openRequestModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Request Task
            </button>
          </div>
        )}
      </div>

      {/* ── No staff profile warning ─────────────────────────────── */}
      {noStaffProfile && (
        <div className="card p-5 border-amber-200 bg-amber-50">
          <div className="flex gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-900">Account not linked to a staff profile</p>
              <p className="text-xs text-amber-700 mt-1">Ask your Project Manager to create a staff profile and link it to your account. Your tasks will appear here once linked.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats strip ──────────────────────────────────────────── */}
      {!noStaffProfile && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Active Tasks',  value: activeTasks.length,        color: 'text-blue-700',    bg: 'bg-blue-50',   border: 'border-blue-100' },
            { label: 'Hours Logged',  value: `${totalLogged.toFixed(1)}h`, color: 'text-gray-900', bg: 'bg-white',     border: 'border-gray-100' },
            { label: 'Allocated',     value: `${totalAllocated.toFixed(1)}h`, color: 'text-gray-700', bg: 'bg-white', border: 'border-gray-100' },
            { label: 'Overdue',       value: overdueTasks.length,       color: overdueTasks.length > 0 ? 'text-red-600' : 'text-gray-400',   bg: overdueTasks.length > 0 ? 'bg-red-50' : 'bg-white',   border: overdueTasks.length > 0 ? 'border-red-100' : 'border-gray-100' },
            { label: 'Time Exhausted',value: exhaustedTasks.length,     color: exhaustedTasks.length > 0 ? 'text-orange-600' : 'text-gray-400', bg: exhaustedTasks.length > 0 ? 'bg-orange-50' : 'bg-white', border: exhaustedTasks.length > 0 ? 'border-orange-100' : 'border-gray-100' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
              <p className="text-lg font-black leading-none ${s.color}">
                <span className={s.color}>{s.value}</span>
              </p>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Hours progress bar ────────────────────────────────────── */}
      {!noStaffProfile && totalAllocated > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">Time Usage</p>
            <p className="text-xs text-gray-500">
              <span className={totalLogged > totalAllocated ? 'text-red-600 font-semibold' : 'text-gray-700'}>{totalLogged.toFixed(1)}h</span>
              {' logged of '}{totalAllocated.toFixed(1)}h allocated
              {' · '}{(totalAllocated - totalLogged).toFixed(1)}h remaining
            </p>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalLogged > totalAllocated ? 'bg-red-500' : totalLogged / totalAllocated > 0.8 ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (totalLogged / totalAllocated) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── My Tasks ─────────────────────────────────────────────── */}
      {!noStaffProfile && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">My Tasks</h2>
            <span className="text-xs text-gray-400">{activeTasks.length} active</span>
          </div>

          {tasksLoading && (
            <div className="card p-8 text-center text-gray-400 text-sm">Loading tasks…</div>
          )}

          {!tasksLoading && tasks.length === 0 && (
            <div className="card p-10 text-center">
              <div className="text-3xl mb-2 opacity-30">✅</div>
              <p className="text-sm font-medium text-gray-500">No tasks assigned yet</p>
              <p className="text-xs text-gray-400 mt-1">Your PM will assign tasks when ready</p>
            </div>
          )}

          {!tasksLoading && tasks.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((t: any) => {
                const allocated  = Number(t.allocatedHours || 0);
                const logged     = Number(t.loggedHours || 0);
                const remaining  = Number(t.remainingHours ?? Math.max(0, allocated - logged));
                const pct        = allocated > 0 ? Math.min((logged / allocated) * 100, 100) : 0;
                const overBudget = logged > allocated;
                const exhausted  = t.timeExhausted || remaining <= 0;
                const daysLeft   = t.dueDate ? Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000) : null;
                const isOverdue  = daysLeft !== null && daysLeft < 0;

                return (
                  <Link key={t.id} to={`/pm/tasks/${t.id}`}
                    className={`card p-4 hover:shadow-md transition-shadow border ${
                      exhausted ? 'border-red-200 bg-red-50/30' : isOverdue ? 'border-amber-200' : 'border-gray-100'
                    }`}>

                    {/* Exhausted banner */}
                    {exhausted && (
                      <div className="mb-2.5 -mx-4 -mt-4 px-4 py-2 bg-red-500 rounded-t-xl">
                        <p className="text-[10px] font-bold text-white uppercase tracking-wide">Time exhausted — request extension</p>
                      </div>
                    )}

                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[10px] font-mono text-gray-400">{t.taskNumber || t.number}</span>
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-200'}`} title={t.priority} />
                        <span className={`pill ${STATUS_BADGE[t.status] || 'bg-gray-100 text-gray-500'}`}>
                          {t.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-gray-900 mb-0.5 leading-snug">{t.title}</p>
                    <p className="text-[11px] text-gray-400 mb-3 truncate">{t.projectNumber} — {t.projectName}</p>

                    {/* Time usage */}
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
                      <span>{logged.toFixed(1)}h / {allocated.toFixed(1)}h</span>
                      <span className={remaining > 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                        {remaining > 0 ? `${remaining.toFixed(1)}h left` : 'Over budget'}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${overBudget ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>

                    {/* Due date */}
                    {t.dueDate && (
                      <p className={`text-[10px] mt-2 font-medium ${isOverdue ? 'text-red-500' : daysLeft !== null && daysLeft <= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {isOverdue ? `⚠ ${Math.abs(daysLeft!)}d overdue` : daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`}
                        {' · '}{new Date(t.dueDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom grid: Time logs + Extensions ──────────────────── */}
      {!noStaffProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Recent Time Logs — 2 cols */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent Time Logs</h2>
              <Link to="/employee/planner" className="text-xs text-blue-600 hover:underline">Log time →</Link>
            </div>
            {logs.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-2xl mb-1.5 opacity-20">⏱</div>
                <p className="text-xs text-gray-400">No time logs yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{log.taskTitle}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{log.projectName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-semibold text-gray-900">{log.hours}h</p>
                      <p className="text-[10px] text-gray-400">{new Date(log.date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}</p>
                    </div>
                    <span className={`pill shrink-0 ${LOG_STATUS[log.status] || 'bg-gray-100 text-gray-500'}`}>{log.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Extensions — 1 col */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Pending Extensions</h2>
            </div>
            {extensions.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-2xl mb-1.5 opacity-20">📋</div>
                <p className="text-xs text-gray-400">No pending requests</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {extensions.map(ext => (
                  <div key={ext.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900">+{ext.requestedHours}h</p>
                        <p className="text-[10px] text-gray-500 truncate">{ext.taskTitle}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{ext.projectName}</p>
                      </div>
                      <span className={`pill shrink-0 ${ext.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : ext.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {ext.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1.5 italic leading-relaxed">{ext.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Request Task Modal ───────────────────────────────────── */}
      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md card p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900 mb-0.5">Request a Task</h3>
            <p className="text-xs text-gray-500 mb-4">Your PM will review and approve, reject, or ask for more info.</p>

            <div className="space-y-3">
              <div>
                <label className="form-label">Project</label>
                <select value={requestModal.projectId}
                  onChange={e => setRequestModal(p => p ? { ...p, projectId: e.target.value } : p)}
                  className="input">
                  {Array.from(new Map(
                    tasks.filter((t: any) => t.projectId || t.project?.id)
                      .map((t: any) => {
                        const pid = t.projectId || t.project?.id;
                        return [pid, { id: pid, number: t.projectNumber || t.project?.number || '', name: t.projectName || t.project?.name || '' }];
                      })
                  ).values()).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.number} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Task title *</label>
                <input value={requestModal.title}
                  onChange={e => setRequestModal(p => p ? { ...p, title: e.target.value } : p)}
                  className="input" placeholder="e.g. Re-edit chapter 3 after author rewrite" />
              </div>
              <div>
                <label className="form-label">What you'd be doing *</label>
                <textarea rows={3} value={requestModal.description}
                  onChange={e => setRequestModal(p => p ? { ...p, description: e.target.value } : p)}
                  className="textarea" />
              </div>
              <div>
                <label className="form-label">Why is this needed? *</label>
                <textarea rows={2} value={requestModal.justification}
                  onChange={e => setRequestModal(p => p ? { ...p, justification: e.target.value } : p)}
                  className="textarea" />
              </div>
              <div>
                <label className="form-label">Estimated hours *</label>
                <input type="number" min={0.25} step="0.25" value={requestModal.estimatedHours}
                  onChange={e => setRequestModal(p => p ? { ...p, estimatedHours: e.target.value } : p)}
                  className="input" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRequestModal(null)}
                className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!requestModal.projectId) return showToast('error', 'Pick a project.');
                if (!requestModal.title.trim()) return showToast('error', 'Title is required.');
                if (!requestModal.description.trim()) return showToast('error', 'Describe what you need to do.');
                if (!requestModal.justification.trim()) return showToast('error', 'Explain why this task is needed.');
                const hours = Number(requestModal.estimatedHours);
                if (!hours || hours <= 0) return showToast('error', 'Estimated hours must be positive.');
                requestMut.mutate({ projectId: requestModal.projectId, title: requestModal.title.trim(),
                  description: requestModal.description.trim(), justification: requestModal.justification.trim(), estimatedHours: hours });
              }} disabled={requestMut.isPending}
                className="btn-primary disabled:opacity-50">
                {requestMut.isPending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

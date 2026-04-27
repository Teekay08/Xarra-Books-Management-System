import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: 'PLANNING' | 'ACTIVE' | 'DEMO_PENDING' | 'SIGNED_OFF' | 'CANCELLED';
  demoRecordedAt: string | null;
  demoAttachmentUrl: string | null;
  demoNotes: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
  sponsorApproved: boolean;
  sponsorApprovedBy: string | null;
  sponsorApprovedAt: string | null;
  taskSummary: { total: number; done: number };
  createdAt: string;
}

interface SprintTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo: string | null;
}

const STATUS_STYLES: Record<Sprint['status'], { bg: string; text: string; label: string }> = {
  PLANNING:     { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'Planning' },
  ACTIVE:       { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Active' },
  DEMO_PENDING: { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Demo Pending' },
  SIGNED_OFF:   { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Signed Off' },
  CANCELLED:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Cancelled' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-12 text-right">{done}/{total} done</span>
    </div>
  );
}

function SprintCard({ sprint, onDemoRecord, onSignOff, onSponsorApprove, onActivate, onCancel, onDelete }: {
  sprint: Sprint;
  onDemoRecord: (s: Sprint) => void;
  onSignOff: (id: string) => void;
  onSponsorApprove: (id: string) => void;
  onActivate: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);
  const [selectedBacklog, setSelectedBacklog] = useState<Set<string>>(new Set());
  const s = STATUS_STYLES[sprint.status];
  const isLive = sprint.status === 'ACTIVE';
  const isClosed = ['SIGNED_OFF', 'CANCELLED'].includes(sprint.status);
  const days = Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86_400_000);

  const { data: detailData, refetch: refetchDetail } = useQuery({
    queryKey: ['bil-sprint-detail', sprint.id],
    queryFn: () => api<{ data: Sprint & { tasks: SprintTask[] } }>(`/billetterie/projects/${sprint.projectId}/sprints/${sprint.id}`),
    enabled: expanded,
  });

  // Backlog: tasks with no sprint assigned
  const { data: backlogData } = useQuery({
    queryKey: ['bil-tasks-backlog', sprint.projectId],
    queryFn: () => api<{ data: SprintTask[] }>(`/billetterie/projects/${sprint.projectId}/tasks?sprintId=none`),
    enabled: showBacklog,
    select: d => d?.data?.filter((t: SprintTask) => !['DONE', 'CANCELLED'].includes(t.status)),
  });

  const assignMut = useMutation({
    mutationFn: (taskIds: string[]) => api(
      `/billetterie/projects/${sprint.projectId}/sprints/${sprint.id}/tasks`,
      { method: 'POST', body: JSON.stringify({ taskIds, action: 'add' }) },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bil-sprint-detail', sprint.id] });
      qc.invalidateQueries({ queryKey: ['bil-tasks-backlog', sprint.projectId] });
      qc.invalidateQueries({ queryKey: ['bil-sprints', sprint.projectId] });
      setShowBacklog(false);
      setSelectedBacklog(new Set());
    },
  });

  const removeMut = useMutation({
    mutationFn: (taskId: string) => api(
      `/billetterie/projects/${sprint.projectId}/sprints/${sprint.id}/tasks`,
      { method: 'POST', body: JSON.stringify({ taskIds: [taskId], action: 'remove' }) },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bil-sprint-detail', sprint.id] });
      qc.invalidateQueries({ queryKey: ['bil-tasks-backlog', sprint.projectId] });
      qc.invalidateQueries({ queryKey: ['bil-sprints', sprint.projectId] });
    },
  });

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${isLive ? 'border-blue-400 shadow-sm' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm text-gray-900">{sprint.name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
            {sprint.sponsorApproved && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">✓ Sponsor Approved</span>}
            {isLive && days >= 0 && <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">{days}d left</span>}
            {isLive && days < 0 && <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">{Math.abs(days)}d overdue</span>}
          </div>
          <div className="text-[10px] text-gray-400">
            {fmtDate(sprint.startDate)} → {fmtDate(sprint.endDate)}
          </div>
          {sprint.goal && <div className="text-xs text-gray-500 mt-0.5 truncate">{sprint.goal}</div>}
        </div>
        <div className="flex-shrink-0 w-36">
          <ProgressBar done={sprint.taskSummary.done} total={sprint.taskSummary.total} />
        </div>
        <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* Tasks in sprint */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sprint Tasks</div>
              {!isClosed && (
                <button onClick={() => setShowBacklog(v => !v)} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
                  {showBacklog ? '✕ Close' : '+ Add from Backlog'}
                </button>
              )}
            </div>
            {detailData?.data?.tasks && detailData.data.tasks.length > 0 ? (
              <div className="space-y-1">
                {detailData.data.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs group/task">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${t.status === 'DONE' ? 'bg-green-500' : t.status === 'IN_PROGRESS' ? 'bg-blue-500' : t.status === 'REVIEW' ? 'bg-amber-500' : 'bg-gray-300'}`} />
                    <span className={`flex-1 ${t.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
                    <span className="text-[10px] text-gray-400">{t.status.replace('_', ' ')}</span>
                    {!isClosed && (
                      <button onClick={() => removeMut.mutate(t.id)}
                        className="opacity-0 group-hover/task:opacity-100 text-[10px] text-red-400 hover:text-red-600 ml-1 transition-opacity" title="Remove from sprint">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No tasks assigned to this sprint yet.</p>
            )}
          </div>

          {/* Backlog picker */}
          {showBacklog && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Backlog (unassigned tasks)</div>
              {!backlogData?.length ? (
                <p className="text-xs text-gray-400">No backlog tasks available.</p>
              ) : (
                <>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {backlogData.map((t: SprintTask) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white rounded px-1 py-0.5">
                        <input type="checkbox" checked={selectedBacklog.has(t.id)}
                          onChange={e => setSelectedBacklog(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(t.id) : next.delete(t.id);
                            return next;
                          })}
                          className="rounded" />
                        <span className="flex-1 text-gray-700">{t.title}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded ${t.priority === 'URGENT' ? 'bg-red-100 text-red-700' : t.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.priority}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => { if (selectedBacklog.size > 0) assignMut.mutate([...selectedBacklog]); }}
                    disabled={selectedBacklog.size === 0 || assignMut.isPending}
                    className="w-full py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {assignMut.isPending ? 'Adding…' : `Add ${selectedBacklog.size || ''} Task${selectedBacklog.size !== 1 ? 's' : ''} to Sprint`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Demo info */}
          {sprint.demoRecordedAt && (
            <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs space-y-0.5">
              <div className="font-semibold text-amber-800">Demo recorded {fmtDate(sprint.demoRecordedAt)}</div>
              {sprint.demoNotes && <div className="text-amber-700">{sprint.demoNotes}</div>}
              {sprint.demoAttachmentUrl && (
                <a href={sprint.demoAttachmentUrl} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline">View demo recording</a>
              )}
            </div>
          )}
          {sprint.signedOffAt && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
              PM signed off on {fmtDate(sprint.signedOffAt)}
            </div>
          )}
          {sprint.sponsorApprovedAt && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
              Sponsor approved on {fmtDate(sprint.sponsorApprovedAt)}
            </div>
          )}

          {/* Gate action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {sprint.status === 'PLANNING' && (
              <button onClick={() => onActivate(sprint.id)}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                Activate Sprint
              </button>
            )}
            {sprint.status === 'ACTIVE' && (
              <button onClick={() => onDemoRecord(sprint)}
                className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700">
                Record Demo
              </button>
            )}
            {sprint.status === 'DEMO_PENDING' && (
              <button onClick={() => onSignOff(sprint.id)}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">
                PM Sign Off
              </button>
            )}
            {sprint.status === 'SIGNED_OFF' && !sprint.sponsorApproved && (
              <button onClick={() => onSponsorApprove(sprint.id)}
                className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700">
                Sponsor Approve
              </button>
            )}
            {['PLANNING', 'ACTIVE', 'DEMO_PENDING'].includes(sprint.status) && (
              <button onClick={() => { if (confirm(`Cancel sprint "${sprint.name}"? Tasks will be unlinked.`)) onCancel(sprint.id); }}
                className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50">
                Cancel Sprint
              </button>
            )}
            {['PLANNING', 'CANCELLED'].includes(sprint.status) && (
              <button onClick={() => { if (confirm(`Delete sprint "${sprint.name}"?`)) onDelete(sprint.id); }}
                className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-50">
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props { projectId: string }

export function BilletterieSprints({ projectId }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [demoTarget, setDemoTarget] = useState<Sprint | null>(null);
  const [demoForm, setDemoForm] = useState({ url: '', notes: '' });
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' });

  const { data: sprintsData, isLoading } = useQuery({
    queryKey: ['bil-sprints', projectId],
    queryFn: () => api<{ data: Sprint[] }>(`/billetterie/projects/${projectId}/sprints`),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/sprints`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-sprints', projectId] }); setAdding(false); setForm({ name: '', goal: '', startDate: '', endDate: '' }); },
  });

  const actionMut = useMutation({
    mutationFn: ({ action, id, body }: { action: string; id: string; body?: any }) =>
      api(`/billetterie/projects/${projectId}/sprints/${id}/${action}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bil-sprints', projectId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/billetterie/projects/${projectId}/sprints/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bil-sprints', projectId] }),
  });

  const sprints: Sprint[] = (sprintsData?.data ?? []).map(s => ({ ...s, projectId }));
  const activeSprint = sprints.find(s => s.status === 'ACTIVE');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Sprints / Iterations</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeSprint ? <span className="text-blue-700">Active: <strong>{activeSprint.name}</strong></span> : 'No sprint currently active'}
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + New Sprint
        </button>
      </div>

      {/* Demo recording modal */}
      {demoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">Record Demo — {demoTarget.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Recording URL (optional)</label>
                <input value={demoForm.url} onChange={e => setDemoForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Demo Notes</label>
                <textarea value={demoForm.notes} onChange={e => setDemoForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  placeholder="Summary of what was demonstrated..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => {
                actionMut.mutate({ action: 'demo', id: demoTarget.id, body: { demoAttachmentUrl: demoForm.url || null, demoNotes: demoForm.notes || null } });
                setDemoTarget(null);
                setDemoForm({ url: '', notes: '' });
              }} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">
                Record Demo
              </button>
              <button onClick={() => setDemoTarget(null)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">New Sprint</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Sprint Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sprint 1, Iteration Alpha"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Sprint Goal</label>
              <input value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
                placeholder="What do we commit to completing in this sprint?"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date *</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate({ name: form.name, goal: form.goal || null, startDate: form.startDate, endDate: form.endDate })}
              disabled={!form.name || !form.startDate || !form.endDate || createMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Sprint'}
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
          {createMut.isError && <p className="text-xs text-red-600">{(createMut.error as any)?.message ?? 'Error creating sprint'}</p>}
        </div>
      )}

      {/* Sprint list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading sprints…</div>
      ) : sprints.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-2">🏃</div>
          <p className="text-sm font-medium text-gray-500">No sprints yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a sprint to start breaking the project into time-boxed iterations</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sprints.map(s => (
            <SprintCard
              key={s.id}
              sprint={s}
              onDemoRecord={setDemoTarget}
              onSignOff={id => actionMut.mutate({ action: 'sign-off', id })}
              onSponsorApprove={id => actionMut.mutate({ action: 'sponsor-approve', id })}
              onActivate={id => actionMut.mutate({ action: 'activate', id })}
              onCancel={id => actionMut.mutate({ action: 'cancel', id })}
              onDelete={id => deleteMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Gate flow legend */}
      <div className="bg-gray-50 rounded-xl px-4 py-3">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Sprint Gate Flow</div>
        <div className="flex items-center gap-2 text-[10px] text-gray-600 flex-wrap">
          <span className="px-1.5 py-0.5 bg-gray-200 rounded">Planning</span>
          <span>→ PM Activates →</span>
          <span className="px-1.5 py-0.5 bg-blue-200 rounded">Active</span>
          <span>→ Demo Recorded →</span>
          <span className="px-1.5 py-0.5 bg-amber-200 rounded">Demo Pending</span>
          <span>→ PM Sign-off →</span>
          <span className="px-1.5 py-0.5 bg-green-200 rounded">Signed Off</span>
          <span>→ Sponsor Approves →</span>
          <span className="px-1.5 py-0.5 bg-green-300 rounded">✓ Done</span>
        </div>
      </div>
    </div>
  );
}

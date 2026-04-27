import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

interface Deliverable {
  id: string;
  projectId: string;
  phaseKey: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  assignedTo?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  isRequired: boolean;
}

interface TimeLog {
  id: string;
  workDate: string;
  hours: string;
  description: string | null;
  status: string;
  staffMemberId: string;
  staffMemberName: string | null;
}

interface Props {
  projectId: string;
  phaseKey: string;
  phaseStatus: 'LOCKED' | 'ACTIVE' | 'APPROVED';
  canEdit: boolean;
}

const STATUS_CONFIG = {
  PENDING:     { label: 'Pending',     cls: 'bg-gray-100 text-gray-600',   icon: '○' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-50 text-blue-700',    icon: '◑' },
  COMPLETE:    { label: 'Complete',    cls: 'bg-green-50 text-green-700',   icon: '●' },
} as const;

const LOG_STATUS_CLS: Record<string, string> = {
  DRAFT:     'bg-gray-100 text-gray-500',
  SUBMITTED: 'bg-amber-50 text-amber-700',
  APPROVED:  'bg-green-50 text-green-700',
  REJECTED:  'bg-red-50 text-red-600',
};

// ─── Per-deliverable time log panel ──────────────────────────────────────────

function DeliverableTimeLogs({
  projectId,
  deliverableId,
  canLog,
  onClose,
}: {
  projectId: string;
  deliverableId: string;
  canLog: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ workDate: new Date().toISOString().slice(0, 10), hours: '', description: '' });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bil-deliverable-logs', deliverableId],
    queryFn: () => api<{ data: TimeLog[]; totalHours: number }>(
      `/billetterie/projects/${projectId}/deliverables/${deliverableId}/time-logs`,
    ),
  });
  const logs = data?.data ?? [];
  const totalHours = data?.totalHours ?? 0;

  const logMutation = useMutation({
    mutationFn: (body: object) =>
      api(`/billetterie/projects/${projectId}/deliverables/${deliverableId}/log-time`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bil-deliverable-logs', deliverableId] });
      queryClient.invalidateQueries({ queryKey: ['bil-deliverables', projectId] });
      setForm((f) => ({ ...f, hours: '', description: '' }));
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Failed to log time'),
  });

  const deleteMutation = useMutation({
    mutationFn: (logId: string) =>
      api(`/billetterie/projects/${projectId}/deliverables/${deliverableId}/time-logs/${logId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-deliverable-logs', deliverableId] }),
  });

  function submit() {
    const h = parseFloat(form.hours);
    if (!form.workDate || isNaN(h) || h <= 0 || h > 24) {
      setFormError('Enter a valid date and hours (0.25 – 24)');
      return;
    }
    logMutation.mutate({ workDate: form.workDate, hours: h, description: form.description || null });
  }

  return (
    <div className="mt-3 border border-blue-100 rounded-lg bg-blue-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
          Time Logs {totalHours > 0 && <span className="ml-1 font-normal text-blue-600">({totalHours.toFixed(1)} h total)</span>}
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm leading-none">×</button>
      </div>

      {/* Log entry form */}
      {canLog && (
        <div className="space-y-2">
          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{formError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date *</label>
              <input
                type="date"
                value={form.workDate}
                onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Hours *</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                placeholder="e.g. 2.5"
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
          <button
            onClick={submit}
            disabled={logMutation.isPending}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {logMutation.isPending ? 'Logging…' : '+ Log Time'}
          </button>
        </div>
      )}

      {/* Existing logs */}
      {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
      {!isLoading && logs.length === 0 && (
        <p className="text-xs text-gray-400 italic">No time logged yet.</p>
      )}
      <div className="space-y-1.5">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-md px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-800">{Number(log.hours).toFixed(1)} h</span>
                <span className="text-xs text-gray-500">{log.workDate}</span>
                {log.staffMemberName && (
                  <span className="text-[10px] text-gray-400">— {log.staffMemberName}</span>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${LOG_STATUS_CLS[log.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {log.status}
                </span>
              </div>
              {log.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{log.description}</p>}
            </div>
            {log.status === 'DRAFT' && (
              <button
                onClick={() => { if (confirm('Delete this time log?')) deleteMutation.mutate(log.id); }}
                className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                title="Delete"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PhaseDeliverables({ projectId, phaseKey, phaseStatus, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [loggingFor, setLoggingFor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bil-deliverables', projectId, phaseKey],
    queryFn: () => api<{ data: Deliverable[] }>(
      `/billetterie/projects/${projectId}/deliverables?phaseKey=${phaseKey}`,
    ),
  });

  const deliverables = data?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/billetterie/projects/${projectId}/deliverables/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-deliverables', projectId, phaseKey] }),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      api(`/billetterie/projects/${projectId}/deliverables`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bil-deliverables', projectId, phaseKey] });
      setAdding(false);
      setNewTitle('');
      setNewDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/billetterie/projects/${projectId}/deliverables/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-deliverables', projectId, phaseKey] }),
  });

  const complete = deliverables.filter((d) => d.status === 'COMPLETE').length;
  const total = deliverables.length;
  const required = deliverables.filter((d) => d.isRequired);
  const allRequiredDone = required.every((d) => d.status === 'COMPLETE');

  function nextStatus(current: Deliverable['status']): Deliverable['status'] {
    if (current === 'PENDING') return 'IN_PROGRESS';
    if (current === 'IN_PROGRESS') return 'COMPLETE';
    return 'PENDING';
  }

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-gray-400">Loading deliverables…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Progress header */}
      {total > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${total > 0 ? (complete / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap">{complete}/{total} done</span>
          {allRequiredDone && total > 0 && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              ✓ Ready to advance
            </span>
          )}
        </div>
      )}

      {/* Deliverable list */}
      <div className="space-y-2">
        {deliverables.length === 0 && (
          <p className="text-sm text-gray-400 py-2">No deliverables defined for this phase.</p>
        )}
        {deliverables.map((d) => {
          const cfg = STATUS_CONFIG[d.status];
          const isLoggingThis = loggingFor === d.id;
          return (
            <div key={d.id}>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  d.status === 'COMPLETE'
                    ? 'bg-green-50/40 border-green-100'
                    : d.status === 'IN_PROGRESS'
                    ? 'bg-blue-50/40 border-blue-100'
                    : 'bg-white border-gray-100'
                }`}
              >
                {/* Status toggle button */}
                {canEdit && phaseStatus !== 'APPROVED' ? (
                  <button
                    onClick={() => updateMutation.mutate({ id: d.id, status: nextStatus(d.status) })}
                    disabled={updateMutation.isPending}
                    className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                      d.status === 'COMPLETE'
                        ? 'bg-green-500 border-green-500 text-white'
                        : d.status === 'IN_PROGRESS'
                        ? 'bg-blue-100 border-blue-400 text-blue-600'
                        : 'border-gray-300 text-transparent hover:border-gray-400'
                    }`}
                    title={`Click to mark as ${nextStatus(d.status)}`}
                  >
                    {d.status === 'COMPLETE' ? '✓' : d.status === 'IN_PROGRESS' ? '◑' : ''}
                  </button>
                ) : (
                  <span className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    d.status === 'COMPLETE'
                      ? 'bg-green-500 border-green-500 text-white'
                      : d.status === 'IN_PROGRESS'
                      ? 'bg-blue-100 border-blue-400 text-blue-600'
                      : 'border-gray-300 text-gray-300'
                  }`}>
                    {d.status === 'COMPLETE' ? '✓' : d.status === 'IN_PROGRESS' ? '◑' : ''}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-tight ${d.status === 'COMPLETE' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {d.title}
                      {d.isRequired && <span className="ml-1 text-red-400 text-xs">*</span>}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      {/* Log Time button — always visible when phase is active */}
                      {phaseStatus !== 'LOCKED' && (
                        <button
                          onClick={() => setLoggingFor(isLoggingThis ? null : d.id)}
                          className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                            isLoggingThis
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                          title="Log time against this deliverable"
                        >
                          ⏱ Log Time
                        </button>
                      )}
                      {canEdit && !d.isRequired && phaseStatus !== 'APPROVED' && (
                        <button
                          onClick={() => {
                            if (confirm('Delete this deliverable?')) deleteMutation.mutate(d.id);
                          }}
                          className="text-gray-300 hover:text-red-400 text-xs transition-colors"
                          title="Delete deliverable"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  {d.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {d.assigneeName && (
                      <span className="text-[10px] text-gray-400">Assigned: {d.assigneeName}</span>
                    )}
                    {d.dueDate && (
                      <span className="text-[10px] text-gray-400">Due: {d.dueDate}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline time log panel */}
              {isLoggingThis && (
                <DeliverableTimeLogs
                  projectId={projectId}
                  deliverableId={d.id}
                  canLog={phaseStatus !== 'LOCKED'}
                  onClose={() => setLoggingFor(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Add new deliverable */}
      {canEdit && phaseStatus !== 'APPROVED' && (
        <div>
          {adding ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Deliverable title…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim()) {
                    createMutation.mutate({ phaseKey, title: newTitle.trim(), description: newDesc || null, isRequired: false });
                  }
                  if (e.key === 'Escape') { setAdding(false); setNewTitle(''); setNewDesc(''); }
                }}
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (newTitle.trim()) {
                      createMutation.mutate({ phaseKey, title: newTitle.trim(), description: newDesc || null, isRequired: false });
                    }
                  }}
                  disabled={!newTitle.trim() || createMutation.isPending}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAdding(false); setNewTitle(''); setNewDesc(''); }}
                  className="text-xs text-gray-500 px-3 py-1.5 rounded-md hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors py-1"
            >
              + Add deliverable
            </button>
          )}
        </div>
      )}

      {!allRequiredDone && required.length > 0 && phaseStatus === 'ACTIVE' && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <strong>{required.length - required.filter((d) => d.status === 'COMPLETE').length}</strong> required deliverable(s) must be completed before this phase can advance.
        </p>
      )}
    </div>
  );
}

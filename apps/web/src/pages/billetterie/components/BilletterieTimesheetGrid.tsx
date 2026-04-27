import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { TIME_LOG_STATUS_BADGE } from '../billetterie-constants';

interface Props {
  projectId: string;
}

function getMonday(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' });
}

export function BilletterieTimesheetGrid({ projectId }: Props) {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => fmt(getMonday(new Date())));
  const [selectedMember, setSelectedMember] = useState('');
  const [logModal, setLogModal] = useState<{ taskId: string; taskTitle: string; date: string } | null>(null);
  const [logHours, setLogHours] = useState('1');
  const [logDesc, setLogDesc] = useState('');
  const [logging, setLogging] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(weekStart), i);
    return { date: fmt(d), label: dayLabel(d) };
  });

  const { data, isLoading } = useQuery({
    queryKey: ['bil-timesheets', projectId, weekStart, selectedMember],
    queryFn: () => {
      const params = new URLSearchParams({ weekStart });
      if (selectedMember) params.set('staffMemberId', selectedMember);
      return api<{ data: any }>(`/billetterie/projects/${projectId}/timesheets?${params}`);
    },
  });

  const { data: staffData } = useQuery({
    queryKey: ['bil-staff-all'],
    queryFn: () => api<{ data: any[] }>('/billetterie/team'),
  });

  const approveMutation = useMutation({
    mutationFn: (logId: string) => api(`/billetterie/time-logs/${logId}/approve`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-timesheets', projectId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (logId: string) => api(`/billetterie/time-logs/${logId}/reject`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-timesheets', projectId] }),
  });

  const submitWeekMutation = useMutation({
    mutationFn: ({ staffMemberId }: { staffMemberId: string }) =>
      api(`/billetterie/projects/${projectId}/timesheets/submit-week`, {
        method: 'POST',
        body: JSON.stringify({ weekStart, staffMemberId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-timesheets', projectId] }),
  });

  const members = data?.data?.members ?? [];
  const staff   = staffData?.data ?? [];

  async function submitLog() {
    if (!logModal) return;
    setLogging(true);
    try {
      await api(`/billetterie/projects/${projectId}/tasks/${logModal.taskId}/log-time`, {
        method: 'POST',
        body: JSON.stringify({ workDate: logModal.date, hours: Number(logHours), description: logDesc || null }),
      });
      queryClient.invalidateQueries({ queryKey: ['bil-timesheets', projectId] });
      setLogModal(null);
      setLogHours('1');
      setLogDesc('');
    } finally {
      setLogging(false);
    }
  }

  function prevWeek() { setWeekStart(fmt(addDays(new Date(weekStart), -7))); }
  function nextWeek() { setWeekStart(fmt(addDays(new Date(weekStart), 7))); }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button onClick={prevWeek} className="px-2 py-1 rounded text-sm hover:bg-white transition-colors">←</button>
          <span className="text-sm font-medium text-gray-700 px-2">
            {new Date(weekStart).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} — {addDays(new Date(weekStart), 6).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="px-2 py-1 rounded text-sm hover:bg-white transition-colors">→</button>
        </div>
        <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Team Members</option>
          {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Log hours modal */}
      {logModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Log Hours</h3>
            <p className="text-xs text-gray-500">{logModal.taskTitle} · {logModal.date}</p>
            <input type="number" min="0.25" max="24" step="0.25" value={logHours} onChange={(e) => setLogHours(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Hours" />
            <input type="text" value={logDesc} onChange={(e) => setLogDesc(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Description (optional)" />
            <div className="flex gap-2">
              <button onClick={submitLog} disabled={logging} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {logging ? 'Saving...' : 'Log Hours'}
              </button>
              <button onClick={() => setLogModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading timesheets...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No time entries for this week.</div>
      ) : (
        <div className="space-y-6">
          {members.map((member: any) => {
            // Build a map: taskId → day → entries
            const byTaskDay: Record<string, Record<string, any[]>> = {};
            const taskTitles: Record<string, string> = {};
            const taskIds: string[] = [];

            for (const entry of member.entries) {
              const tid = entry.taskId;
              if (!byTaskDay[tid]) {
                byTaskDay[tid] = {};
                taskIds.push(tid);
              }
              taskTitles[tid] = entry.taskTitle;
              const d = typeof entry.workDate === 'string' ? entry.workDate : new Date(entry.workDate).toISOString().slice(0, 10);
              if (!byTaskDay[tid][d]) byTaskDay[tid][d] = [];
              byTaskDay[tid][d].push(entry);
            }

            return (
              <div key={member.staffMember.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{member.staffMember.name}</p>
                    <p className="text-xs text-gray-500">{member.staffMember.role}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Submit week — only shown when there are DRAFT entries */}
                    {member.entries.some((e: any) => e.status === 'DRAFT') && (
                      <button
                        onClick={() => submitWeekMutation.mutate({ staffMemberId: member.staffMember.id })}
                        disabled={submitWeekMutation.isPending}
                        className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
                      >
                        {submitWeekMutation.isPending ? 'Submitting…' : 'Submit Week'}
                      </button>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{member.totalHours.toFixed(1)}h</p>
                      <p className="text-xs text-gray-500">this week</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 w-48">Task</th>
                        {days.map((d) => (
                          <th key={d.date} className="text-center px-2 py-2 font-medium text-gray-500 whitespace-nowrap min-w-16">{d.label}</th>
                        ))}
                        <th className="text-right px-4 py-2 font-medium text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskIds.map((tid) => {
                        const rowTotal = Object.values(byTaskDay[tid]).flat().reduce((sum: number, e: any) => sum + Number(e.hours), 0);
                        return (
                          <tr key={tid} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-700 truncate max-w-48">{taskTitles[tid]}</td>
                            {days.map((d) => {
                              const entries = byTaskDay[tid][d.date] ?? [];
                              const hours = entries.reduce((s: number, e: any) => s + Number(e.hours), 0);
                              const status = entries[0]?.status ?? null;
                              return (
                                <td key={d.date} className="text-center px-2 py-2">
                                  {hours > 0 ? (
                                    <div className="group relative inline-flex flex-col items-center gap-0.5">
                                      <span className={`font-medium px-1.5 py-0.5 rounded text-[10px] ${status ? TIME_LOG_STATUS_BADGE[status] : ''}`}>{hours.toFixed(1)}h</span>
                                      {status && entries[0] && (
                                        <div className="hidden group-hover:flex gap-1">
                                          {status === 'SUBMITTED' && (
                                            <>
                                              <button onClick={() => approveMutation.mutate(entries[0].id)} className="text-[9px] bg-green-100 text-green-700 px-1 rounded">✓</button>
                                              <button onClick={() => rejectMutation.mutate(entries[0].id)} className="text-[9px] bg-red-100 text-red-700 px-1 rounded">✗</button>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setLogModal({ taskId: tid, taskTitle: taskTitles[tid], date: d.date })}
                                      className="h-6 w-full rounded border border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-colors text-[10px]"
                                    >+</button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-2 text-right font-medium text-gray-700">{rowTotal.toFixed(1)}h</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

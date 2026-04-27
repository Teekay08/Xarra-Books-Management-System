import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { PHASES, PHASE_BY_KEY, CLR, PRIORITY_DOT, isOverdue } from '../billetterie-constants';

interface Props {
  projectId: string;
  projectStartDate?: string | null;
  projectTargetEndDate?: string | null;
}

function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  r.setHours(0, 0, 0, 0);
  return r;
}

export function BilletterieTimeline({ projectId, projectStartDate, projectTargetEndDate }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['bil-timeline', projectId],
    queryFn: () => api<{ data: { tasks: any[]; milestones: any[] } }>(`/billetterie/projects/${projectId}/tasks/timeline`),
  });

  const tasks      = data?.data?.tasks ?? [];
  const milestones = data?.data?.milestones ?? [];

  const { rangeStart, weeks, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    if (projectStartDate) { const d = parseDate(projectStartDate); if (d) allDates.push(d); }
    if (projectTargetEndDate) { const d = parseDate(projectTargetEndDate); if (d) allDates.push(d); }
    for (const t of tasks) {
      const s = parseDate(t.startDate); if (s) allDates.push(s);
      const e = parseDate(t.dueDate);   if (e) allDates.push(e);
    }
    for (const m of milestones) {
      const d = parseDate(m.dueDate); if (d) allDates.push(d);
    }

    const now = new Date();
    allDates.push(now);

    const earliest = allDates.reduce((a, b) => a < b ? a : b);
    const latest   = allDates.reduce((a, b) => a > b ? a : b);
    const paddedEnd = addDays(latest, 7);
    const rangeStart = startOfWeek(addDays(earliest, -7));
    const totalDays  = Math.ceil((paddedEnd.getTime() - rangeStart.getTime()) / 86400000);
    const numWeeks   = Math.ceil(totalDays / 7);
    const weeks: Date[] = Array.from({ length: numWeeks }, (_, i) => addDays(rangeStart, i * 7));

    return { rangeStart, weeks, totalDays };
  }, [tasks, milestones, projectStartDate, projectTargetEndDate]);

  function pct(date: Date) {
    return Math.max(0, Math.min(100, ((date.getTime() - rangeStart.getTime()) / (totalDays * 86400000)) * 100));
  }

  const today = new Date();
  const todayPct = pct(today);

  // Group tasks by phase
  const byPhase: Record<string, any[]> = {};
  for (const t of tasks) {
    if (!byPhase[t.phaseKey]) byPhase[t.phaseKey] = [];
    byPhase[t.phaseKey].push(t);
  }

  if (isLoading) return <div className="text-sm text-gray-500 py-8 text-center">Loading timeline...</div>;
  if (tasks.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-sm">No tasks with both start and end dates.</p>
      <p className="text-xs mt-1">Add start date and due date to tasks to see them on the Gantt chart.</p>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${Math.max(800, weeks.length * 60)}px` }}>
        {/* Header — weeks */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <div className="w-56 flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 border-r border-gray-200">Task</div>
          <div className="flex-1 relative">
            <div className="flex">
              {weeks.map((w, i) => (
                <div key={i} className="flex-1 px-1 py-2 text-[10px] text-gray-400 border-r border-gray-100 text-center whitespace-nowrap">
                  {w.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Milestones row */}
        {milestones.length > 0 && (
          <div className="flex border-b border-gray-100 bg-yellow-50/30">
            <div className="w-56 flex-shrink-0 px-3 py-2 text-[10px] font-semibold text-yellow-700 border-r border-gray-200 flex items-center gap-1">
              ◆ Milestones
            </div>
            <div className="flex-1 relative h-8">
              {milestones.map((m: any) => {
                const dDate = parseDate(m.dueDate);
                if (!dDate) return null;
                const left = pct(dDate);
                return (
                  <div key={m.id} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${left}%` }}>
                    <div className="relative group">
                      <div className="h-3.5 w-3.5 bg-yellow-400 rotate-45 border border-yellow-600 cursor-pointer" />
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {m.title} — {m.dueDate}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tasks grouped by phase */}
        {PHASES.map((phase) => {
          const phaseTasks = byPhase[phase.key] ?? [];
          if (phaseTasks.length === 0) return null;
          const c = CLR[phase.color];
          return (
            <div key={phase.key}>
              <div className={`flex border-b ${c.border} ${c.bg}`}>
                <div className={`w-56 flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold ${c.text} border-r border-gray-200 uppercase tracking-wide`}>
                  {phase.label}
                </div>
                <div className="flex-1" />
              </div>
              {phaseTasks.map((task: any) => {
                const startDate = parseDate(task.startDate);
                const dueDate   = parseDate(task.dueDate);
                if (!startDate || !dueDate) return null;
                const left  = pct(startDate);
                const right = pct(dueDate);
                const width = Math.max(right - left, 1);
                const over = isOverdue(task.dueDate) && task.status !== 'DONE';

                return (
                  <div key={task.id} className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="w-56 flex-shrink-0 px-3 py-2 border-r border-gray-200 flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-700 truncate" title={task.title}>{task.title}</span>
                    </div>
                    <div className="flex-1 relative py-2 px-1">
                      {/* Week grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {weeks.map((_, i) => (
                          <div key={i} className="flex-1 border-r border-gray-100" />
                        ))}
                      </div>
                      {/* Task bar */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-5 rounded flex items-center px-1.5 text-[10px] text-white font-medium truncate ${over ? 'bg-red-400' : task.status === 'DONE' ? 'bg-green-500' : `bg-${phase.color}-500`} transition-all`}
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: task.status === 'DONE' ? '#22c55e' : over ? '#f87171' : undefined }}
                        title={`${task.title}: ${task.startDate} → ${task.dueDate}`}
                      >
                        {width > 10 ? task.title : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Today line overlay — rendered as a pseudo-element via inline style */}
        <div className="relative pointer-events-none" style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(224px + ${todayPct}%)`, width: '2px', background: '#ef4444', zIndex: 10 }} />
      </div>
    </div>
  );
}
